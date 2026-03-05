import { Type, Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const envSchema = Type.Object({
    PORT: Type.Optional(Type.String({ default: '3001' })),
    NODE_ENV: Type.Optional(Type.Enum({ development: 'development', production: 'production', test: 'test' }, { default: 'development' })),

    GMAIL_USER: Type.String({ format: 'email', description: 'Correo de despacho (Gmail)' }),
    GMAIL_APP_PASSWORD: Type.String({ minLength: 16, maxLength: 16, description: 'Contraseña de aplicación (16 chars)' }),
    NOTIFICATION_SECRET: Type.String({ minLength: 20, description: 'Secret de despacho (Capa Web)' }),

    MAX_REQUESTS_PER_MINUTE: Type.Optional(Type.String({ default: '1000' }))
});

export type Env = Static<typeof envSchema>;

const validateEnv = (): Env => {
    const rawEnv = {
        PORT: process.env.PORT || '3001',
        NODE_ENV: process.env.NODE_ENV || 'development',
        GMAIL_USER: process.env.GMAIL_USER,
        GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''), // Normalizar espacios de Google
        NOTIFICATION_SECRET: process.env.NOTIFICATION_SECRET,
        MAX_REQUESTS_PER_MINUTE: process.env.MAX_REQUESTS_PER_MINUTE || '1000'
    };

    const errors = [...Value.Errors(envSchema, rawEnv)];
    if (errors.length > 0) {
        console.error('❌ [CRITICAL_ERR] Entorno INVÁLIDO detectado:', JSON.stringify(errors, null, 2));
        process.exit(1);
    }

    return Value.Cast(envSchema, rawEnv);
};

export const env = validateEnv();
export const envConfigs = env;
