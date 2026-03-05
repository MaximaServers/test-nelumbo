import { CouponModel } from './coupon.entity';
import { StaffGuard } from '../../core/guards/staff.guard';
import {
    NotFoundException,
    ConflictException,
    ForbiddenException,
} from '../../core/exceptions/domain.exception';
import type { UserPayload } from '../../types';

export const couponService = {

    buildQuery(user: UserPayload, filters: { locationId?: string; personDocument?: string; status?: string }): Record<string, unknown> {
        const query: Record<string, unknown> = {};
        const now = new Date();

        if (filters.status) {
            query.status = filters.status;
            if (filters.status === 'VALID') {
                query.expiresAt = { $gt: now };
            }
        }

        if (filters.personDocument) query.personDocument = filters.personDocument;

        if (user.role === 'ADMIN') {
            if (filters.locationId) query.locationId = filters.locationId;
        } else {
            const assignedLocations = user.locations ?? [];
            if (filters.locationId) {
                if (!assignedLocations.includes(filters.locationId)) {
                    throw new ForbiddenException('No tienes permiso para consultar esta sede.');
                }
                query.locationId = filters.locationId;
            } else {
                query.locationId = { $in: assignedLocations };
            }
        }

        return query;
    },

    async listCoupons(user: UserPayload, filters: { locationId?: string; personDocument?: string; status?: string; page: number; limit: number }) {
        const { page, limit } = filters;
        const skip = (page - 1) * limit;
        const query = this.buildQuery(user, filters);

        const [coupons, total] = await Promise.all([
            CouponModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            CouponModel.countDocuments(query)
        ]);

        return {
            data: coupons,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    checkRedeemPermission(user: UserPayload, locationId: string): void {
        const assignedLocations = user.locations ?? [];
        if (user.role !== 'ADMIN' && !assignedLocations.includes(locationId)) {
            throw new ForbiddenException('No tienes permiso para operar en esta sede.');
        }
    },

    async redeemCoupon(code: string, locationId: string) {
        const updated = await CouponModel.findOneAndUpdate(
            { code, status: 'VALID', expiresAt: { $gt: new Date() } },
            { status: 'USED', redeemedAt: new Date(), redeemedLocationId: locationId },
            { new: true }
        );

        if (!updated) {
            const existing = await CouponModel.findOne({ code, locationId });
            if (!existing) throw new NotFoundException('Cupón no encontrado para esta sede.');
            if (existing.status === 'USED') throw new ConflictException('El cupón ya fue utilizado.');
            throw new ConflictException('El cupón ha expirado y no puede redimirse.');
        }

        return updated;
    },

    async getAvailableCouponsForPerson(document: string, locationId: string) {
        const now = new Date();
        return CouponModel.find({
            personDocument: document,
            locationId: locationId,
            status: 'VALID',
            expiresAt: { $gt: now }
        });
    },

    async issueLoyaltyCoupon(document: string, locationId: string, email: string, bucket: number) {
        // --- PROTECCIÓN DE DATOS: STAFF NO PUEDE SER BENEFICIARIO DE CUPONES ---
        const isStaff = await StaffGuard.isStaff(email);
        if (isStaff) {
            console.warn(`[Fidelidad] Abortado: La entidad con email ${email} posee escalafón de sistema. Ineligible para cupones.`);
            return null;
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 10);

        try {
            const coupon = await CouponModel.create({
                personDocument: document,
                locationId: locationId,
                loyaltyBucket: bucket,
                code: `LOYALTY-${document.slice(-4)}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
                issuedAt: new Date(),
                expiresAt: expiresAt,
                status: 'VALID'
            });
            return coupon;
        } catch (error) {
            const mongoError = error as { code?: number };
            if (mongoError.code === 11000) {
                console.warn(`[Fidelidad] Tolerancia a Concurrencia (E11000) aplicada al generar cupón para ${document} en ${locationId}`);
                return null;
            }
            throw error;
        }
    }
};
