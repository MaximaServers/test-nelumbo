import mongoose from 'mongoose';
import { env } from '../../config/env';


export const connectMongoDB = async () => {
    try {
        const connection = await mongoose.connect(env.MONGO_URI, {
            autoIndex: true,
        });
        console.log('MongoDB conectado correctamente');
        return connection;
    } catch (error) {
        console.error('Error conectando a MongoDB:', error);
        process.exit(1);
    }
};

mongoose.connection.on('error', (err) => {
    console.error('Error en la conexión de MongoDB:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB se desconectó. Intentando volver...');
});
