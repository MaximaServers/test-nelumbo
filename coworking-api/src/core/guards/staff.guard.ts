import { UserModel } from '../../features/auth/user.entity';
import { ForbiddenException } from '../exceptions/domain.exception';

export const StaffGuard = {
    async ensureIsNotStaff(email: string): Promise<void> {
        const staff = await UserModel.findOne({ email: email.toLowerCase() }).select('role').lean();
        if (staff) {
            throw new ForbiddenException(
                `Operación Denegada: La entidad con email ${email} posee rol de sistema (${staff.role}) y no califica como cliente.`
            );
        }
    },

    async isStaff(email: string): Promise<boolean> {
        const staff = await UserModel.findOne({ email: email.toLowerCase() }).select('_id').lean();
        return !!staff;
    }
};
