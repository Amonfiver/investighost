# Roadmap recomendado de Investighost

Estado: FASE 2A diseñada el 2026-07-12; PAUSA HUMANA 2A antes de crear Supabase dev.

## Principios de secuencia

- No ampliar dominios sobre un arranque roto, datos volátiles y cero tests.
- Cerrar contratos y decisiones antes de migraciones o integraciones.
- Separar siempre producción interna de publicación externa.
- Mantener publicación Trawel, campañas y escrituras reales detrás de pausas humanas.
- Cada bloque debe terminar con lint, typecheck, tests, build, prueba funcional y documentación.

## Fases propuestas

### 0. Auditoría — completada y aceptada

Entregables: auditoría, matriz, roadmap y BITACORA2. Salida: PAUSA HUMANA 0.

### 1A. Estabilización de la fundación — completada

Arranque Electron y lint corregidos; scripts canónicos y 21 pruebas mínimas añadidos. La compilación Vite es reproducible. El instalador continúa bloqueado por privilegios de symlinks de Windows y queda documentado como incidencia de entorno/release.

### 1B. Contratos y arquitectura canónica — completada

Modelo de 29 entidades, estados, RBAC, contratos Zod, payload Trawel, frontera de datos, seguridad y aceptación definidos. No se implementó persistencia. PAUSA HUMANA 1 activa.

### 2. Fundación segura y multiusuario

Persistencia local real, Supabase Auth/RLS, roles, auditoría durable, configuración segura, sincronización y manejo de errores. Migraciones solo tras aprobación. PAUSA HUMANA 2.

#### 2A. Diseño de persistencia — completada documentalmente

Definidos proyecto dev, topología productiva compartida, tablas públicas/privadas/locales, repositorios, Auth/RLS, Storage, sincronización y catálogo de 15 migraciones **NO EJECUTADAS**. Sin proyecto, claves, SQL, conexiones ni datos reales.

#### 2B. Motor local de importación verificada — completado

Implementados contratos, cola por registro, SQLite, archivos locales, SHA-256, idempotencia, retry, backup, adaptador mock, IPC y UI mínima. Sin conexión ni borrado real. El parche Trawel→Investighost prevalece para contribuciones.

#### 2C. Entorno dev y contrato remoto — pendiente de autorización

Confirmar organización/región/nombre, crear Supabase dev, capturar baseline DDL sin datos y diseñar/probar el buzón temporal, recibo mínimo, RLS y borrado remoto únicamente en dev. Antes de habilitar delete: restauración local probada y pausa humana.

### 3. Motor de investigación verificable

Consolidar Brave/Kimi, añadir proveedor alternativo aprobado, estrategia de retry/fallback, extracción/contraste según legalidad, trazabilidad de fuentes, coste real y aceptación editorial. Sin publicar. PAUSA HUMANA 3.

### 4. Biblioteca, edición y revisión

CRUD durable, búsqueda, filtros, versiones, edición, aprobación/rechazo, historial y prueba con usuario no técnico. PAUSA HUMANA 4.

### 5. Cola editorial durable

Prioridad, calendario, máximos, pausas, reintentos, idempotencia y operación manual. Preparar ejecución cloud; no publicar todavía.

### 6. Adaptador Trawel

Mapper exacto, resolución de IDs, validación, drafts/review, fuentes, logs, idempotencia y rollback lógico. Prueba solo con entorno y registro autorizados. PAUSA HUMANA 6.

### 7. Moderación y fotos

Bandejas, derechos, consentimiento, Storage, aprobación/rechazo, retirada y conexión Trawel validada. PAUSA HUMANA 7.

### 8–10. CRM, correo y campañas

Primero contactos/consentimiento/supresión; después correo individual; por último campañas con aprobación, webhooks y bajas. PAUSA LEGAL obligatoria antes de cualquier envío real.

### 11–14. Comercial, anuncios, analytics e informes

Clientes, placements y anuncios tras contrato con Trawel; instrumentación analytics separada; informes solo con datos reales; automatizaciones mediante Edge Functions/Cron.

### 15. Endurecimiento y release

Cobertura de tests, E2E, backups/restauración, seguridad, accesibilidad, rendimiento, packaging, firma, instalador, actualización y criterios de release.

## Orden inmediato recomendado

1. Revisar y aceptar FASE 2B y su motor local mock.
2. Confirmar organización, región y nombre del proyecto Supabase dev, y autorizar exportación solo de esquema.
3. Autorizar FASE 2C para crear/configurar dev y probar allí el contrato remoto sin datos reales.
4. Mantener producción intacta y el borrado real deshabilitado.
