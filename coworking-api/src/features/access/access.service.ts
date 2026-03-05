import { Types } from 'mongoose';
import { AccessModel, type IAccess } from './access.entity';
import { couponService } from '../coupons/coupon.service';
import { LocationModel } from '../locations/location.entity';
import { PersonModel } from '../people/person.entity';
import { StaffGuard } from '../../core/guards/staff.guard';
import { UserModel } from '../auth/user.entity';
import { dragonfly } from '../../infrastructure/cache/dragonfly';
import { notificationService } from '../../infrastructure/notifications/notification.service';
import { stayReminderService } from '../reminders/stay-reminder.service';
import { logger } from '../../core/logger/logger';
import {
    ConflictException,
    NotFoundException,
    ForbiddenException
} from '../../core/exceptions/domain.exception';
import type { UserPayload, UserRole } from '../../types';

export const accessService = {

    async checkIn(params: {
        document: string;
        name: string;
        email: string;
        locationId: string;
        operator: UserPayload;
    }) {

        // --- PROTECCIÓN DE IDENTIDAD: STAFF NO PUEDE SER CLIENTE ---
        await StaffGuard.ensureIsNotStaff(params.email);

        const location = await LocationModel.findById(params.locationId);
        if (!location) throw new NotFoundException('Sede no encontrada');

        const assignedLocations = params.operator.locations ?? [];
        if (params.operator.role !== 'ADMIN' && !assignedLocations.includes(params.locationId)) {
            throw new ForbiddenException('No tienes permiso para operar en esta sede.');
        }


        const lockKey = `access:active:doc:${params.document}`;
        const acquired = await dragonfly.set(lockKey, params.locationId, 'EX', 86400, 'NX');

        if (!acquired) {
            throw new ConflictException('Esta persona ya tiene un ingreso activo en este u otro coworking.');
        }


        const capKey = `access:capacity:${params.locationId}`;
        const luaScript = `
            local current = redis.call("GET", KEYS[1])
            if not current then current = 0 end
            if tonumber(current) >= tonumber(ARGV[1]) then return -1 end
            return redis.call("INCR", KEYS[1])
        `;


        const newCapacity = await dragonfly.eval(luaScript, 1, capKey, location.maxCapacity) as number;

        if (newCapacity === -1) {
            await dragonfly.del(lockKey);
            throw new ConflictException('La sede ha alcanzado su capacidad máxima permitida.');
        }


        const person = await PersonModel.findOneAndUpdate(
            { document: params.document },
            {
                $setOnInsert: { document: params.document },
                $set: { name: params.name, email: params.email }
            },
            { upsert: true, new: true }
        );


        try {
            const access = await AccessModel.create({
                personId: person._id,
                locationId: new Types.ObjectId(params.locationId),
                operatorIn: params.operator.email,
                priceAtCheckIn: location.pricePerHour,
                status: 'ACTIVE',
                checkIn: new Date(),
            });



            const availableCoupons = await couponService.getAvailableCouponsForPerson(
                params.document,
                params.locationId
            );

            // --- PROGRAMAR RECORDATORIOS (50 y 55 MINUTOS) ---
            await stayReminderService.schedule(access._id.toString(), access.checkIn, 1);

            logger.info({ document: params.document, location: location.name, operator: params.operator.email }, `[BusinessEvent] CHECK_IN exitoso`);

            return {
                access,
                availableCoupons: availableCoupons.map(c => ({
                    code: c.code,
                    expiresAt: c.expiresAt
                }))
            };
        } catch (error) {
            await dragonfly.decr(capKey);
            await dragonfly.del(lockKey);
            logger.error({ error, document: params.document }, `[BusinessEvent_Err] Fallo en persistencia de CHECK_IN`);
            throw error;
        }
    },


    async checkOut(params: {
        document: string;
        locationId: string;
        operator: UserPayload;
    }) {
        const assignedLocations = params.operator.locations ?? [];
        if (params.operator.role !== 'ADMIN' && !assignedLocations.includes(params.locationId)) {
            throw new ForbiddenException('No tienes permiso para operar en esta sede.');
        }


        const person = await PersonModel.findOne({ document: params.document });
        if (!person) {
            throw new NotFoundException('Persona no registrada en el sistema.');
        }


        const checkOutTime = new Date();


        const activeAccess = await AccessModel.findOne({
            personId: person._id,
            locationId: new Types.ObjectId(params.locationId),
            status: 'ACTIVE'
        });

        if (!activeAccess) {
            throw new NotFoundException('No se encontró un ingreso activo para esta sede.');
        }

        const durationMs = checkOutTime.getTime() - activeAccess.checkIn.getTime();
        const durationMinutes = durationMs / (1000 * 60);

        // --- LÓGICA DE FACTURACIÓN ESCALONADA ---
        let billableHours: number;
        if (durationMinutes <= 5) {
            billableHours = 0.1;
        } else {
            billableHours = Math.ceil(durationMinutes / 60);
        }

        const billingAmount = Math.round(billableHours * activeAccess.priceAtCheckIn * 100) / 100;
        const realDurationHours = durationMs / (1000 * 60 * 60);



        const completedAccess = await AccessModel.findOneAndUpdate(
            {
                _id: activeAccess._id,
                status: 'ACTIVE'
            },
            {
                status: 'COMPLETED',
                checkOut: checkOutTime,
                billingAmount,
                operatorOut: params.operator.email
            },
            { new: true }
        );

        if (!completedAccess) {
            throw new NotFoundException('No se encontró un ingreso activo para esta sede.');
        }

        const updatedPerson = await PersonModel.findOneAndUpdate(
            { document: person.document },
            {
                $inc: {
                    accumulatedHours: realDurationHours,
                    [`locationStats.${params.locationId}`]: realDurationHours
                }

            },
            { new: true }
        );

        await dragonfly.del(`access:active:doc:${params.document}`);
        await dragonfly.decr(`access:capacity:${params.locationId}`);

        // --- LIMPIEZA DE RECORDATORIOS (STAY REMINDERS) ---
        await stayReminderService.unschedule(activeAccess._id.toString()).catch(err => {
            logger.warn({ err, accessId: activeAccess._id }, `[Reminders] Fallo al limpiar cola de Redis`);
        });

        logger.info({ document: params.document, location: params.locationId, amount: billingAmount, operator: params.operator.email }, `[BusinessEvent] CHECK_OUT exitoso`);

        this.processLoyalty(completedAccess, updatedPerson!).catch(err => {
            logger.error({ error: err }, `[Fidelidad_Err] Error crítico no bloqueante`);
        });

        return completedAccess;
    },


    async getActiveUsers(locationId: string, operator: UserPayload, page: number = 1, limit: number = 20) {
        const assignedLocations = operator.locations ?? [];
        if (operator.role !== 'ADMIN' && !assignedLocations.includes(locationId)) {
            throw new ForbiddenException('No tienes permiso para operar en esta sede.');
        }

        const query = {
            locationId: new Types.ObjectId(locationId),
            status: 'ACTIVE'
        };

        const totalItems = await AccessModel.countDocuments(query);
        const totalPages = Math.ceil(totalItems / limit) || 1;
        const normalizedPage = Math.max(1, Math.min(page, totalPages));

        const data = await AccessModel.find(query)
            .select('personId checkIn priceAtCheckIn operatorIn -_id')
            .populate('personId', 'document name email')
            .sort({ checkIn: -1 })
            .skip((normalizedPage - 1) * limit)
            .limit(limit);

        return {
            data,
            meta: {
                total: totalItems,
                page: normalizedPage,
                limit,
                pages: totalPages
            }
        };
    },


    async processLoyalty(access: IAccess, person: any) {
        const { document, email, locationStats } = person;
        const locationIdStr = String(access.locationId);

        // --- EXCLUSIÓN ESTRICTA DE STAFF ---
        const isStaff = await StaffGuard.isStaff(email);
        if (isStaff) {
            logger.info({ email }, `[Fidelidad] Abortado: La entidad posee escalafón de sistema. Ineligible para cupones.`);
            return;
        }

        const hoursInLocation = locationStats?.get ? locationStats.get(locationIdStr) : (locationStats?.[locationIdStr] || 0);

        if (hoursInLocation >= 20) {
            const maxBucket = Math.floor(hoursInLocation / 20);
            const location = await LocationModel.findById(access.locationId).select('name').lean();
            const locationName = location?.name || 'Coworking';

            for (let bucket = 1; bucket <= maxBucket; bucket++) {
                try {
                    const coupon = await couponService.issueLoyaltyCoupon(document, locationIdStr, email, bucket);

                    if (coupon) {
                        console.info(`[Fidelidad] Cupón emitido: Bloque ${bucket} (20h) para ${document} en ${locationName}`);

                        const locationNameSafe = locationName || 'Coworking';
                        const message = `¡Felicidades! Has acumulado ${bucket * 20}h en ${locationNameSafe}. Te regalamos un nuevo cupón: ${coupon.code}. Válido hasta ${coupon.expiresAt.toLocaleDateString()}.`;

                        await notificationService.send({
                            to: email,
                            subject: '¡Tienes un nuevo beneficio de fidelidad!',
                            text: message,
                            html: `
                                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                                    <h2 style="color: #2c3e50;">¡Hola!</h2>
                                    <p>Queremos premiar tu constancia en <strong>${locationNameSafe}</strong>.</p>
                                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                                        <p style="margin: 0; font-size: 1.1em;">Has acumulado un total de <strong>${bucket * 20} horas</strong>.</p>
                                        <p style="margin: 10px 0 0 0; font-size: 1.2em; color: #27ae60;">Tu código de cupón: <strong>${coupon.code}</strong></p>
                                    </div>
                                    <p><small>* Válido hasta el ${coupon.expiresAt.toLocaleDateString()}.</small></p>
                                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                    <p style="font-size: 0.9em; color: #7f8c8d;">Gracias por ser parte de nuestra comunidad.</p>
                                </div>
                            `
                        }).catch(err => console.error(`[Fidelidad] Error enviando notificación:`, err));
                    }
                } catch (error) {
                    const mongoError = error as { code?: number };
                    if (mongoError.code === 11000) {
                        // Ya emitido para este bucket, saltar.
                        continue;
                    }
                    throw error;
                }
            }
        }
    }
};
