import { Schema, model, Document } from 'mongoose';

export interface IAuditLog extends Document {
    timestamp: Date;
    operatorEmail?: string;
    action: string; 
    method: string;
    path: string;
    payload: Record<string, string | number | boolean | object | null>;
    status: number;
    ip: string;
    duration: number;
}

const AuditLogSchema = new Schema<IAuditLog>({
    timestamp: { type: Date, default: Date.now, index: true },
    operatorEmail: { type: String, index: true },
    action: { type: String, index: true },
    method: { type: String },
    path: { type: String },
    payload: { type: Schema.Types.Mixed },
    status: { type: Number },
    ip: { type: String },
    duration: { type: Number }
});

export const AuditLogModel = model<IAuditLog>('AuditLog', AuditLogSchema);
