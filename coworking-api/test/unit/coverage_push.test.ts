import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockProcessQueue, mockLogger } = vi.hoisted(() => ({
    mockProcessQueue: vi.fn(),
    mockLogger: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
    }
}));

vi.mock('../../src/features/reminders/stay-reminder.service', () => ({
    stayReminderService: {
        processQueue: mockProcessQueue,
    }
}));

vi.mock('../../src/core/logger/logger', () => ({
    logger: mockLogger
}));

import { startStayReminderJob } from '../../src/infrastructure/jobs/stay-reminder.job';

describe('Coverage Push - Infrastructure & Core', () => {

    describe('Stay Reminder Job', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.clearAllMocks();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        test('debe ejecutar el job periódicamente y manejar errores', async () => {
            mockProcessQueue.mockResolvedValue(undefined);

            startStayReminderJob(10);

            await vi.advanceTimersByTimeAsync(10);
            expect(mockProcessQueue).toHaveBeenCalled();

            // Caso error (L14 del job)
            mockProcessQueue.mockRejectedValue(new Error('Job Error'));
            await vi.advanceTimersByTimeAsync(10);

            expect(mockProcessQueue).toHaveBeenCalledTimes(2);
            expect(mockLogger.error).toHaveBeenCalled();
        });
    });
});
