# Investighost — cierre y punto de reanudación actual

Fecha de actualización: 2026-07-25
Estado canónico: **FASE 3J CERRADA; FASE 4A-01 COMMITTEADA; FASE 4A-01B IMPLEMENTADA TÉCNICAMENTE Y PENDIENTE DE PRUEBA HUMANA**

Este documento sustituye los puntos de reanudación anteriores. Tras quedar committeada FASE 4A-01, se autorizó exclusivamente FASE 4A-01B para exponer en Electron la navegación de la Biblioteca paginada. FASE 4A-02 y los bloques posteriores no están iniciados ni autorizados.

## 1. Decisión humana vigente

El jefe del proyecto aprobó expresamente J01–J17 y emitió la decisión inequívoca:

```text
FASE 3J — APROBADA
```

El gate humano del flujo Manual queda cerrado. La aprobación no inició ni autorizó FASE 4, Automatic, publicación, Trawel, producción, proveedores reales, IA real o carga de créditos.

## 2. Estado Git al iniciar FASE 4A-01B

- Proyecto Windows: `D:\Proyectos\investighost`.
- Ruta WSL: `/mnt/d/Proyectos/investighost`.
- Rama: `feat/investighost-reinvencion`.
- Commit funcional de cierre 3J: `ac61700f27297d899e55f6460a76a6cac7bca72a`.
- HEAD inicial de 4A-01B: `7b1dddea842d7cffd5a6a318fbcd40cbdd7850b4` (`7b1ddde`).
- Commit de FASE 4A-01: `feat: añadir contrato y paginación estable a la biblioteca`.
- Upstream: `origin/feat/investighost-reinvencion`.
- Divergencia al iniciar 4A-01B: 0 commits locales / 0 commits remotos.
- Árbol limpio al iniciar 4A-01B.

La implementación de 4A-01B permanece local y sin commit ni push hasta recibir autorización expresa.

## 3. Estado general del proyecto

- FASE 2C-C: completada.
- FASE 3A–3I: completadas técnicamente.
- FASE 3J: aprobada humanamente y cerrada.
- J01–J17: aprobados.
- FASE 4 original: no iniciada literalmente; parte de su alcance quedó cubierta y aceptada dentro de FASE 3J.
- FASE 4A-01 — contrato compartido y paginación estable: implementada y committeada en `7b1ddde`.
- FASE 4A-01B — navegación visible de la Biblioteca paginada: implementada técnicamente y pendiente de prueba humana.
- FASE 4A-02 y resto de FASE 4A: no iniciados ni autorizados.
- Automatic: no implementado.
- Flujo activo: Manual local y simulado.
- Persistencia estructurada: Supabase local/PostgreSQL.
- File store durable: Supabase Storage local.
- SQLite, Drizzle, Better SQLite, segunda base y fallbacks: ausentes.
- Trawel y producción: desconectados.
- Publicación: bloqueada por diseño.
- Publicaciones al cierre: 0.
- Proveedores e IA reales: desconectados.
- Créditos reales: no cargados ni consumidos.

## 4. Resultado consolidado J01–J08

| Escenario | Resultado aprobado |
|---|---|
| J01 | Morella se resolvió con identidad canónica GeoNames y dos borradores diferenciados. |
| J02 | La ambigüedad de San Pedro (`ZZ`) mostró Norte y Sur sin selección silenciosa. |
| J03 | La corrección humana eligió San Pedro Sur y conservó método y procedencia. |
| J04 | Una nueva investigación reutilizó el mismo destino Morella sin duplicarlo. |
| J05 | `NO_ACCEPTED_SOURCES` quedó durable, visible, clasificado y recuperable. |
| J06 | El HTTP 404 quedó como fuente `unavailable`, con detalle y evento explícito, sin ocultar la evidencia válida. |
| J07 | El proveedor no disponible produjo un fallo controlado `PERMANENT`. |
| J08 | El reintento recuperó la misma solicitud en un segundo run enlazado. |

Identificadores históricos relevantes de J07/J08:

- Request: `85630509-8ec6-4462-8fe6-9a2c036e7e20`.
- Run fallido: `f461901e-a4de-4daa-9b6c-4c0ff0e848e7`.
- Run recuperado: `d0c91fc6-7c57-4e75-9cee-1838d4ae490f`.
- El segundo run conserva `recovery_from_run_id` hacia el primero.
- Coste del intento fallido: 0,00 EUR.
- Coste del intento recuperado: 0,24 EUR.
- Se conserva una solicitud y dos runs.

## 5. Resultados J09–J12

### J09 — Interrupción y reanudación

- Se utilizó el escenario lento interrumpible.
- Electron se cerró durante la ejecución.
- Al abrir de nuevo, la Biblioteca conservó el scaffold durable.
- La acción `Reanudar` continuó desde checkpoint o etapa durable.
- La ejecución terminó sin crear otra solicitud.
- J09: **APROBADO**.

### J10 — Persistencia tras reinicio

- Tras cerrar y abrir Electron reaparecieron Biblioteca, detalle, fuentes, borradores, costes e historial.
- La evidencia mantuvo identidad y contenido.
- J10: **APROBADO**.

### J11 — Perfiles diferenciados

- Aventura priorizó ruta, preparación y riesgos.
- Estudiante priorizó presupuesto, vida diaria y estudio.
- Los perfiles no fueron una paráfrasis superficial.
- J11: **APROBADO**.

### J12 — Regeneración parcial

- Se regeneró una sola sección de Aventura.
- Se conservó Aventura v1.
- Se creó Aventura v2 enlazada.
- Solo cambió la sección seleccionada.
- RevisIAtor se recalculó.
- Evento durable: `manual.section.regenerated`.
- Coste adicional simulado: 0,02 EUR.
- J12: **APROBADO**.

## 6. J13 — Corrección editorial

Se editó deliberadamente Estudiante, sección 1.

- Se conservó Estudiante v1.
- Se creó Estudiante v2 como edición humana.
- Motivo: “Reorganizar la sección para explicar con mayor claridad qué aspectos debe comprobar un estudiante antes de alojarse en Morella, eliminando repeticiones y separando movilidad, servicios, presupuesto y seguridad.”
- Evento durable: `manual.section.edited`.
- La edición humana no añadió coste.
- J13: **APROBADO**.

## 7. J14 — Rechazo, defecto, corrección y repetición

### Primera ejecución y defecto

Aventura v3 pasó:

```text
ready → in_review → rejected
```

Se registraron `manual.review.started` y `manual.review.rejected`. El rechazo era durable, pero la UI no mostraba después su comentario, actor y fecha, y la decisión no podía reabrirse. Esto impedía auditar el criterio o reconsiderarlo.

J14 quedó bloqueado hasta corregir el defecto.

### Causa técnica

- Los eventos de revisión ya se persistían en `research_events` y en el agregado durable.
- El comentario estaba en `payload`, pero la UI no interpretaba `manual.review.*`.
- El modelo no contemplaba `rejected → in_review`.
- No existían contrato, servicio o IPC de reapertura.
- Los eventos anteriores no guardaban `draftVersion` explícito y el `actor_id` superior podía representar al creador de la solicitud en lugar del decisor.

### Corrección implementada

- La ficha de borrador muestra estado, comentario completo, actor, fecha/hora, versión, draft ID e historial cronológico.
- Se añadió `rejected → in_review`.
- La acción visible se denomina `Reabrir revisión`.
- El comentario de reapertura es obligatorio.
- Se registra `manual.review.reopened`.
- Los eventos nuevos guardan draft, versión, actor, comentario, estado anterior y estado posterior; request, run y timestamp permanecen en el evento.
- Tras reabrir vuelven a estar disponibles `Rechazar`, `Solicitar cambios` y `Aprobar`.
- El rechazo histórico obtiene la versión desde su mismo draft ID inmutable, sin modificar la evidencia original.
- No se crea versión editorial, solicitud o run.
- No se regenera contenido.
- No se añade coste.
- No se publica.

Archivos funcionales de la corrección:

- `src/shared/editorial-contracts.ts`.
- `src/shared/manual-contracts.ts`.
- `src/shared/manual-review-history.ts`.
- `src/modules/editorial-pipeline/manual-workflow.ts`.
- `src/main/index.ts`.
- `src/main/preload.ts`.
- `src/vite-env.d.ts`.
- `src/renderer/App.tsx`.
- `src/renderer/App.css`.
- `tests/editorial-contracts.test.ts`.
- `tests/manual-workflow.test.ts`.

No hay migración: se reutilizan `editorial_drafts.state`, `research_events.payload` y los checkpoints existentes.

### Repetición humana

- Se abrió Aventura v3 rechazada.
- Se consultaron comentario original, actor, fecha/hora, versión e historial.
- Se reabrió con comentario: `rejected → in_review`.
- Se rechazó nuevamente con otro comentario.
- Ambos ciclos quedaron visibles en orden cronológico.
- Aventura permaneció en v3.
- Estado final: `rejected`.
- Coste total: 0,26 EUR.
- Publicaciones: 0.
- Se conservó una sola solicitud y el mismo run.
- J14: **APROBADO tras corrección y repetición**.

## 8. J15 — Aprobación

Estudiante v2 pasó:

```text
ready → in_review → approved
```

- Eventos: `manual.review.started` y `manual.review.approved`.
- Comentario, actor, fecha, versión y draft ID permanecen visibles.
- La UI mostró: “Aprobado para biblioteca. No se ha publicado ni enviado a Trawel.”
- No se creó versión ni se añadió coste.
- J15: **APROBADO**.

## 9. J16 — Coste e historial

Versiones conservadas:

- Aventura v1.
- Aventura v2 regenerada.
- Aventura v3 edición humana, rechazada.
- Estudiante v1.
- Estudiante v2 edición humana, aprobada.

Eventos visibles:

- `manual.section.regenerated`.
- `manual.section.edited`.
- `manual.review.started`.
- `manual.review.rejected`.
- `manual.review.reopened`.
- `manual.review.approved`.

Costes reconciliados:

| Causa | Coste |
|---|---:|
| discovery | 0,02 EUR |
| reading | 0,04 EUR |
| evaluation | 0,02 EUR |
| adventure:full | 0,08 EUR |
| student:full | 0,08 EUR |
| adventure:section:highlights | 0,02 EUR |
| **Total** | **0,26 EUR** |

Las ediciones y decisiones humanas no añadieron coste.

J16: **APROBADO**.

## 10. J17 — Fronteras negativas

La evaluación confirmó desde la UI:

- `Local · Manual · Simulado`.
- Supabase local.
- Mocks deterministas.
- Publicaciones: 0.
- Publicación bloqueada por diseño.
- No existe acción visible de publicar.
- No existe envío a Trawel.
- No existe Automatic.
- No se muestran credenciales, endpoints o proveedores reales.
- Aprobar deja el contenido en biblioteca.
- Rechazar solo permite consultar o reabrir la revisión.
- La aplicación no publica tras aprobar.

J17: **APROBADO**.

## 11. Validaciones técnicas

Validación final ejecutada el 2026-07-25:

- Pruebas relevantes de contratos y flujo Manual: 15/15 aprobadas.
- Suite normal: 143 pruebas aprobadas.
- Integraciones opt-in omitidas: 8.
- Typecheck: aprobado.
- ESLint con cero warnings: aprobado.
- Builds renderer, main y preload: aprobados.
- `git diff --check`: aprobado.

No se ejecutaron integraciones Supabase que creasen solicitudes temporales ni comandos `supabase link`, `supabase db push` o `supabase db reset`.

## 12. Ruta posterior redefinida — FASE 4A

### Estado

```text
FASE 4A — CONSOLIDACIÓN OPERATIVA DE BIBLIOTECA
4A-01 IMPLEMENTADA Y COMMITTEADA
4A-01B IMPLEMENTADA TÉCNICAMENTE — PENDIENTE DE PRUEBA HUMANA
4A-02 Y BLOQUES POSTERIORES — NO INICIADOS
```

### FASE 4A-01 — contrato compartido y paginación estable

Alcance autorizado e implementado:

- Contrato Zod compartido en `src/shared/library-contracts.ts`.
- Consulta de página con tamaño predeterminado 25, mínimo 1 y máximo 100.
- Orden canónico `updated_at DESC, id DESC`.
- Cursor validado con orden, timestamp durable y request ID como desempate.
- Conservación de la precisión textual de `timestamptz` procedente de PostgreSQL.
- Keyset pagination en Supabase, sin offset y recuperando `pageSize + 1`.
- Misma semántica en el repositorio de memoria.
- Servicio, IPC, preload y tipos del renderer actualizados; la frontera IPC valida la consulta.
- El renderer deja de depender del resumen interno del repositorio; en el cierre estricto de 4A-01 todavía mostraba únicamente la primera página.
- Las métricas visibles se rotulan como datos de la página y el coste existente como coste del último run, no como coste acumulado definitivo.

El resultado de página contiene `items`, `hasMore` y `nextCursor`. No devuelve un total ni contadores globales incompletos. `hasActiveIncident` y `hasHistoricalIncident` permanecen conceptos contractualmente distintos; el cálculo histórico completo queda aplazado al read model. El coste acumulado futuro seguirá usando `editorial_execution_controls.spent_cost`.

Pruebas y validaciones:

- Pruebas específicas: 43 aprobadas.
- Suite normal: 161 aprobadas; 9 integraciones opt-in omitidas.
- Se recorrieron 137 solicitudes sintéticas con `updated_at` empatado en seis páginas, sin duplicados ni omisiones.
- Paridad memoria/Supabase probada con un doble local sin red ni persistencia humana.
- Existe una integración Supabase adicional opt-in con creación y limpieza explícitas; no se ejecutó sobre el entorno humano.
- Typecheck, ESLint y builds renderer/main/preload: aprobados.
- `git diff --check`: aprobado.

Limitaciones deliberadas:

- La navegación visible quedó fuera del commit base y se aborda separadamente en 4A-01B.
- No hay búsqueda, filtros, ordenación seleccionable, totales, contadores globales, preferencias ni archivo.
- Se conserva provisionalmente la selección del último run usada antes de 4A-01.
- La consulta no incorpora geografía, borradores, eventos ni `spent_cost`.
- La paginación garantiza recorrido estable sobre un conjunto sin mutaciones concurrentes; una política de snapshot para cambios simultáneos no forma parte de este bloque.
- No se creó ni ejecutó migración.

### FASE 4A-01B — navegación visible de Biblioteca

Alcance autorizado e implementado:

- Controles visibles `Primera página`, `Anterior`, `Actualizar` y `Siguiente`.
- Indicador `Página N` y estados explícitos de carga, Biblioteca vacía, fin de resultados y error de lectura.
- La UI utiliza `nextCursor` para avanzar y conserva en memoria una pila de los cursores usados para entrar en cada página.
- `Anterior` recupera el cursor local de la página previa; no se añadió paginación inversa a PostgreSQL.
- `Actualizar` consulta la página actual con el mismo cursor y conserva su número si sigue siendo válido.
- Un cursor que falla o deja de devolver la página esperada produce un mensaje comprensible y una acción para volver a la primera página.
- Las cargas son mutuamente excluyentes: durante una consulta se deshabilitan navegación y filas para impedir dobles pulsaciones y carreras.
- Abrir un detalle no modifica página o pila; volver a Biblioteca conserva la navegación durante la sesión de Electron.
- Crear, reintentar, reanudar, editar, regenerar, iniciar o resolver una revisión humana y cancelar reinician explícitamente la Biblioteca a página 1.
- Las métricas se rotulan como `Resumen de esta página`; no se presentan como totales globales.
- Toda la sesión de navegación vive en el renderer y desaparece al cerrar la aplicación.

Pruebas y validaciones:

- Controlador de navegación aislado: 19 pruebas aprobadas.
- Se cubren páginas 1→2→3, regreso 3→2→1, primera página, refresco, cursor vencido, doble pulsación, detalle, reinicio por mutación, Biblioteca vacía y ausencia de llamadas de escritura.
- Suite normal: 180 pruebas aprobadas; 9 integraciones opt-in omitidas.
- Typecheck, ESLint y builds renderer/main/preload: aprobados.
- `git diff --check`: aprobado.

Limitaciones:

- No se conserva página o pila al reiniciar Electron.
- No hay número total de páginas, salto a una página arbitraria ni navegación inversa en SQL.
- No se añadió una política de snapshot; una mutación concurrente puede invalidar un cursor y obliga a regresar a la primera página.
- La prueba visual desde Electron queda pendiente. Si la Biblioteca humana no supera 25 solicitudes, se usará la prueba automatizada o un fixture controlado expresamente autorizado, sin crear datos persistentes por defecto.
- No se iniciaron búsqueda, filtros, archivo, read model, contadores globales, preferencias o rediseño integral.

La FASE 4 original proponía biblioteca, CRUD durable, versiones, edición, aprobación/rechazo, historial y prueba con una persona no técnica. FASE 3J ya aceptó humanamente gran parte de esas capacidades:

- Biblioteca y detalle durables.
- Persistencia tras reinicio.
- Versiones editoriales.
- Regeneración aislada.
- Edición humana con motivo.
- Aprobación, rechazo y reapertura.
- Historial cronológico de decisiones.
- Actor, comentario, fecha y versión visibles.
- Eventos y costes auditables.
- Operación completa desde Electron.
- Cero publicación y cero conexión a Trawel.

Por ello no se debe implementar literalmente la FASE 4 anterior ni introducir un CRUD destructivo que duplique o debilite la trazabilidad existente.

### Objetivo

Convertir la Biblioteca durable existente en una herramienta cómoda y segura para gestionar un volumen creciente de investigaciones y borradores, sin lanzar nuevas investigaciones de forma implícita y sin conectar publicación, Trawel, producción, Automatic, IA o proveedores reales.

### Alcance futuro propuesto

#### Búsqueda

Prever búsqueda en datos propios por:

- destino;
- país;
- nombre o título;
- identidad geográfica canónica;
- identificador visible;
- perfil editorial;
- estado de solicitud o borrador.

Buscar en Biblioteca nunca debe lanzar proveedores, crear solicitudes, regenerar contenido o añadir coste.

#### Filtros

Prever filtros combinables por:

- estado de solicitud;
- etapa;
- incidencia;
- completada o investigando;
- lista para revisar o en revisión;
- aprobada, rechazada o archivada;
- perfil Aventura o Estudiante;
- fecha o intervalo;
- presencia o ausencia de incidencias.

La definición técnica definitiva se decidirá después de inspeccionar el volumen, repositorio y experiencia de uso; no se fija en este cierre documental.

#### Ordenación

Prever ordenación por:

- actividad más reciente;
- creación más reciente;
- creación más antigua;
- destino alfabético;
- estado;
- coste;
- última decisión editorial.

#### Archivo seguro

El comportamiento ordinario debe ser archivar, consultar archivados y restaurar. Archivar no puede borrar:

- fuentes;
- hechos;
- versiones;
- costes;
- eventos;
- decisiones humanas.

La eliminación definitiva queda fuera de FASE 4A y exigiría una política posterior específica, confirmación reforzada y reglas propias de auditoría.

#### Resumen operativo

Prever indicadores de:

- en ejecución;
- con incidencia;
- pendientes de revisión;
- en revisión;
- aprobadas;
- rechazadas;
- archivadas.

Estos contadores describen trabajo interno y nunca deben confundirse con publicaciones.

#### Navegación y experiencia

La experiencia futura debe permitir a una persona no técnica:

- localizar contenido rápidamente;
- reconocer su estado;
- abrir el detalle;
- continuar una revisión;
- distinguir incidencias;
- archivar sin perder evidencia;
- restaurar contenido archivado.

#### Terminología de RevisIAtor

RevisIAtor no se considera una dependencia externa obligatoria. FASE 4A solo debe registrar como deuda de interfaz la revisión futura de su nombre y presentación. No se elimina ni se modifica su comportamiento sin otro diseño autorizado.

### Entregables futuros

Si FASE 4A recibe autorización funcional, deberá entregar:

- inventario confirmado de capacidades existentes para evitar duplicación;
- diseño de búsqueda, filtros, ordenación y estados vacíos;
- biblioteca operable con volumen sintético suficiente;
- archivo y restauración no destructivos;
- indicadores operativos separados de publicaciones;
- preferencias persistentes cuando corresponda y esté justificado;
- pruebas automatizadas y aceptación humana desde Electron;
- documentación de invariantes, límites y resultado del gate.

### Fuera de alcance

- publicación;
- Trawel;
- producción;
- Automatic;
- IA y proveedores reales;
- créditos reales;
- cola editorial o calendario de FASE 5;
- campañas, correo o nube;
- migraciones remotas;
- nuevas jerarquías de supervisor o permisos multiusuario;
- borrado destructivo;
- rediseño integral de perfiles;
- control Extensión;
- reutilización automática del conocimiento;
- mejora editorial integral.

### Gate vigente

FASE 4A-01B debe recibir una prueba humana breve desde Electron y decisión expresa antes de commit/push o de autorizar cualquier trabajo posterior. Los criterios están en `docs/ACCEPTANCE_TESTS.md`. Esta implementación no autoriza 4A-02, búsqueda, filtros, read model, archivo, contadores, preferencias ni cualquier fase posterior.

## 13. Decisiones estratégicas pendientes

Estas decisiones se conservan como deuda futura y no autorizan implementación.

### RevisIAtor

- RevisIAtor queda fuera del alcance actual como componente obligatorio.
- La UI conserva nombres y bloques asociados.
- Su ajuste o retirada es deuda posterior.
- No se rediseña durante este cierre.

### Control futuro de extensión

- Añadir un objetivo aproximado de palabras.
- Permitir incrementos de 100 palabras.
- Configurarlo por perfil.
- Punto de partida orientativo: 800 palabras.
- Referencias futuras: Estudiante 1.800; Aventura 1.000.
- Evitar relleno artificial.
- Admitir desviaciones justificadas por la información real disponible.

### Reutilización del conocimiento

- Reutilizar datos ya investigados.
- Actualizar solo información volátil.
- Ampliar secciones concretas cuando baste.
- Rehacer completamente solo por decisión humana.
- Evitar imputar otra vez el coste completo al reutilizar conocimiento propio.
- Mantener trazabilidad de qué conocimiento se reutilizó y qué información se actualizó.
- Mantener Investighost como base maestra y reservar Trawel para una futura publicación autorizada.

### Mejora editorial futura

Aventura:

- adoptar el rol de aventurero experimentado;
- detallar rutas identificables, lugares, actividades, accesos, distancias, duración, desnivel, dificultad, terreno, condiciones, riesgos y servicios reales;
- evitar generalidades intercambiables.

Estudiante:

- adoptar el rol de profesor o divulgador cercano;
- integrar historia, fechas, hechos importantes, población aproximada, lenguas, moneda, contexto político o administrativo, patrimonio, cultura, personajes, economía, educación, vida cotidiana y sitios emblemáticos;
- explicar los datos de forma natural.

Ambos:

- producir escritura natural, sencilla, práctica, interesante y propia de cada destino;
- evitar clichés, plantillas repetidas, copia-pega y datos inventados.

## 14. Persistencia, seguridad y migraciones

- No hay migración nueva para J14 o para el cierre.
- FASE 4A-01 y 4A-01B tampoco añaden ni ejecutan migraciones, seeds o integraciones Supabase.
- No se alteró ni borró evidencia humana histórica.
- No se ejecutó `supabase link`.
- No se ejecutó `supabase db push`.
- No se ejecutó `supabase db reset`.
- No se conectó Trawel o producción.
- No se publicó.
- No se usó IA real.
- No se cargaron créditos.
- No se implementó Automatic.
- Solo se inició el bloque autorizado 4A-01B; 4A-02 no comenzó.

## 15. Siguiente trabajo

```text
EJECUTAR EL PILOTO HUMANO CONTROLADO DE FASE 4A-01B
```

La prueba propuesta es: abrir Biblioteca en página 1, avanzar a página 2, abrir una solicitud, volver conservando página 2, retroceder, regresar a la primera página y confirmar que navegar no crea solicitudes ni coste. Si no existen más de 25 solicitudes humanas, no deben crearse datos persistentes sin otra autorización; las pruebas sintéticas automatizadas demuestran el recorrido.

El commit `7b1ddde` de FASE 4A-01 ya existe en remoto. Los cambios de FASE 4A-01B deben permanecer sin commit ni push hasta autorización expresa. Aprobar este gate no autoriza automáticamente FASE 4A-02. El siguiente paso recomendado tras el gate es un piloto real controlado, manteniendo publicaciones en cero y Trawel, Automatic, producción, IA y proveedores reales desconectados.
