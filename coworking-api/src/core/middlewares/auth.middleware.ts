import { Elysia } from 'elysia';
import { jwt } from '@elysiajs/jwt';
import { env } from '../../config/env';
import { dragonfly } from '../../infrastructure/cache/dragonfly';
import { UnauthorizedException, ForbiddenException } from '../exceptions/domain.exception';
import type { UserPayload } from '../../types';


export const checkRequiredRole = (user: UserPayload | null | undefined, roles: ('ADMIN' | 'OPERATOR')[]) => {
    if (!user) throw new UnauthorizedException('Tienes que iniciar sesión');
    if (roles.length > 0 && !roles.includes(user.role)) {
        throw new ForbiddenException(`No tienes el rol necesario: ${roles.join(' o ')}`);
    }
};


export const auth = new Elysia()
    .error({
        UNAUTHORIZED: UnauthorizedException,
        FORBIDDEN: ForbiddenException
    })
    .use(jwt({
        name: 'jwt',
        secret: env.JWT_SECRET,
        exp: env.SESSION_EXPIRATION,
    }))
    .derive({ as: 'global' }, async ({ jwt, headers }) => {
        const authHeader = (headers['authorization'] || headers['Authorization']) as string | undefined;

        if (!authHeader?.startsWith('Bearer ')) {
            return { user: null as UserPayload | null, token: null };
        }

        const token = authHeader.slice(7);
        const payload = await jwt.verify(token);

        if (!payload || payload.iss !== 'coworking-api' || payload.aud !== 'coworking-client') {
            throw new UnauthorizedException('Token de contexto inválido');
        }

        const isRevoked = await dragonfly.get(`auth:denylist:${token}`);
        if (isRevoked) throw new UnauthorizedException('La sesión ya no es válida');

        const userId = String(payload.id);
        const isUserRevoked = await dragonfly.get(`auth:revoked:${userId}`);
        if (isUserRevoked) {
            throw new UnauthorizedException('Su acceso ha sido revocado permanentemente');
        }


        const user: UserPayload = {
            id: userId,
            email: String(payload.email),
            role: payload.role as 'ADMIN' | 'OPERATOR',
            locations: Array.isArray(payload.locations) ? (payload.locations as string[]) : undefined
        };

        return {
            user,
            token,
        };
    });
