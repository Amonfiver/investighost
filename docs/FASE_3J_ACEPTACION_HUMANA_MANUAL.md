# FASE 3J — Acta de aceptación humana del flujo Manual

Fecha de preparación: 2026-07-21
Fecha de cierre: 2026-07-25
Estado: **APROBADA**
Responsable de decisión: jefe del proyecto

## Alcance cerrado

FASE 3J validó el único flujo Manual canónico en Electron con Supabase local, catálogo y fixtures sintéticos, y proveedores mock deterministas. La evaluación se realizó desde la interfaz sin depender de SQL para las decisiones humanas.

La aprobación de 3J:

- no publica contenido;
- no conecta Trawel o producción;
- no activa proveedores ni IA reales;
- no carga ni consume créditos reales;
- no implementa Automatic;
- no inicia ni autoriza FASE 4.

Cualquier trabajo posterior requiere un encargo nuevo y explícito.

## Configuración de aceptación

- Rama evaluada: `feat/investighost-reinvencion`.
- Base estructurada durable: Supabase local/PostgreSQL.
- File store durable: Supabase Storage local.
- Entorno visible: `Local · Manual · Simulado`.
- Publicaciones al cierre: 0.
- Destinos de prueba: Morella (`ES`) y homónimos sintéticos San Pedro (`ZZ`).
- Perfiles: Aventura y Estudiante.
- Proveedores: mocks locales deterministas.
- Trawel, producción, publicación e IA real: desconectados.

## Resultado de los escenarios obligatorios

| ID | Resultado humano confirmado | Decisión |
|---|---|---|
| J01 Destino válido | Morella se resolvió con identidad GeoNames visible; el flujo terminó con dos borradores diferenciados y sin publicación. | **APROBADO** |
| J02 Ambigüedad | San Pedro (`ZZ`) mostró Norte y Sur sin selección silenciosa. | **APROBADO** |
| J03 Corrección geográfica | La elección humana de San Pedro Sur conservó identidad, método y procedencia. | **APROBADO** |
| J04 Destino duplicado | La nueva investigación reutilizó el mismo destino canónico sin duplicar la entidad. | **APROBADO** |
| J05 Fuentes insuficientes | El fallo `NO_ACCEPTED_SOURCES` quedó durable, visible, clasificado y con acción controlada. | **APROBADO** |
| J06 Fuente rota | El HTTP 404 quedó como fuente `unavailable`, con detalle y evento explícito, mientras el pipeline conservó la evidencia válida. | **APROBADO** |
| J07 Proveedor no disponible | El primer intento falló de forma controlada con código `PERMANENT`, etapa y mensaje visibles. | **APROBADO** |
| J08 Reintento idempotente | El segundo run recuperó la misma solicitud, enlazó el run anterior y no duplicó destino ni agregado. | **APROBADO** |
| J09 Interrupción y reanudación | Tras cerrar y abrir Electron se conservó el scaffold; la ejecución se reanudó desde estado durable sin crear otra solicitud. | **APROBADO** |
| J10 Persistencia tras reinicio | Biblioteca, detalle, fuentes, borradores, costes e historial reaparecieron tras reiniciar. | **APROBADO** |
| J11 Perfiles diferenciados | Aventura y Estudiante mostraron estructuras y utilidades editoriales distintas, no una paráfrasis superficial. | **APROBADO** |
| J12 Regeneración | Se regeneró una sola sección de Aventura, se conservó la versión anterior, se creó la versión enlazada y se añadieron 0,02 EUR. | **APROBADO** |
| J13 Corrección editorial | La edición humana de Estudiante conservó v1, creó v2 y registró actor y motivo sin coste adicional. | **APROBADO** |
| J14 Rechazo y reconsideración | Tras corregir el defecto detectado, Aventura v3 conservó dos ciclos de rechazo, reapertura e historial completo sin nueva versión, solicitud, run o coste. | **APROBADO** |
| J15 Aprobación | Estudiante v2 pasó a `approved` con comentario durable y mensaje explícito de no publicación ni envío a Trawel. | **APROBADO** |
| J16 Coste e historial | Intentos, recuperación, versiones, eventos, proveedores, unidades y costes quedaron visibles y reconciliables. | **APROBADO** |
| J17 Fronteras negativas | La UI no ofreció publicación, Trawel, Automatic, credenciales, endpoints ni proveedores reales; publicaciones siguió en cero. | **APROBADO** |

## J13 — Corrección editorial confirmada

Se editó deliberadamente Estudiante, sección 1.

- Se conservó Estudiante v1.
- Se creó Estudiante v2 como edición humana.
- Motivo: “Reorganizar la sección para explicar con mayor claridad qué aspectos debe comprobar un estudiante antes de alojarse en Morella, eliminando repeticiones y separando movilidad, servicios, presupuesto y seguridad.”
- Evento durable: `manual.section.edited`.
- Coste adicional: 0 EUR.

## J14 — Defecto, corrección y repetición aprobada

### Defecto detectado

En la primera ejecución Aventura v3 pasó `ready → in_review → rejected` y registró `manual.review.started` y `manual.review.rejected`. El rechazo era durable, pero la interfaz no mostraba posteriormente el comentario, actor y fecha, ni permitía reabrir la revisión.

El defecto bloqueó inicialmente J14 porque impedía auditar el criterio, corregir una equivocación o permitir la reconsideración de un supervisor.

### Corrección aplicada

- La ficha muestra estado, comentario completo, actor, fecha/hora, versión, draft ID e historial cronológico.
- Se añadió la transición humana `rejected → in_review`.
- La acción visible se denomina `Reabrir revisión`.
- La reapertura exige comentario.
- Se registra el evento durable `manual.review.reopened`.
- Los eventos nuevos conservan request, run, draft, versión, actor, comentario y timestamp.
- Tras reabrir vuelven a estar disponibles `Rechazar`, `Solicitar cambios` y `Aprobar`.
- No se crea versión editorial, solicitud o run.
- No se regenera contenido ni se añade coste.
- No se publica.
- No fue necesaria una migración de base de datos.

El rechazo histórico anterior a la corrección conserva su payload original. La UI obtiene su versión a partir del mismo draft ID inmutable; los eventos posteriores guardan la versión explícitamente.

### Repetición humana

- Se consultó el primer rechazo y su comentario.
- Aventura v3 pasó `rejected → in_review` con comentario de reapertura.
- Se realizó un segundo rechazo con otro comentario.
- Ambos ciclos quedaron visibles en orden cronológico.
- Estado final de Aventura v3: `rejected`.
- Coste total: 0,26 EUR.
- Publicaciones: 0.
- Se conservó una sola solicitud y el mismo run.

J14 quedó **APROBADO** tras la corrección y repetición humana.

## J15–J17 — Cierre del gate

- Estudiante v2 pasó `ready → in_review → approved`.
- Se conservaron `manual.review.started` y `manual.review.approved`, comentario, actor, fecha, versión y draft ID.
- La UI mostró: “Aprobado para biblioteca. No se ha publicado ni enviado a Trawel.”
- El intento fallido y el run recuperado de J07/J08 permanecieron enlazados y reconciliables.
- Las versiones Aventura v1, v2 y v3, y Estudiante v1 y v2 permanecieron visibles.
- Los eventos editoriales y de decisión fueron consultables.
- La suma de uso simulado permaneció en 0,26 EUR.
- No apareció ninguna frontera de publicación, Trawel, Automatic o producción.

## Acta de decisión humana

- Commit base probado: `270ec3bbf373076bbd457751733de5c21f7b3324`.
- Estado del código J14 probado: cambios locales sobre el commit base, pendientes de commit de cierre.
- Fecha/hora: 2026-07-25; hora no consignada.
- Evaluador: jefe del proyecto.
- Escenarios aprobados: J01–J17.
- Defectos/bloqueos: defecto de trazabilidad y reapertura de J14 corregido y repetido; sin bloqueos pendientes para FASE 3J.
- Decisión inequívoca: **APROBADO**.
- Firma o confirmación escrita: confirmación expresa aportada por el jefe del proyecto en el encargo de cierre.

## Decisión final

**FASE 3J — APROBADA**

El gate humano queda cerrado. Esta decisión no autoriza trabajo posterior: FASE 4 no se ha iniciado, Automatic no está implementado y Trawel, producción y publicación permanecen desconectados.
