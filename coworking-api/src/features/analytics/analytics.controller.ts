import { Elysia, t } from 'elysia';
import { analyticsService } from './analytics.service';
import { checkRequiredRole } from '../../core/middlewares/auth.middleware';
import { ForbiddenException } from '../../core/exceptions/domain.exception';
import type { UserPayload } from '../../types';

export const analyticsController = (app: Elysia) =>
    app.group('/analytics', (app) => app


        .get('/top-people', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN', 'OPERATOR']);

            const { startDate, endDate } = ctx.query;
            const data = await analyticsService.getTopPeople(startDate, endDate);
            return { success: true, data };
        }, {
            query: t.Object({
                startDate: t.Optional(t.String({ format: 'date-time', description: 'Fecha inicio (ISO-8601). Default: hace 30 días.' })),
                endDate: t.Optional(t.String({ format: 'date-time', description: 'Fecha fin (ISO-8601). Default: ahora.' })),
            }),
            detail: {
                tags: ['Analytics'],
                summary: 'Top 10 personas con más ingresos al sistema',
                description: `
Retorna el ranking global de las 10 personas con mayor actividad en el rango temporal especificado.
Implementa **Timeboxing** (max 30 días de rango sugerido) y **PII Masking** en el documento.

**Acceso:** ADMIN y OPERATOR.
`.trim(),
                responses: {
                    200: { description: 'Array de hasta 10 personas ordenadas por cantidad de ingresos descendente.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                }
            }
        })


        .get('/stats', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null, query: { locationId?: string; startDate?: string; endDate?: string } };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const data = await analyticsService.getLocationStats(ctx.query.locationId, ctx.query.startDate, ctx.query.endDate);
            return { success: true, data };
        }, {
            query: t.Object({
                locationId: t.Optional(t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'Sede específica.' })),
                startDate: t.Optional(t.String({ format: 'date-time' })),
                endDate: t.Optional(t.String({ format: 'date-time' })),
            }),
            detail: {
                tags: ['Analytics'],
                summary: 'Indicadores financieros y de uso (Timeboxed)',
                description: `
Retorna indicadores financieros redondeados a 2 decimales. 
Obliga a usar rangos de tiempo para evitar degradación de performance.
`.trim(),
                responses: {
                    200: { description: 'Objeto con métricas financieras y operativas.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    422: { description: 'Parámetros inválidos.' },
                }
            }
        })


        .get('/top-people/location/:locationId', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null; query: { startDate?: string; endDate?: string } };
            checkRequiredRole(ctx.user, ['ADMIN', 'OPERATOR']);

            const { locationId } = ctx.params;
            const { startDate, endDate } = ctx.query;


            if (ctx.user!.role === 'OPERATOR') {
                const assignedLocations = ctx.user!.locations ?? [];
                if (!assignedLocations.includes(locationId)) {
                    throw new ForbiddenException('No tienes permiso para consultar estadísticas de esta sede.');
                }
            }

            const data = await analyticsService.getTopPeopleByLocation(locationId, startDate, endDate);
            return { success: true, data };
        }, {
            params: t.Object({ locationId: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId de la sede' }) }),
            query: t.Object({
                startDate: t.Optional(t.String({ format: 'date-time' })),
                endDate: t.Optional(t.String({ format: 'date-time' }))
            }),
            detail: {
                tags: ['Analytics'],
                summary: 'Top 10 personas con más ingresos en una sede específica (Timeboxed)',
                description: `
Igual que \`GET /analytics/top-people\` pero filtrado por sede y con rangos de fecha obligatorios.
`.trim(),
                responses: {
                    200: { description: 'Array de hasta 10 personas que más visitan esa sede.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    422: { description: 'Parámetros inválidos.' },
                }
            }
        })


        .get('/first-timers', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null; query: { startDate?: string; endDate?: string } };
            checkRequiredRole(ctx.user, ['ADMIN', 'OPERATOR']);

            const { startDate, endDate } = ctx.query;
            const data = await analyticsService.getFirstTimeEntries(startDate, endDate);
            return { success: true, data };
        }, {
            query: t.Object({
                startDate: t.Optional(t.String({ format: 'date-time' })),
                endDate: t.Optional(t.String({ format: 'date-time' }))
            }),
            detail: {
                tags: ['Analytics'],
                summary: 'Personas que ingresan por primera vez (Timeboxed)',
                description: `
Lista las personas que solo tienen un ingreso registrado en el sistema dentro del rango temporal.
`.trim(),
                responses: {
                    200: { description: 'Array de personas.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                }
            }
        })


        .get('/operator-revenue', async (context) => {
            const ctx = context as typeof context & {
                user: UserPayload | null;
                query: { scope?: 'personal' | 'location'; locationId?: string }
            };
            checkRequiredRole(ctx.user, ['OPERATOR', 'ADMIN']);

            const user = ctx.user!;
            const { scope = 'location', locationId } = ctx.query;

            // ADMIN: puede ver cualquier sede o global
            if (user.role === 'ADMIN') {
                const metrics = await analyticsService.getFinancialMetrics({
                    locationIds: locationId ? [locationId] : undefined
                });
                return { success: true, data: metrics };
            }

            // OPERATOR: personal o sus sedes asignadas
            if (scope === 'personal') {
                const metrics = await analyticsService.getFinancialMetrics({ operatorEmail: user.email });
                return { success: true, data: metrics };
            }

            // Por defecto, ingresos de sus sedes asignadas
            const assigned = user.locations ?? [];
            const metrics = await analyticsService.getFinancialMetrics({ locationIds: assigned });
            return { success: true, data: metrics };

        }, {
            query: t.Object({
                scope: t.Optional(t.String({ pattern: '^(personal|location)$', description: 'Alcance de las métricas. Default: location.' })),
                locationId: t.Optional(t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'Sede específica (Solo ADMIN).' }))
            }),
            detail: {
                tags: ['Analytics'],
                summary: 'Ingresos económicos (hoy, semana, mes, año)',
                description: `
Retorna el resumen de facturación desglosado por períodos clave.
Implementa **Smart Scoping**:
- **Operadores:** Por defecto ven los ingresos de sus sedes asignadas. Pueden usar \`?scope=personal\` para ver solo sus ventas.
- **Admin:** Por defecto ve ingresos globales. Puede usar \`?locationId=...\` para filtrar.

**Períodos:** Hoy, Semana (Lunes-Domingo), Mes, Año.
`.trim(),
                responses: {
                    200: { description: 'Métricas financieras por período.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                }
            }
        })



        .get('/top-operators', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const data = await analyticsService.getTopOperatorsWeekly();
            return { success: true, data };
        }, {
            detail: {
                tags: ['Analytics'],
                summary: 'Top 3 operadores con más ingresos (check-ins) en la semana',
                description: `
Retorna el ranking de los 3 operadores que han registrado la mayor cantidad de ingresos (check-ins) de personas en el sistema durante la semana actual.

**Acceso:** Solo ADMIN.

**Métrica:** Conteo de documentos de acceso donde el operador realizó el \`checkIn\`. Muestra la productividad operativa en recepción.

**Condiciones de error:**
- \`401\` — No autenticado.
- \`403\` — Solo para rol ADMIN.
`.trim(),
                responses: {
                    200: { description: 'Array de operadores con su respectivo conteo de ingresos procesados.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                }
            }
        })



        .get('/top-locations', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const data = await analyticsService.getTopLocationsWeekly();
            return { success: true, data };
        }, {
            detail: {
                tags: ['Analytics'],
                summary: 'Top 3 sedes con mayor facturación en la semana actual',
                description: `
Retorna las 3 sedes con mayor facturación acumulada en la semana en curso.

**Acceso:** Solo ADMIN.

**Métrica:** Suma de \`billingAmount\` de todos los checkouts completados en la semana actual agrupados por \`locationId\`.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede ver este ranking.
`.trim(),
                responses: {
                    200: { description: 'Array de hasta 3 sedes con nombre y total facturado en la semana.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                }
            }
        })
    );
