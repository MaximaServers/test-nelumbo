import { Schema, model, Document } from 'mongoose';

export interface IPerson extends Document {
    document: string;
    name: string;
    email: string;
    accumulatedHours?: number;
    locationStats?: Map<string, number>;
    createdAt: Date;
    updatedAt: Date;
}

const PersonSchema = new Schema<IPerson>(
    {
        document: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        accumulatedHours: { type: Number, default: 0 },
        locationStats: { type: Map, of: Number, default: {} }
    },
    { timestamps: true }
);

export const PersonModel = model<IPerson>('Person', PersonSchema);
