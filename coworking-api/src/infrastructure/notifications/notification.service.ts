import { logger } from '../../core/logger/logger';

export const notificationService = {
    async send(params: {
        to: string;
        subject: string;
        text: string;
        html?: string;
    }): Promise<{ success: boolean; error?: string }> {
        const url = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3001/email';
        const secret = process.env.NOTIFICATION_SECRET;

        if (!secret) {
            logger.error('[NotificationClient] Error: NOTIFICATION_SECRET no configurado.');
            return { success: false, error: 'NOTIFICATION_SECRET no configurado' };
        }

        try {
            logger.info({ to: params.to }, `[NotificationClient] Despachando email vía microservicio blindado...`);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout industrial

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Notification-Secret': secret
                },
                body: JSON.stringify(params),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                logger.error({ status: response.status, errorData }, `[NotificationClient] Fallo en microservicio`);
                return { success: false, error: `Microservicio respondió con status ${response.status}` };
            }

            const result = await response.json() as { success: boolean, messageId: string };
            logger.info({ messageId: result.messageId }, `[NotificationClient] Notificación exitosa`);

            return { success: true };

        } catch (error: any) {
            if (error.name === 'AbortError') {
                logger.error({ url }, `[NotificationClient] Timeout (3s) conectando`);
            } else {
                logger.error({ url, error: error.message }, `[NotificationClient] Error crítico de red`);
            }
            return { success: false, error: error.message };
        }
    },
};
