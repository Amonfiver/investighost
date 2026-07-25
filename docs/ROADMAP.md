# Roadmap recomendado de Investighost

## Pipeline real — preparación controlada

La rama `feat/investighost-real-pipeline` inicia el lote sin gasto PROMPT 01–10 desde el checkpoint protegido `checkpoint/pre-real-pipeline-20260725`. PROMPT 01 añade únicamente contratos neutrales y puertos sustituibles: Investighost orquesta, `ResearchTool` investiga y `IntelligenceEngine` comprende, estructura, redacta y revisa. El máximo de dos rondas queda representado en los contratos y no se activa ningún proveedor real.

PROMPT 02 incorpora un Centro de proveedores local: catálogo inicial Tavily/OpenAI, una selección activa por categoría, estado y prueba simulada. Las credenciales quedan cifradas por `safeStorage` en Electron main, fuera del proyecto y de Supabase; el renderer no recibe secretos y la falta de un backend seguro bloquea las mutaciones.

PROMPT 03 incorpora contabilidad durable por llamada: tarifas versionadas, reservas, ledger append-only, una guarda real global y límites por tarea, lote y día. La migración se aplica únicamente en Supabase local y no habilita llamadas: reservar es obligatorio antes de invocar, conciliar después y un timeout ambiguo no se reintenta.

PROMPT 04 añade el primer `ResearchTool` Tavily con Search/Extract, normalización, deduplicación, hashes, créditos, límites, timeout y cancelación. Sigue siendo una implementación sin red: el transporte `fetch` está cerrado por defecto y toda validación usa fixtures.

PROMPT 05 añade el primer `IntelligenceEngine` OpenAI sobre el contrato de Responses API y Structured Outputs. El cliente permanece falso: solo procesa el expediente, diferencia coberturas y roles, mide uso simulado y no dispone de web search ni herramientas externas.

PROMPT 06 cierra la orquestación controlada de investigación: ronda inicial, ampliación focalizada solo para carencias relevantes y parada definitiva tras ronda 2. Hashes de consulta, equivalencias, límites, checkpoints íntegros e idempotencia impiden loops, duplicados y doble coste.

PROMPT 07 expone Aventura y Estudiante con activación, profundidad y extensión aproximada persistente. El rango 800–4.000 avanza de 100 en 100, los prompts prohíben relleno y ambos perfiles reutilizan una sola investigación.

PROMPT 08 valida un piloto integral Morella sin red: los adaptadores falsos recorren dos rondas como máximo, conocimiento compartido, dos borradores y revisión bajo reservas y ledger simulados. La reanudación tras una incidencia no duplica investigación ni gasto; coste y llamadas reales, regeneración, publicación y efectos externos siguen en cero. El protocolo humano existe, pero no ha sido ejecutado.

PROMPT 09 deja preparada una puerta visible y cerrada por defecto para un único piloto Morella. La política fija una tarea, concurrencia 1, presupuestos 0,20/0,25/0,50 EUR, dos rondas y cero regeneración/publicación; el preflight exige proveedores, conexiones reales, modelos, tarifas, presupuesto, saldo, Supabase, ledger, guarda y cero tareas activas. Los estados desconocidos bloquean, una prueba simulada no cuenta y todavía no existe acción de ejecución.

PROMPT 10 concluye con **NO-GO operativo**. El pipeline simulado, la seguridad local, los límites y los backups superan auditoría, pero la función SQL de reserva no detecta que una clave idempotente existente llegue con parámetros distintos. Antes de cualquier piloto deben añadirse comparación durable y prueba de integración, y después resolverse los controles reales que permanecen cerrados por alcance: conexiones, clientes, tarifas, saldo, presupuesto y sondas. PROMPT 11 no está iniciado ni autorizado.

PROMPT 10B corrige la deuda con una nueva migración local aditiva: misma clave e input idéntico convergen; cualquier diferencia de atribución, facturación, presupuesto o payload devuelve `IDEMPOTENCY_CONFLICT` sin duplicar reserva, ledger o coste. La concurrencia se prueba con sesiones PostgreSQL independientes y las rutas legacy quedan deprecadas y bloqueadas antes de entorno/red. Dictamen actualizado: **GO técnico para configurar credenciales y preparar autorización humana de PROMPT 11**; ejecución real, conexiones y PROMPT 11 siguen requiriendo autorización expresa.

Estado: Hoja de Ruta Canónica V3 formalizada; FASE 3A–3I completadas técnicamente y FASE 3J aprobada, cerrada y sincronizada. FASE 4A-01 está implementada y committeada; FASE 4A-01B está implementada técnicamente y pendiente de prueba humana. FASE 4A-02 y los bloques posteriores no están iniciados ni autorizados. Automatic continúa bloqueado y no implementado.

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

La ejecución se rige por `INVESTIGHOST_HOJA_DE_RUTA_CANONICA_V3.md`. 3A–3G cerraron dominio, persistencia, contenido y calidad; 3H hizo el flujo Manual operable desde Electron sobre Supabase local; 3I cerró recuperación, costes, cancelación e idempotencia; 3J completó J01–J17 y recibió aprobación humana expresa. El flujo Manual queda cerrado y sincronizado en la rama remota mediante el commit `ac61700f27297d899e55f6460a76a6cac7bca72a`, sin conexión a producción/Trawel, sin publicación de contenido y sin Automatic.

### 4. Biblioteca, edición y revisión — alcance original parcialmente cubierto

La formulación original incluía CRUD durable, búsqueda, filtros, versiones, edición, aprobación/rechazo, historial y prueba con usuario no técnico. FASE 3J ya aceptó Biblioteca durable, persistencia tras reinicio, detalle, versiones, regeneración parcial, edición con motivo, aprobación, rechazo, reapertura, historial de decisiones, actores, comentarios, fechas, costes y eventos.

No se implementará literalmente la FASE 4 original: hacerlo duplicaría capacidades y podría introducir un CRUD destructivo incompatible con la trazabilidad aprobada.

### 4A. Consolidación operativa de Biblioteca — 4A-01B pendiente de gate

Estado: **4A-01 IMPLEMENTADA Y COMMITTEADA; 4A-01B IMPLEMENTADA TÉCNICAMENTE Y PENDIENTE DE PRUEBA HUMANA; 4A-02 NO INICIADA**.

#### Objetivo

Hacer cómoda y segura la Biblioteca existente para un volumen creciente de investigaciones y borradores, manteniendo el entorno local, Manual y simulado.

#### 4A-01 — contrato compartido y paginación estable

Implementación técnica terminada y committeada en `7b1ddde`:

- contrato Zod compartido y desacoplado del repositorio;
- página predeterminada de 25 y máximo validado de 100;
- cursor keyset con `updated_at DESC, id DESC`;
- `items`, `hasMore` y `nextCursor`, sin total o contadores parciales presentados como globales;
- paridad de memoria y Supabase;
- validación en servicio e IPC;
- compatibilidad mínima del renderer con su primera página;
- 137 solicitudes sintéticas recorridas sin duplicados u omisiones;
- 43 pruebas específicas y suite normal de 161 pruebas aprobadas;
- typecheck, ESLint y builds renderer/main/preload aprobados;
- cero migraciones, seeds, proveedores, costes, publicación o conexiones externas.

Quedan expresamente fuera búsqueda, filtros, ordenación seleccionable, read model, geografía/títulos/estados editoriales, `spent_cost`, archivo/restauración, contadores, preferencias y rediseño UX. FASE 4A-02 no comenzó.

#### 4A-01B — navegación visible de la Biblioteca paginada

Implementación técnica terminada y pendiente de prueba humana:

- botones visibles Primera página, Anterior, Actualizar y Siguiente;
- indicador de página y estados de carga, vacío, fin y error;
- pila de cursores local para volver hacia atrás sin paginación inversa en PostgreSQL;
- refresco con el cursor actual;
- recuperación comprensible ante cursor inválido o vencido;
- exclusión de cargas simultáneas;
- conservación de página al abrir y cerrar detalle durante la sesión;
- reinicio seguro a página 1 después de cualquier mutación existente;
- métricas identificadas como resumen exclusivo de la página;
- 19 pruebas específicas y suite normal de 180 pruebas aprobadas;
- cero migraciones, seeds, proveedores, coste, publicación o conexiones externas.

La sesión no persiste tras reiniciar Electron y no existen total de páginas, salto directo, búsqueda, filtros, archivo o contadores globales. La prueba humana debe realizarse con datos ya existentes; si no hay más de 25 solicitudes, no se poblará la Biblioteca humana automáticamente.

#### Alcance propuesto

- Buscar en datos propios por destino, país, título, identidad canónica, identificador, perfil y estado.
- Distinguir expresamente búsqueda de Biblioteca de nueva investigación: buscar no crea solicitudes, invoca proveedores ni genera coste.
- Filtrar por estado, etapa, incidencia, revisión, aprobación/rechazo/archivo, perfil, fechas y presencia de incidencias.
- Ordenar por actividad, creación, destino, estado, coste y última decisión.
- Archivar, consultar archivados y restaurar sin perder fuentes, hechos, versiones, costes, eventos o decisiones.
- Mostrar indicadores de ejecución, incidencias, pendientes de revisión, en revisión, aprobadas, rechazadas y archivadas.
- Facilitar que una persona no técnica localice, comprenda, abra, continúe, archive y restaure contenido.
- Registrar como deuda la terminología de RevisIAtor sin cambiar ahora su comportamiento.

#### Fuera de alcance

- publicación, Trawel y producción;
- Automatic, IA, proveedores o créditos reales;
- cola editorial y calendario de FASE 5;
- campañas, correo, nube y migraciones remotas;
- nuevas jerarquías de supervisor o permisos multiusuario;
- borrado destructivo;
- rediseño integral de perfiles;
- control Extensión;
- reutilización automática del conocimiento;
- mejora editorial integral.

#### Entregables futuros

- inventario de capacidades existentes y gaps reales;
- diseño de búsqueda, filtros, ordenación, archivo/restauración y estados vacíos;
- operación sobre una biblioteca suficientemente poblada con datos sintéticos;
- indicadores internos inequívocamente separados de publicaciones;
- persistencia justificada de preferencias cuando corresponda;
- pruebas automatizadas, validación local y aceptación humana desde Electron;
- documentación final de invariantes y límites.

#### Gate humano 4A

El gate inmediato revisa exclusivamente 4A-01B desde Electron: avanzar, abrir un detalle, volver conservando página, retroceder, regresar a la primera página y confirmar ausencia de nuevas solicitudes o coste. FASE 4A-02 requerirá otra autorización expresa. El gate final de toda 4A seguirá exigiendo archivo no destructivo, conservación de trazabilidad, publicaciones en cero y ausencia de Trawel, producción y Automatic.

### 5. Cola editorial durable — no iniciada

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

1. Mantener FASE 3J cerrada y sincronizada; no queda pendiente su commit o push.
2. Ejecutar el piloto humano controlado de FASE 4A-01B; no hacer commit ni push antes de autorización.
3. No iniciar FASE 4A-02, FASE 5 o cualquier bloque posterior sin un encargo nuevo.
4. Mantener Automatic, producción, Trawel, proveedores reales y publicación bloqueados.

## Estado FASE 2C-B — 2026-07-14

Implementación completada: contribuciones usa PostgreSQL y Storage de Supabase local mediante migración versionada y seed sintético. El runtime no inicializa SQLite ni ofrece fallback. El código SQLite legado permanece aislado para retirada posterior porque otros módulos aún lo referencian. Próxima subfase recomendada: 2C-C, retirada controlada de dependencias, schemas y adaptadores SQLite residuales, sin ampliar dominios ni conectar producción.
