import { Type, Static } from '@sinclair/typebox';

/**
 * 📧 MAILING SCHEMA (DTO)
 * Contrato estricto y validado para la recepción de correos.
 */
export const SendEmailSchema = Type.Object({
    to: Type.String({ format: 'email', description: 'Destinatario final' }),
    subject: Type.String({ minLength: 5, maxLength: 100, description: 'Asunto de la notificación' }),
    text: Type.String({ minLength: 10, description: 'Cuerpo en texto plano' }),
    html: Type.Optional(Type.String({ description: 'Cuerpo en HTML (premium layout)' })),
    from: Type.Optional(Type.String({ default: 'Coworking <notifications@resend.dev>', description: 'Sender personalizado' }))
});

export type SendEmailRequest = Static<typeof SendEmailSchema>;
