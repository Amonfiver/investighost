# Investighost — cierre y punto de reanudación actual

## Estado vigente — BIB-V02 implementado y pendiente de validación PostgreSQL

Fecha de actualización: 2026-08-06.

- Repositorio: `D:\Proyectos\investighost` (`/mnt/d/Proyectos/investighost` en WSL).
- Rama: `feat/investighost-real-pipeline`.
- HEAD de partida de BIB-V02: `aad3670134a6313799aff8547378eb338a35a54b`.
- Upstream: `origin/feat/investighost-real-pipeline`, sincronizado 0/0 tras `git fetch --prune origin`.
- Piloto Morella: `480d9c05-3ef7-4c44-a6f1-7762b7179a03`.
- Run: `467dc951-26f5-45f6-895c-d2f06c496d6e`.
- Transferencia a Biblioteca: `65a3fde4-0327-43f1-846b-655cab804e36`.
- Resultado editorial aprobado humanamente, con Aventura y Estudiante generados y revisados.
- Revisión automática: `passed_with_warnings`.
- Gasto final: `0,310169 EUR`; reserva: `0 EUR`; coste de Biblioteca: `0 EUR`.
- Publicaciones: `0`; Trawel y Automatic desconectados.
- Las dos entradas figuran como `Aprobado · Sin publicar`, conservan texto completo, hashes, versión 1, revisión final y decisión terminal.
- Cada entrada conserva 7 warnings, 5 gaps, 3 contradicciones, 15 claims, 29 trazas y 8 fuentes.
- La incorporación idéntica reutiliza la transferencia existente y no crea duplicados.
- La prueba humana completa de incorporación a Biblioteca quedó aprobada.

Dictamen vigente: **GATE DE INCORPORACIÓN REAL A BIBLIOTECA Y BIB-V01 FORMALMENTE CERRADOS; BIB-V02 IMPLEMENTADO PERO NO CERRADO**.

El repositorio específico, la canonicalización TypeScript, la migración transaccional autoritativa, los cinco comandos y la lectura interna de versión aprobada vigente están implementados con pruebas unitarias, contractuales y estáticas aprobadas. El daemon de Docker no estaba disponible, por lo que las cinco pruebas PostgreSQL sintéticas de migración, paridad, rollback, idempotencia y concurrencia quedaron preparadas pero no ejecutadas. BIB-V02 no puede cerrarse hasta aprobarlas. Publicación, Trawel, Automatic, regeneración de Morella y nuevas llamadas a proveedores continúan fuera de alcance.

Las secciones históricas que siguen conservan el recorrido previo y no sustituyen este estado vigente. Las secciones 18–23 fijan el cierre actual y el contrato de reanudación siguiente.

## Estado histórico — PROMPT 10D completado y conciliado

- Rama activa: `feat/investighost-real-pipeline`.
- HEAD inicial del bloque: `272268e1f16482c323dc79e232ae5e14816054d6`.
- Tavily y OpenAI tienen clientes reales detrás de un permiso estricto y una única ruta UI/IPC de conectividad; no existe ruta UI/IPC de investigación.
- Las claves se introducen desde Centro de proveedores, se cifran con `safeStorage` fuera del proyecto y nunca regresan al renderer.
- Catálogo oficial versionado: `2026-07-25.1`, moneda USD, verificado el 2026-07-25 y con revisión obligatoria desde 2026-08-25.
- Conversión `connectivity-fx-2026-07-25.1`: `1 USD = 1 EUR`, conservadora y no bancaria.
- El preflight confirmó `safeStorage`, credenciales activas, Luna, tarifas, Supabase, ledger virgen, guarda libre y límites negativos.
- A las 20:59 CEST se ejecutaron exactamente una Tavily Search basic y una OpenAI Responses con `gpt-5.6-luna`, sin retry.
- Tavily: 1 crédito y `0,008 EUR`. OpenAI: 17 tokens de entrada, 0 cacheados, 10 de salida y `0,000077 EUR`.
- Total: `0,008077 EUR`; reservas pendientes `0`; coste retenido `0`; guarda libre; publicaciones `0`.
- PROMPT 11 no se ejecutó. Morella, Trawel, producción y Automatic permanecen bloqueados.

Dictamen: **GO para preparar PROMPT 11; su ejecución sigue requiriendo otra autorización expresa.**

El historial durable bloquea una segunda prueba de conectividad. La feature flag solo se habilitó en el proceso autorizado y no quedó persistida. Las secciones históricas posteriores no amplían este alcance ni autorizan investigación.

## Pipeline real — lote PROMPT 01–10 auditado

El punto de retorno previo al pipeline real permanece protegido por la etiqueta `checkpoint/pre-real-pipeline-20260725` y por el backup externo documentado en `D:\Backups\investighost\pre-real-pipeline-20260725-0336`.

PROMPT 01 formaliza una arquitectura neutral, todavía inactiva y sin red:

- Investighost como orquestador;
- `ResearchTool` e `IntelligenceEngine` como puertos sustituibles;
- contratos Zod serializables para misión, perfiles, extensión, profundidad, límites, expediente, fuentes, evidencias, conocimiento maestro, cobertura, carencias, consultas focalizadas, rondas, decisiones y estados;
- un máximo contractual de dos rondas, sin posibilidad de tercera;
- cero credenciales, proveedores reales, migraciones, publicación o coste.

La ejecución acumulada se registra en `docs/REAL_PIPELINE_EXECUTION_REPORT.md`. PROMPT 11 y posteriores continúan fuera de alcance.

PROMPT 02 añadió originalmente el Centro de proveedores en modo simulado. PROMPT 10C conserva su validación sin red y añade clientes reales inaccesibles sin el gate completo. Tavily y OpenAI aparecen en sus categorías; el renderer solo recibe estado público y una máscara constante. Las credenciales se transportan por IPC de escritura validado, se cifran en main mediante Electron `safeStorage` y se guardan fuera del proyecto, bajo el directorio de datos de usuario. No se usa Supabase para credenciales y un backend seguro no disponible bloquea configuración y activación.

PROMPT 03 añade el ledger durable y el cortafuegos de gasto. La migración local `20260725050000_real_provider_ledger.sql` es aditiva: siete tablas nuevas conservan tarifas versionadas, presupuestos, guarda global, reservas y asientos append-only. La reserva precede a la llamada, los límites se evalúan tarea → lote → día y un resultado ambiguo conserva la reserva y exige revisión humana. La integración fue sintética, transaccional y revertida; los conteos humanos permanecieron en 13 solicitudes, 14 runs, 24 borradores y 136 eventos.

PROMPT 04 implementa Tavily Search/Extract detrás de `ResearchTool`, pero únicamente con transporte inyectable y fixtures. El transporte REST basado en `fetch` permanece bloqueado por defecto. Se conservan URL normalizada, título, contenido acotado, score, SHA-256, request IDs, créditos y fallos parciales; timeout, cancelación, límites y errores HTTP detienen la operación sin reintentos ni red real.

PROMPT 05 implementa OpenAI detrás de `IntelligenceEngine` con cliente Responses API falso y Structured Outputs derivados de Zod. Analiza solo el expediente, crea conocimiento maestro, contradicciones, carencias y consultas; genera Aventura/Estudiante y revisión final con coberturas distintas. Refusal, incomplete, JSON inválido, timeout, cancelación o intento de ampliar tras ronda 2 detienen la operación sin reintento ni red.

PROMPT 06 conecta misión, `ResearchTool`, expediente e `IntelligenceEngine` en un orquestador estrictamente limitado a dos rondas. La segunda exige carencia high/critical resoluble, consulta no repetida/equivalente, límites y presupuesto. Checkpoints con integridad y operaciones idempotentes permiten reanudar sin repetir llamadas o coste simulado. Tras ronda 2 solo se continúa a redacción o `review_required`.

PROMPT 07 añade controles visibles del pipeline real inactivo. Cada perfil puede activarse, elegir profundidad y extensión entre 800 y 4.000 palabras en pasos de 100; defaults: Aventura 1.000 y Estudiante 1.800. Las preferencias viven fuera del proyecto, sobreviven al reinicio y no ejecutan proveedores. Los prompts distinguen roles y prohíben rellenar cuando la evidencia no cubre el objetivo.

PROMPT 08 valida el pipeline integral Morella exclusivamente con dobles inyectados. El recorrido comparte una misión y un expediente, detecta una carencia de acceso, realiza una única ronda focalizada y obtiene conocimiento, Aventura 1.000, Estudiante 1.800 y revisión. El ledger simulado reserva y concilia 0,19 EUR dentro del límite de 0,20; una incidencia recuperable demuestra reanudación sin repetir Tavily ni coste. Permanecen en cero las llamadas y el coste reales, las regeneraciones, las publicaciones y los efectos externos. El protocolo humano queda preparado, pero no ejecutado por Codex.

PROMPT 09 prepara una puerta real fail-closed para un único piloto Morella, sin ejecutarlo. La política fija una tarea, concurrencia 1, aviso 0,16 EUR, presupuesto 0,20, ampliación humana máxima 0,25, límite absoluto 0,50, dos rondas y cero regeneración/publicación. El checklist exige claves configuradas sin exponerlas, proveedor activo, conexión real, modelo, tarifas, presupuesto durable, saldo cuando sea consultable, Supabase, ledger, guarda libre y cero tareas reales activas. La feature flag parte apagada, las pruebas simuladas no acreditan conexión real y no existe acción de ejecución.

PROMPT 10 cierra la auditoría con dictamen **NO-GO operativo**. Las validaciones sin red son correctas, los backups conservan sus hashes, los datos humanos permanecen 13/14/24/136 y las tablas económicas están vacías. Bloquea el piloto una divergencia de idempotencia: el servicio en memoria rechaza reutilizar una clave con parámetros distintos, pero la función SQL devuelve la reserva existente sin compararlos. También permanecen pendientes, por diseño del lote, clientes y conexiones reales, tarifas, presupuestos y sondas del preflight. El detalle y los pasos de corrección están en `docs/real-pipeline/REAL_PIPELINE_PRE_PILOT_AUDIT.md`.

PROMPT 10B resuelve aquel NO-GO con la migración aditiva `20260725183730_fix_provider_reservation_idempotency.sql`, sin modificar la migración aplicada original. Una clave existente solo devuelve la misma reserva si todos los campos de atribución, presupuesto, facturación y payload coinciden; cualquier diferencia produce `IDEMPOTENCY_CONFLICT`, tipado, sanitizado y no reintentable, sin presupuesto o ledger adicional. Las carreras idénticas/conflictivas se validaron en dos sesiones sobre una base local aislada y eliminada. Las rutas legacy de entorno, Kimi, Brave y orquestación histórica están deprecadas y bloqueadas antes de leer configuración, crear clientes, acceder a red o registrar inputs. Nuevo dictamen: **GO técnico para configurar credenciales y preparar autorización humana de PROMPT 11**. No autoriza conexiones, llamadas ni PROMPT 11.

PROMPT 10C conecta Tavily REST y OpenAI SDK/Responses a las abstracciones nuevas, pero solo tras un permiso opaco que exige feature flag, configuración, preflight, autorización humana, reserva y guarda. El catálogo `2026-07-25.1` usa datos oficiales en USD y caduca para revisión. La pantalla muestra tarifa/modelo y un preflight local con ocho estados; la acción de conectividad está deshabilitada. Todos los tests usan secretos y transportes sintéticos. No se leyeron o probaron claves reales y no hubo llamadas, créditos, tokens o coste.

PROMPT 10D añade una política exclusiva de conectividad, muestra la conversión conservadora y habilita una única acción con confirmación humana. Antes de red pasaron 20 escenarios obligatorios, cuatro pruebas de transporte, la suite completa y dos integraciones del ledger. La ejecución real produjo exactamente dos llamadas conciliadas por `0,008077 EUR`; los IDs solo se muestran enmascarados, las claves nunca se imprimieron y el segundo intento queda bloqueado. Los datos humanos conservan 13 solicitudes, 14 runs, 24 borradores y 136 eventos con sus timestamps previos.

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

- No hay migración nueva para PROMPT 10D; se reutiliza el ledger local ya aplicado.
- FASE 4A-01 y 4A-01B tampoco añadieron migraciones, seeds o integraciones Supabase.
- No se alteró ni borró evidencia humana histórica.
- No se ejecutó `supabase link`.
- No se ejecutó `supabase db push`.
- No se ejecutó `supabase db reset`.
- No se conectó Trawel o producción.
- No se publicó.
- Se usó OpenAI real una única vez para el literal de conectividad; no se generó contenido editorial.
- Se consumió 1 crédito Tavily y 27 tokens OpenAI por `0,008077 EUR` total.
- No se implementó Automatic.
- 4A-02 no comenzó y PROMPT 11 no se ejecutó.

## 15. Siguiente trabajo

```text
PREPARAR PROMPT 11 SIN EJECUTARLO
```

La conectividad mínima ya está acreditada. La próxima intervención debe releer la hoja de ruta, definir el alcance exacto de PROMPT 11 y obtener autorización humana independiente antes de cualquier investigación. No debe repetir 10D ni reutilizar su botón para Morella.

El commit `7b1ddde` de FASE 4A-01 pertenece al historial de la rama de reinvención. En la rama real actual, publicaciones, Trawel, producción y Automatic siguen bloqueados.

## 16. Estado tras PROMPT 10E

PROMPT 10E corrige el NO-GO técnico que impedía ejecutar de forma durable el piloto real. El sistema dispone ahora de:

- preflight editorial independiente del ensayo 10D;
- modo durable `real_editorial_pilot`, separado de `manual` y de la identidad futura `automatic`;
- presupuesto y guarda propios de Morella con parada automática en `0,20 EUR`;
- repositorio append-only para misión, rondas, fuentes, documentos, evidencia, conocimiento, borradores, revisión, incidencias, eventos y checkpoints;
- ledger editorial relacionado con piloto y run, sin hardcodes de `connectivity-check-10d`;
- estado `pending_human_review`;
- preparación idempotente, bloqueo de identidad duplicada y variante humana distinta;
- IPC/UI para preparar, confirmar presupuesto, observar, cancelar, reanudar y consultar resultado;
- workflow completo verificado con clientes falsos y reinicio simulado.

Las migraciones locales son:

1. `20260725213000_real_editorial_pilot.sql`;
2. `20260725214500_real_editorial_prepare_idempotency.sql`;
3. `20260725215500_real_editorial_ledger_sanitization.sql`;
4. `20260725220500_real_editorial_prepare_concurrency.sql`;
5. `20260725221500_real_editorial_connectivity_evidence.sql`.

No hay piloto real persistido todavía: la integración usó rollback y la UI no ejecutó preparación. Las 13 solicitudes Manual, 14 runs, 20 fuentes, 62 hechos, 24 borradores y 136 eventos permanecen intactos. El historial 10D conserva dos llamadas conciliadas, cero reservas pendientes y `0,008077 EUR`; 10E añadió cero gasto.

## 17. Siguiente trabajo vigente

```text
REINTENTAR PROMPT 11 SOLO CON AUTORIZACIÓN HUMANA EXPRESA
```

Antes de cualquier red, PROMPT 11 debe obtener `ready_for_real_editorial_pilot`, preparar el piloto separado, confirmar su presupuesto de `0,20 EUR` y habilitar temporalmente la feature flag editorial. Debe detenerse si hay duplicado real, reserva pendiente, guarda ocupada, tarifa no vigente o cualquier frontera negativa.

PROMPT 11 sigue sin ejecutarse. Publicación, Trawel, producción y Automatic continúan bloqueados; la prueba 10D no debe repetirse.

## 18. Cierre formal del gate real de Biblioteca

El bloque queda cerrado porque concurren todas las condiciones técnicas y humanas exigibles:

- existe una decisión terminal humana durable de aprobación y aceptación expresa de warnings;
- los artefactos fuente, el snapshot y la revisión final están identificados por ID, versión y SHA-256;
- `move_approved_result_to_library` valida estado, presupuesto conciliado, guarda libre, ausencia de reservas y coincidencia exacta de artefactos;
- la transferencia crea atómicamente una entrada Aventura y una Estudiante;
- `real_editorial_library_transfers` y `real_editorial_library_entries` son append-only, tienen claves únicas y bloquean borrado o mutación;
- la repetición idéntica devuelve la misma transferencia y cualquier divergencia de procedencia se detiene como conflicto;
- las entradas conservan procedencia editorial, decisión humana, revisión automática, warnings, gaps, contradicciones, claims, trazas y fuentes;
- constraints de base fijan coste propio `0 EUR`, cero llamadas, cero reservas, cero publicaciones y Trawel/Automatic desconectados;
- la UI distingue inequívocamente `Aprobado · Sin publicar` y no ofrece acción de publicación;
- la aceptación humana real de todo el recorrido de incorporación quedó aprobada sin duplicados.

No procede repetir el piloto, regenerar Morella ni repetir pruebas ya aprobadas. El cierre documental no autoriza ninguna transición posterior.

## 19. Siguiente bloque lógico — edición y versionado interno de Biblioteca

La secuencia correcta es:

```text
entrada v1 aprobada e inmutable
  → versión derivada interna
  → comparación y reconciliación de trazabilidad
  → revisión y aprobación humanas de la versión derivada
  → aprobado · sin publicar
  → gate posterior separado de publicación controlada
```

No debe saltarse directamente a Trawel. La Biblioteca real actual solo persiste y lista proyecciones inmutables del resultado aprobado. No dispone todavía de agregado de versiones derivadas, editor, comparación, reconciliación de hallazgos ni decisión humana específica por versión. La cola de `src/modules/publishing` sigue siendo un store temporal en memoria y `src/services/trawel` es un placeholder desconectado; ninguno constituye una ruta autorizable para estas entradas.

### Modelo mínimo propuesto

1. **Origen inmutable.** `real_editorial_library_entries` continúa siendo la versión 1 y la raíz de procedencia. Nunca se modifica su título, texto, estado, artefactos, hashes, revisión, decisión o evidencia.
2. **Versiones derivadas append-only.** Una tabla propuesta `real_editorial_library_versions` guarda versiones 2+, cada una con `entry_id`, número correlativo, padre o hash padre, título, texto, hash canónico del contenido, motivo, actor y fechas. La primera derivada referencia el hash calculado de la entrada v1; las siguientes referencian la versión previa. Crear una versión exige compare-and-set/idempotency key y no permite ramas silenciosas.
3. **Procedencia por referencia y deltas.** La versión derivada hereda por FK la procedencia completa de v1. No copia ni reescribe artefactos, warnings, gaps, contradicciones, claims, trazas o fuentes. Solo registra un snapshot hash de la evaluación y deltas explícitos.
4. **Hallazgos de versión.** Una tabla propuesta `real_editorial_library_version_findings` registra categoría (`warning`, `gap`, `contradiction` o `claim`), origen (`inherited` o `new`), estado (`pending` o `resolved`), soporte (`supported`, `unsupported` o `not_applicable`), referencia/fingerprint de origen, texto, claims/fuentes vinculados, motivo de resolución, actor y fecha. Así se distinguen warnings heredados pendientes, hallazgos resueltos y afirmaciones nuevas no respaldadas sin alterar el histórico.
5. **Decisiones append-only.** Una tabla propuesta `real_editorial_library_version_decisions` registra `submit_for_review`, `approve`, `request_changes` o `reject`, siempre contra `version_id`, hash de contenido y hash de evaluación, con actor, comentario, idempotency key y timestamp. El estado vigente se deriva del último evento válido; el contenido de la versión decidida permanece congelado.
6. **Comparación de solo lectura.** Un read model reúne v1, la versión elegida, diff de título/texto, hashes, procedencia heredada y deltas de trazabilidad. Comparar no escribe, no llama a proveedores y no genera coste.
7. **Aprobación humana separada.** La transición mínima es `draft → in_review → approved|changes_requested|rejected`. Una corrección posterior crea otra versión; no sobrescribe la rechazada/devuelta. Aprobar exige actor, comentario y aceptación o resolución explícita de los hallazgos permitidos por la política que se cierre antes de implementar.
8. **Publicación físicamente ausente.** Las nuevas tablas, contratos, servicios e IPC no incluyen `publish`, `queue`, `Trawel` ni handoff. Toda versión, incluso aprobada, conserva `unpublished` por contrato. La futura publicación requerirá otra fase, migración, adaptador, autorización humana y gate propios.

### Operaciones mínimas futuras

- abrir una entrada individual y sus versiones;
- crear una versión derivada desde un hash padre esperado;
- listar y comparar versiones;
- registrar/reconciliar hallazgos y trazabilidad de la versión;
- enviar una versión congelada a revisión;
- decidirla humanamente;
- consultar el historial completo sin editar el origen.

## 20. Invariantes, decisiones previas y superficie futura

### Invariantes no negociables

- El artefacto real, la transferencia y la entrada v1 permanecen append-only e idénticos byte a byte.
- Una versión derivada nunca cambia coste del run, ledger, reservas, piloto o run de Morella.
- Cero Tavily, OpenAI, regeneración, Trawel, Automatic y publicaciones durante todo el bloque.
- Cada versión posee hash canónico reproducible, padre verificable, número único por entrada e idempotencia conflict-aware.
- No se pierde ni se reemplaza ninguna evidencia heredada; toda resolución es un delta auditable.
- Ninguna afirmación factual nueva queda silenciosamente clasificada como respaldada.
- Aprobar contenido interno no equivale a encolar, entregar ni publicar.
- Todo write cruza contrato estricto, actor autorizado, transacción SQL y verificación posterior; el renderer no accede directamente a Supabase.

### Decisiones que deben cerrarse antes de implementar

- canonicalización exacta de título/texto/idioma antes de calcular hashes;
- editor mínimo de documento completo o edición estructurada por secciones;
- política para detectar afirmaciones nuevas sin IA: clasificación humana asistida por diff o reglas locales conservadoras;
- si un claim nuevo puede enlazarse solo a las 8 fuentes heredadas o exige una fase separada de ampliación de evidencia;
- severidades que bloquean aprobación y tratamiento explícito de los 7 warnings, 5 gaps y 3 contradicciones heredados;
- regla de linealidad, borradores simultáneos, concurrencia y recuperación tras cierre del editor;
- selección de la versión aprobada vigente sin borrar ni mutar aprobaciones anteriores;
- alcance del actor local actual frente a RBAC futuro;
- límites de tamaño, normalización de saltos de línea y estrategia de diff para textos largos;
- si los contratos de Biblioteca se extraen del archivo del piloto a un módulo propio antes de ampliarlos.

### Archivos y áreas probablemente afectados después

Existentes:

- `src/shared/real-editorial-pilot-contracts.ts` o un nuevo `src/shared/real-editorial-library-contracts.ts`;
- `src/modules/real-pipeline/real-editorial-repository.ts` o un repositorio de Biblioteca separado;
- `src/main/real-editorial-pilot-runtime.ts` o un runtime de Biblioteca separado;
- `src/main/index.ts`, `src/main/preload.ts` y `src/vite-env.d.ts` para IPC tipado;
- `src/renderer/App.tsx` y `src/renderer/App.css`, preferiblemente extrayendo detalle, editor, comparación, trazabilidad y decisión a componentes propios;
- `supabase/migrations/` mediante una migración aditiva nueva;
- tests de contratos, repositorio, migración, idempotencia, comparación, UI y fronteras negativas;
- `docs/STATE_MACHINES.md`, `docs/DATABASE_SCHEMA_PLAN.md`, `docs/ACCEPTANCE_TESTS.md` y este documento al cerrar el bloque.

Tablas actuales que se leen o referencian pero no se mutan: `real_editorial_artifacts`, `real_editorial_terminal_decisions`, `real_editorial_library_transfers`, `real_editorial_library_entries` y `real_editorial_events`. Las tablas propuestas son `real_editorial_library_versions`, `real_editorial_library_version_findings` y `real_editorial_library_version_decisions`.

Las áreas de publicación (`src/modules/publishing`, `src/services/trawel`, `src/shared/contracts.ts` y `docs/TRAWEL_HANDOFF_CONTRACT.md`) deben permanecer sin cambios durante este siguiente bloque. Se revisarán solo en la futura fase de publicación controlada.

### Siguiente paso vigente

```text
AUTORIZAR Y CERRAR EL DISEÑO DEL MODELO DE VERSIONES DERIVADAS DE BIBLIOTECA,
SIN IMPLEMENTAR PUBLICACIÓN NI CONECTAR TRAWEL
```

## 21. Diseño de versionado cerrado — PROMPT 33

La especificación `docs/REAL_EDITORIAL_LIBRARY_VERSIONING_DESIGN.md` cierra identidad, linaje sin ramas, revisiones append-only, canonicalización y hashes, estados, decisiones, findings, claims, aprobación, comparación, modelo de datos, fronteras, concurrencia e idempotencia.

Decisión principal: el modelo futuro usa cuatro tablas, separando versión y revisión para no mutar un draft al guardarlo. `superseded` será una etiqueta derivada y la versión aprobada vigente se calculará con fallback a v1, sin puntero mutable.

En PROMPT 33 no se implementaron contratos, migraciones, repositorio, runtime, IPC o UI. No se ejecutaron pruebas funcionales ni hubo proveedores, coste, regeneración, publicación, Trawel o Automatic.

Gate autorizado entonces, ya cerrado en la sección siguiente:

```text
BIB-V01 — ESQUEMA Y CONTRATOS,
SIN UI, SIN DATOS REALES, SIN PROVEEDORES Y SIN PUBLICACIÓN
```

## 22. Cierre de BIB-V01 — esquema y contratos

BIB-V01 quedó implementado sin tocar datos reales ni conectar ninguna frontera runtime:

- una única migración aditiva crea `real_editorial_library_versions`, `real_editorial_library_version_revisions`, `real_editorial_library_version_findings` y `real_editorial_library_version_decisions`;
- v1 permanece solo en `real_editorial_library_entries`, inmutable y referenciada como origen;
- las cuatro tablas nuevas usan `ON DELETE RESTRICT`, RLS, grants mínimos y el trigger append-only ya existente;
- el linaje v2+, revisiones completas, findings reconciliados y decisiones humanas conservan hashes SHA-256, claves de operación, actor y auditoría;
- aprobación sigue significando exclusivamente `approved · unpublished`; las decisiones fijan a cero publicación y mantienen Trawel y Automatic desconectados;
- `src/shared/real-editorial-library-contracts.ts` concentra enums, identificadores, contenido canonicalizado, read models, comandos todavía desconectados, resultados y errores previstos;
- `investighost-library-c14n-v1` es el único contrato aceptado, pero BIB-V01 no produce hashes ni afirma paridad entre PostgreSQL y TypeScript;
- las pruebas nuevas cubren Zod, transiciones deterministas, payloads válidos e inválidos, tipos y estructura estática de la migración.

No se implementaron repositorio, funciones transaccionales de dominio, IPC, preload, UI, editor, diff ni decisiones runtime. Tampoco se aplicó la migración a una base: el daemon de Docker no estaba en ejecución y no se inició forzosamente. La CLI local de Supabase `2.109.1` estaba disponible vía Windows, pero no podía validar PostgreSQL sin ese daemon; la validación SQL dinámica queda pendiente para un entorno local sintético autorizado.

Las invariantes que necesitan concurrencia o consultas cruzadas quedan explícitamente para BIB-V02: una sola versión abierta por entrada, numeración correlativa, coincidencia de hashes CAS, estado efectivo, pertenencia de procedencia, idempotencia conflict-aware, listas exactas de riesgo y separación de funciones.

Siguiente gate, solo con autorización expresa:

```text
BIB-V02 — REPOSITORIO Y TRANSACCIONES,
SIN IPC, SIN UI, SIN DATOS REALES, SIN PROVEEDORES Y SIN PUBLICACIÓN
```

## 23. Estado de BIB-V02 — implementación pendiente de validación dinámica

Se implementó exclusivamente el alcance autorizado:

- `src/modules/library-versioning/` separa canonicalización/hashes, autorización del actor local, orquestación semántica, puerto de repositorio y adaptador Supabase;
- la migración `20260806230000_real_editorial_library_versioning_transactions.sql` añade fingerprints a todas las escrituras y funciones `security definer` para crear versión, guardar revisión, reconciliar finding, enviar a revisión, decidir y consultar current approved;
- PostgreSQL adquiere advisory lock por `operation_key` y por entrada o versión, deriva el estado desde decisiones append-only, asigna correlativos y padres, recalcula hashes y aplica CAS;
- v1 continúa exclusivamente en `real_editorial_library_entries`: se lee para canonicalizar el origen y validar referencias, pero nunca se actualiza, copia ni migra;
- los findings baseline hacen explícito qué procedencia heredada falta por reconciliar; las filas posteriores sustituyen lógicamente a la secuencia anterior sin mutarla;
- aprobación revalida findings, claims, lista exacta de riesgos y separación de funciones. El único actor local requiere excepción de autoaprobación expresa y motivada;
- todas las salidas conservan `unpublished`; no existe ruta IPC, preload, renderer, editor, diff, cola ni adaptador de publicación.

Validación ejecutada sin red ni datos reales:

- contratos BIB-V01/BIB-V02 y pruebas de repositorio/canonicalización: 24 aprobadas;
- `typecheck`: aprobado;
- `lint`: aprobado;
- arnés transaccional PostgreSQL: 5 pruebas preparadas, omitidas porque Docker no estaba disponible;
- no se aplicó ninguna migración ni se insertó ningún fixture en la base humana.

El arnés opt-in crea una base aislada, clona solo el esquema, inserta diez entradas sintéticas con triggers/FKs temporalmente desactivados en esa base y prueba: paridad TypeScript/PostgreSQL; v2/v3; current approved; procedencia; findings/claims; submit y decisiones; estados terminales; rollback; retries idénticos/divergentes; y carreras create/save/submit/doble approve/approve-vs-reject, incluida una colisión concurrente con la misma key y payload distinto. La base se elimina al terminar.

Gate vigente, que debe completarse antes de autorizar BIB-V03:

```text
INICIAR SUPABASE LOCAL CON DOCKER Y EJECUTAR:
RUN_LIBRARY_VERSIONING_INTEGRATION=1 npx vitest run --config vitest.config.ts \
  tests/real-editorial-library-versioning-supabase.integration.test.ts

SI LAS 5 PRUEBAS PASAN, REEJECUTAR TYPECHECK, LINT, TESTS DEL BLOQUE Y DIFF-CHECK;
SOLO ENTONCES CERRAR BIB-V02. NO AVANZAR TODAVÍA A BIB-V03.
```
