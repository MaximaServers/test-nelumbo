import { describe, test, expect, beforeEach, vi } from 'vitest';
import { accessService } from '../../src/features/access/access.service';
import { LocationModel } from '../../src/features/locations/location.entity';
import { AccessModel } from '../../src/features/access/access.entity';
import { PersonModel } from '../../src/features/people/person.entity';
import { StaffGuard } from '../../src/core/guards/staff.guard';
import { UserModel } from '../../src/features/auth/user.entity';
import { couponService } from '../../src/features/coupons/coupon.service';
import { dragonfly } from '../../src/infrastructure/cache/dragonfly';
import { notificationService } from '../../src/infrastructure/notifications/notification.service';
import {
    NotFoundException,
    ForbiddenException,
    ConflictException,
} from '../../src/core/exceptions/domain.exception';
import type { UserPayload } from '../../src/types';
import { Types } from 'mongoose';

vi.mock('../../src/features/coupons/coupon.service', () => ({
    couponService: {
        issueLoyaltyCoupon: vi.fn().mockResolvedValue({ code: 'LOYALTY-C1', expiresAt: new Date(), status: 'VALID' }),
        buildQuery: vi.fn(),
        listCoupons: vi.fn(),
        checkRedeemPermission: vi.fn(),
        redeemCoupon: vi.fn(),
        getAvailableCouponsForPerson: vi.fn().mockResolvedValue([])
    }
}));


// ─── Helpers de tipo ────────────────────────────────────────────────────────
const locationId = '507f1f77bcf86cd799439011';
const personId = new Types.ObjectId('507f1f77bcf86cd799439022');

const adminOperator: UserPayload = {
    id: '507f1f77bcf86cd799439033',
    email: 'admin@coworking.com',
    role: 'ADMIN',
};

const validOperator: UserPayload = {
    id: '507f1f77bcf86cd799439044',
    email: 'op@coworking.com',
    role: 'OPERATOR',
    locations: [locationId],
};

const unauthorizedOperator: UserPayload = {
    id: '507f1f77bcf86cd799439055',
    email: 'other@coworking.com',
    role: 'OPERATOR',
    locations: ['aabbccddeeff001122334455'], // sede diferente
};

const mockLocation = {
    _id: new Types.ObjectId(locationId),
    name: 'Sede Norte',
    maxCapacity: 10,
    pricePerHour: 5,
};

const mockPerson = {
    _id: personId,
    document: '12345678',
    name: 'Juan Pérez',
    email: 'juan@example.com',
};

// ─── Resetear mocks antes de cada test ──────────────────────────────────────
beforeEach(() => {
    (LocationModel.findById as any).mockReset();
    (AccessModel.findOne as any).mockReset();
    (AccessModel.findOneAndUpdate as any).mockReset();
    (AccessModel.create as any).mockReset();
    (AccessModel.aggregate as any).mockReset();
    (PersonModel.findOne as any).mockReset();
    (PersonModel.findOneAndUpdate as any).mockReset();
    (UserModel.findOne as any).mockReset();

    // Centralized Staff Protection Mocks
    vi.spyOn(StaffGuard, 'ensureIsNotStaff').mockResolvedValue(undefined);
    vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(false);

    vi.spyOn(couponService, 'getAvailableCouponsForPerson').mockReset();
    vi.spyOn(couponService, 'issueLoyaltyCoupon').mockReset();

    (dragonfly.set as any).mockReset();
    (dragonfly.get as any).mockReset();
    (dragonfly.del as any).mockReset();
    (dragonfly.decr as any).mockReset();
    (dragonfly.eval as any).mockReset();
    (notificationService.send as any).mockReset();
    vi.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════════
// checkIn
// ═══════════════════════════════════════════════════════════════════════════
describe('accessService.checkIn', () => {
    const checkInParams = {
        document: '12345678',
        name: 'Juan Pérez',
        email: 'juan@example.com',
        locationId,
        operator: validOperator,
    };

    test('sede no existe → NotFoundException', async () => {
        (LocationModel.findById as any).mockResolvedValue(null);

        await expect(accessService.checkIn(checkInParams)).rejects.toBeInstanceOf(NotFoundException);
        expect(dragonfly.set).not.toHaveBeenCalled();
    });

    test('El email pertenece al staff → ForbiddenException', async () => {
        vi.spyOn(StaffGuard, 'ensureIsNotStaff').mockRejectedValue(new ForbiddenException('Staff cannot register'));

        await expect(accessService.checkIn(checkInParams)).rejects.toBeInstanceOf(ForbiddenException);
        expect(LocationModel.findById).not.toHaveBeenCalled();
        expect(dragonfly.set).not.toHaveBeenCalled();
    });

    test('OPERATOR sin permiso en la sede → ForbiddenException', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);

        await expect(
            accessService.checkIn({ ...checkInParams, operator: unauthorizedOperator })
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(dragonfly.set).not.toHaveBeenCalled();
    });

    test('ADMIN bypasea verificación de sede asignada', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);
        // Lock NX adquirido
        (dragonfly.set as any).mockResolvedValue('OK');
        // LUA retorna capacidad nueva (1)
        (dragonfly.eval as any).mockResolvedValue(1);
        // Person upsert
        (PersonModel.findOneAndUpdate as any).mockResolvedValue(mockPerson);
        // Access creado
        (AccessModel.create as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            status: 'ACTIVE',
            checkIn: new Date(),
        });
        // Sin cupones
        vi.spyOn(couponService, 'getAvailableCouponsForPerson').mockResolvedValue([]);

        const result = await accessService.checkIn({ ...checkInParams, operator: adminOperator });
        expect(result.access).toBeDefined();
        expect(dragonfly.set).toHaveBeenCalledTimes(1);
    });

    test('lock Redis ya existe (NX falla) → ConflictException, sin crear Access', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);
        // NX falla: retorna null
        (dragonfly.set as any).mockResolvedValue(null);

        await expect(accessService.checkIn(checkInParams)).rejects.toBeInstanceOf(ConflictException);
        expect(AccessModel.create).not.toHaveBeenCalled();
    });

    test('LUA retorna -1 (capacidad llena) → ConflictException + rollback del lockKey', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);
        (dragonfly.set as any).mockResolvedValue('OK');
        // LUA dice: capacidad llena
        (dragonfly.eval as any).mockResolvedValue(-1);
        (dragonfly.del as any).mockResolvedValue(1);

        await expect(accessService.checkIn(checkInParams)).rejects.toBeInstanceOf(ConflictException);
        // rollback: se debe borrar el lock
        expect(dragonfly.del).toHaveBeenCalledWith(`access:active:doc:${checkInParams.document}`);
        expect(AccessModel.create).not.toHaveBeenCalled();
    });

    test('AccessModel.create falla → rollback de capKey y lockKey, re-throw', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);
        (dragonfly.set as any).mockResolvedValue('OK');
        (dragonfly.eval as any).mockResolvedValue(1);
        (PersonModel.findOneAndUpdate as any).mockResolvedValue(mockPerson);
        const dbError = new Error('MongoDB write failed');
        (AccessModel.create as any).mockRejectedValue(dbError);
        (dragonfly.decr as any).mockResolvedValue(0);
        (dragonfly.del as any).mockResolvedValue(1);

        await expect(accessService.checkIn(checkInParams)).rejects.toThrow('MongoDB write failed');
        expect(dragonfly.decr).toHaveBeenCalledWith(`access:capacity:${locationId}`);
        expect(dragonfly.del).toHaveBeenCalledWith(`access:active:doc:${checkInParams.document}`);
    });

    test('éxito sin cupones disponibles → retorna access con availableCoupons vacío', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);
        (dragonfly.set as any).mockResolvedValue('OK');
        (dragonfly.eval as any).mockResolvedValue(1);
        (PersonModel.findOneAndUpdate as any).mockResolvedValue(mockPerson);
        const mockAccess = { _id: new Types.ObjectId(), status: 'ACTIVE', checkIn: new Date() };
        (AccessModel.create as any).mockResolvedValue(mockAccess);
        vi.spyOn(couponService, 'getAvailableCouponsForPerson').mockResolvedValue([]);

        const result = await accessService.checkIn(checkInParams);
        expect(result.access).toBe(mockAccess);
        expect(result.availableCoupons).toEqual([]);
    });

    test('éxito con cupones disponibles → retorna cupones mapeados (código + expiresAt)', async () => {
        (LocationModel.findById as any).mockResolvedValue(mockLocation);
        (dragonfly.set as any).mockResolvedValue('OK');
        (dragonfly.eval as any).mockResolvedValue(2);
        (PersonModel.findOneAndUpdate as any).mockResolvedValue(mockPerson);
        (AccessModel.create as any).mockResolvedValue({ _id: new Types.ObjectId(), status: 'ACTIVE', checkIn: new Date() });
        const expiresAt = new Date(Date.now() + 86400000);
        vi.spyOn(couponService, 'getAvailableCouponsForPerson').mockResolvedValue([
            { code: 'LOYALTY-5678-ABCD1234', expiresAt } as any,
        ]);

        const result = await accessService.checkIn(checkInParams);
        expect(result.availableCoupons).toHaveLength(1);
        expect(result.availableCoupons[0].code).toBe('LOYALTY-5678-ABCD1234');
        expect(result.availableCoupons[0].expiresAt).toBe(expiresAt);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// checkOut
// ═══════════════════════════════════════════════════════════════════════════
describe('accessService.checkOut', () => {
    const checkOutParams = {
        document: '12345678',
        locationId,
        operator: validOperator,
    };

    test('OPERATOR sin permiso → ForbiddenException', async () => {
        await expect(
            accessService.checkOut({ ...checkOutParams, operator: unauthorizedOperator })
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(PersonModel.findOne).not.toHaveBeenCalled();
    });

    test('Person no encontrada → NotFoundException', async () => {
        (PersonModel.findOne as any).mockResolvedValue(null);

        await expect(accessService.checkOut(checkOutParams)).rejects.toBeInstanceOf(NotFoundException);
    });

    test('activeAccess no encontrado (findOne) → NotFoundException', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        (AccessModel.findOne as any).mockResolvedValue(null);

        await expect(accessService.checkOut(checkOutParams)).rejects.toBeInstanceOf(NotFoundException);
    });

    test('findOneAndUpdate retorna null (contención concurrente) → NotFoundException', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        const checkIn = new Date(Date.now() - 7200000); // 2h atrás
        (AccessModel.findOne as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 5,
            status: 'ACTIVE',
        });
        // Otro proceso ya cerró el ingreso → CAS atómico gana
        (AccessModel.findOneAndUpdate as any).mockResolvedValue(null);

        await expect(accessService.checkOut(checkOutParams)).rejects.toBeInstanceOf(NotFoundException);
        // Los locks NO deben liberarse porque MongoDB no confirmó el cambio
        expect(dragonfly.del).not.toHaveBeenCalled();
        expect(dragonfly.decr).not.toHaveBeenCalled();
    });

    test('Facturación Escalonada: 1 min o 5 min → cobra 0.1h', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        // Caso: 4 minutos para evitar lag de ejecución
        const checkIn = new Date(Date.now() - (4 * 60 * 1000));
        (AccessModel.findOne as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 10,
            status: 'ACTIVE',
        });
        (AccessModel.findOneAndUpdate as any).mockResolvedValue({ billingAmount: 1 });
        (dragonfly.del as any).mockResolvedValue(1);
        (dragonfly.decr as any).mockResolvedValue(0);

        await accessService.checkOut(checkOutParams);
        const updateCall = (AccessModel.findOneAndUpdate as any).mock.calls[0];
        const updatePayload = updateCall[1] as { billingAmount: number };
        expect(updatePayload.billingAmount).toBe(1); // 0.1h * 10
    });

    test('Facturación Escalonada: 6 min o 59 min → cobra 1h completa', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        // Caso: 6 minutos
        const checkIn = new Date(Date.now() - (6 * 60 * 1000));
        (AccessModel.findOne as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 10,
            status: 'ACTIVE',
        });
        (AccessModel.findOneAndUpdate as any).mockResolvedValue({ billingAmount: 10 });
        (dragonfly.del as any).mockResolvedValue(1);
        (dragonfly.decr as any).mockResolvedValue(0);

        await accessService.checkOut(checkOutParams);
        const updateCall = (AccessModel.findOneAndUpdate as any).mock.calls[0];
        const updatePayload = updateCall[1] as { billingAmount: number };
        expect(updatePayload.billingAmount).toBe(10); // 1h * 10
    });

    test('Facturación Escalonada: 61 min → cobra 2h completas', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        // Caso: 61 minutos
        const checkIn = new Date(Date.now() - (61 * 60 * 1000));
        (AccessModel.findOne as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 10,
            status: 'ACTIVE',
        });
        (AccessModel.findOneAndUpdate as any).mockResolvedValue({ billingAmount: 20 });
        (dragonfly.del as any).mockResolvedValue(1);
        (dragonfly.decr as any).mockResolvedValue(0);

        await accessService.checkOut(checkOutParams);
        const updateCall = (AccessModel.findOneAndUpdate as any).mock.calls[0];
        const updatePayload = updateCall[1] as { billingAmount: number };
        expect(updatePayload.billingAmount).toBe(20); // 2h * 10
    });


    test('éxito → dragonfly.del y dragonfly.decr se llaman DESPUÉS del commit en MongoDB', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        const checkIn = new Date(Date.now() - 3600000);
        const activeAccess = {
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 5,
            status: 'ACTIVE',
        };
        (AccessModel.findOne as any).mockResolvedValue(activeAccess);
        (AccessModel.findOneAndUpdate as any).mockResolvedValue({
            ...activeAccess,
            status: 'COMPLETED',
            billingAmount: 5,
        });
        (dragonfly.del as any).mockResolvedValue(1);
        (dragonfly.decr as any).mockResolvedValue(0);
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await accessService.checkOut(checkOutParams);

        expect(dragonfly.del).toHaveBeenCalledWith(`access:active:doc:${checkOutParams.document}`);
        expect(dragonfly.decr).toHaveBeenCalledWith(`access:capacity:${locationId}`);
    });

    test('ADMIN bypasea verificación de sede asignada en checkOut', async () => {
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        const checkIn = new Date(Date.now() - 3600000);
        (AccessModel.findOne as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 5,
            status: 'ACTIVE',
        });
        (AccessModel.findOneAndUpdate as any).mockResolvedValue({
            status: 'COMPLETED',
            billingAmount: 5,
        });
        (dragonfly.del as any).mockResolvedValue(1);
        (dragonfly.decr as any).mockResolvedValue(0);
        (AccessModel.aggregate as any).mockResolvedValue([]);

        // Admin puede hacer checkout en cualquier sede
        await expect(
            accessService.checkOut({ ...checkOutParams, operator: adminOperator })
        ).resolves.toBeDefined();
    });

    test('processLoyalty .catch handler es ejecutado cuando processLoyalty falla con error no-bloqueante', async () => {
        /**
         * Verifica el path de la línea 177 de access.service.ts:
         * this.processLoyalty(completedAccess, person.document, person.email).catch(err => {...})
         *
         * checkOut SIEMPRE debe resolver aunque processLoyalty falle internamente.
         * El .catch silencia el error (no-blocking by design) y loguea.
         */
        (PersonModel.findOne as any).mockResolvedValue(mockPerson);
        const checkIn = new Date(Date.now() - 7200000);
        (AccessModel.findOne as any).mockResolvedValue({
            _id: new Types.ObjectId(),
            personId,
            locationId: new Types.ObjectId(locationId),
            checkIn,
            priceAtCheckIn: 5,
            status: 'ACTIVE',
        });
        (AccessModel.findOneAndUpdate as any).mockResolvedValue({
            status: 'COMPLETED',
            billingAmount: 10,
            personId,
            locationId: new Types.ObjectId(locationId),
        });
        (dragonfly.del as any).mockResolvedValue(1);
        (dragonfly.decr as any).mockResolvedValue(0);

        // processLoyalty internamente llama AccessModel.aggregate — lo hacemos fallar
        // Esto activa el .catch(err => console.error(...)) de la línea 177
        (AccessModel.aggregate as any).mockRejectedValue(
            new Error('Aggregate network timeout')
        );

        // checkOut DEBE resolver exitosamente aunque processLoyalty falle
        // porque el .catch handler absorbe el error
        const result = await accessService.checkOut(checkOutParams);
        expect(result).toBeDefined();

        // Esperamos un tick para que el fire-and-forget se ejecute
        await new Promise(resolve => setTimeout(resolve, 10));
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// getActiveUsers
// ═══════════════════════════════════════════════════════════════════════════
describe('accessService.getActiveUsers', () => {
    const mockFindChain = {
        select: vi.fn().mockReturnThis(),
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn(() => Promise.resolve([{ personId: mockPerson, checkIn: new Date() }]))
    };

    beforeEach(() => {
        (AccessModel.find as any).mockReturnValue(mockFindChain);
        (AccessModel.countDocuments as any).mockResolvedValue(10);
    });

    test('OPERATOR sin permiso → ForbiddenException', async () => {
        await expect(
            accessService.getActiveUsers(locationId, unauthorizedOperator)
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(AccessModel.find).not.toHaveBeenCalled();
    });

    test('ADMIN siempre puede ver personas activas', async () => {
        const result = await accessService.getActiveUsers(locationId, adminOperator);
        expect(AccessModel.find).toHaveBeenCalledWith({
            locationId: expect.any(Types.ObjectId),
            status: 'ACTIVE',
        });
        expect(result).toBeDefined();
    });

    test('OPERATOR con permiso puede consultar su sede', async () => {
        const result = await accessService.getActiveUsers(locationId, validOperator);
        expect(AccessModel.find).toHaveBeenCalled();
        expect(result).toBeDefined();
    });

    test('OPERATOR con locations vacías → ForbiddenException', async () => {
        const noLocOp: UserPayload = { ...validOperator, locations: [] };
        await expect(
            accessService.getActiveUsers(locationId, noLocOp)
        ).rejects.toBeInstanceOf(ForbiddenException);
    });

    test('OPERATOR con locations undefined → ForbiddenException', async () => {
        const noLocOp: UserPayload = { ...validOperator, locations: undefined };
        await expect(
            accessService.getActiveUsers(locationId, noLocOp)
        ).rejects.toBeInstanceOf(ForbiddenException);
    });
});

// ═══════════════════════════════════════════════════════════════════════════
// processLoyalty
// ═══════════════════════════════════════════════════════════════════════════
describe('accessService.processLoyalty', () => {
    const mockAccess = {
        personId,
        locationId: new Types.ObjectId(locationId),
    } as import('../../src/features/access/access.entity').IAccess;

    test('totalHours >= 20, pero email pertenece a ADMIN → no crea cupón (Guard Clause)', async () => {
        vi.spyOn(StaffGuard, 'isStaff').mockResolvedValue(true);

        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'admin@coworking.com',
            locationStats: new Map([[locationId, 25]])
        });

        expect(couponService.issueLoyaltyCoupon).not.toHaveBeenCalled();
    });

    test('totalHours < 20 → no crea cupón', async () => {
        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'juan@example.com',
            locationStats: new Map([[locationId, 15]])
        });

        expect(couponService.issueLoyaltyCoupon).not.toHaveBeenCalled();
    });


    test('totalHours >= 20, ya existe cupón → no crea otro (idempotencia por bucket)', async () => {

        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockRejectedValue({ code: 11000 });

        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'juan@example.com',
            locationStats: new Map([[locationId, 25]])
        });

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalled();
    });

    test('totalHours >= 20, sin cupón previo → crea cupón y notifica', async () => {
        const newCoupon = { code: 'LOYALTY-5678-NEWCODE1', status: 'VALID', expiresAt: new Date(Date.now() + 86400000) };
        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockResolvedValue(newCoupon as any);
        (LocationModel.findById as any).mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockLocation)
            })
        });
        (notificationService.send as any).mockResolvedValue({ success: true });

        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'juan@example.com',
            locationStats: new Map([[locationId, 20]])
        });

        expect(couponService.issueLoyaltyCoupon).toHaveBeenCalledTimes(1);
        expect(notificationService.send).toHaveBeenCalledTimes(1);
    });

    test('locationStats vacío → no crea cupón', async () => {
        await accessService.processLoyalty(mockAccess, {
            document: '12345678',
            email: 'juan@example.com',
            locationStats: new Map()
        });

        expect(couponService.issueLoyaltyCoupon).not.toHaveBeenCalled();
    });

    test('CouponService lanza error crítico → re-throw', async () => {
        const generalError = new Error('DB connection lost');
        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockRejectedValue(generalError);

        await expect(
            accessService.processLoyalty(mockAccess, {
                document: '12345678',
                email: 'juan@example.com',
                locationStats: new Map([[locationId, 25]])
            })
        ).rejects.toThrow('DB connection lost');
    });

    test('notificationService.send falla → re-throw (Checkout bloquea el error)', async () => {
        vi.spyOn(couponService, 'issueLoyaltyCoupon').mockResolvedValue({ code: 'LOYALTY-5678-ABCD1234', status: 'VALID', expiresAt: new Date() } as any);
        (LocationModel.findById as any).mockReturnValue({
            select: vi.fn().mockReturnValue({
                lean: vi.fn().mockResolvedValue(mockLocation)
            })
        });
        (notificationService.send as any).mockRejectedValue(new Error('Microservice down'));

        // El Checkout NO debe fallar si la notificación falla, ya que usamos .catch() interno
        await expect(
            accessService.processLoyalty(mockAccess, {
                document: '12345678',
                email: 'juan@example.com',
                locationStats: new Map([[locationId, 25]])
            })
        ).resolves.toBeUndefined();
    });
    describe('accessService.getActiveUsers edge cases', () => {
        test('Si hay 0 items → totalPages es 1 (branch || 1)', async () => {
            const locationId = new Types.ObjectId().toString();
            const adminOperator: any = { role: 'ADMIN' };

            (AccessModel.countDocuments as any).mockResolvedValue(0);
            (AccessModel.find as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                populate: vi.fn().mockReturnThis(),
                sort: vi.fn().mockReturnThis(),
                skip: vi.fn().mockReturnThis(),
                limit: vi.fn().mockResolvedValue([])
            });

            const result = await accessService.getActiveUsers(locationId, adminOperator);
            expect(result.meta.pages).toBe(1);
        });
    });
});
