import { describe, test, expect, beforeEach, vi } from 'vitest';
import { StaffGuard } from '../../src/core/guards/staff.guard';
import { UserModel } from '../../src/features/auth/user.entity';
import { ForbiddenException } from '../../src/core/exceptions/domain.exception';

describe('StaffGuard Unit Tests', () => {
    const email = 'test@coworking.com';

    beforeEach(() => {
        vi.clearAllMocks();
        (UserModel.findOne as any).mockReset();
    });

    describe('ensureIsNotStaff', () => {
        test('Si el email NO es staff → resuelve sin error', async () => {
            (UserModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue(null)
            });

            await expect(StaffGuard.ensureIsNotStaff(email)).resolves.toBeUndefined();
            expect(UserModel.findOne).toHaveBeenCalledWith({ email: email.toLowerCase() });
        });

        test('Si el email ES staff → lanza ForbiddenException', async () => {
            (UserModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue({ role: 'ADMIN' })
            });

            await expect(StaffGuard.ensureIsNotStaff(email)).rejects.toBeInstanceOf(ForbiddenException);
        });

        test('Normaliza el email a minúsculas', async () => {
            (UserModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue(null)
            });

            await StaffGuard.ensureIsNotStaff('TEST@COWORKING.COM');
            expect(UserModel.findOne).toHaveBeenCalledWith({ email: 'test@coworking.com' });
        });
    });

    describe('isStaff', () => {
        test('Si el email existe en UserModel → retorna true', async () => {
            (UserModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue({ _id: 'someid' })
            });

            const result = await StaffGuard.isStaff(email);
            expect(result).toBe(true);
        });

        test('Si el email NO existe en UserModel → retorna false', async () => {
            (UserModel.findOne as any).mockReturnValue({
                select: vi.fn().mockReturnThis(),
                lean: vi.fn().mockResolvedValue(null)
            });

            const result = await StaffGuard.isStaff(email);
            expect(result).toBe(false);
        });
    });
});
