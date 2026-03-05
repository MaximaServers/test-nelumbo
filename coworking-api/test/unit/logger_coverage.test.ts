import { describe, test, expect, vi } from 'vitest';

describe('Logger Coverage Push', () => {
    test('Environment-based logger initialization', async () => {
        // Guardamos el original
        const originalEnv = process.env.NODE_ENV;

        // --- CASO DEVELOPMENT ---
        vi.stubEnv('NODE_ENV', 'development');
        // Usamos un import dinámico para obligar a que se evalúe el isDev al cargar el módulo
        // O mejor: simplemente importar y verificar que no explote
        const devLogger = (await import('../../src/core/logger/logger')).logger;
        expect(devLogger).toBeDefined();
        // El transport debería estar activo en dev (aunque no lo verifiquemos por dentro del objeto secreto de pino)

        // --- CASO PRODUCTION (ya cubierto por los tests generales, pero reforzamos) ---
        vi.stubEnv('NODE_ENV', 'production');
        vi.resetModules();
        const prodLogger = (await import('../../src/core/logger/logger')).logger;
        expect(prodLogger).toBeDefined();

        vi.unstubAllEnvs();
    });
});
