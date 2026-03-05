import { AuditLogModel } from './audit.entity';
import type { UserPayload, AuditMetadataContext } from '../../types';




export async function performAudit(params: {
    method: string;
    path: string;
    status: number;
    auditContext: AuditMetadataContext['auditContext'];
    user?: UserPayload | null;
    auditAction?: string;
    auditPayload?: Record<string, any>;
    body: any;
}) {
    const { method, path, status, auditContext, user, auditAction, auditPayload, body } = params;
    const duration = Date.now() - auditContext.startTime;



    const ALLOWED_AUDIT_FIELDS = ['email', 'document', 'name', 'locationId', 'role', 'status', 'assignedLocations', 'pricePerHour', 'code', 'error', 'targetId', 'targetEmail', 'newStatus'];

    const basePayload = auditPayload || body || {};
    const sanitizedPayload: Record<string, any> = {};


    for (const key of ALLOWED_AUDIT_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(basePayload, key)) {
            let value = basePayload[key];
            if (key === 'document' && value) {
                const doc = String(value);
                value = doc.slice(0, 3) + '****' + doc.slice(-3);
            }

            sanitizedPayload[key] = value;
        }
    }

    const action = auditAction || `${method} ${path.toUpperCase()}`;

    console.log(`[Audit] Performing audit for ${action} (Status: ${status})`);

    AuditLogModel.create({
        timestamp: new Date(),
        operatorEmail: user?.email || 'ANONYMOUS',
        action,
        method,
        path,
        payload: sanitizedPayload,
        status,
        ip: auditContext.ip,
        duration
    }).then(() => {
        console.log(`[Audit] Log created successfully for ${action}`);
    }).catch((err) => {

        process.stderr.write(`[Audit Error] Failed to save log for ${action}: ${err.message}\n`);
    });
}
