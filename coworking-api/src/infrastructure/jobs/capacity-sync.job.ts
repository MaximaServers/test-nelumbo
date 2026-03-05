import { AccessModel } from '../../features/access/access.entity';
import { LocationModel } from '../../features/locations/location.entity';
import { dragonfly } from '../cache/dragonfly';

/**
 * Job de Conciliación de Aforo (Anti-DSI)
 * 
 * Este job resuelve el problema de "Distributed State Inconsistency" donde Redis
 * puede quedar desincronizado de la base de datos real (MongoDB) tras un crash.
 * 
 * Es una técnica de "Self-Healing" o auto-curación del sistema.
 */
export const syncCapacities = async () => {
    try {
        const locations = await LocationModel.find({}, '_id').lean();

        for (const loc of locations) {
            const activeCount = await AccessModel.countDocuments({
                locationId: loc._id,
                status: 'ACTIVE'
            });

            // Forzamos que Redis coincida con la verdad absoluta (MongoDB)
            await dragonfly.set(`access:capacity:${loc._id.toString()}`, activeCount);
        }

        console.debug(`[Job] Capacity Sync: Sincronizadas ${locations.length} sedes.`);
    } catch (error) {
        console.error('[Job] Capacity Sync Error:', error);
    }
};

/**
 * Inicia el intervalo de sincronización.
 * @param intervalMs Tiempo entre ejecuciones (default 5 minutos)
 */
export const startCapacitySyncJob = (intervalMs: number = 300000) => {
    setInterval(syncCapacities, intervalMs);
    // Ejecución inmediata al arranque para limpiar basura de sesiones muertas
    syncCapacities();
};
