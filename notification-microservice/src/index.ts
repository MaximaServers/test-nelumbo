import { Elysia } from 'elysia';
import { env } from './config/env';
import { logger } from './core/logger/logger';
import { mailingController } from './features/mailing/mailing.controller';
import { healthController } from './features/health/health.controller';
import { rateLimit } from 'elysia-rate-limit';
import { cors } from '@elysiajs/cors';

const app = new Elysia({ strictPath: false })
    .use(cors())
    .use(rateLimit({
        max: parseInt(env.MAX_REQUESTS_PER_MINUTE!) || 1000,
        duration: 60000,
        errorResponse: new Response(
            JSON.stringify({ error: 'Too Many Requests', detail: 'Rate limit excedido por diseño de seguridad.' }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
        )
    }))
    .onError(({ code, error, set, path }) => {
        const err = error as Error;
        const msg = err.message || 'Unknown Error';
        const errorCode = code as string;

        logger.error({ path, code: errorCode, error: msg }, `[System_Error] Exception caught`);

        if (msg.includes('ACCESS_DENIED') || errorCode === 'ACCESS_DENIED_NO_SECRET' || errorCode === 'ACCESS_DENIED_INVALID_SECRET') {
            set.status = 401;
            return {
                error: 'Unauthorized Access Denied',
                detail: msg.replace('ACCESS_DENIED_', '').replace(/_/g, ' ')
            };
        }

        if (code === 'VALIDATION') {
            set.status = 400;
            return { error: 'Invalid Payload Contract', detail: msg };
        }

        if (code === 'NOT_FOUND') {
            set.status = 404;
            return { error: 'Not Found', detail: 'Recurso no disponible.' };
        }

        // Fallback industrial
        set.status = 500;
        return {
            error: 'Unexpected Runtime Exception',
            detail: msg,
            timestamp: new Date().toISOString()
        };
    })
    .use(healthController)
    .use(mailingController)
    .listen(env.PORT!);

logger.info(`🚀 [NOTIFICATION_SERVICE_SECURED] Puerto ${app.server?.port}`);
logger.info({ audit: true, env: env.NODE_ENV }, `[System_Audit] Microservicio de notificaciones listo.`);
