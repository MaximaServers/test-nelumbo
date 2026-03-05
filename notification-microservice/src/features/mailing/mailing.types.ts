export interface MailResponse {
    success: boolean;
    messageId?: string;
    error?: string;
    detail?: string;
    sentAt?: string;
}
