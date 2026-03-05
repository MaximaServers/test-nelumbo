Sistema de Control de Acceso a Coworkings Empresariales
1. CONSIDERACIONES GENERALES
- API REST para control de ingreso y salida de personas en múltiples sedes de coworking.
- Mantener histórico de accesos para generación de indicadores.
- Autenticación mediante JWT con expiración de 6 horas.
- Manejo de roles: ADMIN y OPERADOR.
- Control de capacidad máxima por sede.
- Cálculo de facturación según tiempo de permanencia.
- Integración con microservicio de notificaciones (simulado).
2. AUTENTICACIÓN Y SEGURIDAD
- Debe existir un usuario precargado:
    ```
    usuario: admin@mail.com
    pass: admin
    ```
- El rol ADMIN es el único autorizado para crear usuarios con rol OPERADOR.
- Los endpoints deben estar protegidos por rol y token válido.
3. PERMISOLOGÍA
- Rol ADMIN:
    - Crear usuarios OPERADOR.
    - CRUD completo de sedes.
    - Asociar operadores a sedes.
    - Consultar accesos e indicadores globales.
    - Visualizar métricas financieras agregadas.
- Rol OPERADOR:
    - Registrar ingreso de personas.
    - Registrar salida (si existe ingreso activo).
    - Consultar personas actualmente dentro de su sede.
    - Visualizar indicadores de su sede.
4. CRUD DE SEDES
- Cada sede debe contener:
    - Nombre
    - Dirección
    - Capacidad máxima simultánea
    - Costo por hora
- Debe validarse la capacidad disponible en cada ingreso.
5. REGISTRO DE INGRESO
- No puede existir ingreso activo del mismo documento en ninguna sede.
- Registrar fecha y hora exacta de ingreso.
- Validar capacidad disponible.
6. REGISTRO DE SALIDA
- Debe existir ingreso activo.
- Registrar fecha y hora de salida.
- Calcular valor a pagar según tiempo de permanencia.
- Mover registro a histórico.
- Liberar cupo en la sede.
7. NOTIFICACIONES Y CUPÓN POR FIDELIDAD
- Si una persona acumula más de 20 horas de permanencia en una misma sede, considerando la suma de múltiples estadías, el sistema deberá generar automáticamente una notificación de agradecimiento indicando que ha recibido un cupón de consumo interno.
- Reglas del cupón:
    - Se otorga una única vez por persona y por sede.
    - Vigencia de 10 días calendario desde su generación.
    - Debe poder marcarse como utilizado.
    - No puede reutilizarse.
    - Si expira, debe registrarse como EXPIRADO y no podrá redimirse.
- La notificación debe enviarse mediante el microservicio simulado.
8. MICROSEVICIO DE NOTIFICACIONES (SIMULADO)
- Debe recibir email, documento, mensaje y sede.
- Imprimir en logs la solicitud.
- Retornar respuesta exitosa simulada.
- Debe invocarse desde la API principal cuando aplique.
9. INDICADORES
- ADMIN y OPERADOR:
    - Top 10 personas con más ingresos.
    - Top 10 personas con más ingresos por sede.
    - Personas que ingresan por primera vez.
- OPERADOR:
    - Ingresos económicos (hoy, semana, mes, año).
- ADMIN:
    - Top 3 operadores con más ingresos en la semana.
    - Top 3 sedes con mayor facturación semanal.
10. REQUISITOS TÉCNICOS
- Manejo de excepciones para errores 400.
- Arquitectura en capas (Controller, Service, Repository, Entity).
- Protección por roles.
- Entregar colección Postman documentada.
- Definir modelo entidad-relación.
- Publicar solución en GitHub con README para ejecución local