import { z } from 'zod';

const envSchema = z.object({
    PORT: z.string().default('3000').transform(Number),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    
    MONGO_URI: z.string().url(),

    
    DRAGONFLY_HOST: z.string().default('localhost'),
    DRAGONFLY_PORT: z.string().default('6379').transform(Number),
    DRAGONFLY_PASSWORD: z.string().optional(),

    
    JWT_SECRET: z.string().min(32),
    SESSION_EXPIRATION: z.string().default('6h'),

    
    
    ALLOWED_ORIGINS: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error('❌ Invalid environment variables:', _env.error.format());
    process.exit(1);
}


export function parseExpirationToSeconds(exp: string): number {
    const value = parseInt(exp);
    if (isNaN(value)) return 21600; 

    const unit = exp.toLowerCase().replace(/[0-9]/g, '').trim();
    switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return value; 
    }
}

export const env = {
    ..._env.data,
    SESSION_EXPIRATION_SECONDS: parseExpirationToSeconds(_env.data.SESSION_EXPIRATION),
    ALLOWED_ORIGINS: _env.data.ALLOWED_ORIGINS,
};
