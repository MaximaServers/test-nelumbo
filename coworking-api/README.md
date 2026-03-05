# Coworking Management API

API de alto rendimiento para la gestión de acceso, fidelidad y analítica en sedes de coworking. Diseñada con un enfoque de pureza arquitectónica, seguridad estricta y control de concurrencia atómico.

Desarrollada bajo estándares estrictos de auditoría de arquitectura y TypeScript.

## 🛠 Stack Tecnológico

- **Runtime:** [Bun](https://bun.sh/) (Ecosistema de alto rendimiento compatible con TypeScript nativo).
- **Framework:** [Elysia.js](https://elysiajs.com/) (Framework web optimizado para Bun con tipado estricto vía TypeBox).
- **Base de Datos:** [MongoDB](https://www.mongodb.com/) (Persistencia de documentos mediante Mongoose).
- **Cache & Concurrencia:** [DragonflyDB](https://dragonflydb.io/) (Reemplazo ultra-rápido de Redis para locks atómicos y sesiones).
- **Validación:** [TypeBox](https://github.com/sinclairzx81/typebox) (Esquemas con validación en runtime y tipado estático inferido).
- **Seguridad:** JWT (HS256) con Kill-Switch instantáneo basado en Redis.
- **Testing:** [Vitest](https://vitest.dev/) con simulación de infraestructura y cobertura de código.

## 🛡️ Principios de Arquitectura

- **Zero Testmaking:** No hay lógica en producción que dependa de variables de testing.
- **Contract Enforcement:** Todas las entradas son validadas por esquemas estrictos antes de ser procesadas (TypeBox).
- **Industrial Audit:** Cada acción mutativa es auditada con enmascaramiento automático de PII y trazabilidad total del operador.
- **Segregación de Identidad (StaffGuard):** Separación absoluta entre el personal operativo (ADMIN/OPERATOR) y los clientes. El personal tiene prohibido participar en el sistema de fidelidad o registrarse como cliente, garantizando KPIs limpios y previniendo fugas financieras.
- **Atomic Concurrency (Triple-Lock):** El estado del sistema (aforo y cupones) es gobernado por locks atómicos de infraestructura, eliminando condiciones de carrera y garantizando consistencia total entre memoria (Redis) y persistencia (Mongo).

## 🚀 Despliegue y Ejecución

La API está completamente Dockerizada y configurada para un arranque determinista.

### Requisitos
- Bun (>= 1.0)
- Docker y Docker Compose instalados.
- (Opcional) CLI de Mongo o Compass

### Opción A: Despliegue con Docker (Recomendado)
1. **Levantar el ecosistema:**
> Los comandos de docker deben ejecutarse sobre el directorio root del repositorio
   ```bash
   docker-compose up -d --build
   ```
   *Esto levantará:*
   - `coworking-api` (Port 3000)
   - `coworking-mongo` (Port 27017)
   - `coworking-dragonfly` (Port 6379)
   - `coworking-notification` (Microservicio interno)

3. **Acceder a la documentación (Swagger/Scalar):**
   Una vez arriba, visita: [SWAGGER LOCAL](http://localhost:3000/swagger)

### Opción B: Ejecución Local (Desarrollo)
1. **Definir `.env`**:
   ```env
   PORT=3000
   NODE_ENV=development
   MONGO_URI=mongodb://admin:password123@localhost:27017/coworking?authSource=admin
   DRAGONFLY_HOST=localhost
   DRAGONFLY_PORT=6379
   DRAGONFLY_PASSWORD=secure_dragonfly_audit_pwd_2026
   JWT_SECRET=super_secret_audit_safe_key_32_chars_min
   SESSION_EXPIRATION=6h
   NOTIFICATION_SECRET=audit_notification_secret_2026_xyz
   NOTIFICATION_SERVICE_URL=http://localhost:3001/email
   ```
2. **Instalar dependencias e iniciar:**
   ```bash
   bun install
   bun run dev
   ```

## 🚀 Postman Collection

Para facilitar las pruebas manuales y la integración, se incluye una colección completa:

* **Ubicación:** [`docs/coworking-api.postman_collection.json`](docs/coworking-api.postman_collection.json)
* **Instrucciones:**
    1. Importar el JSON en Postman.
    2. Configurar la variable `baseUrl` en un Environment (por defecto [IR A LOCALHOST EN PUERTO 3000](http://localhost:3000)).
    3. Autenticarse con `POST /auth/login` (Admin: `admin@mail.com` / `admin`).
    4. Copiar el JWT resultante en la variable `token` del environment.

## 🧪 Testing y Calidad

El proyecto exige un estándar de cobertura superior al 95% sin el uso de directivas de exclusión (`istanbul ignore`).

### Cómo correr los tests
```bash
bun vitest run           # Ejecutar suite completa
bun vitest run --coverage # Reporte de cobertura (target >90%+)
```

## 🏗️ Seeding Industrial (Zero-Contamination)

> **PRECAUCIÓN / ACCIÓN DESTRUCTIVA**: Ejecutar este script ELIMINARÁ todos los datos existentes en la base de datos de MongoDB y DragonflyDB. Úsese únicamente en entornos LOCALES o de PRUEBAS cuya base de datos sea completamente desechable. **NO EJECUTAR EN PRODUCCIÓN.**

Para entornos de desarrollo y pruebas de integración, el sistema cuenta con un script de seeding industrial diseñado para crear un estado consistente, realista y auditable.

* **Script:** [src/scripts/seed.ts](src/scripts/seed.ts)
* **Ejecución:** `bun run src/scripts/seed.ts`

### ¿Qué hace este script?
1. **Limpieza Total (Purge)**: Ejecuta un `flushall` en DragonflyDB y vacía todas las colecciones de MongoDB (`Locations`, `Users`, `People`, `Access`, `AuditLogs`, `Coupons`).
2. **Identidades Sintéticas (PII Safe)**: Crea 50 personas con nombres reales colombianos pero documentos con prefijo `TEST-*` y correos con dominio `*.test.invalid` (RFC 2606), garantizando que nunca se interactúe con usuarios reales.
3. **Escenario Histórico Masivo**: Genera **550+ registros de acceso** distribuidos en los últimos 60 días, con horarios laborales coherentes (8am-8pm) y cálculos de cobro reales.
4. **Trazabilidad Total**: Realiza el seeding generando también los `AuditLogs` correspondientes (Login, Check-in, Check-out), simulando la actividad manual de los operadores.
5. **Escenario de Fidelidad**: Fuerza un caso de éxito donde el usuario *Sebastián Restrepo* ya acumuló >20h y tiene un cupón `VALID` listo para ser redimido en la sede HQ El Poblado.

### Credenciales Generadas
| Tipo | Email | Password | Asignación / Alcance |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@mail.com` | `admin` | Acceso Global |
| **OPERADOR** | `carlos.villa@coworking.co` | `operator123` | HQ El Poblado, Laureles Premium |

## Herramientas de Auditoría y Pruebas

### Auditoría Forense
El sistema cuenta con un script de auditoría exhaustiva que prueba todos los vectores de ataque, concurrencia y reglas de negocio.
* **Script:** `src/scripts/audit_forensic.sh`
* **Ejecución:** `./src/scripts/audit_forensic.sh`
Este script levanta peticiones reales contra la API y la base de datos para garantizar que no existan regresiones en la seguridad o en la lógica de fidelidad.

### Máquina del Tiempo (Time Machine)
Para auditar el sistema de recordatorios y cobros sin tener que esperar horas en tiempo real, se diseñó una herramienta de desplazamiento temporal.
* **Script:** `src/scripts/audit-reminders.ts`
* **Uso:** `bun run src/scripts/audit-reminders.ts --time-travel <ACCESS_ID_FROM_MONGODB_COLLECTION>`
**¿Por qué usarlo?** Al ejecutar este comando, el sistema altera orgánicamente la fuente de verdad (MongoDB) retrocediendo la hora de entrada del usuario indicado y fuerza a la memoria caché a recalcular matemáticamente los eventos. Esto permite probar el flujo completo de recordatorios exactamente como ocurriría en producción, manteniendo un 100% de precisión en los datos sin recurrir a simulaciones engañosas o saltos de código.

## Sistema de Notificaciones y Reglas de Facturación

El proyecto cuenta con un microservicio de notificaciones integrado y completamente funcional. No es un simulador; utiliza `Nodemailer` conectado a un servidor SMTP real de Gmail para despachar correos electrónicos a los clientes reales.

### Recordatorios de Sobrecosto
Para proteger al cliente de cobros sorpresa, el microservicio envía correos automáticos durante la estancia del usuario:
1. **Aviso de 10 minutos:** Se envía a los 50 minutos de estancia, avisando que pronto se cumplirá la hora.
2. **Aviso de 5 minutos:** Un último recordatorio a los 55 minutos para que el usuario pueda decidir si hacer check-out o continuar.

### Lógica de Facturación vs Fidelidad
El sistema maneja dos conceptos de tiempo distintos para ser justo tanto con el negocio como con el cliente:
* **Facturación Comercial:** Los primeros 5 minutos de cualquier hora se cobran como una fracción (0.1 horas) para dar margen de maniobra. Sin embargo, pasado el minuto 5, el sistema factura la hora completa, independientemente de si el cliente se queda 10 o 59 minutos más.
* **Fidelidad (Lealtad):** A diferencia de la facturación, el sistema de cupones y beneficios calcula el tiempo de estancia basándose estrictamente en el tiempo real transcurrido (reloj puro). La lógica comercial de redondeo de horas no contamina la métrica de fidelidad, garantizando siempre la máxima precisión y transparencia para el usuario.

## 🛡️ Roles y Permisos (RBAC)

El sistema implementa un RBAC (Role-Based Access Control) estricto para evitar accesos no autorizados.

| Módulo | Endpoint / Acción | ADMINISTRADOR | OPERADOR |
| :--- | :--- | :---: | :---: |
| **AUTENTICACIÓN** | `POST /auth/login` | ✅ | ✅ |
| **ACCESO** | `POST /access/in` (Registrar Ingreso) | ✅ | ✅* |
| **ACCESO** | `POST /access/out` (Registrar Salida) | ✅ | ✅* |
| **ACCESO** | `GET /access/active/:locationId` | ✅ | ✅* |
| **CUPONES** | `POST /coupons/redeem` (Redimir) | ✅ | ✅ |
| **SEDES** | CRUD completo de `/locations` | ✅ | ❌ |
| **USUARIOS** | Gestionar `/users/operators` (Crear/Borrar) | ✅ | ❌ |
| **ANÁLISIS** | Métricas Globales / Estratégicas | ✅ | ❌ |
| **ANÁLISIS** | Métricas de Sede y Personas | ✅ | ✅ |
| **ANÁLISIS** | Recaudo Propio (Operador) | ✅ | ✅ |

*\*Los OPERADORES solo pueden realizar acciones en las sedes que tienen asignadas.*

## 📈 Análisis y Diseño Técnico

### Modelo Entidad - Relación (ER)

![Diagrama ER - Coworking API](./docs/mer.png)

**Notas de cardinalidad:**
- `User` M-N `Location` — relación embebida via `assignedLocations[]` en User (sin tabla pivot).
- `Coupon` tiene índice único compuesto `(personDocument, locationId)` — 1 cupón por persona por sede (histórico estricto).
- `AuditLog` referencia al usuario con string (soft ref) para preservar el historial al eliminar usuarios.

### Diccionario de Datos (MongoDB Schemas)

#### 1. Colección: `users` (Gestión de Identidades y RBAC)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `email` | `String` | `required, unique, lowercase` | Identificador único del usuario. |
| `passwordHash` | `String` | `required` | Hash `bcrypt` (cost 12). Nunca se expone en la API. |
| `role` | `String` | `enum: ["ADMIN", "OPERATOR"]` | Define el alcance de permisos (RBAC). |
| `assignedLocations`| `[ObjectId]` | `ref: "Location"` | Sedes que el Operador tiene autorizado gestionar. |
| `status` | `String` | `enum: ["ACTIVE", "INACTIVE"]`| Estado del usuario. `INACTIVE` dispara el Kill-Switch. |

#### 2. Colección: `locations` (Inventario de Coworkings)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `name` | `String` | `required, unique` | Nombre identificador de la sede. |
| `address` | `String` | `required` | Dirección física. |
| `maxCapacity` | `Number` | `required, min: 1` | Capacidad máxima de personas simultáneas. |
| `pricePerHour` | `Number` | `required, min: 0` | Costo de la hora para facturación. |

> **Nota:** La ocupación actual (`currentCapacity`) se gestiona en **DragonflyDB** para garantizar atomicidad y performance (~0.5ms por check-in/out).

#### 3. Colección: `people` (Identidades de Clientes)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `document` | `String` | `required, unique, index` | Documento de identidad (DNI/Cédula). |
| `name` | `String` | `required` | Nombre completo del cliente. |
| `email` | `String` | `required` | Email para contacto/cupones. |

#### 4. Colección: `accesses` (Historial de Entradas/Salidas)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `personId` | `ObjectId` | `required, ref: "Person"` | Referencia al cliente. |
| `locationId` | `ObjectId` | `required, ref: "Location"`| Referencia a la sede. |
| `operatorIn` | `String` | `required` | Email del operador que registró ingreso. |
| `operatorOut` | `String` | `optional` | Email del operador que registró salida. |
| `checkIn` | `Date` | `required, default: now` | Timestamp de entrada. |
| `checkOut` | `Date` | `optional` | Timestamp de salida. |
| `billingAmount` | `Number` | `default: 0` | Valor total facturado (calculado al salir). |
| `priceAtCheckIn` | `Number` | `required` | Snapshot del precio para auditoría histórica. |
| `status` | `String` | `enum: ["ACTIVE", "COMPLETED"]` | Estado del registro. |

#### 5. Colección: `coupons` (Fidelidad y Beneficios)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `code` | `String` | `required, unique` | Código CSPRNG (`randomUUID`). |
| `personDocument`| `String` | `required` | Documento del beneficiario. |
| `locationId` | `ObjectId` | `required, ref: "Location"`| Sede donde se emite/redime. |
| `issuedAt` | `Date` | `default: now` | Fecha de emisión. |
| `expiresAt` | `Date` | `required` | Vencimiento (+10 días). |
| `status` | `String` | `enum: ["VALID", "USED", "EXPIRED"]` | Estado del beneficio. |

#### 6. Colección: `auditlogs` (Auditoría Superior)
| Campo | Tipo | Restricciones | Descripción |
| :--- | :--- | :--- | :--- |
| `timestamp` | `Date` | `index, default: now` | Fecha exacta del evento. |
| `operatorEmail` | `String` | `index` | Quién realizó la acción (del JWT). |
| `action` | `String` | `index` | Tipo de evento (LOGIN, CHECK_IN, etc). |
| `method`/`path` | `String` | `required` | Metadata del request HTTP. |
| `payload` | `Mixed` | `required` | Datos de la acción (PII sanitizado). |
| `status` | `Number` | `required` | Código HTTP resultante (200, 403, 500). |
| `duration` | `Number` | `required` | Tiempo de respuesta en ms. |

## 📜 Bitácora de Decisiones Arquitectónicas (Audit Readiness)

Este sistema no confía en que el código "corra bien", sino en las restricciones de infraestructura. A continuación, se detallan las decisiones tomadas para mitigar riesgos críticos de negocio.

### 1. Control de Concurrencia Atómico
*   **Problema:** Riesgo de dobles ingresos económicos o sobrepoblación de sedes bajo carga.
*   **Decisión:** Uso de **DragonflyDB** para validación de capacidad con scripts Lua y Locks de documento.
*   **Mitigación:** Las validaciones de cupo son atómicas y thread-safe a nivel de memoria, eliminando *Race Conditions*.

### 2. "Kill-Switch" e Invalidadación de Sesión
*   **Problema:** Vulnerabilidad de JWTs activos (6h) si un operador es comprometido.
*   **Decisión:** Triple validación (JWT Payload + Redis Denylist + User Status Check).
*   **Mitigación:** La desactivación de un usuario dispara una revocación global (`auth:revoked:${userId}`). Adicionalmente, el cierre de sesión o eliminación quema el JTI en una `denylist` de alto rendimiento, invalidando el token de forma permanente e irreversible incluso si el usuario es reactivado.

### 3. Estrategia "Write-Then-Release"
*   **Problema:** Pérdida de integridad si Redis libera un cupo pero la base de datos falla al guardar el cobro.
*   **Decisión:** Inversión del flujo de liberación.
*   **Mitigación:** MongoDB captura el éxito de la transacción primero; solo entonces Redis libera los recursos.

### 4. Segregación de Staff (StaffGuard)
*   **Problema:** Corrupción de métricas y fuga financiera por personal interno generando cupones de consumo.
*   **Decisión:** Bloqueo absoluto vía `StaffGuard` basado en la identidad verificada.
*   **Mitigación:** Todo el personal (ADMIN y OPERATOR) está excluido del pool de fidelidad. El sistema rechaza cualquier intento de registro como cliente si el email pertenece al staff, garantizando que el 100% de los beneficios sean para clientes orgánicos.

### 5. Snapshot de Facturación (PriceAtCheckIn)
*   **Problema:** Disputas legales por cambios de tarifa mientras el usuario está dentro del coworking.
*   **Decisión:** Persistencia del precio vigente al momento del check-in.
*   **Mitigación:** El sistema respeta el contrato pactado al entrar, ignorando fluctuaciones de tarifa posteriores durante la estadía.

### 6. Integridad de Fidelidad (Triple Index Guarantee)
*   **Problema:** Condiciones de carrera permitiendo la generación de múltiples cupones por una misma estadía o ciclo de lealtad.
*   **Decisión:** Índice único compuesto de infraestructura: `(personDocument, locationId, loyaltyBucket)`.
*   **Mitigación:** Garantía de nivel de base de datos que impide físicamente la duplicidad de beneficios para un mismo ciclo de acumulación, blindando el sistema contra ataques de concurrencia en la redención.

### 7. Auditoría Forense y PII Safe
*   **Problema:** Necesidad de cumplimiento (compliance) sin exponer datos sensibles.
*   **Decisión:** Middleware de auditoría write-only con enmascaramiento automático.
*   **Mitigación:** Trazabilidad inmutable de cada acción mutativa vinculada al operador, capturando latencias y estatus HTTP sin comprometer datos PII.

