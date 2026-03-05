import { Schema, model, Document } from 'mongoose';
import type { UserRole } from '../../types';


export interface IUser extends Document {
    email: string;
    passwordHash: string;
    role: UserRole;
    assignedLocations: Schema.Types.ObjectId[]; 
    status: 'ACTIVE' | 'INACTIVE';
}

const userSchema = new Schema<IUser>({
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['ADMIN', 'OPERATOR'], default: 'OPERATOR' },
    assignedLocations: [{ type: Schema.Types.ObjectId, ref: 'Location' }],
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
}, { timestamps: true });

export const UserModel = model<IUser>('User', userSchema);
