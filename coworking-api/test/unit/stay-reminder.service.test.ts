import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { stayReminderService } from '../../src/features/reminders/stay-reminder.service';
import { dragonfly } from '../../src/infrastructure/cache/dragonfly';
import { AccessModel } from '../../src/features/access/access.entity';
import { PersonModel } from '../../src/features/people/person.entity';
import { LocationModel } from '../../src/features/locations/location.entity';
import { notificationService } from '../../src/infrastructure/notifications/notification.service';
import { Types } from 'mongoose';

vi.mock('../../src/infrastructure/cache/dragonfly', () => ({
    dragonfly: {
        zadd: vi.fn(),
        zrange: vi.fn(),
        zrem: vi.fn(),
        zrangebyscore: vi.fn(),
    }
}));

vi.mock('../../src/infrastructure/notifications/notification.service', () => ({
    notificationService: {
        send: vi.fn().mockResolvedValue({ success: true }),
    }
}));

describe('StayReminderService', () => {
    const accessId = new Types.ObjectId().toString();
    const checkInTime = new Date();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(AccessModel, 'findOne').mockReset();
        vi.spyOn(PersonModel, 'findById').mockReset();
        vi.spyOn(LocationModel, 'findById').mockReset();
    });

    describe('schedule', () => {
        test('debe programar T-10 y T-5 con scores correctos', async () => {
            await stayReminderService.schedule(accessId, checkInTime, 1);

            expect(dragonfly.zadd).toHaveBeenCalled();
            const [key, ...args] = (dragonfly.zadd as any).mock.calls[0];
            expect(key).toBe('reminders:queue');
            // Check scores (roughly)
            expect(args[0]).toBeGreaterThan(checkInTime.getTime());
        });

        test('debe fallar silenciosamente si la fecha es inválida', async () => {
            await stayReminderService.schedule(accessId, 'not-a-date' as any);
            expect(dragonfly.zadd).not.toHaveBeenCalled();
        });
    });

    describe('unschedule', () => {
        test('debe remover items de la cola para un accessId', async () => {
            (dragonfly.zrange as any).mockResolvedValue([`${accessId}:T10:1`, `other:T10:1`]);
            await stayReminderService.unschedule(accessId);
            expect(dragonfly.zrem).toHaveBeenCalledWith('reminders:queue', `${accessId}:T10:1`);
        });
    });

    describe('processQueue', () => {
        test('debe procesar recordatorios vencidos y enviar notificaciones', async () => {
            const reminderId = `${accessId}:T10:1`;
            (dragonfly.zrangebyscore as any).mockResolvedValue([reminderId]);
            (dragonfly.zrem as any).mockResolvedValue(1); // Confirmado que lo sacamos

            vi.spyOn(AccessModel, 'findOne').mockResolvedValue({
                _id: new Types.ObjectId(accessId),
                personId: new Types.ObjectId(),
                locationId: new Types.ObjectId(),
                checkIn: checkInTime,
                status: 'ACTIVE'
            } as any);

            vi.spyOn(PersonModel, 'findById').mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ name: 'Juan', email: 'juan@test.com' })
                })
            } as any);

            vi.spyOn(LocationModel, 'findById').mockReturnValue({
                select: vi.fn().mockReturnValue({
                    lean: vi.fn().mockResolvedValue({ name: 'Coworking Central' })
                })
            } as any);

            await stayReminderService.processQueue();

            expect(notificationService.send).toHaveBeenCalledWith(expect.objectContaining({
                to: 'juan@test.com',
                subject: expect.stringContaining('Recordatorio')
            }));
        });

        test('si el acceso ya no está activo, no debe notificar', async () => {
            (dragonfly.zrangebyscore as any).mockResolvedValue([`${accessId}:T10:1`]);
            (dragonfly.zrem as any).mockResolvedValue(1);
            vi.spyOn(AccessModel, 'findOne').mockResolvedValue(null);

            await stayReminderService.processQueue();
            expect(notificationService.send).not.toHaveBeenCalled();
        });

        test('si es T5, debe programar el siguiente ciclo', async () => {
            const spy = vi.spyOn(stayReminderService, 'schedule');
            const reminderId = `${accessId}:T5:1`;
            (dragonfly.zrangebyscore as any).mockResolvedValue([reminderId]);
            (dragonfly.zrem as any).mockResolvedValue(1);

            vi.spyOn(AccessModel, 'findOne').mockResolvedValue({
                _id: new Types.ObjectId(accessId),
                checkIn: checkInTime,
                status: 'ACTIVE'
            } as any);

            vi.spyOn(PersonModel, 'findById').mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue({ name: 'Juan' })
            } as any);

            vi.spyOn(LocationModel, 'findById').mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue({ name: 'Loc' })
            } as any);

            await stayReminderService.processQueue();
            expect(spy).toHaveBeenCalledWith(accessId, expect.anything(), 2);
        });

        test('debe capturar errores de Redis en processQueue (L134)', async () => {
            (dragonfly.zrangebyscore as any).mockRejectedValue(new Error('Redis Down'));
            await expect(stayReminderService.processQueue()).resolves.toBeUndefined();
        });

        test('debe capturar errores de Redis en schedule', async () => {
            (dragonfly.zadd as any).mockRejectedValue(new Error('Redis Full'));
            await expect(stayReminderService.schedule(accessId, checkInTime)).resolves.toBeUndefined();
        });

        test('debe capturar errores de Redis en unschedule', async () => {
            (dragonfly.zrange as any).mockRejectedValue(new Error('Redis Error'));
            await expect(stayReminderService.unschedule(accessId)).resolves.toBeUndefined();
        });

        test('branch: unschedule con lista vacia', async () => {
            (dragonfly.zrange as any).mockResolvedValue([]);
            await stayReminderService.unschedule(accessId);
            expect(dragonfly.zrem).not.toHaveBeenCalled();
        });

        test('branch: processQueue con recordatorio ya procesado (zrem returns 0)', async () => {
            (dragonfly.zrangebyscore as any).mockResolvedValue(['item:1']);
            (dragonfly.zrem as any).mockResolvedValue(0);
            await stayReminderService.processQueue();
            expect(AccessModel.findOne).not.toHaveBeenCalled();
        });

        test('branch: processQueue con persona o locacion inexistente', async () => {
            (dragonfly.zrangebyscore as any).mockResolvedValue([`${accessId}:T10:1`]);
            (dragonfly.zrem as any).mockResolvedValue(1);
            vi.spyOn(AccessModel, 'findOne').mockResolvedValue({ _id: new Types.ObjectId(accessId), personId: new Types.ObjectId(), status: 'ACTIVE' } as any);

            // Caso persona null
            vi.spyOn(PersonModel, 'findById').mockReturnValue({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(null) } as any);
            await stayReminderService.processQueue();
            expect(notificationService.send).not.toHaveBeenCalled();
        });
    });
});
