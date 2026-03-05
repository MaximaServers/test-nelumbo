import { Elysia } from 'elysia';

/**
 * 🏥 HEALTH CHECK CONTROLLER (FEATURE-FIRST)
 * Rutas públicas de diagnóstico. Completamente aislado en su propio feature.
 */
export const healthController = new Elysia({ prefix: '/health', name: 'HealthFeature' })
    .get('', () => ({
        status: 'UP',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV || 'production'
    }), {
        detail: {
            summary: 'Salud del Microservicio',
            tags: ['Health']
        }
    });
