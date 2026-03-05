import { Elysia, t } from 'elysia';
import { accessService } from './access.service';
import { checkRequiredRole } from '../../core/middlewares/auth.middleware';
import type { UserPayload, AuditMetadataContext } from '../../types';

export const accessController = (app: Elysia) =>
    app.group('/access', (app) => app


        .post('/in', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null } & AuditMetadataContext;
            checkRequiredRole(ctx.user!, ['ADMIN', 'OPERATOR']);
            const { document, locationId, name, email } = ctx.body;


            ctx.auditAction = 'CHECK_IN';
            ctx.auditPayload = { document, locationId };

            const result = await accessService.checkIn({
                document,
                name,
                email,
                locationId,
                operator: ctx.user!,
            });

            return {
                success: true,
                message: 'Ingreso registrado correctamente',
                data: result
            };
        }, {
            body: t.Object({
                document: t.String({ minLength: 5, description: 'Número de documento de identidad de la persona que ingresa' }),
                name: t.String({ minLength: 2, description: 'Nombre completo de la persona' }),
                email: t.String({ format: 'email', description: 'Email de la persona (usado para notificaciones de fidelidad)' }),
                locationId: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId de la sede donde se registra el ingreso' }),
            }),
            detail: {
                tags: ['Access'],
                summary: 'Registrar ingreso de una persona a la sede',
                description: `
Registra el ingreso de una persona al coworking. Este endpoint implementa control de concurrencia estricto para garantizar consistencia en tiempo real.

**Acceso:** ADMIN o OPERATOR asignado a la sede.

**Flujo interno:**
1. Valida que el operador esté asignado a la sede solicitada (ADMIN tiene acceso global).
2. Adquiere un lock atómico en DragonflyDB por documento — impide doble ingreso simultáneo en cualquier sede.
3. Ejecuta un script LUA para incrementar la ocupación de forma atómica y verificar la capacidad máxima.
4. Hace upsert de la entidad \`Person\` (datos PII aislados del registro de acceso).
5. Crea el registro \`Access\` con estado \`ACTIVE\`.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — El operador no está asignado a esta sede, o el email pertenece a un empleado (ADMIN/OPERATOR).
- \`409\` — La persona ya tiene un ingreso activo en este u otro coworking (lock Redis activo).
- \`409\` — La sede alcanzó su capacidad máxima configurada.
- \`404\` — La sede no existe.
- \`422\` — Campos requeridos faltantes o tipos inválidos.

**Auditoría:** El evento \`CHECK_IN\` queda registrado con documento enmascarado y locationId.
`.trim(),
                responses: {
                    200: { description: 'Ingreso registrado. Retorna el documento Access creado con estado ACTIVE.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'El operador no tiene permiso para esta sede, o la identidad pertenece a un empleado.' },
                    404: { description: 'Sede no encontrada.' },
                    409: { description: 'Persona ya dentro de un coworking, o sede al máximo de capacidad.' },
                    422: { description: 'Cuerpo inválido.' },
                }
            }
        })


        .post('/out', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null } & AuditMetadataContext;
            checkRequiredRole(ctx.user!, ['ADMIN', 'OPERATOR']);
            const body = ctx.body as { document: string; locationId: string };

            ctx.auditAction = 'CHECK_OUT';
            ctx.auditPayload = { document: body.document, locationId: body.locationId };

            const result = await accessService.checkOut({
                document: body.document,
                locationId: body.locationId,
                operator: ctx.user!,
            });

            return {
                success: true,
                message: 'Salida registrada correctamente',
                data: result
            };
        }, {
            body: t.Object({
                document: t.String({ minLength: 5, description: 'Número de documento de la persona que sale' }),
                locationId: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId de la sede de la que sale' }),
            }),
            detail: {
                tags: ['Access'],
                summary: 'Registrar salida y calcular facturación',
                description: `
Cierra el ingreso activo de una persona, calcula el monto a facturar y libera los locks de concurrencia.

**Acceso:** ADMIN o OPERATOR asignado a la sede.

**Flujo interno:**
1. Localiza el registro \`Access\` con estado \`ACTIVE\` para el documento y sede indicados.
2. Calcula la duración en horas (mínimo 0.1h para evitar montos en cero por errores de timing).
3. Calcula \`billingAmount = duracionHoras × priceAtCheckIn\` (precio se captura en el check-in para evitar cambios retroactivos).
4. Libera el lock en DragonflyDB (\`access:active:doc:{document}\`) y decrementa la ocupación.
5. Actualiza el registro a estado \`COMPLETED\`.
6. Lanza en background el proceso de fidelidad (no bloqueante): si la persona acumuló ≥20h en la sede, genera un cupón automáticamente.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — El operador no está asignado a esta sede.
- \`404\` — Persona no registrada en el sistema, o no tiene un ingreso activo en esta sede.
- \`422\` — Campos requeridos faltantes.

**Auditoría:** El evento \`CHECK_OUT\` queda registrado con documento enmascarado y locationId.
`.trim(),
                responses: {
                    200: { description: 'Salida registrada. Retorna el documento Access cerrado con el monto de facturación calculado.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'El operador no tiene permiso para esta sede.' },
                    404: { description: 'Persona no encontrada o sin ingreso activo en la sede.' },
                    422: { description: 'Cuerpo inválido.' },
                }
            }
        })


        .get('/active/:locationId', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null, query: { page?: string, limit?: string } };
            checkRequiredRole(ctx.user, ['ADMIN', 'OPERATOR']);

            const page = parseInt(ctx.query.page || '1', 10);
            const limit = parseInt(ctx.query.limit || '20', 10);

            const result = await accessService.getActiveUsers(ctx.params.locationId, ctx.user!, page, limit);
            return { success: true, ...result };
        }, {
            params: t.Object({
                locationId: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'ObjectId de la sede a consultar' }),
            }),
            query: t.Object({
                page: t.Optional(t.String({ description: 'Página a consultar (default: 1)' })),
                limit: t.Optional(t.String({ description: 'Resultados por página (default: 20)' }))
            }),
            detail: {
                tags: ['Access'],
                summary: 'Consultar personas actualmente dentro de una sede',
                description: `
Retorna la lista de personas que están físicamente dentro de la sede en este momento (registros con estado \`ACTIVE\`).

Un registro es \`ACTIVE\` desde que se llama \`POST /access/in\` hasta que se registra la salida con \`POST /access/out\`. Si el array está vacío, significa que la sede está desocupada.

**Acceso:** ADMIN o OPERATOR asignado a la sede.

**Respuesta por persona:**
- \`personId\` — datos de la persona (documento, nombre, email)
- \`checkIn\` — timestamp de ingreso
- \`priceAtCheckIn\` — tarifa por hora vigente al momento del ingreso
- \`operatorIn\` — email del operador que registró el ingreso

**Paginación:**
Se pueden usar los query parameters \`?page={n}&limit={m}\`. Por defecto, retorna hasta 20 registros por página.

**Condiciones de error:**
- \`401\` — Token ausente o inválido.
- \`403\` — El operador no está asignado a esta sede.
- \`422\` — \`locationId\` con formato inválido.
`.trim(),
                responses: {
                    200: { description: 'Array de registros activos paginados y metadata adicional. Puede ser vacío si no hay nadie en la sede.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'El operador no tiene permiso para ver esta sede.' },
                    422: { description: 'locationId no es un ObjectId válido.' },
                }
            }
        })
    );
