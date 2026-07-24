# Investighost — cierre y punto de reanudación actual

Fecha de actualización: 2026-07-25
Estado canónico: **FASE 3J APROBADA Y CERRADA**

Este documento sustituye los puntos de reanudación anteriores. No hay una siguiente fase autorizada.

## 1. Decisión humana vigente

El jefe del proyecto aprobó expresamente J01–J17 y emitió la decisión inequívoca:

```text
FASE 3J — APROBADA
```

El gate humano del flujo Manual queda cerrado. La aprobación no inicia ni autoriza FASE 4, Automatic, publicación, Trawel, producción, proveedores reales, IA real o carga de créditos.

## 2. Estado Git de este cierre

- Proyecto Windows: `D:\Proyectos\investighost`.
- Ruta WSL: `/mnt/d/Proyectos/investighost`.
- Rama: `feat/investighost-reinvencion`.
- HEAD inicial: `270ec3bbf373076bbd457751733de5c21f7b3324`.
- Commit base: `docs: cerrar gate humano hasta j08`.
- Upstream: `origin/feat/investighost-reinvencion`.
- Divergencia inicial con upstream: 0 commits locales / 0 commits remotos.
- La corrección de J14 y este cierre documental permanecen sin commit.
- No se hizo push.

El cierre Git requiere autorización humana expresa. Hasta recibirla no debe crearse el commit.

## 3. Estado general del proyecto

- FASE 2C-C: completada.
- FASE 3A–3I: completadas técnicamente.
- FASE 3J: aprobada humanamente y cerrada.
- J01–J17: aprobados.
- FASE 4: no iniciada y no autorizada.
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

## 12. Decisiones estratégicas pendientes

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

### Reutilización del conocimiento

- Reutilizar datos ya investigados.
- Actualizar solo información volátil.
- Ampliar secciones concretas cuando baste.
- Rehacer completamente solo por decisión humana.
- Evitar imputar otra vez el coste completo al reutilizar conocimiento propio.
- Mantener Investighost como base maestra y reservar Trawel para una futura publicación autorizada.

### Mejora editorial futura

Aventura:

- adoptar el rol de aventurero experimentado;
- detallar rutas, accesos, distancias, duración, desnivel, dificultad, terreno, condiciones, riesgos y servicios reales;
- evitar generalidades intercambiables.

Estudiante:

- adoptar el rol de profesor o divulgador cercano;
- integrar historia, fechas, población, lenguas, moneda, contexto administrativo, cultura, patrimonio, personajes, economía y sitios emblemáticos;
- explicar los datos de forma natural.

Ambos:

- producir escritura práctica, natural y propia de cada destino;
- evitar clichés, plantillas repetidas y copia-pega.

## 13. Persistencia, seguridad y migraciones

- No hay migración nueva para J14 o para el cierre.
- No se alteró ni borró evidencia humana histórica.
- No se ejecutó `supabase link`.
- No se ejecutó `supabase db push`.
- No se ejecutó `supabase db reset`.
- No se conectó Trawel o producción.
- No se publicó.
- No se usó IA real.
- No se cargaron créditos.
- No se implementó Automatic.
- No se inició FASE 4.

## 14. Siguiente trabajo

```text
NINGÚN TRABAJO POSTERIOR AUTORIZADO
```

La próxima acción permitida es únicamente el commit de cierre de FASE 3J si el jefe del proyecto lo autoriza expresamente. Tras ese commit seguirá siendo necesario un encargo nuevo para cualquier fase, funcionalidad o integración posterior.
