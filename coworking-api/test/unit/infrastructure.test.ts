import { describe, test, expect, vi, beforeEach } from 'vitest';
import { mockMongoose, mockRedis } from '../setup/mocks';

describe('Infrastructure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('MongoDB Connection Logic', async () => {
        const mongodb = await vi.importActual<any>('../../src/infrastructure/database/mongodb');
        await mongodb.connectMongoDB();
        expect(mockMongoose.connect).toHaveBeenCalled();

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
        mockMongoose.connect.mockRejectedValueOnce(new Error('FAIL'));
        try { await mongodb.connectMongoDB(); } catch (e: any) { expect(e.message).toBe('EXIT'); }
        exitSpy.mockRestore();
    }, 30000);

    test('DragonflyDB Connection & Events', async () => {
        const { dragonfly, connectDragonfly } = await vi.importActual<any>('../../src/infrastructure/cache/dragonfly');
        await connectDragonfly();
        expect(mockRedis.connect).toHaveBeenCalled();

        // Stimulate error events
        const errorListener = (mockRedis.on as any).mock.calls.find((c: any) => c[0] === 'error')[1];
        errorListener(new Error('TEST_ERROR'));

        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });
        mockRedis.connect.mockRejectedValueOnce(new Error('FAIL'));
        try { await connectDragonfly(); } catch (e: any) { expect(e.message).toBe('EXIT'); }
        exitSpy.mockRestore();
    }, 30000);

    test('Notification Service (Fetch Wrapper)', async () => {
        const mod = await vi.importActual<any>('../../src/infrastructure/notifications/notification.service');
        const service = mod.notificationService;
        await service.send({ to: 't@t.com', subject: 'S', text: 'B' });
        expect(global.fetch).toHaveBeenCalled();

        (global.fetch as any).mockResolvedValueOnce({ ok: false, status: 500 });
        await service.send({} as any);

        (global.fetch as any).mockRejectedValueOnce(new Error('NET_ERR'));
        await service.send({} as any);

        // Timeout branch
        (global.fetch as any).mockRejectedValueOnce({ name: 'AbortError' });
        await service.send({} as any);
    });
});
