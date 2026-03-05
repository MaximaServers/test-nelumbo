import pino from 'pino';
import { env } from '../../config/env';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
    level: isDev ? 'debug' : 'info',
    base: {
        service: 'coworking-core-api',
        env: env.NODE_ENV
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
    redact: {
        paths: ['password', 'token', 'headers.authorization', 'document'],
        censor: '[REDACTED]'
    }
});
