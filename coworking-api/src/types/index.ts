import { Document, Types } from 'mongoose';


export type UserRole = 'ADMIN' | 'OPERATOR';


export interface UserPayload {
    id: string;
    email: string;
    role: UserRole;
    locations?: string[];
}


export interface ILocation extends Document {
    name: string;
    address: string;
    maxCapacity: number;
    pricePerHour: number;
    metadata?: Record<string, string | number | boolean | object | null>;
}


export interface ControllerContext<TBody = Record<string, string | number | boolean | object | null>, TParams = Record<string, string>> {
    user: UserPayload | null;
    body: TBody;
    params: TParams;
    set: { status: number | string };
}


export interface AuditMetadataContext {
    auditContext: {
        startTime: number;
        ip: string;
    };
    auditAction?: string;
    auditPayload?: Record<string, string | number | boolean | object | null>;
}


export interface IUser extends Document {
    email: string;
    passwordHash: string;
    role: UserRole;
    assignedLocations: Types.ObjectId[]; 
    status: 'ACTIVE' | 'INACTIVE';
}
