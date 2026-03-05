import { Elysia, t } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { rateLimit } from 'elysia-rate-limit';
import { authService } from './auth.service';
import { UnauthorizedException, RateLimitException } from '../../core/exceptions/domain.exception';
import { env } from '../../config/env';
import type { UserRole, AuditMetadataContext } from '../../types';


const DUMMY_HASH = '$2b$12$MVZcfk4Oe3CSn83LWn2RjuHxlpbgtCMOafWbZ.mlDvEevAjGv1ub6';

export const authController = (app: Elysia) =>
    app.group('/auth', (app) => app
        .use(rateLimit({
            max: 5,
            duration: 60000,
            errorResponse: new RateLimitException('Demasiados intentos de login. Espera 1 minuto.')
        }))
        .use(
            jwt({
                name: 'jwt',
                secret: env.JWT_SECRET,
                exp: env.SESSION_EXPIRATION,
            })
        )
        .post(
            '/login',
            async ({ body, jwt: jwtSigner, ...context }) => {
                const ctx = context as typeof context & AuditMetadataContext;
                const emailInput = String(body.email || '').trim().toLowerCase();
                const passwordInput = String(body.password || '').trim();

                ctx.auditPayload = { email: emailInput };

                const user = await authService.findByEmail(emailInput);


                const hashToVerify = user ? user.passwordHash : DUMMY_HASH;

                let isValid = false;
                try {
                    isValid = await Bun.password.verify(passwordInput, hashToVerify);
                } catch (error) {

                    throw error;
                }

                if (!user || !isValid) {
                    throw new UnauthorizedException('Credenciales inválidas');
                }

                if (user.status === 'INACTIVE') {
                    throw new UnauthorizedException('Su cuenta ha sido desactivada para revisión.');
                }

                const payloadObj = {
                    id: user._id.toString(),
                    email: user.email,
                    role: user.role,
                    locations: user.assignedLocations?.map((id) => id.toString()) || [],
                };


                const token = await jwtSigner.sign({
                    ...payloadObj,
                    iss: 'coworking-api',
                    aud: 'coworking-client',
                });

                return {
                    success: true,
                    data: {
                        user: {
                            id: payloadObj.id,
                            email: payloadObj.email,
                            role: payloadObj.role as UserRole,
                        },
                        token,
                    },
                };
            },
            {
                body: t.Object({
                    email: t.String({ format: 'email' }),
                    password: t.String({ minLength: 1, description: 'Contraseña del usuario' }),
                }),
                detail: {
                    tags: ['Auth'],
                    summary: 'Autenticar usuario y obtener JWT',
                    description: `
Autentica un usuario registrado (ADMIN u OPERATOR) y devuelve un JWT firmado con los datos de sesión.

**Flujo:**
1. Se busca el usuario por email (case-insensitive).
2. Se verifica la contraseña usando bcrypt.
3. Se verifica que el usuario no esté en estado INACTIVE.
4. Se firma un JWT con \`id\`, \`email\`, \`role\` y \`locations\` asignadas.

**Rate Limiting:** Máximo 5 intentos por minuto por IP. Superado el límite se recibe 429.

**Condiciones de error:**
- \`401\` — Email no encontrado, contraseña incorrecta, o cuenta desactivada (mensaje genérico para evitar enumeración de usuarios).
- \`422\` — Formato de email inválido o campos requeridos faltantes.
- \`429\` — Rate limit superado.

**Seguridad:** El evento de login (exitoso o fallido) queda registrado en el audit log con el email enmascarado.
`.trim(),
                    responses: {
                        200: { description: 'Login exitoso. Retorna el token JWT y datos básicos del usuario.' },
                        401: { description: 'Credenciales inválidas o cuenta desactivada.' },
                        422: { description: 'Cuerpo de la petición inválido (email malformado, campos vacíos).' },
                        429: { description: 'Demasiados intentos. Espera 1 minuto antes de reintentar.' },
                    }
                },
            }
        )
    );
