import { Schema, model, Types, Document } from 'mongoose';

export type CouponStatus = 'VALID' | 'USED' | 'EXPIRED';

export interface ICoupon extends Document {
    personDocument: string;
    locationId: Types.ObjectId;
    code: string;
    issuedAt: Date;
    expiresAt: Date;
    status: CouponStatus;
    loyaltyBucket?: number;
    createdAt: Date;
    updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
    {
        personDocument: { type: String, required: true, index: true },
        locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
        code: { type: String, required: true, unique: true },
        issuedAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true },
        status: {
            type: String,
            enum: ['VALID', 'USED', 'EXPIRED'],
            default: 'VALID',
            index: true,
        },
        loyaltyBucket: { type: Number, index: true },
    },
    { timestamps: true }
);




CouponSchema.index({ personDocument: 1, locationId: 1, loyaltyBucket: 1 }, { unique: true });

export const CouponModel = model<ICoupon>('Coupon', CouponSchema);

