import { describe, test, expect, beforeEach, vi } from 'vitest';
import { analyticsService } from '../../src/features/analytics/analytics.service';
import { AccessModel } from '../../src/features/access/access.entity';
import { Types } from 'mongoose';

const locationId = '507f1f77bcf86cd799439011';

beforeEach(() => {
    (AccessModel.aggregate as any).mockReset();
});

describe('analyticsService.getTopPeople', () => {
    test('llama aggregate y retorna resultado', async () => {
        const expected = [{ document: 'DOC1', name: 'Ana', totalEntries: 15, totalHours: 30 }];
        (AccessModel.aggregate as any).mockResolvedValue(expected);

        const result = await analyticsService.getTopPeople();

        expect(AccessModel.aggregate).toHaveBeenCalledTimes(1);
        expect(result).toEqual(expected);
    });

    test('pipeline incluye $group con totalEntries y totalHours', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getTopPeople();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const groupStage = pipeline.find((s: object) => '$group' in s) as { $group: { totalEntries: object } } | undefined;
        expect(groupStage).toBeDefined();
        expect(groupStage!.$group.totalEntries).toBeDefined();
    });

    test('pipeline incluye $limit: 10', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getTopPeople();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const limitStage = pipeline.find((s: object) => '$limit' in s) as { $limit: number } | undefined;
        expect(limitStage?.$limit).toBe(10);
    });

    test('pipeline incluye $lookup a people', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getTopPeople();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const lookupStage = pipeline.find((s: object) => '$lookup' in s) as
            | { $lookup: { from: string } }
            | undefined;
        expect(lookupStage?.$lookup.from).toBe('people');
    });

    test('retorna array vacío cuando aggregate retorna []', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);
        const result = await analyticsService.getTopPeople();
        expect(result).toEqual([]);
    });
});

describe('analyticsService.getTopPeopleByLocation', () => {
    test('llama aggregate con $match por locationId como ObjectId', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getTopPeopleByLocation(locationId);

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as
            | { $match: { locationId: Types.ObjectId } }
            | undefined;
        expect(matchStage).toBeDefined();
        expect(matchStage!.$match.locationId).toBeInstanceOf(Types.ObjectId);
        expect(matchStage!.$match.locationId.toString()).toBe(locationId);
    });

    test('pipeline incluye $limit: 10', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getTopPeopleByLocation(locationId);

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const limitStage = pipeline.find((s: object) => '$limit' in s) as { $limit: number } | undefined;
        expect(limitStage?.$limit).toBe(10);
    });

    test('retorna resultado del aggregate', async () => {
        const expected = [{ document: 'DOC2', name: 'Carlos', totalEntries: 8 }];
        (AccessModel.aggregate as any).mockResolvedValue(expected);

        const result = await analyticsService.getTopPeopleByLocation(locationId);
        expect(result).toEqual(expected);
    });
});

describe('analyticsService.getFirstTimeEntries', () => {
    test('llama aggregate y retorna resultado', async () => {
        const expected = [{ document: 'DOC3', name: 'María', entryCount: 1 }];
        (AccessModel.aggregate as any).mockResolvedValue(expected);

        const result = await analyticsService.getFirstTimeEntries();
        expect(result).toEqual(expected);
    });

    test('pipeline filtra entryCount === 1', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getFirstTimeEntries();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        // Hay dos etapas $match: la primera del $group (entryCount 1) y el initial match
        const matchStages = pipeline.filter((s: object) => '$match' in s) as { $match: object }[];
        const entryCountMatch = matchStages.find(
            (s) => 'entryCount' in s.$match
        ) as { $match: { entryCount: number } } | undefined;
        expect(entryCountMatch?.$match.entryCount).toBe(1);
    });
});

describe('analyticsService.getFinancialMetrics', () => {
    test('retorna desglose hoy/semana/mes/año cuando hay datos', async () => {
        const data = { _id: null, today: 100, week: 400, month: 1500, year: 18000 };
        (AccessModel.aggregate as any).mockResolvedValue([data]);

        const result = await analyticsService.getFinancialMetrics({ operatorEmail: 'op@coworking.com' });
        expect(result).toEqual({ today: 100, week: 400, month: 1500, year: 18000 });
    });

    test('retorna todos ceros cuando aggregate devuelve array vacío (sin ventas)', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        const result = await analyticsService.getFinancialMetrics({ operatorEmail: 'op@coworking.com' });
        expect(result).toEqual({ today: 0, week: 0, month: 0, year: 0 });
    });

    test('llama aggregate con email del operador como filtro', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getFinancialMetrics({ operatorEmail: 'specific@op.com' });

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as
            | { $match: { operatorOut: string; status: string } }
            | undefined;
        expect(matchStage?.$match.operatorOut).toBe('specific@op.com');
        expect(matchStage?.$match.status).toBe('COMPLETED');
    });

    test('llama aggregate con locationIds como filtro', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        const locs = ['507f1f77bcf86cd799439011'];
        await analyticsService.getFinancialMetrics({ locationIds: locs });

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as
            | { $match: { status: string; locationId: object } }
            | undefined;
        expect(matchStage?.$match.locationId).toBeDefined();
    });
});


describe('analyticsService.getTopOperatorsWeekly', () => {
    test('llama aggregate y retorna resultados (conteo de personas)', async () => {
        const expected = [
            { operatorEmail: 'op1@c.com', totalEntries: 50 },
            { operatorEmail: 'op2@c.com', totalEntries: 30 },
        ];
        (AccessModel.aggregate as any).mockResolvedValue(expected);

        const result = await analyticsService.getTopOperatorsWeekly();
        expect(result).toEqual(expected);
    });

    test('pipeline filtra por checkIn >= startOfWeek', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getTopOperatorsWeekly();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as
            | { $match: { checkIn: object } }
            | undefined;
        expect(matchStage?.$match.checkIn).toBeDefined();
    });

    test('pipeline agrupa por operatorIn y cuenta', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);
        await analyticsService.getTopOperatorsWeekly();
        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const groupStage = pipeline.find((s: object) => '$group' in s) as any;
        expect(groupStage.$group._id).toBe('$operatorIn');
        expect(groupStage.$group.totalEntries).toBeDefined();
    });
});

describe('analyticsService.getTopLocationsWeekly', () => {
    test('llama aggregate y retorna resultados con revenue', async () => {
        const expected = [{ locationName: 'Sede Norte', totalRevenue: 2000.55 }];
        (AccessModel.aggregate as any).mockResolvedValue(expected);

        const result = await analyticsService.getTopLocationsWeekly();
        expect(result).toEqual(expected);
    });

    test('pipeline incluye $lookup a locations', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);
        await analyticsService.getTopLocationsWeekly();
        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const lookupStage = pipeline.find((s: object) => '$lookup' in s) as any;
        expect(lookupStage?.$lookup.from).toBe('locations');
    });
});


describe('analyticsService.getLocationStats', () => {
    test('sin locationId → match solo por status COMPLETED (global)', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getLocationStats();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as
            | { $match: { status: string; locationId?: unknown } }
            | undefined;
        expect(matchStage?.$match.status).toBe('COMPLETED');
        expect(matchStage?.$match.locationId).toBeUndefined();
    });

    test('con locationId → match incluye locationId como ObjectId', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getLocationStats(locationId);

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as
            | { $match: { status: string; locationId?: Types.ObjectId } }
            | undefined;
        expect(matchStage?.$match.locationId).toBeInstanceOf(Types.ObjectId);
        expect(matchStage?.$match.locationId?.toString()).toBe(locationId);
    });

    test('retorna los stats del aggregate', async () => {
        const expected = [{ locationName: 'Sede Sur', totalRevenue: 5000, totalEntries: 120, averageDurationHours: 2.5 }];
        (AccessModel.aggregate as any).mockResolvedValue(expected);

        const result = await analyticsService.getLocationStats(locationId);
        expect(result).toEqual(expected);
    });

    test('pipeline incluye $lookup a locations', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);

        await analyticsService.getLocationStats();

        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const lookupStage = pipeline.find((s: object) => '$lookup' in s) as
            | { $lookup: { from: string } }
            | undefined;
        expect(lookupStage?.$lookup.from).toBe('locations');
    });
});

describe('analyticsService.calculateDateRange', () => {
    test('usa valores por defecto si no hay params', () => {
        const range = analyticsService.calculateDateRange();
        expect(range.start).toBeDefined();
        expect(range.end).toBeDefined();
        // Diferencia debe ser ~30 días
        const diff = range.end.getTime() - range.start.getTime();
        expect(diff).toBeGreaterThan(29 * 24 * 60 * 60 * 1000);
    });
});

describe('analyticsService.getFinancialMetrics', () => {
    test('maneja options vacías', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);
        await analyticsService.getFinancialMetrics();
        expect(AccessModel.aggregate).toHaveBeenCalled();
    });

    test('filtra por operatorEmail y locationIds', async () => {
        (AccessModel.aggregate as any).mockResolvedValue([]);
        await analyticsService.getFinancialMetrics({
            operatorEmail: 'op@test.com',
            locationIds: ['507f1f77bcf86cd799439011']
        });
        const pipeline = (AccessModel.aggregate as any).mock.calls[0][0] as object[];
        const matchStage = pipeline.find((s: object) => '$match' in s) as any;
        expect(matchStage.$match.operatorOut).toBe('op@test.com');
        expect(matchStage.$match.locationId).toBeDefined();
    });
});

