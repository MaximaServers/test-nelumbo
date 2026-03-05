import { Schema, model, Types, Document } from 'mongoose';

export type AccessStatus = 'ACTIVE' | 'COMPLETED';

export interface IAccess extends Document {
    personId: Types.ObjectId;
    locationId: Types.ObjectId;
    checkIn: Date;
    checkOut?: Date;
    operatorIn: string; 
    operatorOut?: string; 
    billingAmount: number;
    priceAtCheckIn: number; 
    status: AccessStatus;
    createdAt: Date;
    updatedAt: Date;
}

const AccessSchema = new Schema<IAccess>(
    {
        personId: { type: Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
        locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true, index: true },
        operatorIn: { type: String, required: true },
        operatorOut: { type: String },
        checkIn: { type: Date, default: Date.now, required: true },
        checkOut: { type: Date },
        billingAmount: { type: Number, default: 0 },
        priceAtCheckIn: { type: Number, required: true },
        status: {
            type: String,
            enum: ['ACTIVE', 'COMPLETED'],
            default: 'ACTIVE',
            index: true,
        },
    },
    { timestamps: true }
);


AccessSchema.index({ personId: 1, status: 1 });

export const AccessModel = model<IAccess>('Access', AccessSchema);

