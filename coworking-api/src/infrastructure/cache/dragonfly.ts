import Redis from 'ioredis';
import { env } from '../../config/env';


export const dragonfly = new Redis({
    host: env.DRAGONFLY_HOST,
    port: env.DRAGONFLY_PORT,
    password: env.DRAGONFLY_PASSWORD,
    maxRetriesPerRequest: null,
    lazyConnect: true,
});

export const connectDragonfly = async () => {
    try {
        await dragonfly.connect();
        console.log('DragonflyDB conectado correctamente');
    } catch (error) {
        console.error('Error conectando a DragonflyDB:', error);
        process.exit(1);
    }
};

dragonfly.on('error', (err) => {
    if (dragonfly.status === 'connecting') {
        return;
    }
    console.error('Error en DragonflyDB:', err.message);
});
