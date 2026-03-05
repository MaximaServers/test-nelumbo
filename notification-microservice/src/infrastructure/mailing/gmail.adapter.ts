import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../core/logger/logger';
import { MailResponse } from '../../features/mailing/mailing.types';

export class GmailAdapter {
    private static transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: env.GMAIL_USER,
            pass: env.GMAIL_APP_PASSWORD,
        },
    });

    static async send(params: {
        to: string;
        subject: string;
        text: string;
        html?: string;
    }): Promise<MailResponse> {
        try {
            logger.info({ to: params.to, subject: params.subject }, `[Gmail_Adapter] Despachando email via SMTP...`);

            const info = await this.transporter.sendMail({
                from: `"Coworking System" <${env.GMAIL_USER}>`,
                to: params.to,
                subject: params.subject,
                text: params.text,
                html: params.html
            });

            logger.info({ messageId: info.messageId }, `[Gmail_Adapter_Audit] Email despachado con éxito`);

            return {
                success: true,
                messageId: info.messageId
            };

        } catch (error: any) {
            logger.error({
                error: error.message,
                code: error.code,
                command: error.command
            }, `[Gmail_Adapter_Err] Fallo crítico en el túnel SMTP`);

            return {
                success: false,
                error: error.message || 'SMTP_TRANSPORTER_FAILURE'
            };
        }
    }
}
