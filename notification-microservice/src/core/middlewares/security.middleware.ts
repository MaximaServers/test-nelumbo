import { Elysia } from 'elysia';
import { envConfigs } from '../../config/env';
import { logger } from '../logger/logger';

export const securityMiddleware = (app: Elysia) =>
    app.derive(({ headers }) => {
        const secret = headers['x-notification-secret'];

        if (!secret) {
            logger.warn(`[Security_Audit] Intento de acceso SIN secreto detectado.`);
            throw new Error('ACCESS_DENIED_NO_SECRET');
        }

        if (secret !== envConfigs.NOTIFICATION_SECRET) {
            logger.warn({ audit: true }, `[Security_Audit] Intento de acceso con secreto INVÁLIDO.`);
            throw new Error('ACCESS_DENIED_INVALID_SECRET');
        }

        logger.info({ audit: true }, `[Security_Audit] Acceso AUTORIZADO.`);

        return {
            authorized: true,
            timestamp_authorized: new Date().toISOString()
        };
    });
