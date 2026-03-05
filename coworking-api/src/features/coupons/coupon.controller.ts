import { Elysia, t } from 'elysia';
import { rateLimit } from 'elysia-rate-limit';
import { couponService } from './coupon.service';
import { RateLimitException } from '../../core/exceptions/domain.exception';
import { checkRequiredRole } from '../../core/middlewares/auth.middleware';
import type { UserPayload, AuditMetadataContext } from '../../types';

export const couponController = (app: Elysia) =>
    app.group('/coupons', (app) => app


        .use(rateLimit({
            max: 30,
            duration: 60000,
            errorResponse: new RateLimitException('Demasiadas peticiones al sistema de cupones. Espera 1 minuto.')
        }))

        .get('/', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null };
            checkRequiredRole(ctx.user!, ['ADMIN', 'OPERATOR']);

            const { status, locationId, personDocument } = ctx.query;
            const page = Number(ctx.query.page);
            const limit = Math.min(Number(ctx.query.limit), 100);

            const result = await couponService.listCoupons(ctx.user!, { status, locationId, personDocument, page, limit });

            return { success: true, ...result };
        }, {
            query: t.Object({
                status: t.Optional(t.Enum({ VALID: 'VALID', USED: 'USED', EXPIRED: 'EXPIRED' })),
                locationId: t.Optional(t.String({ pattern: '^[0-9a-fA-F]{24}$' })),
                personDocument: t.Optional(t.String({ minLength: 5, description: 'Filtrar cupones por documento de la persona' })),
                page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
                limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 50 }))
            }),
            detail: {
                tags: ['Coupons'],
                summary: 'Listado de cupones (Paginado)',
                description: `
Permite consultar el historial de cupones emitidos con paginación industrial y aislamiento multitenant.

**Filtros:**
- \`status\`, \`locationId\`, \`personDocument\`.

**Paginación:**
- \`page\`: Página (default 1).
- \`limit\`: Máximo registros (default 50).

**Aislamiento de Seguridad:**
- **ADMIN**: Acceso global.
- **OPERADOR**: restringido a sus sedes asignadas.
`.trim(),
                responses: {
                    200: { description: 'Lista de cupones obtenida exitosamente.' },
                    401: { description: 'No autenticado.' },
                    403: { description: 'El operador intentó acceder a datos de una sede no autorizada.' }
                }
            }
        })


        .patch('/:code/redeem', async (context) => {
            const ctx = context as typeof context & { user: UserPayload | null } & AuditMetadataContext;
            checkRequiredRole(ctx.user!, ['ADMIN', 'OPERATOR']);

            const { code } = ctx.params;
            const { locationId } = ctx.body;

            ctx.auditAction = 'COUPON_REDEEM';
            ctx.auditPayload = { code, locationId };

            couponService.checkRedeemPermission(ctx.user!, locationId);

            const updated = await couponService.redeemCoupon(code, locationId);

            console.info(`[BusinessEvent] COUPON_REDEEM: Código ${code} usado en sede ${locationId} por ${ctx.user!.email}`);

            return {
                success: true,
                message: 'Cupón redimido exitosamente',
                data: updated
            };
        }, {
            params: t.Object({
                code: t.String({ minLength: 1, description: 'Código único del cupón a redimir' })
            }),
            body: t.Object({
                locationId: t.String({ pattern: '^[0-9a-fA-F]{24}$', description: 'Sede donde se redime' })
            }),
            detail: {
                tags: ['Coupons'],
                summary: 'Redimir un cupón de fidelidad (PATCH)',
                description: `
Marca un cupón como utilizado (\`USED\`). Cambia el estado del recurso de forma permanente.

**Validaciones Críticas:**
- La sede (\`locationId\`) debe ser la misma para la que se emitió el cupón.
- El usuario ejecutor debe tener permiso sobre dicha sede.
- El cupón debe estar en estado \`VALID\` y no haber superado su fecha de expiración (\`expiresAt\`).


**Auditoría:** Se registra el evento \`COUPON_REDEEM\` con el payload del código y sede.
`.trim(),
                responses: {
                    200: { description: 'Cupón redimido correctamente.' },
                    404: { description: 'Cupón no encontrado.' },
                    409: { description: 'Cupón ya usado o expirado.' }
                }
            }
        })
    );
