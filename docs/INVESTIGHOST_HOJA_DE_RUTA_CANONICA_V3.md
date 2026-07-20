# INVESTIGHOST — HOJA DE RUTA CANÓNICA V3

**Estado:** aprobada como guía operativa vigente
**Fecha de formalización:** 2026-07-21
**Proyecto:** `D:\Proyectos\investighost`
**Rama de partida:** `feat/investighost-reinvencion`
**Commit base:** `996e098`
**Objetivo prioritario:** producir contenido fiable para Trawel mediante un flujo Manual completo, revisable y persistente; posteriormente reutilizar exactamente ese pipeline desde Automatic.

---

# 1. PROPÓSITO DE ESTA VERSIÓN

Esta hoja sustituye como guía operativa vigente a las interpretaciones anteriores que todavía contemplaban SQLite local, Drizzle, Better SQLite, un file store local independiente, sincronización SQLite/Supabase, creación inmediata de un Supabase remoto de desarrollo, conexión temprana con Trawel o implementación anticipada de Automatic.

Los documentos anteriores se conservarán como historia y trazabilidad. Esta V3 no borra las decisiones históricas: establece cuál es su interpretación vigente.

---

# 2. JERARQUÍA DE AUTORIDAD

En caso de contradicción se aplicará este orden:

1. Decisiones humanas expresamente aprobadas más recientes.
2. Esta Hoja de Ruta Canónica V3.
3. `INVESTIGHOST_DECISION_SUPABASE_UNICO.md`.
4. Parche arquitectónico del modo Automatic.
5. Parche de sincronización local de contribuciones, reinterpretado sin SQLite.
6. Documentación viva actualizada durante FASE 2C-C.
7. Hoja de ruta V2.
8. Planes, auditorías y documentos históricos anteriores.

Una referencia antigua a SQLite, Drizzle, un file store físico independiente o sincronización SQLite/Supabase no podrá considerarse vigente.

---

# 3. ESTADO DE PARTIDA CONFIRMADO

## 3.1 Fases completadas

- FASE 0 — Auditoría completa.
- FASE 1A — Estabilización técnica.
- FASE 1B — Contratos y arquitectura canónica inicial.
- FASE 2A — Diseño de persistencia.
- FASE 2B — Implementación histórica SQLite, posteriormente sustituida.
- FASE 2C — Reorientación hacia Supabase local.
- FASE 2C-C — Retirada completa de SQLite y recuperación verificable.

## 3.2 Estado técnico

- Electron funciona en desarrollo.
- Typecheck aprobado.
- Lint aprobado.
- Tests generales: 62/62.
- Integración Supabase local: 1/1.
- Suite total: 63/63.
- `supabase db reset` aprobado.
- PostgreSQL local operativo.
- Supabase Storage local operativo.
- Siete tablas de contribuciones reconstruibles mediante migración y seed.
- Backup y restauración PostgreSQL probados.
- Backup y restauración Storage probados.
- Árbol Git limpio.
- Commit `996e098` sincronizado con GitHub.

## 3.3 Persistencia vigente

La única persistencia durable del MVP será:

- Supabase local/PostgreSQL para datos estructurados.
- Supabase Storage local para archivos.

No habrá SQLite, Drizzle, Better SQLite, segunda base local, fallback silencioso, base temporal paralela, file store alternativo ni duplicación de tablas Manual/Automatic.

Los `Map`, caches y variables actuales son memoria volátil, no persistencia aceptable para contenido editorial definitivo.

---

# 4. OBJETIVO OPERATIVO DEL MVP

El MVP debe permitir que un operador no técnico pueda:

1. Introducir un destino.
2. Elegir o confirmar perfiles editoriales.
3. Iniciar una investigación.
4. Ver progreso y errores.
5. Obtener fuentes y datos estructurados.
6. Generar contenido diferenciado.
7. Revisar y corregir.
8. Aprobar, rechazar o devolver a edición.
9. Guardar el contenido en la biblioteca interna.
10. Preparar una futura publicación.
11. Publicar únicamente después de aprobación humana.
12. Mantener separados producción y publicación.

Flujo de experiencia:

```text
Destino → investigar → revisar → corregir → aprobar → guardar
```

Subsistema de publicación:

```text
Aprobado → mapear → validar → encolar → aprobar publicación → publicar
```

---

# 5. PRINCIPIOS NO NEGOCIABLES

## 5.1 Pipeline único

Manual y Automatic usarán el mismo caso de uso canónico:

```text
ResearchDestination(destination, editorialProfiles, options)
```

La firma definitiva se cerrará al consolidar contratos. Automatic no tendrá prompts, tablas, validadores, resultados, estados, mappers o lógica editorial paralelos.

## 5.2 Revisión humana

Nunca habrá publicación automática durante el MVP. Todo contenido debe pasar por validación estructural, controles de calidad, revisión humana, aprobación editorial y aprobación de publicación.

## 5.3 Perfiles diferenciados

Los perfiles iniciales serán Aventura y Estudiante. Estudiante no podrá ser una simple reescritura superficial de Aventura. Deberán diferenciarse en intención, selección de información, prioridades, tono, planes, recomendaciones, riesgos, presupuesto, necesidades prácticas y estructura editorial cuando corresponda.

## 5.4 Producción desconectada

Hasta autorización específica:

- no usar credenciales productivas;
- no ejecutar `supabase link`;
- no ejecutar `supabase db push`;
- no introducir project refs remotos;
- no escribir ni borrar en Trawel;
- no publicar contenido real;
- no copiar PII real;
- no usar imágenes privadas reales.

## 5.5 Coste controlado

Se priorizarán servicios locales, planes gratuitos, mocks, datos sintéticos, límites configurables, ejecución secuencial y estimación previa de costes. No se contratará infraestructura adicional mientras no sea necesaria para ofrecer el servicio.

---

# 6. DOMINIO CANÓNICO QUE DEBE CONSOLIDARSE

## 6.1 Identidad geográfica

País, región, provincia/estado cuando corresponda, ciudad o zona, destino, aliases, slug canónico, identificadores externos opcionales, versión de fuente geográfica, estado y fecha de última comprobación. La IA no improvisará cada vez una lista territorial.

## 6.2 Solicitud de investigación

Destino, perfiles, idioma, profundidad, notas, opciones, fecha, autor, snapshot de configuración, idempotencia y estado.

## 6.3 Ejecución

Solicitud, proveedor, modelo, versión de prompt, inicio/final, intentos, coste estimado/real, tokens o unidades, errores, estado, cancelación y recuperación.

## 6.4 Fuentes

URL, título, editor, autor, fecha, consulta, tipo, fiabilidad, actualidad, ámbito territorial, validación, contenido extraído o referencia y huella/hash cuando corresponda.

## 6.5 Evidencias y hechos

Afirmación normalizada, fuentes, confianza, contradicciones, fecha de validez, categoría, destino y estado de revisión.

## 6.6 Lugares

Identidad, categoría, descripción factual, ubicación, evidencias, condiciones, accesibilidad, relevancia por perfil, estado y duplicados.

## 6.7 Actividades y planes

Tipo, descripción, público, duración, coste orientativo estable, requisitos, riesgos, temporada, fuentes y relevancia editorial.

## 6.8 Borradores editoriales

Perfil, título, introducción, secciones, contenido, fuentes, versión, estado, historial, controles de calidad, autoría técnica y edición humana.

## 6.9 Revisión

Resultado, comentarios, correcciones, severidad, responsable, fecha, versión revisada, aprobación, rechazo o devolución.

## 6.10 Publicación futura

Payload canónico, versión del mapper, destino Trawel resuelto, validación, idempotencia, cola, intentos, respuesta, auditoría y aprobación humana.

---

# 7. MÁQUINAS DE ESTADO MÍNIMAS

## 7.1 Investigación

```text
draft → queued → researching → structuring → validating → completed
```

Ramas: `retry_pending`, `failed`, `cancelled`.

## 7.2 Borrador editorial

```text
generating → ready → in_review → changes_requested → approved
```

Salidas: `rejected`, `archived`.

## 7.3 Publicación

```text
not_prepared → prepared → validated → queued → awaiting_human_approval → publishing → published
```

Ramas: `retry_pending`, `failed`, `cancelled`, `superseded`.

## 7.4 Campaña Automatic futura

```text
draft → ready → running → paused → completed
```

Ramas: `stopping`, `stopped`, `failed`, `cancelled`.

Cada objetivo individual seguirá los estados del pipeline Manual.

---

# 8. PLAN DE EJECUCIÓN POR FASES

# FASE 3 — PIPELINE MANUAL CANÓNICO

## FASE 3A — Auditoría y cierre del dominio editorial

Auditar contratos Zod, tipos, mocks, estados, proveedores, memoria volátil y pipeline. Diseñar entidades, relaciones, identidad geográfica, perfiles, versionado, trazabilidad fuente→hecho→texto, idempotencia, persistencia y tests. No implementar todavía interfaz ni proveedor real.

**Gate:** Manual debe poder representarse de extremo a extremo y Automatic debe poder reutilizar exactamente esas entidades.

## FASE 3B — Migraciones editoriales y repositorios locales

Implementar en Supabase local la persistencia durable del pipeline editorial. Evaluar y cerrar tablas para geografía, solicitudes, ejecuciones, fuentes, hechos, lugares, actividades, perfiles, borradores, versiones, secciones, revisiones, calidad, eventos y uso de proveedores. Añadir migración, seed sintético, constraints, FKs, índices, timestamps, versionado, RLS y repositorios Supabase. Mantener dobles de test en memoria.

**Gate:** reset reproducible, datos sintéticos, cero SQLite, cero fallback, repositorios y tests aprobados.

## FASE 3C — Identidad geográfica canónica

Elegir una fuente geográfica canónica gratuita y versionable, definir snapshot, importar alcance MVP, resolver país/región/ciudad/zona, aliases, slugs, duplicados, búsqueda tolerante, correcciones humanas y procedencia.

**Gate:** misma entrada resuelve al mismo ID salvo cambio versionado; ambigüedad visible; cero destinos inventados por IA.

## FASE 3D — Proveedores y adquisición de fuentes

Conservar mock e implementar contratos desacoplados para descubrimiento, lectura, evaluación y uso. Añadir timeouts, cancelación, backoff, límites, costes, clasificación de fuentes, duplicados, enlaces rotos, modo simulación y circuit breaker básico. Secretos fuera del renderer y nunca en base.

**Gate:** el pipeline funciona con mock y puede aceptar un proveedor autorizado sin cambiar el dominio.

## FASE 3E — Estructuración factual

Extraer y normalizar hechos, lugares, actividades, consejos y advertencias; asociar cada afirmación con fuentes; detectar contradicciones/duplicados; asignar confianza y volatilidad; validar con Zod; persistir parciales y reanudar.

**Gate:** no generar texto definitivo desde una masa sin estructura ni trazabilidad.

## FASE 3F — Generación Aventura y Estudiante

Definir contratos, prompts versionados, reglas, secciones, longitud, tono, prohibiciones, regeneración parcial, historial y coste. Aventura prioriza exploración, naturaleza, rutas, dificultad, temporada, preparación, riesgos y logística. Estudiante prioriza presupuesto, transporte, alojamiento, zonas, ambiente, estudio, servicios, seguridad, vida diaria y trámites verificables.

**Gate:** los perfiles se distinguen por contenido y utilidad, no solo por tono.

## FASE 3G — RevisIAtor y controles de calidad

Comprobar schema, cobertura, trazabilidad, fuentes débiles/antiguas, contradicciones, afirmaciones sin evidencia, duplicados, clichés, relleno, geografía, idioma, coherencia, diferenciación, volatilidad, seguridad y riesgos editoriales. Resultados: aprobar, aprobar con advertencias, solicitar cambios, bloquear o rechazar.

**Gate:** RevisIAtor nunca publica ni sustituye la decisión humana.

## FASE 3H — Interfaz Manual completa

Crear vistas para nueva investigación, resolución de destino, perfiles, configuración, progreso, errores, reintentos, fuentes, hechos, lugares, actividades, borradores, comparación, RevisIAtor, edición, versiones, revisión, aprobación, rechazo, biblioteca e historial. UX simple, accesible, persistente y sin terminal.

**Gate:** un operador no técnico completa el flujo sin SQL ni herramientas externas.

## FASE 3I — Resiliencia, costes e idempotencia

Persistir tras cada etapa, reanudar tras reinicio, evitar doble ejecución, cancelar de forma segura, reintentar etapa fallida, backoff, límites de intentos, costes, presupuestos, eventos auditables y pruebas de fallos de proveedor, base, Storage, Electron, regeneración y concurrencia accidental.

**Gate:** Automatic no podrá empezar hasta aprobar esta fase.

## FASE 3J — Aceptación humana del flujo Manual

Preparar escenarios obligatorios: destino válido/ambiguo/duplicado, fuentes insuficientes, fuente rota, proveedor no disponible, interrupción/reanudación, regeneración, corrección, rechazo, aprobación, perfiles diferenciados, persistencia tras reinicio, coste, historial, sin publicación, sin Trawel y sin duplicados por reintento.

**Gate humano:** el jefe aprueba o rechaza. Sin aprobación no se inicia Automatic.

---

# FASE 4 — BIBLIOTECA EDITORIAL Y PLANIFICACIÓN INTERNA

Biblioteca de investigaciones, borradores, aprobados, rechazados, archivados, filtros, búsqueda, etiquetas, prioridad, calendario editorial, cola de preparados, historial, duplicados y contenido desactualizado. Producir mucho en un día no obliga a publicar ese día.

---

# FASE 5 — AUTOMATIC SECUENCIAL

Condiciones previas: Manual aceptado, modelo canónico consolidado, RevisIAtor, persistencia por etapas, reintentos, idempotencia, costes y recuperación aprobados.

Automatic orquestará múltiples destinos reutilizando exactamente `ResearchDestination`. Primera versión estrictamente secuencial. Permitirá crear campaña, resolver/previsualizar alcance, excluir destinos, iniciar, pausar, reanudar, detener, reintentar un destino, omitir existentes, reprocesar con autorización, controlar coste y errores. Cada destino termina en revisión humana.

---

# FASE 6 — AUTOMATIC CON CONCURRENCIA LIMITADA

Solo después de estabilidad secuencial y métricas reales. Máximo global, por proveedor y campaña; rate limits, colas, locks/leases, heartbeats cuando proceda, detección de abandonados, cancelación, backpressure, presupuesto y observabilidad. Empezará con dos trabajos como máximo.

---

# FASE 7 — CONTRATO Y MAPPER DE TRAWEL EN LOCAL

Preparar el handoff sin producción:

```text
Contenido aprobado → TrawelMapper → contrato Trawel → validación → cola → aprobación humana
```

Verificar esquema real mediante exportación autorizada, resolver IDs, probar mapper, idempotencia, actualización, rollback lógico y fallos parciales. Borradores, fuentes, costes y notas permanecen en Investighost.

---

# FASE 8 — PUBLICACIÓN CONTROLADA EN ENTORNO SEGURO

Probar fuera de producción o en entorno autorizado con backup, migraciones revisadas, credenciales aisladas, allowlist, banner, auditoría, aprobación humana, rollback y datos sintéticos.

---

# FASE 9 — CONEXIÓN PRODUCTIVA AUTORIZADA CON TRAWEL

Solo con autorización humana, revisión de schema, backup, migraciones aprobadas, mínimos privilegios, rollback, publicación inicial limitada, monitorización e idempotencia. Despliegue progresivo hasta ritmo objetivo de 3–5 publicaciones diarias. Nunca publicación automática.

---

# FASE 10 — CONTRIBUCIONES Y MODERACIÓN

Reinterpretar el parche antiguo sin SQLite: PostgreSQL local para registros/estados y Storage local para archivos. Flujo: consultar pendientes, crear trabajos, descargar payload/archivos, validar Zod, calcular hashes, persistir, verificar, confirmar importación, solicitar borrado remoto, registrar resultado y revisar localmente.

Nunca borrar remoto antes de verificar fila, archivos, hashes, relaciones, transacción y backup reciente válido. Reintentos por registro/archivo con backoff y sin bloquear el lote.

---

# FASE 11 — USUARIOS, ROLES Y AUDITORÍA

Roles iniciales: owner, admin, editor, reviewer, publisher y moderator. Futuro: sales, analyst y soporte. Mínimo privilegio, denegación por defecto, sesiones seguras, service role fuera del renderer, auditoría de acciones y trazabilidad de aprobaciones.

---

# FASE 12 — CRM

Contactos, organizaciones, relaciones, oportunidades, tareas, notas, consentimiento, preferencias, historial, segmentación, supresión y retención. No mezclar CRM con contribuciones editoriales ni almacenar PII sin necesidad y base jurídica.

---

# FASE 13 — COMUNICACIONES TRANSACCIONALES

Plantillas, proveedor desacoplado, colas, reintentos, logs, bajas cuando proceda, errores, webhooks y límites. Resend será candidato, no dependencia automática.

---

# FASE 14 — CAMPAÑAS DE CORREO

Separadas de Automatic. Entidades `Campaign`, `CampaignAudience`, `CampaignDelivery`. Antes de enviar: responsable, base jurídica, consentimiento, privacidad, derechos, supresión, bajas, retención e identificación del remitente.

---

# FASE 15 — PUBLICIDAD Y PROMOCIONES

Promociones internas, slots, creatividades, segmentación, fechas, prioridad, estado, aprobación, métricas y expiración. No mezclar publicidad con contenido editorial ni ocupar hero/mapa contra decisiones de Trawel.

---

# FASE 16 — ANALYTICS

Definir primero contrato propio de eventos y después proveedor. Medir investigaciones, fallos, costes, tiempos, revisiones, correcciones, aprobaciones, rechazos, publicaciones, contribuciones, errores, biblioteca, campañas y promociones, evitando PII innecesaria.

---

# FASE 17 — OPERACIÓN, BACKUPS Y RECUPERACIÓN

Backups programados, rotación, cifrado cuando proceda, restauraciones periódicas, monitorización, avisos, exportaciones, recuperación ante corrupción, actualización controlada, mantenimiento geográfico y revisión de fuentes. Un backup no es válido si nunca fue restaurado.

---

# FASE 18 — EMPAQUETADO Y DISTRIBUCIÓN

Icono final, firma cuando sea viable, instalador, actualizaciones, configuración segura, rutas de datos, permisos, diagnóstico, exportación, desinstalación segura y guía de recuperación. `winCodeSign` se resolverá en una fase específica.

---

# 9. ESTRATEGIA DE RAMAS Y COMMITS

Para cada fase:

1. Confirmar rama y árbol limpio.
2. Crear rama específica solo cuando se justifique.
3. Ejecutar checkpoints en orden.
4. Auditar antes de modificar.
5. No mezclar fases.
6. Ejecutar pruebas.
7. Actualizar documentación después de aprobación técnica.
8. Pausa humana donde corresponda.
9. Commit lógico.
10. Push solo cuando esté autorizado.

Cada prompt indicará fuente de autoridad, alcance permitido/prohibido, archivos, pruebas, criterios de aceptación, condición de detención y política de Git.

---

# 10. ORDEN OPERATIVO INMEDIATO

1. FASE 3A — Dominio editorial canónico.
2. FASE 3B — Migraciones y repositorios.
3. FASE 3C — Identidad geográfica.
4. FASE 3D — Proveedores y fuentes.
5. FASE 3E — Estructuración factual.
6. FASE 3F — Aventura y Estudiante.
7. FASE 3G — RevisIAtor.
8. FASE 3H — Interfaz Manual.
9. FASE 3I — Resiliencia e idempotencia.
10. FASE 3J — Aceptación humana Manual.
11. Decisión humana de inicio de Automatic.

Automatic no deberá aparecer en código antes del punto 11, salvo contratos neutrales y reutilizables.

---

# 11. SIGUIENTE PASO EXACTO

```text
FASE 3A — AUDITORÍA Y CONSOLIDACIÓN DEL DOMINIO EDITORIAL CANÓNICO
```

No comenzar todavía llamadas reales a proveedores, Automatic, conexión con Trawel, publicación, contribuciones, CRM, campañas, publicidad o analytics.

---

# 12. CRITERIO DE ÉXITO GENERAL

Investighost cumplirá su objetivo cuando pueda recibir un destino, resolverlo canónicamente, investigar con fuentes, estructurar evidencias, crear Aventura y Estudiante, pasar RevisIAtor, permitir revisión humana, guardar versiones, aprobar, mantener biblioteca, preparar publicación validada, publicar solo con autorización, ejecutar Automatic sin duplicar motor, reanudar, controlar costes, auditar decisiones, operar sin SQLite y proteger producción.

---

# 13. DECISIÓN APROBADA

Esta Hoja de Ruta V3 queda aprobada como guía canónica a partir del commit:

```text
996e098
```

La ejecución podrá avanzar por FASE 3A–3I en orden y deberá detenerse en la aceptación humana de FASE 3J o ante un bloqueo real definido por el prompt maestro.
