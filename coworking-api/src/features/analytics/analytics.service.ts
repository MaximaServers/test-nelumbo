import { AccessModel } from '../access/access.entity';
import { Types } from 'mongoose';

export const analyticsService = {

    async getTopPeople(startDateStr?: string, endDateStr?: string) {
        const { start, end } = this.calculateDateRange(startDateStr, endDateStr);

        return AccessModel.aggregate([
            { $match: { checkIn: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: '$personId',
                    totalEntries: { $count: {} },
                    totalHours: {
                        $sum: {
                            $divide: [
                                { $subtract: [{ $ifNull: ['$checkOut', new Date()] }, '$checkIn'] },
                                1000 * 60 * 60
                            ]
                        }
                    }
                }
            },
            { $sort: { totalEntries: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'people',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'personInfo'
                }
            },
            { $unwind: '$personInfo' },
            {

                $project: {
                    document: {
                        $concat: [
                            { $substr: ["$personInfo.document", 0, 3] },
                            "****",
                            { $substr: ["$personInfo.document", { $subtract: [{ $strLenCP: "$personInfo.document" }, 3] }, 3] }
                        ]
                    },
                    name: '$personInfo.name',
                    totalEntries: 1,
                    totalHours: { $round: ['$totalHours', 2] }
                }
            }
        ]);
    },


    async getTopPeopleByLocation(locationId: string, startDateStr?: string, endDateStr?: string) {
        const { start, end } = this.calculateDateRange(startDateStr, endDateStr);
        return AccessModel.aggregate([
            { $match: { locationId: new Types.ObjectId(locationId), checkIn: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: '$personId',
                    totalEntries: { $count: {} },
                }
            },
            { $sort: { totalEntries: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'people',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'personInfo'
                }
            },
            { $unwind: '$personInfo' },
            {
                $project: {
                    document: {
                        $concat: [
                            { $substr: ["$personInfo.document", 0, 3] },
                            "****",
                            { $substr: ["$personInfo.document", { $subtract: [{ $strLenCP: "$personInfo.document" }, 3] }, 3] }
                        ]
                    },
                    name: '$personInfo.name',
                    totalEntries: 1
                }
            }
        ]);
    },


    async getFirstTimeEntries(startDateStr?: string, endDateStr?: string) {
        const { start, end } = this.calculateDateRange(startDateStr, endDateStr);
        return AccessModel.aggregate([
            { $match: { checkIn: { $gte: start, $lte: end } } },
            {
                $group: {
                    _id: '$personId',
                    entryCount: { $count: {} },
                    firstEntry: { $min: '$checkIn' }
                }
            },
            { $match: { entryCount: 1 } },
            { $sort: { firstEntry: -1 } },
            {
                $lookup: {
                    from: 'people',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'personInfo'
                }
            },
            { $unwind: '$personInfo' },
            {
                $project: {
                    document: {
                        $concat: [
                            { $substr: ["$personInfo.document", 0, 3] },
                            "****",
                            { $substr: ["$personInfo.document", { $subtract: [{ $strLenCP: "$personInfo.document" }, 3] }, 3] }
                        ]
                    },
                    name: '$personInfo.name',
                    entryCount: 1,
                    firstEntry: 1
                }
            }
        ]);
    },


    async getFinancialMetrics(options: { operatorEmail?: string; locationIds?: string[] } = {}) {
        const { today, startOfWeek, startOfMonth, startOfYear } = this.getStandardPeriods();

        const matchCond: any = { status: 'COMPLETED' };

        if (options.operatorEmail) {
            matchCond.operatorOut = options.operatorEmail;
        }

        if (options.locationIds && options.locationIds.length > 0) {
            matchCond.locationId = { $in: options.locationIds.map(id => new Types.ObjectId(id)) };
        }

        const aggr = await AccessModel.aggregate([
            { $match: matchCond },
            {
                $group: {
                    _id: null,
                    today: {
                        $sum: { $cond: [{ $gte: ['$checkOut', today] }, '$billingAmount', 0] }
                    },
                    week: {
                        $sum: { $cond: [{ $gte: ['$checkOut', startOfWeek] }, '$billingAmount', 0] }
                    },
                    month: {
                        $sum: { $cond: [{ $gte: ['$checkOut', startOfMonth] }, '$billingAmount', 0] }
                    },
                    year: {
                        $sum: { $cond: [{ $gte: ['$checkOut', startOfYear] }, '$billingAmount', 0] }
                    }
                }
            }
        ]);

        const result = aggr[0] || { today: 0, week: 0, month: 0, year: 0 };

        return {
            today: Number(result.today.toFixed(2)),
            week: Number(result.week.toFixed(2)),
            month: Number(result.month.toFixed(2)),
            year: Number(result.year.toFixed(2))
        };
    },



    async getTopOperatorsWeekly() {
        const { startOfWeek } = this.getStandardPeriods();

        return AccessModel.aggregate([
            {
                $match: {
                    checkIn: { $gte: startOfWeek }
                }
            },
            {
                $group: {
                    _id: '$operatorIn',
                    totalEntries: { $count: {} }
                }
            },
            { $sort: { totalEntries: -1 } },
            { $limit: 3 },
            {
                $project: {
                    operatorEmail: '$_id',
                    totalEntries: 1,
                    _id: 0
                }
            }
        ]);
    },


    async getTopLocationsWeekly() {
        const { startOfWeek } = this.getStandardPeriods();

        return AccessModel.aggregate([
            {
                $match: {
                    status: 'COMPLETED',
                    checkOut: { $gte: startOfWeek }
                }
            },
            {
                $group: {
                    _id: '$locationId',
                    totalRevenue: { $sum: '$billingAmount' }
                }
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 3 },
            {
                $lookup: {
                    from: 'locations',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'locationInfo'
                }
            },
            { $unwind: '$locationInfo' },
            {
                $project: {
                    locationName: '$locationInfo.name',
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    _id: 0
                }
            }
        ]);
    },



    async getLocationStats(locationId?: string, startDateStr?: string, endDateStr?: string) {
        const { start, end } = this.calculateDateRange(startDateStr, endDateStr);

        const match: Record<string, any> = {
            status: 'COMPLETED',
            checkOut: { $gte: start, $lte: end }
        };

        if (locationId) {
            match.locationId = new Types.ObjectId(locationId);
        }

        const stats = await AccessModel.aggregate([
            { $match: match },
            {
                $group: {
                    _id: '$locationId',
                    totalRevenue: { $sum: '$billingAmount' },
                    averageDurationHours: {
                        $avg: {
                            $divide: [
                                { $subtract: ['$checkOut', '$checkIn'] },
                                1000 * 60 * 60
                            ]
                        }
                    },
                    totalEntries: { $count: {} }
                }
            },
            {
                $lookup: {
                    from: 'locations',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'locationInfo'
                }
            },
            { $unwind: '$locationInfo' },
            {
                $project: {
                    locationName: '$locationInfo.name',
                    totalRevenue: { $round: ['$totalRevenue', 2] },
                    averageDurationHours: { $round: ['$averageDurationHours', 2] },
                    totalEntries: 1
                }
            }
        ]);

        return stats;
    },


    calculateDateRange(start?: string, end?: string) {
        const endDate = end ? new Date(end) : new Date();
        const startDate = start ? new Date(start) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

        return { start: startDate, end: endDate };
    },

    getStandardPeriods() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const day = today.getDay();
        const diff = (day + 6) % 7;
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - diff);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        return { today, startOfWeek, startOfMonth, startOfYear };
    }
};

