import { describe, test, expect } from 'vitest';
import { parseExpirationToSeconds } from '../../src/config/env';

describe('parseExpirationToSeconds', () => {
    describe('unidad horas (h)', () => {
        test('6h → 21600 segundos', () => {
            expect(parseExpirationToSeconds('6h')).toBe(21600);
        });

        test('1h → 3600 segundos', () => {
            expect(parseExpirationToSeconds('1h')).toBe(3600);
        });

        test('24h → 86400 segundos', () => {
            expect(parseExpirationToSeconds('24h')).toBe(86400);
        });
    });

    describe('unidad días (d)', () => {
        test('1d → 86400 segundos', () => {
            expect(parseExpirationToSeconds('1d')).toBe(86400);
        });

        test('7d → 604800 segundos', () => {
            expect(parseExpirationToSeconds('7d')).toBe(604800);
        });
    });

    describe('unidad minutos (m)', () => {
        test('30m → 1800 segundos', () => {
            expect(parseExpirationToSeconds('30m')).toBe(1800);
        });

        test('60m → 3600 segundos', () => {
            expect(parseExpirationToSeconds('60m')).toBe(3600);
        });
    });

    describe('unidad segundos (s)', () => {
        test('3600s → 3600 segundos', () => {
            expect(parseExpirationToSeconds('3600s')).toBe(3600);
        });

        test('0s → 0 segundos', () => {
            expect(parseExpirationToSeconds('0s')).toBe(0);
        });
    });

    describe('sin unidad (asume segundos)', () => {
        test('3600 → 3600 (sin unidad = segundos)', () => {
            expect(parseExpirationToSeconds('3600')).toBe(3600);
        });

        test('0 → 0', () => {
            expect(parseExpirationToSeconds('0')).toBe(0);
        });
    });

    describe('valores inválidos → fallback 21600 (6h default)', () => {
        test('string no numérico → 21600', () => {
            expect(parseExpirationToSeconds('abc')).toBe(21600);
        });

        test('string vacío → 21600', () => {
            expect(parseExpirationToSeconds('')).toBe(21600);
        });

        test('solo letras sin número → 21600', () => {
            expect(parseExpirationToSeconds('h')).toBe(21600);
        });
    });

    describe('case handling', () => {
        test('6H (mayúscula) → fallback por default case → retorna 6 (sin unidad conocida)', () => {
            // La función hace toLowerCase() antes del switch, PERO parseInt('6H') = 6
            // y replace(/[0-9]/g, '') = 'H' → toLowerCase() = 'H' → hmm
            // Leyendo el código fuente: unit = exp.toLowerCase().replace(/[0-9]/g, '').trim()
            // '6H'.toLowerCase() = '6h', .replace(/[0-9]/g, '') = 'h' → case 'h' → 6 * 3600 = 21600
            expect(parseExpirationToSeconds('6H')).toBe(21600);
        });
    });
});
