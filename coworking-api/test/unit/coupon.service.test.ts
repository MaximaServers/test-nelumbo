import { describe, test, expect, beforeEach, vi } from 'vitest';
import { couponService } from '../../src/features/coupons/coupon.service';
import { CouponModel } from '../../src/features/coupons/coupon.entity';
import { StaffGuard } from '../../src/core/guards/staff.guard';
import { ForbiddenException, NotFoundException, ConflictException } from '../../src/core/exceptions/domain.exception';
import { Types } from 'mongoose';

describe('CouponService Unit Tests', () => {
    const adminUser: any = { role: 'ADMIN' };
    const operatorUser: any = { role: 'OPERATOR', locations: ['loc1'] };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('buildQuery', () => {
        test('ADMIN con status VALID y locationId', () => {
            const query = couponService.buildQuery(adminUser, { status: 'VALID', locationId: 'loc1' });
            expect(query.status).toBe('VALID');
            expect(query.locationId).toBe('loc1');
            expect(query.expiresAt).toBeDefined();
        });

        test('OPERATOR sin locationId → filtra por sus sedes', () => {
            const query = couponService.buildQuery(operatorUser, {});
            expect(query.locationId).toEqual({ $in: ['loc1'] });
        });

        test('OPERATOR con locationId prohibida → ForbiddenException', () => {
            expect(() => couponService.buildQuery(operatorUser, { locationId: 'loc2' }))
                .toThrow(ForbiddenException);
        });

        test('OPERATOR con locations undefined → utiliza array vacío', () => {
            const opNoLocs: any = { role: 'OPERATOR' }; // missing locations
            const query = couponService.buildQuery(opNoLocs, {});
            expect(query.locationId).toEqual({ $in: [] });
        });
    });

    describe('redeemCoupon', () => {
        test('Si no encuentra cupón válido → lanza NotFoundException (si no existe)', async () => {
            CouponModel._internal.findOneAndUpdate.mockReturnValue(null);
            CouponModel._internal.findOne.mockReturnValue(null);

            await expect(couponService.redeemCoupon('BAD', 'loc1'))
                .rejects.toBeInstanceOf(NotFoundException);
        });

        test('Si cupón está USED → lanza ConflictException', async () => {
            CouponModel._internal.findOneAndUpdate.mockReturnValue(null);
            CouponModel._internal.findOne.mockReturnValue({ status: 'USED' });

            await expect(couponService.redeemCoupon('C1', 'loc1'))
                .rejects.toThrow('ya fue utilizado');
        });

        test('Si cupón está caducado → lanza ConflictException', async () => {
            CouponModel._internal.findOneAndUpdate.mockReturnValue(null);
            CouponModel._internal.findOne.mockReturnValue({ status: 'VALID', expiresAt: new Date(Date.now() - 1000) });

            await expect(couponService.redeemCoupon('C1', 'loc1'))
                .rejects.toThrow('ha expirado');
        });
    });


    describe('issueLoyaltyCoupon', () => {
        test('Si es staff → retorna null y no crea', async () => {
            vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(true);
            const res = await couponService.issueLoyaltyCoupon('doc', 'loc', 'staff@test.com', 1);
            expect(res).toBeNull();
            expect(CouponModel.create).not.toHaveBeenCalled();
        });

        test('Conflicto de concurrencia (E11000) → retorna null', async () => {
            vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(false);
            const error: any = new Error('Duplicate');
            error.code = 11000;
            CouponModel._internal.create.mockRejectedValue(error);

            const res = await couponService.issueLoyaltyCoupon('doc', 'loc', 'p@test.com', 1);
            expect(res).toBeNull();
        });

        test('Otro error → re-throw', async () => {
            vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(false);
            CouponModel._internal.create.mockRejectedValue(new Error('DB Fail'));

            await expect(couponService.issueLoyaltyCoupon('doc', 'loc', 'p@test.com', 1))
                .rejects.toThrow('DB Fail');
        });

    });
});
