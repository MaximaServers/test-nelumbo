import { Schema, model } from 'mongoose';
import type { ILocation } from '../../types';


const locationSchema = new Schema<ILocation>({
    name: { type: String, required: true, unique: true },
    address: { type: String, required: true },
    maxCapacity: { type: Number, required: true, min: 1 },
    pricePerHour: { type: Number, required: true, min: 0 },
    metadata: { type: Schema.Types.Mixed }, 
}, { timestamps: true });

export const LocationModel = model<ILocation>('Location', locationSchema);
