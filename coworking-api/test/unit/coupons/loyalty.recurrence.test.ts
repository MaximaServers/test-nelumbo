import { describe, test, expect, beforeEach, vi } from 'vitest';
import { accessService } from '../../../src/features/access/access.service';
import { couponService } from '../../../src/features/coupons/coupon.service';
import { LocationModel } from '../../../src/features/locations/location.entity';
import { UserModel } from '../../../src/features/auth/user.entity';
import { StaffGuard } from '../../../src/core/guards/staff.guard';
import { notificationService } from '../../../src/infrastructure/notifications/notification.service';
import { Types } from 'mongoose';

describe('Loyalty Recurrence Logic', () => {
    const person = {
        document: '12345678',
        email: 'client@mail.com',
        locationStats: new Map<string, number>()
    };

    const access = {
        locationId: new Types.ObjectId('507f1f77bcf86cd799439011'),
    } as any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock Model methods manually because they are classes/functions
        // Mock StaffGuard
        vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(false);
        vi.spyOn(StaffGuard, 'ensureIsNotStaff').mockResolvedValue(undefined);

        (LocationModel.findById as any).mockReturnValue({
            select: vi.fn().mockReturnThis(),
            lean: vi.fn().mockResolvedValue({ name: 'Sede Test' })
        });

        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockResolvedValue(null);
        vi.spyOn(notificationService, 'send').mockResolvedValue({ success: true } as any);
    });

    test('Debe emitir 1 cupón a las 20 horas', async () => {
        person.locationStats.set(String(access.locationId), 20);

        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockResolvedValue({ code: 'C1', expiresAt: new Date() } as any);

        await accessService.processLoyalty(access, person);

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledTimes(1);
        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledWith(person.document, String(access.locationId), person.email, 1);
    });

    test('Debe emitir 2 cupones si tiene 40 horas', async () => {
        person.locationStats.set(String(access.locationId), 40);

        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockResolvedValue({ code: 'CX', expiresAt: new Date() } as any);

        await accessService.processLoyalty(access, person);

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledTimes(2);
        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), 1);
        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), 2);
    });

    test('No debe emitir duplicados si ya existen (manejo de bucket)', async () => {
        person.locationStats.set(String(access.locationId), 40);

        // Simular que el bucket 1 ya existe (error 11000) y el 2 es nuevo
        vi.spyOn(couponService, 'issueLoyaltyCoupon')
            .mockRejectedValueOnce({ code: 11000 })
            .mockResolvedValueOnce({ code: 'C2', expiresAt: new Date() } as any);

        await accessService.processLoyalty(access, person);

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledTimes(2);
    });

    test('Debe excluir a STAFF (ADMIN/OPERATOR) de recibir cupones', async () => {
        person.locationStats.set(String(access.locationId), 100);

        vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(true);

        await accessService.processLoyalty(access, person);

        expect(couponService.issueLoyaltyCoupon).not.toHaveBeenCalled();
    });

    test('Las sedes deben ser independientes', async () => {
        const otherLocId = '507f1f77bcf86cd799439099';
        const stats = new Map<string, number>();
        stats.set(String(access.locationId), 25);
        stats.set(otherLocId, 10);

        const localPerson = { ...person, locationStats: stats };

        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockResolvedValue({ code: 'C1', expiresAt: new Date() } as any);

        // Procesar para sede A
        await accessService.processLoyalty(access, localPerson);
        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledTimes(1);
        expect((couponService.issueLoyaltyCoupon as any).mock.calls[0][1]).toBe(String(access.locationId));

        vi.clearAllMocks();

        // Procesar para sede B (que solo tiene 10h)
        const accessB = { locationId: new Types.ObjectId(otherLocId) } as any;
        await accessService.processLoyalty(accessB, localPerson);
        expect(couponService.issueLoyaltyCoupon).not.toHaveBeenCalled();
    });
});
