import { describe, test, expect, vi, beforeEach } from 'vitest';
import { app } from '../../src/index';
import { UserModel, LocationModel, mockRedis } from '../setup/mocks';
import { Types } from 'mongoose';
import { syncCapacities } from '../../src/infrastructure/jobs/capacity-sync.job';

const handle = async (app: any, req: Request) => await app.handle(req);

describe('Coverage Boost Integration', () => {
    const adminHeaders = { 'authorization': 'Bearer admin-token', 'Content-Type': 'application/json' };
    const opHeaders = { 'authorization': 'Bearer operator-token', 'Content-Type': 'application/json' };
    const locationId = '507f1f77bcf86cd799439011';
    const userId = '507f191e810c19729de860ea';

    const userFixture = {
        _id: new Types.ObjectId(userId),
        role: 'OPERATOR',
        assignedLocations: [new Types.ObjectId(locationId)],
        email: 'op@test.com',
        status: 'ACTIVE',
        passwordHash: 'hash'
    };

    beforeEach(() => {
        vi.clearAllMocks();

        LocationModel._internal.findById.mockReturnValue({ _id: new Types.ObjectId(locationId), pricePerHour: 10 });
        LocationModel._internal.find.mockReturnValue([{ _id: new Types.ObjectId(locationId) }]);

        UserModel._internal.findOne.mockReturnValue(userFixture);
        UserModel._internal.findById.mockReturnValue(userFixture);

        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        if (global.Bun?.password) {
            vi.spyOn(global.Bun.password, 'verify').mockResolvedValue(true as any);
        }
    });

    test('analytics.controller OPERATOR branches (personal vs location scope)', async () => {
        const resPersonal = await handle(app, new Request('http://localhost/analytics/operator-revenue?scope=personal', {
            headers: opHeaders
        }));
        expect(resPersonal.status).toBe(200);

        const resLocation = await handle(app, new Request('http://localhost/analytics/operator-revenue', {
            headers: opHeaders
        }));
        expect(resLocation.status).toBe(200);
    });

    test('auth.middleware L55 (locations undefined branch)', async () => {
        const res = await handle(app, new Request('http://localhost/locations', {
            headers: { 'authorization': 'Bearer noloc-token' }
        }));
        expect(res.status).toBe(200);
    });

    test('auth.middleware L38 (Invalid token context - missing iss/aud)', async () => {
        const res = await handle(app, new Request('http://localhost/locations', {
            headers: { 'authorization': 'Bearer bad-context-token' }
        }));
        expect(res.status).toBe(401);
    });

    test('auth.middleware L47 (Permanently revoked user)', async () => {
        mockRedis.get.mockImplementation((key: string) => {
            if (key === 'auth:revoked:revoked-user-id') return Promise.resolve('1');
            return Promise.resolve(null);
        });

        const res = await handle(app, new Request('http://localhost/locations', {
            headers: { 'authorization': 'Bearer revoked-user-token' }
        }));
        expect(res.status).toBe(401);
    });

    test('auth.controller L30-31 (Email/Password coverage)', async () => {
        const res = await handle(app, new Request('http://localhost/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'op@test.com', password: 'password' })
        }));
        expect(res.status).toBe(200);
    });

    test('analytics.controller L79 (noloc-op hits ?? [])', async () => {
        const res = await handle(app, new Request(`http://localhost/analytics/top-people/location/${locationId}`, {
            headers: { 'authorization': 'Bearer noloc-op-token' }
        }));
        expect(res.status).toBe(403);
    });

    test('analytics.controller L149 (Admin with locationId query)', async () => {
        const res = await handle(app, new Request(`http://localhost/analytics/operator-revenue?locationId=${locationId}`, {
            headers: adminHeaders
        }));
        expect(res.status).toBe(200);
    });

    test('analytics.controller L161 (noloc-op hits ?? [])', async () => {
        const res = await handle(app, new Request('http://localhost/analytics/operator-revenue', {
            headers: { 'authorization': 'Bearer noloc-op-token' }
        }));
        expect(res.status).toBe(200);
    });

    test('auth.middleware No Token branch', async () => {
        const resNoToken = await handle(app, new Request('http://localhost/analytics/operator-revenue', {}));
        expect(resNoToken.status).toBe(401);
    });

    test('capacity-sync.job L27 (Sync script success log)', async () => {
        const consoleSpy = vi.spyOn(console, 'debug');
        await syncCapacities();
        expect(consoleSpy).toHaveBeenCalled();
    });
});
