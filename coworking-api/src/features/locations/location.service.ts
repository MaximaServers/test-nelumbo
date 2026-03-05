import { LocationModel } from './location.entity';
import { ConflictException, NotFoundException } from '../../core/exceptions/domain.exception';
import type { ILocation } from '../../types';

export const locationService = {

    async listLocations(page: number, limit: number) {
        const skip = (page - 1) * limit;
        const [locations, total] = await Promise.all([
            LocationModel.find().skip(skip).limit(limit).lean(),
            LocationModel.countDocuments()
        ]);

        return {
            data: locations,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    },

    async createLocation(body: Pick<ILocation, 'name' | 'address' | 'maxCapacity' | 'pricePerHour'>) {
        const existing = await LocationModel.findOne({ name: body.name });
        if (existing) {
            throw new ConflictException(`La sede con nombre '${body.name}' ya existe.`);
        }
        return LocationModel.create(body);
    },

    async updateLocation(id: string, body: Partial<Pick<ILocation, 'name' | 'address' | 'maxCapacity' | 'pricePerHour'>>) {
        const updated = await LocationModel.findByIdAndUpdate(id, body, { new: true }).lean();
        if (!updated) throw new NotFoundException('Sede no encontrada');
        return updated;
    }
};
