import { stayReminderService } from '../../features/reminders/stay-reminder.service';
import { logger } from '../../core/logger/logger';

export const startStayReminderJob = (intervalMs: number = 60000) => { // Cada minuto
    setInterval(async () => {
        try {
            logger.debug(`[Job] Stay Reminder: Procesando cola...`);
            await stayReminderService.processQueue();
        } catch (error) {
            logger.error({ error }, `[Job_Err] Error en StayReminderJob`);
        }
    }, intervalMs);

    logger.info({ intervalMs }, `🚀 [STAY_REMINDER_JOB] Iniciado orquestador de recordatorios.`);
};
