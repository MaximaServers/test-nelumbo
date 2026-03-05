import { Elysia, t } from 'elysia';
import { userService } from './user.service';
import { checkRequiredRole } from '../../core/middlewares/auth.middleware';
import { env } from '../../config/env';
import { dragonfly } from '../../infrastructure/cache/dragonfly';
import type { UserPayload, AuditMetadataContext } from '../../types';

export const userController = (app: Elysia) =>
    app.group('/users', (app) => app


        .get('/operators', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const page = Number(ctx.query.page);
            const limit = Math.min(Number(ctx.query.limit), 100);

            const result = await userService.listOperators(page, limit);
            return { success: true, ...result };
        }, {
            query: t.Object({
                page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 50 }))
            }),
            detail: {
                tags: ['Users'],
                summary: 'Listar operadores del sistema (Paginado)',
                description: `
Devuelve los usuarios con rol OPERATOR registrados en el sistema, con sus sedes asignadas.
Implementa paginación obligatoria para asegurar la estabilidad del sistema.

**Acceso:** Solo ADMIN.

**Seguridad:** El campo \`passwordHash\` es excluido explícitamente — nunca se expone el hash de contraseña.

**Paginación:**
- \`page\`: Página actual (default 1).
- \`limit\`: Registros por página (default 50, max 100).
`.trim(),
                responses: {
                    200: { description: 'Array de operadores sin datos sensibles. Sedes resueltas por referencia.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                }
            }
        })


        .post('/operators', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null } & AuditMetadataContext;
            checkRequiredRole(ctx.user, ['ADMIN']);

            const body = ctx.body as { email: string; password: string; assignedLocations?: string[] };

            const newData = await userService.createOperator(body);

            ctx.set.status = 201;
            return { success: true, data: newData };
        }, {
            body: t.Object({
                email: t.String({ format: 'email', description: 'Email del nuevo operador. Debe ser único en el sistema.' }),
                password: t.String({ minLength: 6, description: 'Contraseña del operador (mínimo 6 caracteres). Se almacena como hash bcrypt cost-12.' }),
                assignedLocations: t.Optional(t.Array(t.String({ pattern: '^[0-9a-fA-F]{24}$', error: 'Formato de ObjectId inválido' }), { description: 'Array de ObjectIds de sedes asignadas. Pueden editarse luego con PUT /operators/:id/locations.' }))
            }),
            detail: {
                tags: ['Users'],
                summary: 'Crear un nuevo usuario Operador',
                description: `
Crea un nuevo operador en el sistema y opcionalmente le asigna sedes de trabajo.

**Acceso:** Solo ADMIN.

**Proceso de creación:**
- El email se normaliza a minúsculas.
- La contraseña se hashea con bcrypt (cost 12) — el hash nunca se expone.
- Si se pasan \`assignedLocations\`, se verifica que todas existan en MongoDB antes de crear el usuario.
- El operador se crea en estado \`ACTIVE\` por defecto.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede crear operadores.
- \`404\` — Una o más de las sedes en \`assignedLocations\` no existen.
- \`409\` — Ya existe un usuario con ese email.
- \`422\` — Email malformado, contraseña menor a 6 chars, o ObjectId de sede inválido.
`.trim(),
                responses: {
                    200: { description: 'Operador creado. Retorna id, email, role y sedes asignadas (sin passwordHash).' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    404: { description: 'Una o más sedes no encontradas.' },
                    409: { description: 'Email ya registrado.' },
                    422: { description: 'Cuerpo inválido.' },
                }
            }
        })


        .put('/operators/:id/locations', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user, ['ADMIN']);

            const body = ctx.body as { assignedLocations: string[] };
            const params = ctx.params as { id: string };

            const updatedOperator = await userService.updateOperatorLocations(params.id, body.assignedLocations);
            return { success: true, data: updatedOperator };
        }, {
            params: t.Object({
                id: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId del operador a actualizar' })
            }),
            body: t.Object({
                assignedLocations: t.Array(t.String({ pattern: '^[0-9a-fA-F]{24}$' }), { description: 'Lista completa de ObjectIds de sedes. Esta operación es un reemplazo completo — las sedes no listadas quedan desasignadas.' })
            }),
            detail: {
                tags: ['Users'],
                summary: 'Actualizar las sedes asignadas a un operador',
                description: `
Reemplaza completamente el array de sedes asignadas a un operador. Es una operación de reemplazo total, no de merge — si se envía un array vacío, el operador queda sin sedes.

**Acceso:** Solo ADMIN.

**Comportamiento:**
- Si antes tenía las sedes [A, B] y se envían [B, C], el resultado es [B, C] — A queda desasignada.
- Todas las sedes enviadas son validadas contra MongoDB antes de actualizar.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede modificar asignaciones.
- \`404\` — El operador no existe, o una o más sedes del array no existen.
- \`422\` — ObjectId de operador o de sede con formato inválido.
`.trim(),
                responses: {
                    200: { description: 'Operador actualizado con las nuevas sedes asignadas.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    404: { description: 'Operador no encontrado, o sedes inexistentes.' },
                    422: { description: 'ObjectId inválido.' },
                }
            }
        })


        .patch('/operators/:id/status', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null } & AuditMetadataContext;
            checkRequiredRole(ctx.user, ['ADMIN']);

            const { id } = ctx.params;
            const { status } = ctx.body as { status: 'ACTIVE' | 'INACTIVE' };

            const updated = await userService.updateOperatorStatus(id, status);


            if (status === 'INACTIVE') {
                await dragonfly.set(`auth:revoked:${id}`, 'deactivated', 'EX', env.SESSION_EXPIRATION_SECONDS);
            } else {

                await dragonfly.del(`auth:revoked:${id}`);
            }


            ctx.auditAction = status === 'INACTIVE' ? 'USER_DEACTIVATE' : 'USER_ACTIVATE';
            ctx.auditPayload = { targetId: id, targetEmail: updated.email, newStatus: status };

            return { success: true, message: `Estado del operador actualizado a ${status}.` };
        }, {
            params: t.Object({
                id: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId del operador' })
            }),
            body: t.Object({
                status: t.Enum({ ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' }, { description: 'Nuevo estado del operador' })
            }),
            detail: {
                tags: ['Users'],
                summary: 'Activar o desactivar un operador (invalidación instantánea si se desactiva)',
                description: `
Cambia el estado de un operador entre \`ACTIVE\` e \`INACTIVE\` con efecto inmediato sobre sus sesiones activas.

**Acceso:** Solo ADMIN.

**Kill-Switch (INACTIVE):**
Cuando se desactiva un operador, se escribe una clave en DragonflyDB (\`auth:revoked:{id}\`) con TTL igual a la expiración de sesión configurada. Cualquier request que llegue con el JWT de ese operador será rechazado en el middleware de auth antes de llegar al controlador, sin importar si el token aún no expiró.

**Reactivación (ACTIVE):**
Al reactivar, se elimina la clave de DragonflyDB. El operador puede volver a autenticarse y operar normalmente.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede cambiar estados.
- \`404\` — Operador no encontrado.
- \`422\` — Estado inválido (solo se aceptan \`ACTIVE\` o \`INACTIVE\`).

**Auditoría:** Se registra \`USER_DEACTIVATE\` o \`USER_ACTIVATE\` según el caso.
`.trim(),
                responses: {
                    200: { description: 'Estado actualizado. Si se desactivó, el operador ya no puede usar tokens existentes.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    404: { description: 'Operador no encontrado.' },
                    422: { description: 'Estado inválido.' },
                }
            }
        })


        .delete('/operators/:id', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null } & AuditMetadataContext;
            checkRequiredRole(ctx.user, ['ADMIN']);

            const { id } = ctx.params;
            const target = await userService.deleteOperator(id);


            await dragonfly.set(`auth:revoked:${id}`, 'deleted', 'EX', env.SESSION_EXPIRATION_SECONDS);


            ctx.auditAction = 'USER_DELETE';
            ctx.auditPayload = { deletedUserId: id, deletedEmail: target.email };

            return { success: true, message: 'Operador eliminado y sesiones invalidadas.' };
        }, {
            params: t.Object({
                id: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId del operador a eliminar' })
            }),
            detail: {
                tags: ['Users'],
                summary: 'Eliminar un operador e invalidar sus sesiones instantáneamente',
                description: `
Elimina permanentemente un operador del sistema e invalida todas sus sesiones activas de forma inmediata.

**Acceso:** Solo ADMIN.

**Proceso de eliminación:**
1. Se elimina el documento del operador en MongoDB.
2. Se escribe una clave en DragonflyDB (\`auth:revoked:{id}\`) con TTL = duración de sesión configurada — cualquier token existente del operador será rechazado inmediatamente por el middleware de auth.

**⚠️ Esta operación es irreversible.** El operador no puede ser recuperado. Sus registros de acceso históricos se conservan (integridad referencial para auditoría y facturación).

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — Solo ADMIN puede eliminar operadores.
- \`404\` — Operador no encontrado (puede no existir o ser un ADMIN).

**Auditoría:** El evento \`USER_DELETE\` queda registrado con el ID y email del eliminado.
`.trim(),
                responses: {
                    200: { description: 'Operador eliminado. Sus tokens activos quedan invalidados de inmediato.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'Rol insuficiente.' },
                    404: { description: 'Operador no encontrado.' },
                }
            }
        })
    );
