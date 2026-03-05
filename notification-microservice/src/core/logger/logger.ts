import pino from 'pino';
import { LogContext } from '../../types/logger';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    base: {
        service: 'notification-microservice',
        env: process.env.NODE_ENV
    },
    transport: isDev ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname,service,env',
            translateTime: 'yyyy-mm-dd HH:MM:ss.l',
            messageFormat: '{msg}',
            singleLine: false,
            errorLikeObjectKeys: ['err', 'error'],
            customColors: 'info:blue,warn:yellow,error:red'
        }
    } : undefined,
    // Redacción de datos sensibles por seguridad
    redact: {
        paths: ['to', 'email', 'password', 'secret', 'X-Notification-Secret'],
        censor: '[REDACTED]'
    }
});

/**
 * AUDIT WRAPPER
 * Mantenemos la semántica de auditoría para trazabilidad de cumplimiento.
 */
export const auditLogger = {
    log: (message: string, context?: LogContext) => {
        logger.info({ ...context, audit: true }, `[AUDIT] ${message}`);
    }
};
