import { Elysia } from 'elysia';
import { mailingService } from './mailing.service';
import { SendEmailSchema } from './mailing.schema';
import { securityMiddleware } from '../../core/middlewares/security.middleware';
import { logger } from '../../core/logger/logger';

export const mailingController = new Elysia({ prefix: '/email', name: 'MailingFeature' })
    .use(securityMiddleware)

    .post('', async ({ body, set }) => {
        logger.info({ to: body.to }, `[Mailing_Feature] Recibiendo despacho de email...`);

        const result = await mailingService.sendEmail(body);

        if (!result.success) {
            set.status = 502;
            logger.error({ error: result.error, to: body.to }, `[Mailing_Feature_Err] Fallo en infra externa`);
        } else {
            set.status = 201;
            logger.info({ messageId: result.messageId, to: body.to, audit: true }, `[Mailing_Feature_Audit] Éxito: Notificado`);
        }

        return result;
    }, {
        body: SendEmailSchema,
        detail: {
            summary: 'Enviar email',
            description: 'Recibe payload formal y lo despacha al orquestador',
            tags: ['Mailing']
        }
    });
