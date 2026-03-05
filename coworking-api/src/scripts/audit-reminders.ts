import { dragonfly } from '../infrastructure/cache/dragonfly';
import { AccessModel } from '../features/access/access.entity';
import { PersonModel } from '../features/people/person.entity';
import { connectMongoDB } from '../infrastructure/database/mongodb';
import { connectDragonfly } from '../infrastructure/cache/dragonfly';
import { stayReminderService } from '../features/reminders/stay-reminder.service';

/**
 * 🛰️ REMINDER AUDIT TOOL & TIME MACHINE (SSS+ TIER)
 * Certifica el estado de la cola y permite auditoría forense mediante manipulación temporal,
 * manteniendo un flujo SSS+ 100% truthness para el StayReminder.
 */
async function audit() {
    await connectMongoDB();
    await connectDragonfly();

    const args = process.argv.slice(2);
    const command = args[0];
    const targetAccessId = args[1];

    if (command === '--time-travel') {
        if (!targetAccessId) {
            console.error('❌ Error: Debes pasar el Access ID. Uso: bun run src/scripts/audit-reminders.ts --time-travel <ID>');
            process.exit(1);
        }

        console.log(`\n⏳ [TIME_MACHINE] Iniciando desplazamiento temporal para Access ID: ${targetAccessId}`);
        const access = await AccessModel.findById(targetAccessId);
        if (!access || access.status !== 'ACTIVE') {
            console.error('❌ Acceso no encontrado o ya no está en estado ACTIVE.');
            process.exit(1);
        }

        // 1. Alteramos la FUENTE DE LA VERDAD (MongoDB). 
        // Lo mandamos al minuto 49 del ciclo de 1 hora. Así el T10 saltará "naturalmente" en el próximo minuto.
        const fakePastTime = new Date(Date.now() - (49 * 60 * 1000));
        access.checkIn = fakePastTime;
        await access.save();
        console.log(`✅ [MongoDB] Check-In forjado a 'hace 49 minutos': ${fakePastTime.toLocaleString()}`);

        // 2. Destruimos los registros alterados o en espera de la cola Redis para aislar.
        const queue = await dragonfly.zrange('reminders:queue', 0, -1);
        for (const member of queue) {
            if (member.startsWith(targetAccessId)) {
                await dragonfly.zrem('reminders:queue', member);
            }
        }
        console.log(`✅ [DragonflyDB] Anclajes temporales anteriores purgados.`);

        // 3. Forzamos la Resiliencia Industrial para que el sistema reprograme con Verdad Total.
        console.log(`🔄 [Auto-Curación] Activando el motor matemático SSS+ para reconstruir los hashes...`);
        await stayReminderService.reSyncReminders();

        console.log(`\n🚀 ¡VIAJE EN EL TIEMPO EJECUTADO CON 100% TRUTHNESS!`);
        console.log(`=> El sistema ahora asume estructuralmente que este cliente lleva 49 minutos en la sede.`);
        console.log(`=> En menos de 60 segundos, el Cron Job detectará el minuto 50, validará con Mongo y enviará el correo de "Faltan 10m".`);
        console.log(`=> El recordatorio de "Faltan 5m" ocurrirá 5 minutos después fluyendo orgánicamente sin hacks ni manipulación.`);

        process.exit(0);
    }

    console.log('\n--- 🔍 AUDITORÍA DE RECORDATORIOS (Estado Actual) ---');
    console.log('💡 TIP: Para adelantar el tiempo orgánicamente de un ID, usa:');
    console.log('bun src/scripts/audit-reminders.ts --time-travel <ACCESS_ID>\n');

    const queue = await dragonfly.zrange('reminders:queue', 0, -1, 'WITHSCORES');
    if (queue.length === 0) {
        console.log('✅ La cola está vacía (Todo procesado o nada programado).');
    } else {
        console.log(`📋 Tareas en cola: ${queue.length / 2}\n`);

        for (let i = 0; i < queue.length; i += 2) {
            const member = queue[i];
            const score = parseInt(queue[i + 1]);
            const [accessId, type, cycle] = member.split(':');
            const targetTime = new Date(score);

            const access = await AccessModel.findById(accessId);
            const person = access ? await PersonModel.findById(access.personId) : null;

            const status = targetTime.getTime() < Date.now() ? '🚨 VENCIDO (Procesando o reintentando...)' : '⏳ PROGRAMADO';

            console.log(`[${status}]`);
            console.log(`   └─ Usuario: ${person?.name || 'Desconocido'} (${person?.email})`);
            console.log(`   └─ Access ID: ${accessId}`);
            console.log(`   └─ Tipo/Ciclo: ${type} (Hora ${cycle})`);
            console.log(`   └─ Disparo: ${targetTime.toLocaleString()} (En ${Math.round((score - Date.now()) / 1000 / 60)} min)`);
            console.log('   -------------------------------------------------');
        }
    }

    process.exit(0);
}

audit();
