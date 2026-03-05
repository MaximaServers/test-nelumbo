import { GmailAdapter } from '../../infrastructure/mailing/gmail.adapter';
import { SendEmailRequest } from './mailing.schema';
import { MailResponse } from './mailing.types';
import { logger } from '../../core/logger/logger';

class MailingService {
    async sendEmail(params: SendEmailRequest): Promise<MailResponse> {
        logger.info({ to: params.to, subject: params.subject }, `[Mailing_Service] Orquestando envío...`);
        return await GmailAdapter.send(params);
    }
}

export const mailingService = new MailingService();
