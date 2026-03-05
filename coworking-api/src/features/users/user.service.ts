import { Types } from 'mongoose';
import { UserModel } from '../auth/user.entity';
import { LocationModel } from '../locations/location.entity';
import { ConflictException, NotFoundException } from '../../core/exceptions/domain.exception';

export const userService = {

    async listOperators(page: number, limit: number) {
        const skip = (page - 1) * limit;
        const [operators, total] = await Promise.all([
            UserModel.find({ role: 'OPERATOR' })
                .select('-passwordHash')
                .populate('assignedLocations', 'name address')
                .skip(skip)
                .limit(limit)
                .lean(),
            UserModel.countDocuments({ role: 'OPERATOR' })
        ]);

        return {
            data: operators,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    async createOperator(body: { email: string; password: string; assignedLocations?: string[] }) {
        const existing = await UserModel.findOne({ email: body.email.toLowerCase() });
        if (existing) {
            throw new ConflictException(`El usuario ${body.email} ya existe.`);
        }

        if (body.assignedLocations && body.assignedLocations.length > 0) {
            const locationCount = await LocationModel.countDocuments({ _id: { $in: body.assignedLocations } });
            if (locationCount !== body.assignedLocations.length) {
                throw new NotFoundException('Una o más sedes proporcionadas no existen en el sistema.');
            }
        }

        const passwordHash = await Bun.password.hash(body.password, { algorithm: 'bcrypt', cost: 12 });
        const newOperator = new UserModel({
            email: body.email.toLowerCase(),
            passwordHash,
            role: 'OPERATOR',
            assignedLocations: (body.assignedLocations || []).map((id: string) => new Types.ObjectId(id)),
            status: 'ACTIVE'
        });
        await newOperator.save();

        return {
            id: String(newOperator._id),
            email: newOperator.email,
            role: newOperator.role,
            assignedLocations: newOperator.assignedLocations
        };
    },

    async updateOperatorLocations(id: string, assignedLocations: string[]) {
        const locationCount = await LocationModel.countDocuments({ _id: { $in: assignedLocations } });
        if (locationCount !== assignedLocations.length) {
            throw new NotFoundException('Una o más sedes proporcionadas no existen en el sistema.');
        }

        const updated = await UserModel.findOneAndUpdate(
            { _id: id, role: 'OPERATOR' },
            { assignedLocations: assignedLocations.map(locId => new Types.ObjectId(locId)) },
            { new: true }
        ).select('-passwordHash');

        if (!updated) throw new NotFoundException('Operador no encontrado.');
        return updated;
    },

    async updateOperatorStatus(id: string, status: 'ACTIVE' | 'INACTIVE') {
        const updated = await UserModel.findOneAndUpdate(
            { _id: id, role: 'OPERATOR' },
            { status },
            { new: true }
        );
        if (!updated) throw new NotFoundException('Operador no encontrado.');
        return updated;
    },

    async deleteOperator(id: string) {
        const target = await UserModel.findOne({ _id: id, role: 'OPERATOR' });
        if (!target) throw new NotFoundException('Operador no encontrado.');
        await UserModel.deleteOne({ _id: id });
        return target;
    }
};
