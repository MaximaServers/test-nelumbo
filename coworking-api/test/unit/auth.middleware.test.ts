import { describe, test, expect } from 'vitest';
import { checkRequiredRole } from '../../src/core/middlewares/auth.middleware';
import { UnauthorizedException, ForbiddenException } from '../../src/core/exceptions/domain.exception';
import type { UserPayload } from '../../src/types';

const adminUser: UserPayload = {
    id: '507f1f77bcf86cd799439011',
    email: 'admin@coworking.com',
    role: 'ADMIN',
};

const operatorUser: UserPayload = {
    id: '507f1f77bcf86cd799439022',
    email: 'op@coworking.com',
    role: 'OPERATOR',
    locations: ['507f1f77bcf86cd799439033'],
};

describe('checkRequiredRole', () => {
    describe('usuario nulo o no autenticado', () => {
        test('null lanza UnauthorizedException', () => {
            expect(() => checkRequiredRole(null, ['ADMIN'])).toThrow(UnauthorizedException);
        });

        test('undefined lanza UnauthorizedException', () => {
            expect(() => checkRequiredRole(undefined, ['ADMIN'])).toThrow(UnauthorizedException);
        });

        test('mensaje de error incluye indicación de login', () => {
            try {
                checkRequiredRole(null, ['OPERATOR']);
                expect(true).toBe(false); // no debería llegar aquí
            } catch (e) {
                expect(e).toBeInstanceOf(UnauthorizedException);
                expect((e as UnauthorizedException).status).toBe(401);
            }
        });
    });

    describe('rol insuficiente', () => {
        test('OPERATOR contra roles=[ADMIN] lanza ForbiddenException', () => {
            expect(() => checkRequiredRole(operatorUser, ['ADMIN'])).toThrow(ForbiddenException);
        });

        test('ADMIN contra roles=[OPERATOR] lanza ForbiddenException', () => {
            expect(() => checkRequiredRole(adminUser, ['OPERATOR'])).toThrow(ForbiddenException);
        });

        test('ForbiddenException tiene status 403', () => {
            try {
                checkRequiredRole(operatorUser, ['ADMIN']);
                expect(true).toBe(false);
            } catch (e) {
                expect(e).toBeInstanceOf(ForbiddenException);
                expect((e as ForbiddenException).status).toBe(403);
            }
        });

        test('mensaje de error incluye los roles requeridos', () => {
            try {
                checkRequiredRole(operatorUser, ['ADMIN']);
                expect(true).toBe(false);
            } catch (e) {
                expect((e as ForbiddenException).detail).toContain('ADMIN');
            }
        });
    });

    describe('rol correcto — no lanza', () => {
        test('ADMIN contra roles=[ADMIN] no lanza', () => {
            expect(() => checkRequiredRole(adminUser, ['ADMIN'])).not.toThrow();
        });

        test('OPERATOR contra roles=[OPERATOR] no lanza', () => {
            expect(() => checkRequiredRole(operatorUser, ['OPERATOR'])).not.toThrow();
        });

        test('ADMIN contra roles=[ADMIN, OPERATOR] no lanza', () => {
            expect(() => checkRequiredRole(adminUser, ['ADMIN', 'OPERATOR'])).not.toThrow();
        });

        test('OPERATOR contra roles=[ADMIN, OPERATOR] no lanza', () => {
            expect(() => checkRequiredRole(operatorUser, ['ADMIN', 'OPERATOR'])).not.toThrow();
        });
    });
});
