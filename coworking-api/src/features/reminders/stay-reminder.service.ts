import { dragonfly } from '../../infrastructure/cache/dragonfly';
import { logger } from '../../core/logger/logger';
import { AccessModel } from '../access/access.entity';
import { PersonModel } from '../people/person.entity';
import { LocationModel } from '../locations/location.entity';
import { notificationService } from '../../infrastructure/notifications/notification.service';
import { Types } from 'mongoose';

const REMINDER_QUEUE = 'reminders:queue';

export const stayReminderService = {
    /**
     * Programa los recordatorios de 10 y 5 minutos antes de que se cumpla la próxima hora.
     */
    async schedule(accessId: string, checkInTime: Date, cycle: number = 1) {
        if (!checkInTime || !(checkInTime instanceof Date)) {
            logger.warn({ accessId }, `[Reminders] Fallo al programar: checkInTime no es una fecha válida.`);
            return;
        }

        const baseTime = checkInTime.getTime();
        const nextHourMs = baseTime + (cycle * 60 * 60 * 1000);

        const reminder10Score = nextHourMs - (10 * 60 * 1000); // T-10
        const reminder5Score = nextHourMs - (5 * 60 * 1000);  // T-5

        // Formato ID: accessId:Type:Cycle
        const r10Id = `${accessId}:T10:${cycle}`;
        const r5Id = `${accessId}:T5:${cycle}`;

        try {
            await dragonfly.zadd(REMINDER_QUEUE,
                reminder10Score, r10Id,
                reminder5Score, r5Id
            );
            logger.info({ accessId, cycle }, `[Reminders] Programados recordatorios para ciclo ${cycle}`);
        } catch (error) {
            logger.error({ error, accessId }, `[Reminders_Err] Fallo al programar en Redis`);
        }
    },

    /**
     * UNSCHEDULE
     * No es estrictamente vital (por el check ACTIVE), pero ayuda a limpiar Redis.
     */
    async unschedule(accessId: string) {
        try {
            // Buscamos patrones del accessId en el ZSET
            const members = await dragonfly.zrange(REMINDER_QUEUE, 0, -1);
            const toRemove = members.filter(m => m.startsWith(accessId));
            if (toRemove.length > 0) {
                await dragonfly.zrem(REMINDER_QUEUE, ...toRemove);
            }
        } catch (error) {
            logger.warn({ accessId }, `[Reminders] No se pudo limpiar Redis al checkout`);
        }
    },

    /**
     * PROCESS QUEUE
     * Consumidor de la cola de prioridad.
     */
    async processQueue() {
        const now = Date.now();

        try {
            // Obtenemos recordatorios vencidos (score <= now)
            const dueReminders = await dragonfly.zrangebyscore(REMINDER_QUEUE, '-inf', now);

            if (dueReminders.length === 0) return;

            for (const item of dueReminders) {
                const [accessId, type, cycleStr] = item.split(':');
                const cycle = parseInt(cycleStr);

                // ATOMICIADAD: Los sacamos de la cola antes de procesar
                const removed = await dragonfly.zrem(REMINDER_QUEUE, item);
                if (removed === 0) continue; // Ya procesado por otro nodo

                // VALIDAR SI SIGUE ACTIVO
                const access = await AccessModel.findOne({
                    _id: new Types.ObjectId(accessId),
                    status: 'ACTIVE'
                });

                if (!access) {
                    logger.debug({ accessId }, `[Reminders] Ignorado: Acceso ya no está activo.`);
                    continue;
                }

                // CARGAR DATOS PARA NOTIFICAR
                const person = await PersonModel.findById(access.personId).select('name email').lean();
                const location = await LocationModel.findById(access.locationId).select('name').lean();

                if (person && location) {
                    const timeRemaining = type === 'T10' ? '10' : '5';
                    const nextHour = cycle + 1;

                    const result = await notificationService.send({
                        to: person.email,
                        subject: `⌛ Recordatorio de estancia - ${location.name}`,
                        text: `Hola ${person.name}, te recordamos que en ${timeRemaining} minutos completarás ${cycle} hora(s) de estancia. Si te quedas, empezarás a facturar la hora ${nextHour}.`,
                        html: `
                            <div style="font-family: sans-serif; padding: 20px; color: #333; border: 1px solid #eee; border-radius: 8px;">
                                <h3 style="color: #c0392b;">🔔 Recordatorio de Estancia</h3>
                                <p>Hola <strong>${person.name}</strong>,</p>
                                <p>Te notificamos que te faltan aproximadamente <strong>${timeRemaining} minutos</strong> para completar <strong>${cycle} hora(s)</strong> de estancia en <strong>${location.name}</strong>.</p>
                                <p style="background: #fff3cd; padding: 10px; border-radius: 4px;">
                                    Si continúas después de este tiempo, se registrará el inicio de tu <strong>hora número ${nextHour}</strong>.
                                </p>
                                <p>Si deseas finalizar tu estadía ahora, por favor acércate a recepción para tu check-out.</p>
                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                <small style="color: #7f8c8d;">Este es un mensaje automático para ayudarte a gestionar tu tiempo en Coworking.</small>
                            </div>
                        `
                    });

                    if (result.success) {
                        logger.info({ accessId, type }, `[Reminders] Notificación enviada exitosamente.`);
                        // SI FUE EL T5 (Último de este ciclo), PROGRAMAMOS EL SIGUIENTE CICLO
                        if (type === 'T5') {
                            await this.schedule(accessId, access.checkIn, cycle + 1);
                        }
                    } else {
                        // Si falla, lo devolvemos a Redis para dentro de 1 minuto
                        logger.warn({ accessId, error: result.error }, `[Reminders_Retry] El envío falló. Agendando reintento...`);
                        await dragonfly.zadd(REMINDER_QUEUE, Date.now() + 60000, item);
                    }
                }
            }
        } catch (error) {
            logger.error({ error }, `[Reminders_Job_Err] Error procesando cola de recordatorios`);
        }
    },

    /**
     * Recorre los accesos activos y asegura que tengan recordatorios en Redis.
     * Para después de caídas de Redis o desincronizaciones manuales.
     */
    async reSyncReminders() {
        try {
            const activeAccesses = await AccessModel.find({ status: 'ACTIVE' });
            logger.info(`[Reminders_Sync] Iniciando sincronización de ${activeAccesses.length} accesos activos...`);

            for (const access of activeAccesses) {
                const members = await dragonfly.zrange(REMINDER_QUEUE, 0, -1);
                const hasReminders = members.some(m => m.startsWith(access._id.toString()));

                if (!hasReminders) {
                    const elapsedMs = Date.now() - access.checkIn.getTime();
                    const cycle = Math.floor(elapsedMs / (60 * 60 * 1000)) + 1;
                    await this.schedule(access._id.toString(), access.checkIn, cycle);
                    logger.info({ accessId: access._id }, `[Reminders_Sync] Recuperado recordatorio para acceso.`);
                }
            }
        } catch (error) {
            logger.error({ error }, `[Reminders_Sync_Err] Fallo crítico durante la sincronización`);
        }
    }
}
