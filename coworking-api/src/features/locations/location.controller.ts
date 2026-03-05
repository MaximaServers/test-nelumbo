import { Elysia, t } from 'elysia';
import { locationService } from './location.service';
import { checkRequiredRole } from '../../core/middlewares/auth.middleware';
import type { UserPayload } from '../../types';

export const locationController = (app: Elysia) =>
    app.group('/locations', (app) => app

        .get('/', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const page = Number(ctx.query.page);
            const limit = Math.min(Number(ctx.query.limit), 100);

            const result = await locationService.listLocations(page, limit);
            return { success: true, ...result };
        }, {
            query: t.Object({
                page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 50 }))
            }),
            detail: {
                tags: ['Locations'],
                summary: 'Listar sedes (Paginado)',
                description: `
Devuelve la lista de sedes registradas en el sistema.
Usa paginación obligatoria para preservar el performance.

**Acceso:** Solo ADMIN.

**Paginación:**
- \`page\`: Página actual.
- \`limit\`: Límite por página (max 100).
`.trim(),
                responses: {
                    200: { description: 'Array de sedes con sus atributos completos (nombre, dirección, capacidad, precio/hora).' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente. Solo ADMIN puede listar sedes.' },
                }
            },
        })

        .post('/', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const body = ctx.body as { name: string; address: string; maxCapacity: number; pricePerHour: number };
            const newLocation = await locationService.createLocation(body);
            ctx.set.status = 201;
            return { success: true, data: newLocation };
        }, {
            body: t.Object({
                name: t.String({ minLength: 2, description: 'Nombre único de la sede' }),
                address: t.String({ minLength: 5, description: 'Dirección física de la sede' }),
                maxCapacity: t.Number({ minimum: 1, description: 'Capacidad máxima concurrente de personas' }),
                pricePerHour: t.Number({ minimum: 0, description: 'Precio por hora de uso en la moneda configurada' }),
            }),
            detail: {
                tags: ['Locations'],
                summary: 'Crear una nueva sede',
                description: `
Crea una sede nueva en el sistema. El nombre debe ser único globalmente.

**Acceso:** Solo ADMIN.

**Validaciones:**
- \`name\` debe ser único — si ya existe una sede con ese nombre se retorna \`409\`.
- \`maxCapacity\` mínimo 1.
- \`pricePerHour\` mínimo 0 (sedes gratuitas son válidas).

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede crear sedes.
- \`409\` — Ya existe una sede con el mismo nombre.
- \`422\` — Campos requeridos faltantes o tipos inválidos.
`.trim(),
                responses: {
                    200: { description: 'Sede creada exitosamente. Retorna el documento completo incluyendo su \`_id\`.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    409: { description: 'Conflicto: ya existe una sede con ese nombre.' },
                    422: { description: 'Cuerpo inválido.' },
                }
            },
        })

        .put('/:id', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const body = ctx.body as Partial<{ name: string; address: string; maxCapacity: number; pricePerHour: number }>;
            const params = ctx.params as { id: string };
            const updated = await locationService.updateLocation(params.id, body);
            return { success: true, data: updated };
        }, {
            params: t.Object({ id: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId de la sede (24 caracteres hex)' }) }),
            body: t.Object({
                name: t.Optional(t.String({ minLength: 2, description: 'Nuevo nombre de la sede' })),
                address: t.Optional(t.String({ minLength: 5, description: 'Nueva dirección' })),
                maxCapacity: t.Optional(t.Number({ minimum: 1, description: 'Nueva capacidad máxima' })),
                pricePerHour: t.Optional(t.Number({ minimum: 0, description: 'Nuevo precio por hora' })),
            }),
            detail: {
                tags: ['Locations'],
                summary: 'Actualizar una sede existente',
                description: `
Actualiza uno o más campos de una sede existente. Todos los campos del body son opcionales — solo se actualizan los que se envíen.

**Acceso:** Solo ADMIN.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede modificar sedes.
- \`404\` — No existe una sede con el \`id\` proporcionado.
- \`422\` — Tipos inválidos en los campos enviados.
`.trim(),
                responses: {
                    200: { description: 'Sede actualizada. Retorna el documento con los nuevos valores.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    404: { description: 'Sede no encontrada.' },
                    422: { description: 'Cuerpo inválido.' },
                }
            },
        })
    );
