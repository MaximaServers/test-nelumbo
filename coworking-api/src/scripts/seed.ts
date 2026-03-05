import { connectMongoDB } from '../infrastructure/database/mongodb';
import { connectDragonfly } from '../infrastructure/cache/dragonfly';
import { LocationModel } from '../features/locations/location.entity';
import { UserModel } from '../features/auth/user.entity';
import { PersonModel } from '../features/people/person.entity';
import { AccessModel } from '../features/access/access.entity';
import { AuditLogModel } from '../core/middlewares/audit.entity';
import { CouponModel } from '../features/coupons/coupon.entity';
import { dragonfly } from '../infrastructure/cache/dragonfly';
import { Types } from 'mongoose';

const ID = {
    LOC_POBLADO: new Types.ObjectId('0000000000000000000000a1'),
    LOC_LAURELES: new Types.ObjectId('0000000000000000000000a2'),
    LOC_BELEN: new Types.ObjectId('0000000000000000000000a3'),
    LOC_ENVIGADO: new Types.ObjectId('0000000000000000000000a4'),
    LOC_SABANETA: new Types.ObjectId('0000000000000000000000a5'),
    OP_CARLOS: new Types.ObjectId('0000000000000000000000b1'),
    OP_ANA: new Types.ObjectId('0000000000000000000000b2'),
    OP_LUIS: new Types.ObjectId('0000000000000000000000b3'),
};

/**
 * Script de Seeding Industrial (Fuera del Runtime de la API)
 * Ejecutar con: bun run src/scripts/seed.ts
 */

// --- Helpers ---

/** Devuelve una fecha dentro del rango en horario laboral real (8am–8pm) */
const bizDate = (daysAgo: number, hourStart: number = 8, hourEnd: number = 20): Date => {
    const base = new Date();
    base.setDate(base.getDate() - daysAgo);
    // Normalizar a hora 0
    base.setHours(0, 0, 0, 0);
    const hour = hourStart + Math.random() * (hourEnd - hourStart);
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    base.setHours(h, m, 0, 0);
    return base;
};

/** Genera un checkOut coherente: entre 1h y 8h después del checkIn, sin pasar de las 21:00 */
const checkOutDate = (checkIn: Date, minHours = 1, maxHours = 8): Date => {
    const maxMs = Math.min(
        maxHours * 3600000,
        // Tope: las 21:00 del mismo día
        new Date(checkIn).setHours(21, 0, 0, 0) - checkIn.getTime()
    );
    const minMs = minHours * 3600000;
    const durationMs = minMs + Math.random() * Math.max(0, maxMs - minMs);
    return new Date(checkIn.getTime() + durationMs);
};

/** Calcula billingAmount igual que el servicio real */
const billing = (checkIn: Date, checkOut: Date, price: number): number => {
    const durationHours = Math.max(0.1, (checkOut.getTime() - checkIn.getTime()) / 3600000);
    return Math.round(durationHours * price * 100) / 100;
};

/** Formatea documento para audit (PII masking idéntico al middleware real) */
const maskDoc = (doc: string): string =>
    doc.slice(0, 3) + '****' + doc.slice(-3);

// --- Datos realistas ---

// Identidades 100% sintéticas:
// - Documentos con prefijo TEST- → imposible de confundir con una cédula real.
// - Emails en dominio @test.invalid (RFC 2606) → no ruteables por spec, nunca llegan a nadie real.
const SEED_PEOPLE: Array<{ document: string; name: string; email: string }> = [
    { document: 'TEST-0101234567', name: 'Sebastián Restrepo', email: 'sebastian.restrepo@test.invalid' },
    { document: 'TEST-0202218765', name: 'Valentina Ospina', email: 'valentina.ospina@test.invalid' },
    { document: 'TEST-0303765432', name: 'Andrés Torres', email: 'andres.torres@test.invalid' },
    { document: 'TEST-0404512348', name: 'Juliana Ríos', email: 'juliana.rios@test.invalid' },
    { document: 'TEST-0505234765', name: 'Carlos Muñoz', email: 'carlos.munoz@test.invalid' },
    { document: 'TEST-0606123456', name: 'María Vargas', email: 'maria.vargas@test.invalid' },
    { document: 'TEST-0707198765', name: 'Jhonatan Ruiz', email: 'jhonatan.ruiz@test.invalid' },
    { document: 'TEST-0808436789', name: 'Daniela Cano', email: 'daniela.cano@test.invalid' },
    { document: 'TEST-0909318904', name: 'Felipe Arias', email: 'felipe.arias@test.invalid' },
    { document: 'TEST-1010987123', name: 'Natalia Bermúdez', email: 'natalia.bermudez@test.invalid' },
    { document: 'TEST-1111698741', name: 'Miguel Soto', email: 'miguel.soto@test.invalid' },
    { document: 'TEST-1212765490', name: 'Luisa Patiño', email: 'luisa.patino@test.invalid' },
    { document: 'TEST-1313123876', name: 'Esteban Cardona', email: 'esteban.cardona@test.invalid' },
    { document: 'TEST-1414321098', name: 'Paola Montoya', email: 'paola.montoya@test.invalid' },
    { document: 'TEST-1515012348', name: 'Nicolás Roldán', email: 'nicolas.roldan@test.invalid' },
    { document: 'TEST-1616678901', name: 'Sara Vásquez', email: 'sara.vasquez@test.invalid' },
    { document: 'TEST-1717234890', name: 'Camilo Jaramillo', email: 'camilo.jaramillo@test.invalid' },
    { document: 'TEST-1818012345', name: 'Ximena Arroyave', email: 'ximena.arroyave@test.invalid' },
    { document: 'TEST-1919456789', name: 'David Hurtado', email: 'david.hurtado@test.invalid' },
    { document: 'TEST-2020890123', name: 'Laura Londoño', email: 'laura.londono@test.invalid' },
    { document: 'TEST-2121012345', name: 'Jorge Acosta', email: 'jorge.acosta@test.invalid' },
    { document: 'TEST-2222345678', name: 'Isabela Castaño', email: 'isabela.castano@test.invalid' },
    { document: 'TEST-2323789012', name: 'Alejandro Mora', email: 'alejandro.mora@test.invalid' },
    { document: 'TEST-2424124567', name: 'Manuela Duque', email: 'manuela.duque@test.invalid' },
    { document: 'TEST-2525321098', name: 'Juan Arbeláez', email: 'juan.arbelaez@test.invalid' },
    { document: 'TEST-2626890234', name: 'Viviana Escobar', email: 'viviana.escobar@test.invalid' },
    { document: 'TEST-2727034567', name: 'Santiago Pardo', email: 'santiago.pardo@test.invalid' },
    { document: 'TEST-2828123456', name: 'Tatiana Agudelo', email: 'tatiana.agudelo@test.invalid' },
    { document: 'TEST-2929456018', name: 'Ricardo León', email: 'ricardo.leon@test.invalid' },
    { document: 'TEST-3030789034', name: 'Andrea Quintero', email: 'andrea.quintero@test.invalid' },
    { document: 'TEST-3131890236', name: 'Harold Gutiérrez', email: 'harold.gutierrez@test.invalid' },
    { document: 'TEST-3232567019', name: 'Alejandra Posada', email: 'alejandra.posada@test.invalid' },
    { document: 'TEST-3333012345', name: 'Mauricio Flórez', email: 'mauricio.florez@test.invalid' },
    { document: 'TEST-3434678304', name: 'Diana Álvarez', email: 'diana.alvarez@test.invalid' },
    { document: 'TEST-3535890123', name: 'Germán Cárdenas', email: 'german.cardenas@test.invalid' },
    { document: 'TEST-3636345901', name: 'Marcela Uribe', email: 'marcela.uribe@test.invalid' },
    { document: 'TEST-3737012789', name: 'Juan Pino', email: 'juan.pino@test.invalid' },
    { document: 'TEST-3838904321', name: 'Claudia Naranjo', email: 'claudia.naranjo@test.invalid' },
    { document: 'TEST-3939237890', name: 'Wilmer Zuluaga', email: 'wilmer.zuluaga@test.invalid' },
    { document: 'TEST-4040509678', name: 'Catalina Ortiz', email: 'catalina.ortiz@test.invalid' },
    { document: 'TEST-4141823401', name: 'Tomás Echeverri', email: 'tomas.echeverri@test.invalid' },
    { document: 'TEST-4242134568', name: 'Melissa Cano', email: 'melissa.cano@test.invalid' },
    { document: 'TEST-4343561023', name: 'Henry Farfán', email: 'henry.farfan@test.invalid' },
    { document: 'TEST-4444891237', name: 'Pilar Velásquez', email: 'pilar.velasquez@test.invalid' },
    { document: 'TEST-4545023489', name: 'Samuel Estrada', email: 'samuel.estrada@test.invalid' },
    { document: 'TEST-4646567890', name: 'Angélica Ossa', email: 'angelica.ossa@test.invalid' },
    { document: 'TEST-4747012368', name: 'Rodrigo Cano', email: 'rodrigo.cano@test.invalid' },
    { document: 'TEST-4848234501', name: 'Natalia Alzate', email: 'natalia.alzate@test.invalid' },
    { document: 'TEST-4949560781', name: 'Pablo Mesa', email: 'pablo.mesa@test.invalid' },
    { document: 'TEST-5050789043', name: 'Carolina Suárez', email: 'carolina.suarez@test.invalid' },
];

const industrialSeed = async () => {
    console.log('\n' + '⚠️'.repeat(25));
    console.log('☢️  ADVERTENCIA DE SEGURIDAD  ☢️');
    console.log('Este script ELIMINARÁ TODOS LOS DATOS de MongoDB y DragonflyDB.');
    console.log('Úsese SOLO en entornos LOCALES o DESECHABLES.');
    console.log('NO EJECUTAR EN PRODUCCIÓN.');
    console.log('⚠️'.repeat(25) + '\n');

    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const answer = await new Promise(resolve => {
        readline.question('¿Estás SEGURO de que deseas continuar? Los datos se perderán permanentemente. [y/N]: ', (input: string) => {
            resolve(input.toLowerCase());
        });
    });
    readline.close();

    if (answer !== 'y' && answer !== 'yes') {
        console.log('\n❌ Operación cancelada por el usuario. Abortando...\n');
        process.exit(0);
    }

    console.log('🚀 Iniciando Seeding Industrial (Zero-Contamination)...');

    await connectMongoDB();
    await connectDragonfly();

    // 1. Limpieza Total
    console.log('🧹 Limpiando base de datos...');
    await Promise.all([
        LocationModel.deleteMany({}),
        UserModel.deleteMany({}),
        PersonModel.deleteMany({}),
        AccessModel.deleteMany({}),
        AuditLogModel.deleteMany({}),
        CouponModel.deleteMany({}),
        dragonfly.flushall()
    ]);

    // 2. Admin
    console.log('👤 Sembrando Admin...');
    const adminHash = await Bun.password.hash('admin', { algorithm: 'bcrypt', cost: 12 });
    await UserModel.create({ email: 'admin@mail.com', passwordHash: adminHash, role: 'ADMIN' });
    await AuditLogModel.create({
        timestamp: bizDate(62, 9, 10),
        operatorEmail: 'SYSTEM',
        action: 'USER_CREATE',
        method: 'POST',
        path: '/internal/seed',
        payload: { email: 'admin@mail.com', role: 'ADMIN' },
        status: 201,
        ip: '127.0.0.1',
        duration: 88
    });
    console.log('✅ Admin creado: admin@mail.com / admin');

    // 3. Sedes (barrios reales de Medellín)
    console.log('🏢 Sembrando Sedes...');
    const locations = await LocationModel.insertMany([
        { _id: ID.LOC_POBLADO, name: 'HQ El Poblado', address: 'Calle 10 #43D-30, El Poblado', maxCapacity: 50, pricePerHour: 15.0 },
        { _id: ID.LOC_LAURELES, name: 'Laureles Premium', address: 'Circular 4 #72-31, Laureles', maxCapacity: 30, pricePerHour: 12.0 },
        { _id: ID.LOC_BELEN, name: 'Belén Studio', address: 'Carrera 76 #32B-15, Belén', maxCapacity: 20, pricePerHour: 8.0 },
        { _id: ID.LOC_ENVIGADO, name: 'Envigado Hub', address: 'Calle 38 Sur #42-25, Envigado', maxCapacity: 25, pricePerHour: 10.0 },
        { _id: ID.LOC_SABANETA, name: 'Sabaneta Works', address: 'Calle 75 Sur #48A-10, Sabaneta', maxCapacity: 40, pricePerHour: 11.0 },
    ]);

    const locByName = Object.fromEntries(locations.map(l => [l.name, l]));

    for (const loc of locations) {
        await AuditLogModel.create({
            timestamp: bizDate(61, 9, 11),
            operatorEmail: 'admin@mail.com',
            action: 'LOCATION_CREATE',
            method: 'POST',
            path: '/locations',
            payload: { name: loc.name, maxCapacity: loc.maxCapacity, pricePerHour: loc.pricePerHour },
            status: 201,
            ip: '127.0.0.1',
            duration: 145
        });
    }

    // 4. Operadores con asignaciones reales y no superpuestas
    console.log('👷 Sembrando Operadores...');
    const passHash = await Bun.password.hash('operator123', { algorithm: 'bcrypt', cost: 12 });

    // Mapa estricto: sede → operador a cargo
    const operators = await UserModel.insertMany([
        {
            _id: ID.OP_CARLOS,
            email: 'carlos.villa@coworking.co',
            passwordHash: passHash,
            role: 'OPERATOR',
            status: 'ACTIVE',
            assignedLocations: [locByName['HQ El Poblado']._id, locByName['Laureles Premium']._id]
        },
        {
            _id: ID.OP_ANA,
            email: 'ana.gomez@coworking.co',
            passwordHash: passHash,
            role: 'OPERATOR',
            status: 'ACTIVE',
            assignedLocations: [locByName['Belén Studio']._id, locByName['Envigado Hub']._id]
        },
        {
            _id: ID.OP_LUIS,
            email: 'luis.martinez@coworking.co',
            passwordHash: passHash,
            role: 'OPERATOR',
            status: 'ACTIVE',
            assignedLocations: [locByName['Sabaneta Works']._id]
        },
    ]);

    // Mapa determinista: locationId (string) → operator email
    // Usa toString() para evitar el bug de ObjectId por referencia
    const locationOperatorMap = new Map<string, string>([
        [locByName['HQ El Poblado']._id.toString(), 'carlos.villa@coworking.co'],
        [locByName['Laureles Premium']._id.toString(), 'carlos.villa@coworking.co'],
        [locByName['Belén Studio']._id.toString(), 'ana.gomez@coworking.co'],
        [locByName['Envigado Hub']._id.toString(), 'ana.gomez@coworking.co'],
        [locByName['Sabaneta Works']._id.toString(), 'luis.martinez@coworking.co'],
    ]);

    for (const op of operators) {
        await AuditLogModel.create({
            timestamp: bizDate(60, 9, 10),
            operatorEmail: 'admin@mail.com',
            action: 'USER_CREATE',
            method: 'POST',
            path: '/users/operators',
            payload: { email: op.email, role: op.role, assignedLocations: op.assignedLocations.length },
            status: 200,
            ip: '127.0.0.1',
            duration: 112
        });
    }

    // 5. Personas (nombres, documentos y emails colombianos reales)
    console.log('👥 Sembrando Personas...');
    // Inicializamos con horas base para algunos para probar tramos
    const people = await PersonModel.insertMany(SEED_PEOPLE.map((p, i) => ({
        ...p,
        accumulatedHours: i === 0 ? 0 : Math.floor(Math.random() * 10),
        locationStats: new Map()
    })));

    // 6. Accesos históricos — 550 registros, lógicamente coherentes
    console.log('📊 Sembrando Accesos Históricos...');
    const accesses = [];
    const auditLogs = [];

    // Distribuimos los días para cubrir los últimos 60 días
    for (let i = 0; i < 550; i++) {
        const person = people[i % people.length]; // round-robin para garantizar distribución
        const location = locations[i % locations.length]; // distribuye equitativamente
        const locationStr = location._id.toString();
        const operatorEmail = locationOperatorMap.get(locationStr)!; // siempre definido

        const daysAgo = Math.floor(Math.random() * 59) + 1; // 1–59 días atrás
        const checkIn = bizDate(daysAgo, 8, 19); // horario 8am-7pm para que el checkOut quede antes de las 9pm
        const checkOut = checkOutDate(checkIn, 1, 8);

        accesses.push({
            personId: person._id,
            locationId: location._id,
            checkIn,
            checkOut,
            priceAtCheckIn: location.pricePerHour,        // precio correcto siempre
            billingAmount: billing(checkIn, checkOut, location.pricePerHour),
            operatorIn: operatorEmail,
            operatorOut: operatorEmail,
            status: 'COMPLETED'
        });

        const maskedDoc = maskDoc(person.document);

        auditLogs.push({
            timestamp: checkIn,
            operatorEmail,
            action: 'CHECK_IN',
            method: 'POST',
            path: '/access/in',
            payload: { document: maskedDoc, locationId: location._id },
            status: 200,
            ip: '192.168.1.' + (Math.floor(Math.random() * 50) + 1),
            duration: Math.floor(Math.random() * 150) + 40
        });

        auditLogs.push({
            timestamp: checkOut,
            operatorEmail,
            action: 'CHECK_OUT',
            method: 'POST',
            path: '/access/out',
            payload: { document: maskedDoc, locationId: location._id, billingAmount: billing(checkIn, checkOut, location.pricePerHour) },
            status: 200,
            ip: '192.168.1.' + (Math.floor(Math.random() * 50) + 1),
            duration: Math.floor(Math.random() * 150) + 40
        });
    }

    await AccessModel.insertMany(accesses);
    await AuditLogModel.insertMany(auditLogs);

    // 7. Escenario de Fidelidad: person[0] (Sebastián) acumula >20h en HQ El Poblado
    // priceAtCheckIn = 15 (precio real de HQ El Poblado)
    console.log('🎁 Forzando escenario de Fidelidad para Sebastián Restrepo...');

    const loyalPerson = people[0]; // Sebastián Restrepo, doc 71234567
    const loyalLocation = locByName['HQ El Poblado'];  // precio 15
    const loyalOperator = locationOperatorMap.get(loyalLocation._id.toString())!;

    const loyalty1In = bizDate(5, 9, 10);
    const loyalty1Out = new Date(loyalty1In.getTime() + 9 * 3600000);   // 9h

    const loyalty2In = bizDate(3, 10, 11);
    const loyalty2Out = new Date(loyalty2In.getTime() + 9 * 3600000);   // 9h → acumulado 18h

    const loyalty3In = bizDate(1, 8, 9);
    const loyalty3Out = new Date(loyalty3In.getTime() + 4 * 3600000);   // 4h → total 22h (>20h ✓)

    const fidelityRecords = [
        {
            personId: loyalPerson._id,
            locationId: loyalLocation._id,
            checkIn: loyalty1In,
            checkOut: loyalty1Out,
            priceAtCheckIn: loyalLocation.pricePerHour,       // 15
            billingAmount: billing(loyalty1In, loyalty1Out, loyalLocation.pricePerHour),
            operatorIn: loyalOperator,
            operatorOut: loyalOperator,
            status: 'COMPLETED'
        },
        {
            personId: loyalPerson._id,
            locationId: loyalLocation._id,
            checkIn: loyalty2In,
            checkOut: loyalty2Out,
            priceAtCheckIn: loyalLocation.pricePerHour,
            billingAmount: billing(loyalty2In, loyalty2Out, loyalLocation.pricePerHour),
            operatorIn: loyalOperator,
            operatorOut: loyalOperator,
            status: 'COMPLETED'
        },
        {
            personId: loyalPerson._id,
            locationId: loyalLocation._id,
            checkIn: loyalty3In,
            checkOut: loyalty3Out,
            priceAtCheckIn: loyalLocation.pricePerHour,
            billingAmount: billing(loyalty3In, loyalty3Out, loyalLocation.pricePerHour),
            operatorIn: loyalOperator,
            operatorOut: loyalOperator,
            status: 'COMPLETED'
        },
    ];

    await AccessModel.insertMany(fidelityRecords);

    // Crear el cupón de fidelidad real (lo que el sistema generaría automáticamente)
    const couponIssuedAt = loyalty3Out;
    const couponExpiresAt = new Date(couponIssuedAt.getTime() + 10 * 24 * 3600000); // 10 días
    // Código fijo para el escenario de prueba — predecible y documentado
    const loyaltyCouponCode = 'LOYALTY-TEST01-SEED01';
    await CouponModel.create({
        personDocument: loyalPerson.document,
        locationId: loyalLocation._id,
        code: loyaltyCouponCode,
        loyaltyBucket: 1, // Primer tramo de 20h
        issuedAt: couponIssuedAt,
        expiresAt: couponExpiresAt,
        status: 'VALID'
    });

    // Audit logs de fidelidad
    for (const f of fidelityRecords) {
        const maskedDoc = maskDoc(loyalPerson.document);
        await AuditLogModel.create({
            timestamp: f.checkIn,
            operatorEmail: loyalOperator,
            action: 'CHECK_IN',
            method: 'POST',
            path: '/access/in',
            payload: { document: maskedDoc, locationId: loyalLocation._id },
            status: 200,
            ip: '192.168.1.10',
            duration: 95
        });
        await AuditLogModel.create({
            timestamp: f.checkOut,
            operatorEmail: loyalOperator,
            action: 'CHECK_OUT',
            method: 'POST',
            path: '/access/out',
            payload: { document: maskedDoc, locationId: loyalLocation._id, billingAmount: f.billingAmount },
            status: 200,
            ip: '192.168.1.10',
            duration: 102
        });
    }

    await AuditLogModel.create({
        timestamp: couponIssuedAt,
        operatorEmail: 'SYSTEM',
        action: 'COUPON_ISSUED',
        method: 'POST',
        path: '/internal/loyalty',
        payload: { document: maskDoc(loyalPerson.document), locationId: loyalLocation._id, code: loyaltyCouponCode },
        status: 201,
        ip: '127.0.0.1',
        duration: 80
    });

    // 8. Login logs (simulando acceso normal de los operadores)
    console.log('🔐 Sembrando Login logs...');
    for (const op of operators) {
        for (let d = 0; d < 30; d += 3) {
            const loginTime = bizDate(d, 8, 9);
            await AuditLogModel.create({
                timestamp: loginTime,
                operatorEmail: op.email,
                action: 'LOGIN',
                method: 'POST',
                path: '/auth/login',
                payload: { email: op.email },
                status: 200,
                ip: '192.168.1.' + (Math.floor(Math.random() * 50) + 1),
                duration: Math.floor(Math.random() * 300) + 100
            });
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log('🏁 SEEDING COMPLETADO EXITOSAMENTE');
    console.log('='.repeat(50));
    console.log('\n👑 ADMIN:');
    console.log('   admin@mail.com  /  admin');
    console.log('\n👷 OPERADORES (pass: operator123):');
    console.log('   carlos.villa@coworking.co   → HQ El Poblado, Laureles Premium');
    console.log('   ana.gomez@coworking.co      → Belén Studio, Envigado Hub');
    console.log('   luis.martinez@coworking.co  → Sabaneta Works');
    console.log('\n👥 PERSONAS: 50 personas sintéticas (docs: TEST-XXXX, emails: @test.invalid — RFC 2606)');
    console.log('\n🎁 FIDELIDAD: Sebastián Restrepo (TEST-0101234567) tiene cupón VALID en HQ El Poblado');
    console.log('   Código: LOYALTY-TEST01-SEED01');
    console.log('='.repeat(50) + '\n');

    process.exit(0);
};

industrialSeed().catch(err => {
    console.error('❌ Error en el seeding:', err);
    process.exit(1);
});
