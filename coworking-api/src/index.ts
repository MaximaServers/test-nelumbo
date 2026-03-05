import { Elysia } from 'elysia';
import { swagger } from '@elysiajs/swagger';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { logger } from './core/logger/logger';
import { performAudit } from './core/middlewares/audit.middleware';
import { connectMongoDB } from './infrastructure/database/mongodb';
import { connectDragonfly } from './infrastructure/cache/dragonfly';
import { DomainException, NotFoundException } from './core/exceptions/domain.exception';
import { startCapacitySyncJob } from './infrastructure/jobs/capacity-sync.job';
import { startStayReminderJob } from './infrastructure/jobs/stay-reminder.job';
import { authController } from './features/auth/auth.controller';
import { locationController } from './features/locations/location.controller';
import { userController } from './features/users/user.controller';
import { accessController } from './features/access/access.controller';
import { couponController } from './features/coupons/coupon.controller';
import { analyticsController } from './features/analytics/analytics.controller';
import { auth } from './core/middlewares/auth.middleware';

await connectMongoDB();
await connectDragonfly();
startCapacitySyncJob();
startStayReminderJob();

import { stayReminderService } from './features/reminders/stay-reminder.service';
stayReminderService.reSyncReminders(); // Reconstrucción automática de la cola de notificaciones

export const app = new Elysia()
    .error({ DOMAIN_ERROR: DomainException })


    .onError(async (ctx) => {
        const err = ctx.error as any;
        logger.error({
            code: ctx.code,
            path: ctx.path,
            error: err?.message,
            stack: err?.stack
        }, `[CRITICAL_ERR] Exception caught in global handler`);


        const { code, error, path, request, body } = ctx;
        const derivedCtx = ctx as typeof ctx & {
            auditContext?: { startTime: number; ip: string };
            user?: import('./types').UserPayload | null;
            auditAction?: string;
            auditPayload?: Record<string, string | number | boolean | object | null>;
        };
        const { auditContext, user, auditAction, auditPayload } = derivedCtx;

        const traceId = crypto.randomUUID();
        let errorStatus: number = 500;

        if (error instanceof DomainException) {
            errorStatus = error.status;
        } else if (error && typeof error === 'object' && 'status' in error && typeof (error as { status: number }).status === 'number') {
            errorStatus = (error as { status: number }).status;
        } else {
            switch (code) {
                case 'NOT_FOUND': errorStatus = 404; break;
                case 'VALIDATION': errorStatus = 422; break;
                case 'PARSE': errorStatus = 400; break;
                default:
                    errorStatus = 500;

            }
        }

        const finalAction = auditAction || `ERROR_${code}`;
        const safeAuditContext = auditContext || { startTime: Date.now(), ip: '127.0.0.1' };

        await performAudit({
            method: request.method,
            path,
            status: errorStatus,
            auditContext: safeAuditContext,
            user: user ?? null,
            auditAction: finalAction,
            auditPayload: {
                ...(auditPayload || {}),
                error: error instanceof Error ? error.message : String(error),
                code
            },
            body
        });

        let responseBody: Record<string, any>;

        if (error instanceof DomainException) {
            responseBody = {
                type: error.type,
                title: error.title,
                status: error.status,
                detail: error.detail,
                instance: path,
                traceId,
            };
        } else if (code === 'NOT_FOUND') {
            responseBody = {
                type: 'https://coworking.api/errors/not-found',
                title: 'No encontramos ese recurso',
                status: 404,
                detail: `La ruta '${path}' no existe.`,
                instance: path,
                traceId,
            };
        } else if (code === 'VALIDATION') {
            const validationError = error as unknown as { summary?: string; message?: string; all?: any[] };
            let detail = validationError.summary || validationError.message || 'Validación fallida.';

            const isTechnical = detail.includes('Expected') ||
                detail.includes('Could not create') ||
                detail.includes('at path') ||
                (validationError.all && validationError.all.length > 1);

            if (isTechnical) {
                detail = 'El formato de los datos es inválido o faltan campos obligatorios.';
            }

            responseBody = {
                type: 'https://coworking.api/errors/validation',
                title: 'Hay campos con errores',
                status: 422,
                detail,
                instance: path,
                traceId,
            };
        } else if (code === 'PARSE') {
            responseBody = {
                type: 'https://coworking.api/errors/parse',
                title: 'No pudimos leer los datos',
                status: 400,
                detail: 'El JSON enviado es inválido.',
                instance: path,
                traceId,
            };
        } else {
            const msg = error instanceof Error ? error.message : String(error);
            const isInfra = msg.includes('MongooseServerSelectionError') || msg.includes('ECONNREFUSED');

            responseBody = {
                type: isInfra ? 'https://coworking.api/errors/unavailable' : 'https://coworking.api/errors/internal',
                title: isInfra ? 'El servidor no responde' : 'Tenemos un problema interno',
                status: isInfra ? 503 : 500,
                detail: env.NODE_ENV === 'production' ? 'Un error inesperado ocurrió.' : msg,
                instance: path,
                traceId,
            };
            if (isInfra) errorStatus = 503;
        }

        return new Response(JSON.stringify(responseBody), {
            status: errorStatus,
            headers: { 'Content-Type': 'application/json' }
        });
    })

    .derive(({ headers }) => {
        const startTime = Date.now();

        const xForwardedFor = headers['x-forwarded-for'];
        const ip = (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor?.split(',')[0]) || '127.0.0.1';

        return {
            auditContext: { startTime, ip },
            auditAction: undefined as string | undefined,
            auditPayload: undefined as Record<string, string | number | boolean | object | null> | undefined
        };
    })

    .onBeforeHandle(({ request, path }: { request: Request, path: string }) => {
        logger.debug({ method: request.method, path }, `[Request] incoming`);
    })


    .use(cors({
        origin: env.NODE_ENV === 'production'
            ? (env.ALLOWED_ORIGINS?.split(',') ?? [])
            : true,
        credentials: env.NODE_ENV === 'production',
        allowedHeaders: ['Content-Type', 'Authorization'],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        maxAge: 600,
    }))

    .onRequest(({ set }: { set: any }) => {
        set.headers['X-Frame-Options'] = 'DENY';
        set.headers['X-Content-Type-Options'] = 'nosniff';
        set.headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
        set.headers['Referrer-Policy'] = 'no-referrer';
    })

    .use(swagger({
        path: '/swagger',
        documentation: {
            info: { title: 'Coworking API', version: '1.0.0' },
            components: {
                securitySchemes: {
                    JwtAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
                }
            }
        }
    }))



    .onAfterHandle(async ({ request, path, set, user, auditAction, auditPayload, body, auditContext }: any) => {
        const status = typeof set.status === 'number' ? set.status : 200;

        if (status < 400 && (['POST', 'PUT', 'DELETE'].includes(request.method) || path.includes('/analytics') || auditAction)) {
            await performAudit({
                method: request.method,
                path,
                status,
                auditContext,
                user: user ?? null,
                auditAction,
                auditPayload,
                body
            });
        }
    })


    .get('/health', async () => ({ status: 'ok', uptime: process.uptime() }))
    .use(authController)


    .use(auth)


    .use(locationController)
    .use(userController)
    .use(accessController)
    .use(couponController)
    .use(analyticsController)

    .all('*', () => { throw new NotFoundException('Ruta no encontrada'); })

    .listen(env.PORT);

logger.info(`[COWORKING_API_READY] activo en el puerto ${env.PORT}`);

export type App = typeof app;
