# Roadmap recomendado de Investighost

Estado: Hoja de Ruta Canónica V3 formalizada; FASE 3A y FASE 3B completadas técnicamente el 2026-07-21. FASE 3C es el siguiente escalón. Automatic continúa bloqueado y no implementado.

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

Persistencia única en Supabase local, Auth/RLS, roles, auditoría durable, configuración segura y manejo de errores. Migraciones remotas solo tras aprobación. PAUSA HUMANA 2.

#### 2A. Diseño de persistencia — completada documentalmente

Definidos proyecto dev, topología productiva compartida, tablas públicas/privadas/locales, repositorios, Auth/RLS, Storage, sincronización y catálogo de 15 migraciones **NO EJECUTADAS**. Sin proyecto, claves, SQL, conexiones ni datos reales.

#### 2B. Motor local de importación verificada — completado

Implementados contratos, cola por registro, SQLite, archivos locales, SHA-256, idempotencia, retry, backup, adaptador mock, IPC y UI mínima. Sin conexión ni borrado real. El parche Trawel→Investighost prevalece para contribuciones.

#### 2C. Consolidación de Supabase local — completada técnicamente

La decisión posterior sustituyó el proyecto dev remoto por Supabase local único. 2C-A, 2C-B y 2C-C están completadas. SQLite/Drizzle fueron retirados, PostgreSQL es la única base del MVP y Storage local el único file store operativo. El contrato remoto, cualquier borrado real y producción siguen bloqueados.

#### 2C-A. Reorientación a Supabase local único — completada documentalmente

Supabase local pasa a ser la única persistencia del MVP; SQLite queda deprecado y sin rol de fallback/offline. Se conservan los controles de FASE 2B, trasladables a PostgreSQL/Storage. No se modificó código ni SQL y producción permanece desconectada. PAUSA HUMANA 2C-A.

#### 2C-B. Sustitución técnica de SQLite — completada

Contribuciones migradas a PostgreSQL/Storage local con migración, seed, runtime y pruebas. SQLite ya no es persistencia activa de contribuciones; queda legado residual fuera de ese runtime.

#### 2C-C. Retirada residual y recuperación — completada técnicamente

Retiradas dependencias, configuración, schemas y adaptadores SQLite restantes. El backup custom `-Fc` y la restauración real de PostgreSQL se aprobaron en CHECKPOINT 5; el backup y la restauración por API de Storage se aprobaron en CHECKPOINT 7; la auditoría técnica final, reset, reconstrucción, tests y búsquedas residuales se aprobaron en CHECKPOINT 8. Todo se ejecutó en local con datos sintéticos, sin ampliar dominios ni conectar producción.

Gates aprobados: typecheck, lint, 62/62 tests generales, 1/1 integración Supabase, 63/63 total, `supabase db reset`, siete tablas, seed, RLS y bucket privado. El build completa TypeScript, Vite, Electron main/preload y llega a `release\win-unpacked\Investighost.exe`; solo permanece el fallo conocido de symlinks de `winCodeSign`.

Limitaciones conocidas: normalización no funcional del lockfile por npm 11.6.2; 23 vulnerabilidades npm no corregidas; icono Electron por defecto; posible publicación Docker en más interfaces aunque las pruebas usaron loopback; dump PostgreSQL limitado a `public`; prueba Storage sobre un único objeto sintético sin concurrencia; stores de investigación, cola editorial y logs/cachés aún en memoria.

### 3. Pipeline Manual canónico — V3 vigente

La ejecución se rige por `INVESTIGHOST_HOJA_DE_RUTA_CANONICA_V3.md`. 3A consolidó dominio, trazabilidad y estados; 3B materializó 23 tablas normalizadas, repositorios, RLS, seed, checkpoints y locks en Supabase local. El orden autorizado continúa por 3C–3I y prepara 3J, donde se detiene para aceptación humana. No se conecta producción/Trawel, no se publica y no se implementa Automatic.

### 4. Biblioteca, edición y revisión

CRUD durable, búsqueda, filtros, versiones, edición, aprobación/rechazo, historial y prueba con usuario no técnico. PAUSA HUMANA 4.

### 5. Cola editorial durable

Prioridad, calendario, máximos, pausas, reintentos, idempotencia y operación manual. Preparar ejecución cloud; no publicar todavía.

### Automatic — fase futura condicionada, posterior al Manual estable

No es una fase inmediata ni un pipeline nuevo. Tras finalizar 2C, completar el flujo Manual extremo a extremo (F3–F5), consolidar contratos editoriales y demostrar calidad, trazabilidad, recuperación, reintentos e idempotencia, Automatic podrá orquestar el mismo caso de uso por campañas de investigación. Primero será secuencial; la concurrencia limitada vendrá después. No confundir con campañas de correo de F10. La publicación Trawel permanece separada en F6 y exige aprobación humana.

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

## Orden inmediato vigente

1. FASE 3C — identidad geográfica determinista y ambigüedad explícita.
2. FASE 3D–3I — continuar en el orden canónico V3.
3. FASE 3J — preparar escenarios y detenerse en el gate humano Manual.
4. Mantener Automatic y FASE 4 bloqueados.

## Estado FASE 2C-B — 2026-07-14

Implementación completada: contribuciones usa PostgreSQL y Storage de Supabase local mediante migración versionada y seed sintético. El runtime no inicializa SQLite ni ofrece fallback. El código SQLite legado permanece aislado para retirada posterior porque otros módulos aún lo referencian. Próxima subfase recomendada: 2C-C, retirada controlada de dependencias, schemas y adaptadores SQLite residuales, sin ampliar dominios ni conectar producción.
