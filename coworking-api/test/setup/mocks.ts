import { vi } from 'vitest';
import { Types } from 'mongoose';

// ─── Hoisted Mocks (Available for vi.mock) ───────────────────────────────────
const vi_hoistedMocks = vi.hoisted(() => {
    const redisInstance = {
        connect: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
        eval: vi.fn().mockResolvedValue(1),
        decr: vi.fn().mockResolvedValue(0),
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
        exists: vi.fn().mockResolvedValue(0),
        status: 'ready'
    };

    class MockRedis {
        constructor() { return redisInstance; }
    }

    return {
        RedisClass: MockRedis,
        redisInstance,
        mongoose: {
            connect: vi.fn().mockResolvedValue({}),
            connection: {
                on: vi.fn(),
                readyState: 1,
                close: vi.fn(),
            }
        },
        notification: {
            send: vi.fn().mockResolvedValue({ success: true })
        }
    };
});

// Export Singletons for Tests
export const mockRedis = vi_hoistedMocks.redisInstance;
export const mockMongoose = vi_hoistedMocks.mongoose;
export const mockNotificationService = vi_hoistedMocks.notification;

// ─── Polyfill Bun ────────────────────────────────────────────────────────────
const vi_mockHash = vi.fn().mockResolvedValue('$2b$12$hashhashhashhashhashhashh');
const vi_mockVerify = vi.fn().mockResolvedValue(true);

if (!(global as any).Bun) (global as any).Bun = {};
(global as any).Bun.password = {
    hash: vi_mockHash,
    verify: vi_mockVerify
};

// ─── Mongoose Query Chain Mock Factory ───────────────────────────────────────
const createChain = (fn: any, defaultVal: any) => {
    const getPromise = () => Promise.resolve(fn());
    const mock = {
        lean: vi.fn().mockImplementation(() => mock),
        sort: vi.fn().mockImplementation(() => mock),
        limit: vi.fn().mockImplementation(() => mock),
        skip: vi.fn().mockImplementation(() => mock),
        populate: vi.fn().mockImplementation(() => mock),
        select: vi.fn().mockImplementation(() => mock),
        exec: vi.fn().mockImplementation(() => getPromise()),
        then: (resolve: any, reject: any) => getPromise().then(resolve, reject),
        catch: (reject: any) => getPromise().catch(reject),
    };
    return mock;
};

const createModelClassMock = (defaultData: any) => {
    const internal = {
        find: vi.fn(() => [defaultData]),
        findOne: vi.fn(() => defaultData),
        findById: vi.fn(() => defaultData),
        findOneAndUpdate: vi.fn(() => defaultData),
        findByIdAndUpdate: vi.fn(() => defaultData),
        countDocuments: vi.fn(() => 1),
        aggregate: vi.fn(() => []),
        create: vi.fn((d) => Promise.resolve({ ...d, _id: new Types.ObjectId(), save: vi.fn().mockReturnThis() })),
        deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    };

    class MockModel {
        constructor(public data: any) { Object.assign(this, data); }
        _id = new Types.ObjectId();
        save = vi.fn().mockImplementation(function (this: any) { return Promise.resolve(this); });
        static find = vi.fn(() => createChain(internal.find, [defaultData]));
        static findOne = vi.fn(() => createChain(internal.findOne, defaultData));
        static findById = vi.fn(() => createChain(internal.findById, defaultData));
        static findOneAndUpdate = vi.fn(() => createChain(internal.findOneAndUpdate, defaultData));
        static findByIdAndUpdate = vi.fn(() => createChain(internal.findByIdAndUpdate, defaultData));
        static countDocuments = vi.fn(() => createChain(internal.countDocuments, 1));
        static create = vi.fn((d) => internal.create(d));
        static deleteOne = vi.fn((q) => internal.deleteOne(q));
        static aggregate = vi.fn(() => Promise.resolve(internal.aggregate()));
        static lean = vi.fn().mockReturnThis();
        static select = vi.fn().mockReturnThis();
        static populate = vi.fn().mockReturnThis();
        static _internal = internal;
    }
    return MockModel as any;
};

export const LocationModel = createModelClassMock({ name: 'Sede' });
export const UserModel = createModelClassMock({ email: 'a@a.com', role: 'ADMIN' });
export const AccessModel = createModelClassMock({ status: 'ACTIVE', checkIn: new Date() });
export const CouponModel = createModelClassMock({ code: 'C1', status: 'VALID', expiresAt: new Date(Date.now() + 86400000) });
export const PersonModel = createModelClassMock({ document: '123' });
export const AuditModel = createModelClassMock({ action: 'TEST' });
export const AuditLogModel = createModelClassMock({});

// ─── Module Mocks ────────────────────────────────────────────────────────────
vi.mock('../../src/features/locations/location.entity', () => ({ LocationModel }));
vi.mock('../../src/features/auth/user.entity', () => ({ UserModel }));
vi.mock('../../src/features/access/access.entity', () => ({ AccessModel }));
vi.mock('../../src/core/middlewares/audit.entity', () => ({ AuditModel }));
vi.mock('../../src/features/coupons/coupon.entity', () => ({ CouponModel }));
vi.mock('../../src/features/people/person.entity', () => ({ PersonModel }));
vi.mock('../../src/core/middlewares/audit.entity', () => ({ AuditLogModel }));

vi.mock('cloudinary', () => ({
    v2: {
        config: vi.fn(),
        uploader: {
            upload: vi.fn().mockResolvedValue({ secure_url: 'http://t.co/i.jpg' }),
            destroy: vi.fn().mockResolvedValue({ result: 'ok' })
        }
    }
}));

// INFRASTRUCTURE MODULE MOCKS
vi.mock('../../src/infrastructure/database/mongodb', () => ({ connectMongoDB: vi_hoistedMocks.mongoose.connect }));
vi.mock('../../src/infrastructure/cache/dragonfly', () => ({
    dragonfly: vi_hoistedMocks.redisInstance,
    connectDragonfly: vi_hoistedMocks.redisInstance.connect,
}));
vi.mock('../../src/infrastructure/notifications/notification.service', () => ({
    notificationService: vi_hoistedMocks.notification
}));

vi.mock('@elysiajs/jwt', () => ({



    jwt: (opts: any) => {
        const Elysia = require('elysia').Elysia;
        const name = opts?.name || 'jwt';
        return new Elysia({ name: 'jwt-mock' }).decorate(name, {
            verify: vi.fn().mockImplementation(async (token) => {
                if (token === 'admin-token') {
                    return { id: '507f191e810c19729de860ea', email: 'test@test.com', role: 'ADMIN', locations: ['507f1f77bcf86cd799439011'], iss: 'coworking-api', aud: 'coworking-client' };
                }
                if (token === 'operator-token') {
                    return { id: '507f191e810c19729de860ef', email: 'test@test.com', role: 'OPERATOR', locations: ['507f1f77bcf86cd799439011'], iss: 'coworking-api', aud: 'coworking-client' };
                }
                if (token === 'bad-context-token') {
                    return { id: '507f191e810c19729de860ea', email: 'bad@test.com', role: 'ADMIN' }; // missing iss
                }
                if (token === 'revoked-user-token') {
                    return { id: 'revoked-user-id', email: 'revoked@test.com', role: 'ADMIN', iss: 'coworking-api', aud: 'coworking-client' };
                }
                if (token === 'noloc-token') {
                    return { id: '507f191e810c19729de860ea', email: 'noloc@test.com', role: 'ADMIN', iss: 'coworking-api', aud: 'coworking-client' }; // locations is undefined
                }
                if (token === 'noloc-op-token') {
                    return { id: '507f191e810c19729de860ef', email: 'noloc-op@test.com', role: 'OPERATOR', iss: 'coworking-api', aud: 'coworking-client' }; // locations is undefined
                }



                return null;
            }),
            sign: vi.fn().mockResolvedValue('fake-signed-token')
        });
    }
}));
vi.mock('elysia-rate-limit', () => ({
    rateLimit: () => {
        const Elysia = require('elysia').Elysia;
        return new Elysia({ name: 'rate-limit-mock' });
    }
}));

// ─── Library Mocks ───────────────────────────────────────────────────────────
vi.mock('ioredis', () => ({ default: vi_hoistedMocks.RedisClass, Redis: vi_hoistedMocks.RedisClass }));
vi.mock('mongoose', async (importActual) => {
    const actual: any = await importActual();
    const mockConnect = vi_hoistedMocks.mongoose.connect;
    const mockConnection = vi_hoistedMocks.mongoose.connection;
    return {
        ...actual,
        default: {
            ...actual.default,
            connect: mockConnect,
            connection: mockConnection
        },
        connect: mockConnect,
        connection: mockConnection
    };
});

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, messageId: 'm1' })
}));
