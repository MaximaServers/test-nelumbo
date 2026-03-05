# 🔔 Notification Microservice

Microservicio industrial de notificaciones basado en **Bun + Elysia**, diseñado bajo una arquitectura **Feature-First** para máxima escalabilidad, seguridad y estabilidad.

## Arquitectura
- **Safe**: Tipado estricto con TypeBox y contratos de red inquebrantables.
- **Stable**: Resiliencia SMTP con Gmail 2026 y Rate Limiting agresivo.
- **Secured**: Autenticación S2S mediante **Shared Secret** y redacción automática de datos sensibles (PII).

## Estructura del Proyecto
El sistema utiliza una división vertical por dominios de negocio (Features) en lugar de capas horizontales tradicionales:

```
src/
├── config/           # Validación destructiva de entorno
├── core/             # Middlewares de seguridad y auditoría
├── features/         # Lógica de negocio (Health, Mailing)
└── infrastructure/   # Adaptadores técnicos (Gmail SMTP)
```

## Configuración de Entorno (.env)
El microservicio requiere las siguientes variables para operar:

| Variable | Descripción |
| :--- | :--- |
| `PORT` | Puerto de escucha (Default: 3001) |
| `NODE_ENV` | Entorno de ejecución (`development` o `production`) |
| `NOTIFICATION_SECRET` | Secreto compartido con la API principal (Mismo valor que en coworking-api) |
| `MAX_REQUESTS_PER_MINUTE` | Control de tráfico y Rate Limiting (Default: 1000) |
| `GMAIL_USER` | Correo de despacho (E.j. cuenta de Gmail) |
| `GMAIL_APP_PASSWORD` | App Password de 16 caracteres generada en Google Security |

**Ejemplo de archivo `.env`:**
```env
PORT=3001
NODE_ENV=development
NOTIFICATION_SECRET=audit_notification_secret_2026_xyz
MAX_REQUESTS_PER_MINUTE=1000

GMAIL_USER=correo.notificaciones@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
```

## Endpoints de la API

### Salud (Público)
- `GET /health`: Estado del sistema y diagnóstico rápido.

### Mailing (Protegido)
- `POST /email`: Despacho de correos electrónicos.
  - **Header Requerido**: `X-Notification-Secret: <TU_SECRETO>`
  - **Payload**:
    ```json
    {
      "to": "destinatario@ejemplo.com",
      "subject": "Asunto",
      "text": "Mensaje en plano",
      "html": "<div>Contenido HTML</div>"
    }
    ```

## ⚡ Ejecución
```bash
# Desarrollo con Hot-Reload
bun dev

# Producción
bun src/index.ts
```