import { describe, test, expect, vi, beforeEach } from 'vitest';
import { performAudit } from '../../src/core/middlewares/audit.middleware';
import { AuditLogModel } from '../../src/core/middlewares/audit.entity';

describe('Audit Middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        vi.spyOn(console, 'log').mockImplementation(() => true);
    });

    test('should sanitize payload (obfuscate document, remove password) and log success', async () => {
        (AuditLogModel.create as any).mockResolvedValueOnce(true);

        const auditParams = {
            method: 'POST',
            path: '/users',
            status: 201,
            auditContext: { startTime: Date.now() - 100, ip: '127.0.0.1' },
            body: {
                password: 'supersecret',
                document: '12345678',
                email: 'test@example.com',
                unallowedField: 'dropme'
            }
        };

        await performAudit(auditParams);
        await new Promise(process.nextTick);

        expect(AuditLogModel.create).toHaveBeenCalledWith(expect.objectContaining({
            payload: {
                document: '123****678',
                email: 'test@example.com'
            }
        }));
        expect(console.log).toHaveBeenCalledWith(
            expect.stringContaining('[Audit] Log created successfully')
        );
    });

    test('should handle database error during audit logging without crashing', async () => {
        const error = new Error('DB Connection Failed');
        (AuditLogModel.create as any).mockRejectedValueOnce(error);

        const auditParams = {
            method: 'GET',
            path: '/test',
            status: 200,
            auditContext: { startTime: Date.now() - 100, ip: '127.0.0.1' },
            body: {}
        };

        await performAudit(auditParams);
        await new Promise(process.nextTick);

        expect(AuditLogModel.create).toHaveBeenCalled();
        expect(process.stderr.write).toHaveBeenCalledWith(
            expect.stringContaining('[Audit Error] Failed to save log for GET /TEST: DB Connection Failed')
        );
    });
});
