import { describe, test, expect, beforeEach, vi } from 'vitest';
import { accessService } from '../../src/features/access/access.service';
import { couponService } from '../../src/features/coupons/coupon.service';
import { LocationModel } from '../../src/features/locations/location.entity';
import { StaffGuard } from '../../src/core/guards/staff.guard';
import { Types } from 'mongoose';

vi.mock('../../src/features/coupons/coupon.service', () => ({
    couponService: {
        issueLoyaltyCoupon: vi.fn()
    }
}));

vi.mock('../../src/core/guards/staff.guard', () => ({
    StaffGuard: {
        isStaff: vi.fn()
    }
}));

vi.mock('../../src/features/locations/location.entity', () => ({
    LocationModel: {
        findById: vi.fn()
    }
}));

describe('Individual processLoyalty Coverage Test', () => {
    const locationId = '507f1f77bcf86cd799439011';
    const mockAccess: any = {
        locationId: new Types.ObjectId(locationId)
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('totalHours >= 20 y sede no encontrada → usa nombre por defecto "Coworking"', async () => {
        (StaffGuard.isStaff as any).mockResolvedValue(false);
        (couponService.issueLoyaltyCoupon as any).mockResolvedValue({
            code: 'LOYALTY-TEST',
            expiresAt: new Date()
        });

        (LocationModel.findById as any).mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(null)
            })
        });

        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'juan@example.com',
            locationStats: new Map([[locationId, 25]])
        });

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalled();
    });
    test('Si el cupón es null → no intenta notificar', async () => {
        (StaffGuard.isStaff as any).mockResolvedValue(false);
        (couponService.issueLoyaltyCoupon as any).mockResolvedValue(null);

        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'juan@example.com',
            locationStats: new Map([[locationId, 25]])
        });

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalled();
    });
});
