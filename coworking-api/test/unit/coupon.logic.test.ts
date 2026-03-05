import { describe, test, expect, beforeEach, vi } from 'vitest';
import { couponService } from '../../src/features/coupons/coupon.service';
import { CouponModel } from '../../src/features/coupons/coupon.entity';
import { StaffGuard } from '../../src/core/guards/staff.guard';
import {
    NotFoundException,
    ConflictException,
    ForbiddenException,
} from '../../src/core/exceptions/domain.exception';
import type { UserPayload } from '../../src/types';
import { Types } from 'mongoose';

const locationId = '507f1f77bcf86cd799439011';
const otherLocationId = '507f1f77bcf86cd799439099';

const adminUser: UserPayload = {
    id: '507f1f77bcf86cd799439033',
    email: 'admin@coworking.com',
    role: 'ADMIN',
};

const operatorUser: UserPayload = {
    id: '507f1f77bcf86cd799439044',
    email: 'op@coworking.com',
    role: 'OPERATOR',
    locations: [locationId],
};

const mockCoupon = {
    _id: new Types.ObjectId(),
    code: 'LOYALTY-5678-ABCD1234',
    personDocument: '12345678',
    locationId: new Types.ObjectId(locationId),
    status: 'VALID',
    expiresAt: new Date(Date.now() + 86400000),
};

beforeEach(() => {
    (CouponModel.findOne as any).mockReset();
    (CouponModel.findOneAndUpdate as any).mockReset();
    (CouponModel.find as any).mockReset();
    (CouponModel.countDocuments as any).mockReset();
    (CouponModel.create as any).mockReset();
    vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(false);
    vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// couponService.buildQuery
// ═══════════════════════════════════════════════════════════════════════════
describe('couponService.buildQuery', () => {
    test('ADMIN sin filtros → query vacío (acceso global)', () => {
        const query = couponService.buildQuery(adminUser, {});
        expect(query).toEqual({});
    });

    test('ADMIN con locationId → query filtra por locationId', () => {
        const query = couponService.buildQuery(adminUser, { locationId });
        expect(query['locationId']).toBe(locationId);
    });

    test('ADMIN con status VALID → query incluye expiresAt $gt now', () => {
        const query = couponService.buildQuery(adminUser, { status: 'VALID' });
        expect(query['status']).toBe('VALID');
        expect(query['expiresAt']).toBeDefined();
        expect((query['expiresAt'] as Record<string, Date>)['$gt']).toBeInstanceOf(Date);
    });

    test('ADMIN con status USED → sin filtro expiresAt', () => {
        const query = couponService.buildQuery(adminUser, { status: 'USED' });
        expect(query['status']).toBe('USED');
        expect(query['expiresAt']).toBeUndefined();
    });

    test('OPERATOR con locationId asignado → query filtra por esa sede', () => {
        const query = couponService.buildQuery(operatorUser, { locationId });
        expect(query['locationId']).toBe(locationId);
    });

    test('OPERATOR con locationId no asignado → ForbiddenException', () => {
        expect(() =>
            couponService.buildQuery(operatorUser, { locationId: otherLocationId })
        ).toThrow(ForbiddenException);
    });

    test('OPERATOR sin locationId → query $in de sedes asignadas', () => {
        const query = couponService.buildQuery(operatorUser, {});
        expect((query['locationId'] as Record<string, string[]>)['$in']).toContain(locationId);
    });

    test('OPERATOR con locations undefined → $in vacío', () => {
        const noLocOp: UserPayload = { ...operatorUser, locations: undefined };
        const query = couponService.buildQuery(noLocOp, {});
        expect((query['locationId'] as Record<string, string[]>)['$in']).toEqual([]);
    });

    test('ADMIN con personDocument → query filtra por personDocument', () => {
        const query = couponService.buildQuery(adminUser, { personDocument: '12345678' });
        expect(query['personDocument']).toBe('12345678');
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// couponService.listCoupons
// ═══════════════════════════════════════════════════════════════════════════
describe('couponService.listCoupons', () => {
    test('retorna data y meta paginados', async () => {
        const mockChain = {
            sort: () => ({ skip: () => ({ limit: () => ({ lean: () => Promise.resolve([mockCoupon]) }) }) })
        };
        (CouponModel.find as any).mockReturnValue(mockChain);
        (CouponModel.countDocuments as any).mockResolvedValue(1);

        const result = await couponService.listCoupons(adminUser, { page: 1, limit: 10 });
        expect(result.data).toHaveLength(1);
        expect(result.meta.total).toBe(1);
        expect(result.meta.totalPages).toBe(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// couponService.checkRedeemPermission
// ═══════════════════════════════════════════════════════════════════════════
describe('couponService.checkRedeemPermission', () => {
    test('ADMIN puede redimir en cualquier sede', () => {
        expect(() => couponService.checkRedeemPermission(adminUser, otherLocationId)).not.toThrow();
    });

    test('OPERATOR puede redimir en su sede asignada', () => {
        expect(() => couponService.checkRedeemPermission(operatorUser, locationId)).not.toThrow();
    });

    test('OPERATOR no puede redimir en sede no asignada → ForbiddenException', () => {
        expect(() => couponService.checkRedeemPermission(operatorUser, otherLocationId)).toThrow(ForbiddenException);
    });

    test('OPERATOR con locations vacías → ForbiddenException en cualquier sede', () => {
        const noLocOp: UserPayload = { ...operatorUser, locations: [] };
        expect(() => couponService.checkRedeemPermission(noLocOp, locationId)).toThrow(ForbiddenException);
    });

    test('OPERATOR con locations undefined → ForbiddenException', () => {
        const noLocOp: UserPayload = { ...operatorUser, locations: undefined };
        expect(() => couponService.checkRedeemPermission(noLocOp, locationId)).toThrow(ForbiddenException);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// couponService.redeemCoupon
// ═══════════════════════════════════════════════════════════════════════════
describe('couponService.redeemCoupon', () => {
    test('cupón válido → retorna cupón actualizado a USED', async () => {
        const usedCoupon = { ...mockCoupon, status: 'USED' };
        (CouponModel.findOneAndUpdate as any).mockResolvedValue(usedCoupon);

        const result = await couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId);
        expect(result).toEqual(expect.objectContaining({ code: 'LOYALTY-5678-ABCD1234', status: 'USED' }));
        expect(CouponModel.findOne).not.toHaveBeenCalled();
    });

    test('CAS retorna null y findOne retorna null → NotFoundException', async () => {
        (CouponModel.findOneAndUpdate as any).mockResolvedValue(null);
        (CouponModel.findOne as any).mockResolvedValue(null);

        await expect(couponService.redeemCoupon('BADCODE', locationId)).rejects.toBeInstanceOf(NotFoundException);
    });

    test('CAS retorna null, cupón existe con status USED → ConflictException', async () => {
        (CouponModel.findOneAndUpdate as any).mockResolvedValue(null);
        (CouponModel.findOne as any).mockResolvedValue({ ...mockCoupon, status: 'USED' });

        await expect(couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId)).rejects.toBeInstanceOf(ConflictException);
        const err = await couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId).catch(e => e);
        expect((err as ConflictException).detail).toContain('ya fue utilizado');
    });

    test('CAS retorna null, cupón existe con status EXPIRED → ConflictException', async () => {
        (CouponModel.findOneAndUpdate as any).mockResolvedValue(null);
        (CouponModel.findOne as any).mockResolvedValue({ ...mockCoupon, status: 'EXPIRED', expiresAt: new Date(0) });

        await expect(couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId)).rejects.toBeInstanceOf(ConflictException);
        const err = await couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId).catch(e => e);
        expect((err as ConflictException).detail).toContain('expirado');
    });

    test('CAS retorna null, cupón VALID pero expiresAt pasado (race) → ConflictException', async () => {
        (CouponModel.findOneAndUpdate as any).mockResolvedValue(null);
        (CouponModel.findOne as any).mockResolvedValue({ ...mockCoupon, status: 'VALID', expiresAt: new Date(Date.now() - 1000) });

        await expect(couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId)).rejects.toBeInstanceOf(ConflictException);
    });

    test('findOneAndUpdate se llama con los argumentos del CAS correcto', async () => {
        (CouponModel.findOneAndUpdate as any).mockResolvedValue(mockCoupon);

        await couponService.redeemCoupon('LOYALTY-5678-ABCD1234', locationId);

        expect(CouponModel.findOneAndUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                code: 'LOYALTY-5678-ABCD1234',
                status: 'VALID',
                expiresAt: expect.objectContaining({ $gt: expect.any(Date) }),
            }),
            expect.objectContaining({ status: 'USED' }),
            { new: true }
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// couponService.issueLoyaltyCoupon
// ═══════════════════════════════════════════════════════════════════════════
describe('couponService.issueLoyaltyCoupon', () => {
    const document = '12345678';
    const email = 'test@test.com';
    const bucket = 1;

    test('éxito → crea cupón con bucket y código generado', async () => {
        (CouponModel.create as any).mockResolvedValue(mockCoupon);

        const result = await couponService.issueLoyaltyCoupon(document, locationId, email, bucket);

        expect(result).toEqual(mockCoupon);
        expect(CouponModel.create).toHaveBeenCalledWith(expect.objectContaining({
            personDocument: document,
            locationId,
            loyaltyBucket: bucket,
            status: 'VALID'
        }));
    });

    test('error 11000 (duplicado) → retorna null (tolerancia silenciada)', async () => {
        (CouponModel.create as any).mockRejectedValue({ code: 11000 });

        const result = await couponService.issueLoyaltyCoupon(document, locationId, email, bucket);

        expect(result).toBeNull();
    });

    test('otro error → re-throw', async () => {
        const error = new Error('Database down');
        (CouponModel.create as any).mockRejectedValue(error);

        await expect(
            couponService.issueLoyaltyCoupon(document, locationId, email, bucket)
        ).rejects.toThrow('Database down');
    });

    test('PROTECCIÓN DE DATOS: si el email es STAFF → retorna null y no crea cupón', async () => {
        vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(true);

        const result = await couponService.issueLoyaltyCoupon(document, locationId, email, bucket);

        expect(result).toBeNull();
        expect(CouponModel.create).not.toHaveBeenCalled();
    });
});
