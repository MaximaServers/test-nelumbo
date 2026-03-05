import { describe, test, expect } from 'vitest';
import {
    DomainException,
    UnauthorizedException,
    ForbiddenException,
    NotFoundException,
    ConflictException,
    RateLimitException,
    ValidationException,
} from '../../src/core/exceptions/domain.exception';

describe('DomainException', () => {
    test('construye con todos los campos explícitos', () => {
        const ex = new DomainException('Título', 400, 'Detalle', 'https://api/errors/custom');
        expect(ex).toBeInstanceOf(Error);
        expect(ex).toBeInstanceOf(DomainException);
        expect(ex.title).toBe('Título');
        expect(ex.status).toBe(400);
        expect(ex.detail).toBe('Detalle');
        expect(ex.type).toBe('https://api/errors/custom');
        expect(ex.message).toBe('Detalle');
        expect(ex.name).toBe('DomainException');
    });

    test('usa type por defecto cuando no se especifica', () => {
        const ex = new DomainException('T', 500, 'D');
        expect(ex.type).toBe('https://coworking.api/errors/general');
    });
});

describe('UnauthorizedException', () => {
    test('tiene status 401 y type correcto', () => {
        const ex = new UnauthorizedException();
        expect(ex.status).toBe(401);
        expect(ex.title).toBe('Todavía no sabemos quién eres');
        expect(ex.type).toBe('https://coworking.api/errors/unauthorized');
        expect(ex.detail).toBe('Inicia sesión para poder continuar.');
        expect(ex).toBeInstanceOf(DomainException);
    });

    test('acepta mensaje personalizado', () => {
        const ex = new UnauthorizedException('Token expirado');
        expect(ex.detail).toBe('Token expirado');
        expect(ex.message).toBe('Token expirado');
    });
});

describe('ForbiddenException', () => {
    test('tiene status 403 y type correcto', () => {
        const ex = new ForbiddenException();
        expect(ex.status).toBe(403);
        expect(ex.title).toBe('No tienes permiso para entrar aquí');
        expect(ex.type).toBe('https://coworking.api/errors/forbidden');
        expect(ex.detail).toBe('No tienes los permisos para realizar esta acción.');
        expect(ex).toBeInstanceOf(DomainException);
    });

    test('acepta mensaje personalizado', () => {
        const ex = new ForbiddenException('No tenés acceso a esta sede');
        expect(ex.detail).toBe('No tenés acceso a esta sede');
    });
});

describe('NotFoundException', () => {
    test('tiene status 404 y type correcto', () => {
        const ex = new NotFoundException();
        expect(ex.status).toBe(404);
        expect(ex.title).toBe('No encontramos ese recurso');
        expect(ex.type).toBe('https://coworking.api/errors/not-found');
        expect(ex.detail).toBe('No pudimos encontrar lo que buscabas.');
        expect(ex).toBeInstanceOf(DomainException);
    });

    test('acepta mensaje personalizado', () => {
        const ex = new NotFoundException('Sede no encontrada');
        expect(ex.detail).toBe('Sede no encontrada');
    });
});

describe('ConflictException', () => {
    test('tiene status 409 y type correcto', () => {
        const ex = new ConflictException('Ya existe un ingreso activo');
        expect(ex.status).toBe(409);
        expect(ex.title).toBe('Hay un problema con tu solicitud');
        expect(ex.type).toBe('https://coworking.api/errors/conflict');
        expect(ex.detail).toBe('Ya existe un ingreso activo');
        expect(ex).toBeInstanceOf(DomainException);
    });

    // ConflictException requiere mensaje (sin default) — edge case: string vacío
    test('acepta string vacío como detail', () => {
        const ex = new ConflictException('');
        expect(ex.detail).toBe('');
        expect(ex.status).toBe(409);
    });
});

describe('RateLimitException', () => {
    test('tiene status 429 y type y mensaje por defecto', () => {
        const ex = new RateLimitException();
        expect(ex.status).toBe(429);
        expect(ex.title).toBe('Estás pidiendo demasiado rápido');
        expect(ex.type).toBe('https://coworking.api/errors/rate-limit');
        expect(ex.detail).toContain('Estás haciendo demasiadas peticiones');
        expect(ex).toBeInstanceOf(DomainException);
    });

    test('acepta mensaje personalizado de rate limit', () => {
        const ex = new RateLimitException('50 req/min máximo');
        expect(ex.detail).toBe('50 req/min máximo');
    });
});

describe('ValidationException', () => {
    test('tiene status 422 y type correcto', () => {
        const ex = new ValidationException('Campo email inválido');
        expect(ex.status).toBe(422);
        expect(ex.title).toBe('Hay campos con errores');
        expect(ex.type).toBe('https://coworking.api/errors/validation');
        expect(ex.detail).toBe('Campo email inválido');
        expect(ex).toBeInstanceOf(DomainException);
    });
});

describe('DomainException — herencia y stack trace', () => {
    test('tiene stack trace como cualquier Error nativo', () => {
        const ex = new NotFoundException('test');
        // Bun incluye el constructor base (DomainException) en el stack porque
        // NotFoundException delega en super() — el stack muestra la clase que ejecuta.
        expect(ex.stack).toBeDefined();
        expect(ex.stack!.length).toBeGreaterThan(0);
        // El detail del error debe estar presente
        expect(ex.detail).toBe('test');
    });

    test('instanceof Error es true en toda la jerarquía', () => {
        expect(new UnauthorizedException()).toBeInstanceOf(Error);
        expect(new ForbiddenException()).toBeInstanceOf(Error);
        expect(new NotFoundException()).toBeInstanceOf(Error);
        expect(new ConflictException('x')).toBeInstanceOf(Error);
        expect(new RateLimitException()).toBeInstanceOf(Error);
        expect(new ValidationException('x')).toBeInstanceOf(Error);
    });
});
