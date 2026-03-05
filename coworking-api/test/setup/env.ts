/**
 * Preload: Inyecta variables de entorno mínimas antes de que env.ts se evalúe.
 * env.ts ejecuta process.exit(1) si el schema Zod falla — esto lo previene.
 * Este archivo se carga vía bunfig.toml ANTES que cualquier import de test.
 */
process.env['PORT'] = '0';
process.env['MONGO_URI'] = 'mongodb://localhost:27017/test';
process.env['JWT_SECRET'] = 'test-secret-that-is-long-enough-32chars!!';
process.env['NODE_ENV'] = 'test';
process.env['SESSION_EXPIRATION'] = '6h';
process.env['DRAGONFLY_HOST'] = 'localhost';
process.env['DRAGONFLY_PORT'] = '6379';
process.env['DRAGONFLY_PASSWORD'] = '';
process.env['NOTIFICATION_SERVICE_URL'] = 'http://localhost:3001/email';
process.env['NOTIFICATION_SECRET'] = 'test-notification-secret-2026';
