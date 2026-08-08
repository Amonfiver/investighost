# Diseño del versionado editorial de Biblioteca

Fecha: 2026-08-07

Estado: diseño técnico y de dominio cerrado; BIB-V01 a BIB-V05 implementados y cerrados

Rama de referencia: `feat/investighost-real-pipeline`

HEAD de partida: `2eb3c1eddedabb534e99d234ab424ee1064e26bf`

## 1. Dictamen y alcance

Este documento rige la implementación por gates de la edición humana y las versiones derivadas de las entradas editoriales reales de Biblioteca. No cambia por sí mismo ningún estado durable.

Dictamen vigente: **BIB-V01 A BIB-V05 CERRADOS; BIB-V06 Y GATES POSTERIORES REQUIEREN OTRA AUTORIZACIÓN**.

El resultado objetivo del bloque completo es una versión derivada aprobada internamente y todavía `unpublished`. Quedan fuera:

- modificar la entrada v1 o sus artefactos;
- regenerar Morella;
- Tavily, OpenAI o cualquier proveedor;
- nuevas fuentes obtenidas por red;
- ledger, reservas o coste;
- cola de publicación;
- Trawel, Automatic y producción;
- seleccionar o transformar payloads de publicación.

## 2. Base inspeccionada y diagnóstico

La Biblioteca real vigente se apoya en:

- `real_editorial_artifacts`, append-only, con payload y SHA-256;
- `real_editorial_terminal_decisions`, append-only;
- `real_editorial_library_transfers`, append-only e idempotente;
- `real_editorial_library_entries`, append-only, una entrada por perfil y run;
- contratos `RealEditorialLibrary*` en `src/shared/real-editorial-pilot-contracts.ts`;
- repositorio y runtime del piloto real;
- IPC de incorporación y listado;
- lectura en React del texto y su trazabilidad;
- fronteras `publication_count = 0`, `trawel_connected = false` y `automatic_enabled = false`.

La entrada v1 ya contiene título, contenido, perfil, idioma, identidad geográfica, artefacto y hash de origen, revisión final, decisión terminal, warnings, gaps, contradicciones, claims, trazas, fuentes, actores, fecha y coste del run. No contiene un hash canónico independiente del texto editorial, historial derivado, reconciliación por cambio ni decisiones por versión.

La cola de `src/modules/publishing` continúa en memoria y `src/services/trawel` es un placeholder. El contrato de handoff existente se refiere al modelo general `ContentPiece`, no enlaza una versión derivada de esta Biblioteca y no debe reutilizarse implícitamente.

Superficies inspeccionadas para fijar el diseño:

- `supabase/migrations/20260802170000_real_editorial_library_transition.sql`;
- `supabase/migrations/20260802090000_real_editorial_terminal_review.sql`;
- `supabase/migrations/20260725213000_real_editorial_pilot.sql`;
- `src/shared/real-editorial-pilot-contracts.ts` y `src/shared/real-pipeline-contracts.ts`;
- `src/modules/real-pipeline/real-editorial-repository.ts`;
- `src/main/real-editorial-pilot-runtime.ts`, `src/main/index.ts` y `src/main/preload.ts`;
- `src/vite-env.d.ts`, `src/renderer/App.tsx` y `src/renderer/App.css`;
- los contratos y servicios de publicación/Trawel;
- `docs/STATE_MACHINES.md`, `docs/ROLES_AND_PERMISSIONS.md`, `docs/TRAWEL_HANDOFF_CONTRACT.md` y el documento de reanudación.

## 3. Decisiones adoptadas

1. La entrada `real_editorial_library_entries` es la **versión raíz v1** y no se copia a una fila editable.
2. Las versiones derivadas empiezan en **v2** y forman una única cadena lineal por entrada.
3. No se permiten ramas en el MVP. Dos intentos sobre el mismo padre producen un único ganador y un conflicto stale para el otro.
4. La identidad de una versión se separa de sus guardados: una versión lógica contiene **revisiones append-only** mientras está en `draft`.
5. Enviar a revisión congela una revisión y su snapshot de trazabilidad. Desde ese momento no se añade contenido ni se reconcilian findings en esa versión.
6. `changes_requested`, `rejected`, `abandoned` y `approved` son terminales para esa versión. Cualquier cambio posterior crea la siguiente versión correlativa.
7. `superseded` no se persiste como estado. Es una etiqueta calculada para una aprobación anterior cuando existe otra aprobación con número mayor.
8. La versión aprobada vigente se calcula, no se mantiene mediante un puntero mutable.
9. El editor mínimo es híbrido: documento completo como payload canónico, con navegación visual por encabezados y anotaciones, pero sin modelo durable de secciones.
10. El diff se calcula bajo demanda y no se persiste.
11. Una afirmación nueva solo puede considerarse respaldada con fuentes ya capturadas en v1 y reconciliación humana explícita. Si requiere evidencia nueva, queda bloqueada para aprobación en este bloque.
12. Todos los writes futuros pasarán por funciones transaccionales y repositorio en main; el renderer no tendrá acceso directo a Supabase.

## 4. Alternativas descartadas

- **Editar v1:** rompe la prueba aprobada, la procedencia y el trigger append-only.
- **Duplicar v1 en una nueva tabla como versión editable:** crea dos autoridades para el origen.
- **Solo tres tablas:** no permite guardar varias revisiones sin mutar contenido o confundir guardado con versión editorial.
- **Reutilizar `editorial_drafts`:** sus FKs, cascadas, estados y semántica pertenecen al pipeline Manual, no a la proyección real inmutable.
- **Permitir ramas:** obliga a resolver merges, aprobaciones paralelas y selección de head antes de tener esa necesidad demostrada.
- **Puntero `current_approved_version_id` mutable:** introduce una actualización prescindible y riesgo de divergencia con decisiones append-only.
- **Persistir `superseded`:** reescribiría la interpretación histórica de una aprobación anterior.
- **Editor estructurado por secciones:** el contenido real se guarda como un único string y no posee IDs de sección durables.
- **Persistir el diff:** duplica datos derivados y añade problemas de versión del algoritmo.
- **Detección automática concluyente de claims:** reglas locales solo pueden producir candidatos; no pueden certificar respaldo factual.
- **Reutilizar el helper hash actual sin versión nueva:** ordena claves, pero no define completamente Unicode, whitespace, números ni paridad entre runtimes.

## 5. Identidad y linaje

### 5.1 Referencia uniforme

Una referencia de contenido es una unión cerrada:

- origen: `{ kind: "origin", entryId, versionNumber: 1, hash: originVersionHash }`;
- derivada: `{ kind: "derived", entryId, versionId, versionNumber, hash: decisionTargetHash|latestRevisionHash }`.

La UI puede presentar ambas como versiones, pero v1 continúa viviendo exclusivamente en `real_editorial_library_entries`.

### 5.2 Numeración

- v1: entrada original.
- Primera derivada: v2.
- Cada nueva versión usa `max(version_number) + 1` bajo advisory lock por `entry_id`.
- No se reutilizan números aunque una versión se rechace o abandone.
- `unique(entry_id, version_number)` es obligatorio.

### 5.3 Padre y ramas

- v2 tiene `parent_version_id = null` y `parent_hash = origin_version_hash`.
- v3+ referencia como padre la versión derivada inmediatamente anterior y su hash terminal congelado.
- Solo puede crearse una hija por `parent_hash`.
- Solo puede existir una versión no terminal (`draft` o `ready_for_review`) por entrada.
- Una nueva versión se permite cuando el head anterior está `approved`, `changes_requested`, `rejected` o `abandoned`.

El padre representa el último estado editorial intentado, aunque no estuviera aprobado. La versión aprobada vigente puede seguir siendo v1 o una versión anterior hasta que la nueva sea aprobada.

### 5.4 Versión aprobada vigente

El read model elige:

1. la derivada de mayor `version_number` con decisión terminal válida `approve`;
2. si no existe, la entrada v1.

Una aprobación anterior conserva estado `approved`, pero se muestra como `approved_historical` o `superseded` de forma derivada. No se modifica su decisión. Un draft, rechazo, abandono o solicitud de cambios más reciente no desplaza la última aprobación.

## 6. Modelo append-only

Son inmutables y prohíben `UPDATE` y `DELETE`:

- versiones;
- revisiones;
- revisiones de findings;
- decisiones humanas;
- artefactos, decisión terminal, transferencia y entrada v1 existentes.

Cada operación crea filas nuevas:

- crear versión: una versión, su revisión 1 y el baseline de trazabilidad;
- guardar: una nueva revisión dentro de la versión `draft`;
- reconciliar: una nueva revisión del finding que sustituye lógicamente a la anterior;
- enviar o decidir: una decisión nueva;
- corregir después de `changes_requested`: una versión nueva con número siguiente.

El estado de una versión no es una columna mutable. Se deriva de su secuencia de decisiones. Los read models y funciones SQL deben ignorar cualquier secuencia inválida y fallar ante corrupción, nunca reparar silenciosamente.

## 7. Canonicalización reproducible

### 7.1 Identificadores de contrato

- Canonicalización: `investighost-library-c14n-v1`.
- Payload editorial: `investighost-library-content-v1`.
- Identidad de versión: `investighost-library-version-v1`.
- Revisión: `investighost-library-revision-v1`.
- Snapshot de trazabilidad: `investighost-library-traceability-v1`.
- Target de revisión: `investighost-library-review-target-v1`.
- Algoritmo: `SHA-256`, salida hexadecimal minúscula de 64 caracteres.

Cambiar cualquiera de estas reglas exige un identificador v2; nunca se redefine v1.

### 7.2 Normalización de strings

Antes de persistir y calcular hashes:

1. rechazar NUL y secuencias Unicode no válidas;
2. retirar un único BOM inicial si existe;
3. normalizar Unicode a NFC;
4. convertir `CRLF` y `CR` a `LF`;
5. retirar espacios y tabs al final de cada línea;
6. título: eliminar whitespace exterior y rechazar saltos de línea;
7. contenido: retirar líneas vacías finales y terminar exactamente con un `LF`;
8. preservar whitespace interior, indentación, tabs no finales y líneas vacías internas;
9. rechazar título o contenido vacío tras normalizar.

El valor persistido debe ser el valor normalizado. No se permite almacenar un texto y hashear otro equivalente.

### 7.3 Nulos, vacíos y JSON

- Los campos requeridos nunca admiten `null`, `undefined` o string vacío.
- Un opcional ausente se omite; no se serializa como `null` salvo que el schema declare que `null` tiene significado.
- Arrays ordenados conservan su orden. Arrays que representan conjuntos se ordenan antes por su identificador estable y rechazan duplicados.
- Objetos se serializan mediante JSON Canonicalization Scheme, RFC 8785, sobre UTF-8 sin BOM.
- Timestamps incluidos en hashes usan UTC RFC 3339 con milisegundos y sufijo `Z`.
- Los payloads hashables no usan `NaN`, infinito, `-0` ni decimales económicos. Si un futuro contrato necesita decimales exactos, se serializan como strings normalizados.

La idea de JSON con claves ordenadas se reutiliza del pipeline real, pero este contrato sustituye `localeCompare` por una canonicalización interoperable y versionada.

### 7.4 Hashes

`content_hash`:

```text
sha256(jcs({
  schema: "investighost-library-content-v1",
  canonicalization: "investighost-library-c14n-v1",
  profile,
  language,
  title,
  content
}))
```

No incluye `entry_id`; dos textos idénticos pueden compartir `content_hash`. La identidad y procedencia se enlazan en los hashes superiores.

`origin_version_hash` se calcula sin modificar v1:

```text
sha256(jcs({
  schema: "investighost-library-origin-v1",
  entryId, entryKey, profile, language, contentHash,
  sourceArtifactId, sourceArtifactHash,
  finalReviewHash, terminalDecisionId
}))
```

`version_hash` cubre identidad y linaje:

```text
sha256(jcs({
  schema: "investighost-library-version-v1",
  entryId, versionId, versionNumber,
  parentVersionId, parentHash,
  createdBy, createdAt, creationReason
}))
```

`revision_hash` cubre el snapshot editorial:

```text
sha256(jcs({
  schema: "investighost-library-revision-v1",
  versionHash, revisionId, revisionNumber,
  previousRevisionId, previousRevisionHash,
  contentHash, createdBy, createdAt, reason
}))
```

`traceability_hash` cubre los `finding_hash` efectivos, uno por `finding_key`, ordenados por esa clave, y el `origin_version_hash`.

`decision_target_hash`, también llamado `aggregate_hash`, congela:

```text
sha256(jcs({
  schema: "investighost-library-review-target-v1",
  versionHash, revisionHash, traceabilityHash
}))
```

Enviar a revisión persiste ese target. Aprobar, solicitar cambios o rechazar deben apuntar exactamente al mismo hash. Abandonar calcula un target equivalente sobre la última revisión y trazabilidad, aunque no haya existido envío.

### 7.5 Stale writes

Todo write incluye los valores esperados relevantes:

- `expected_head_hash` al crear versión;
- `expected_state`;
- `expected_latest_revision_hash` al guardar;
- `expected_traceability_hash` al reconciliar o enviar;
- `decision_target_hash` al decidir.

La base recalcula o verifica los hashes dentro del mismo lock y transacción. Una diferencia devuelve un conflicto estable; nunca aplica el cambio sobre el head nuevo.

## 8. Máquina de estados

Estados efectivos:

- `draft`;
- `ready_for_review`;
- `changes_requested`;
- `approved`;
- `rejected`;
- `abandoned`.

`superseded` es solo una etiqueta de lectura para una aprobación histórica.

| Desde | Acción | Hacia | Actor/condición |
|---|---|---|---|
| inexistente | `create_version` | `draft` | editor; head esperado y sin versión abierta |
| `draft` | `save_revision` | `draft` | editor; hash de revisión vigente |
| `draft` | `reconcile_finding` | `draft` | editor; snapshot vigente |
| `draft` | `submit_for_review` | `ready_for_review` | editor; revisión y trazabilidad completas y congeladas |
| `draft` | `abandon` | `abandoned` | editor; motivo obligatorio |
| `ready_for_review` | `approve` | `approved` | reviewer/approver; política de aprobación satisfecha |
| `ready_for_review` | `request_changes` | `changes_requested` | reviewer; comentario y subjects concretos |
| `ready_for_review` | `reject` | `rejected` | reviewer; motivo obligatorio |

No existen transiciones desde estados terminales. Una corrección, reapertura o sustitución crea otra versión. Crear una revisión no muta la revisión anterior; “editable” significa únicamente que `draft` admite una revisión hija.

## 9. Contratos de decisiones humanas

Todas las decisiones comparten:

- `operation_key`: SHA-256 único suministrado y conservado por el llamador;
- `version_id` y `revision_id` objetivo;
- `decision_target_hash`;
- `actor_id` y snapshot de rol/capacidad;
- `expected_state` y `resulting_state`;
- `reason`, de 1 a 2.000 caracteres, sin credenciales;
- fecha autoritativa de base de datos;
- `decision_payload_hash` canónico;
- fronteras literales: cero publicaciones, Trawel falso y Automatic falso.

Contratos específicos:

- `submit_for_review`: `draft → ready_for_review`; incluye `traceability_hash`, resumen de findings y confirmación de que la revisión queda congelada.
- `approve`: `ready_for_review → approved`; incluye findings aceptados con riesgo, justificaciones y excepción de autoaprobación cuando proceda.
- `request_changes`: `ready_for_review → changes_requested`; incluye al menos un finding/claim o instrucción concreta. No devuelve la misma versión a draft.
- `reject`: `ready_for_review → rejected`; motivo terminal.
- `abandon`: `draft → abandoned`; no equivale a rechazo y no requiere reviewer.

Idempotencia:

- misma `operation_key` y mismo `decision_payload_hash`: devolver la decisión previa con `reused = true`;
- misma key y payload distinto: `IDEMPOTENCY_CONFLICT`;
- key distinta después de que el estado cambió: `STATE_CONFLICT`;
- hash objetivo antiguo: `STALE_DECISION_TARGET`;
- doble aprobación: la primera válida gana; la segunda es reutilización idéntica o conflicto, nunca otra fila terminal.

## 10. Trazabilidad y reconciliación

### 10.1 Regla general

Warnings, gaps, contradicciones, claims, evidencias, fuentes y trazas originales permanecen en v1. Ninguna versión puede borrarlos, sustituirlos ni declarar que nunca existieron. La versión derivada registra una interpretación referenciada y auditable.

Cada subject usa una `finding_key` estable:

- warning: fingerprint canónico de tipo + texto original;
- gap: ID original;
- contradicción: fingerprint canónico de tipo + texto original;
- claim: ID original o ID local `manual-claim-*` para uno nuevo.

### 10.2 Ejes formales

Un finding tiene ejes independientes:

- `subject_kind`: `warning|gap|contradiction|claim`;
- `origin`: `inherited|new`;
- `disposition`: `pending|resolved_editorially|accepted_risk|not_applicable`;
- `claim_relation`: `preserved|removed|modified|new|not_applicable`;
- `support_status`: `supported|unsupported|not_applicable`.

Combinaciones exigidas:

- heredado pendiente: `inherited + pending`;
- heredado resuelto: `inherited + resolved_editorially`, con diff y motivo;
- aceptado conscientemente: `accepted_risk`, justificación y confirmación posterior del reviewer;
- deja de aplicar: `not_applicable`, porque el texto relacionado fue eliminado o ya no formula el riesgo;
- hallazgo nuevo: `new`, inicialmente `pending`;
- claim original conservado: `preserved + supported`, reteniendo sus referencias originales;
- claim original eliminado: `removed + not_applicable`, sin borrar su procedencia;
- claim original modificado: `modified + supported|unsupported` según evidencia;
- claim nuevo respaldado: `new + supported`, bajo las reglas del apartado 11;
- claim nuevo no respaldado: `new + unsupported`, siempre bloqueante.

### 10.3 Reconciliaciones append-only

Modificar una clasificación crea una fila con la misma `finding_key`, secuencia siguiente y `supersedes_finding_id`. La fila anterior no cambia. El estado efectivo usa la secuencia más alta válida.

Cada reconciliación conserva:

- revisión de contenido objetivo;
- texto/subject original;
- ancla del diff o rango de líneas normalizadas;
- claim IDs, evidence IDs y source IDs aplicables;
- declaración del editor;
- motivo;
- actor y fecha;
- `finding_hash` e idempotency key.

Una nueva revisión editorial invalida el snapshot anterior. Puede ofrecer clasificaciones previas como ayuda, pero exige confirmarlas otra vez contra el nuevo `revision_hash`.

## 11. Afirmaciones factuales nuevas sin proveedores

### 11.1 Detección local posible

Reglas locales pueden marcar candidatos en texto añadido o modificado:

- números, fechas, precios, horarios, distancias y duraciones;
- nombres propios y topónimos;
- superlativos o afirmaciones de exclusividad;
- accesibilidad, seguridad, normativa y disponibilidad;
- URLs o referencias `[cN]` nuevas/cambiadas;
- oraciones añadidas que no se alinean con un claim original.

Esta detección es una ayuda conservadora. Un “sin candidato” no significa “sin claim”.

### 11.2 Declaración obligatoria

Para cada bloque cambiado, el editor declara una de estas opciones:

- cambio puramente editorial;
- claim original preservado;
- claim original modificado;
- claim original eliminado;
- claim nuevo.

La ausencia de declaración en un bloque factual candidato bloquea el envío a revisión.

### 11.3 Claim nuevo respaldado

Solo se considera respaldado si:

- enlaza una o más fuentes ya conservadas en v1;
- identifica el soporte concreto mediante evidence/source IDs y nota o localizador;
- no contradice claims o contradicciones originales sin resolver;
- la fuente capturada contiene el soporte, no solo una URL o título;
- un reviewer confirma la relación;
- los datos volátiles llevan advertencia de frescura cuando corresponda.

No se admite como respaldo una memoria personal, una URL nueva no capturada, una afirmación “conocida”, el propio texto editado ni una inferencia automática.

### 11.4 Bloqueos

Bloquean aprobación:

- claim nuevo o modificado `unsupported`;
- candidato factual sin declaración;
- source/evidence ID inexistente;
- soporte que no contiene la afirmación;
- contradicción confirmada aplicable al texto retenido;
- dato sensible o volátil presentado como vigente sin tratamiento de frescura;
- referencia `[cN]` rota o atribuida a otro claim.

Si hace falta una fuente nueva, el editor debe retirar/atenuar la afirmación o detenerse para una fase futura de ampliación de evidencia separada y autorizada.

## 12. Política de aprobación

### 12.1 Bloqueos absolutos

- versión o hash stale;
- estado distinto de `ready_for_review`;
- revisión o snapshot de trazabilidad cambiado tras el envío;
- subjects originales sin reconciliar;
- findings de severidad bloqueante pendientes;
- claims nuevos/modificados no respaldados;
- contradicción aplicable no resuelta;
- hash, linaje, citas o referencias inconsistentes;
- actor no autorizado o motivo ausente;
- autoaprobación sin excepción explícita y auditada;
- cualquier señal de publicación, proveedor o efecto externo.

### 12.2 Aprobación con warnings

Puede aprobarse con warnings cuando todos son no bloqueantes y cada uno está:

- `accepted_risk` con justificación específica; o
- `not_applicable` con evidencia del texto eliminado; o
- `resolved_editorially` con diff comprobable.

Pueden permanecer aceptados, según revisión humana, warnings editoriales, gaps de importancia baja/media que no sostengan afirmaciones retenidas y alertas de frescura claramente expresadas. No basta una aceptación global.

### 12.3 Justificación obligatoria

Se exige justificación para:

- cualquier `accepted_risk`;
- claim modificado que siga respaldado;
- eliminación de un claim original significativo;
- dato volátil mantenido;
- aprobación con warnings;
- excepción de autoaprobación.

Un finding se declara `resolved_editorially` solo si el contenido problemático fue corregido y el diff lo demuestra. Se declara `not_applicable` solo si el texto relacionado desapareció o dejó de formular la afirmación. Marcarlo no modifica la procedencia original.

### 12.4 Separación de dimensiones

- Calidad editorial: claridad, estructura, tono y utilidad.
- Respaldo factual: claims, evidencias, fuentes y contradicciones.
- Aceptación humana del riesgo: decisión explícita sobre warnings no bloqueantes.
- Publicación: fase futura no representada por esta máquina.

Una aprobación interna cubre las tres primeras únicamente y conserva `unpublished`.

## 13. Alcance mínimo del editor

Se adopta un modelo **híbrido con documento completo canónico**:

- el payload durable sigue siendo título + texto completo;
- el editor presenta navegación por encabezados/Markdown y anotaciones laterales;
- guardar crea un snapshot completo, no parches ni secciones persistidas;
- claims y findings se enlazan a líneas/anchors derivados, no a IDs de sección autoritativos.

Justificación:

- Aventura y Estudiante actuales son strings completos de hasta 100.000 caracteres;
- no existe estructura durable de secciones que pueda preservarse sin heurísticas;
- el documento completo produce hashes simples y verificables;
- los snapshots hacen recuperación e idempotencia más seguras;
- la navegación visual mejora UX sin introducir un segundo modelo de contenido;
- edición por sección exigiría parser, IDs, reglas de merge y migración de v1;
- un rich-text editor introduciría serializaciones no deterministas.

El primer editor debe trabajar con texto/Markdown fuente normalizado, no HTML generado.

## 14. Comparación

Casos:

- v1 frente a derivada;
- derivada frente a su padre;
- cualquier derivada frente a otra de la misma entrada.

Política:

- diff calculado bajo demanda en main;
- algoritmo versionado `investighost-library-markdown-diff-v1`;
- primera pasada por líneas, con diff intralínea por palabras en líneas sustituidas;
- Markdown tratado como fuente; el renderer escapa el contenido y nunca confía en HTML del diff;
- no se persisten hunks; solo pueden persistirse estadísticas incluidas en una decisión si se consideran parte de su auditoría;
- límite por documento: 100.000 caracteres normalizados; límite combinado: 200.000;
- si se excediera el umbral operativo de diff intralínea, degradar a diff de líneas, nunca truncar silenciosamente.

Junto al diff aparecen:

- IDs, números, estados y hashes de ambos lados;
- padre y versión aprobada vigente;
- título y conteos de líneas/palabras añadidas, retiradas y modificadas;
- warnings, gaps y contradicciones heredados con disposition efectiva;
- claims preservados, eliminados, modificados y nuevos;
- soporte y fuentes por claim;
- candidatos factuales locales no reconciliados;
- actor, motivo y fecha de cada revisión/decisión;
- aviso permanente `Sin publicar`.

## 15. Modelo de datos concreto

El modelo preliminar de tres tablas se corrige a cuatro para separar identidad de versión y revisiones inmutables.

### 15.1 `real_editorial_library_versions`

Propósito: identidad, numeración y linaje de una versión lógica.

Columnas esenciales:

- `id uuid primary key`;
- `entry_id uuid not null references real_editorial_library_entries(id) on delete restrict`;
- `version_number integer not null check (version_number >= 2)`;
- `parent_version_id uuid null references real_editorial_library_versions(id) on delete restrict`;
- `parent_hash text not null check sha256`;
- `version_hash text not null unique check sha256`;
- `creation_key text not null unique check sha256`;
- `canonicalization_version text not null`;
- `created_by uuid not null`;
- `creation_reason text not null`;
- `created_at timestamptz not null`;
- `publication_state text not null check (publication_state = 'unpublished')`.

Restricciones e índices:

- unique `(entry_id, version_number)`;
- unique `(entry_id, parent_hash)` para impedir ramas;
- índice `(entry_id, version_number desc)`;
- v2 exige `parent_version_id is null`; v3+ exige padre;
- función transaccional valida que padre y entrada coinciden y que el número es correlativo.

### 15.2 `real_editorial_library_version_revisions`

Propósito: snapshots completos e inmutables guardados mientras la versión está en draft.

Columnas esenciales:

- `id uuid primary key`;
- `version_id uuid not null references ...versions(id) on delete restrict`;
- `revision_number integer not null check (revision_number >= 1)`;
- `previous_revision_id uuid null references ...revisions(id) on delete restrict`;
- `previous_revision_hash text null check sha256`;
- `title text not null`;
- `content text not null`;
- `content_schema_version text not null`;
- `canonicalization_version text not null`;
- `content_hash text not null check sha256`;
- `revision_hash text not null unique check sha256`;
- `save_key text not null unique check sha256`;
- `reason text not null`;
- `created_by uuid not null`;
- `created_at timestamptz not null`.

Restricciones e índices:

- unique `(version_id, revision_number)`;
- unique parcial `previous_revision_id` cuando no es null, impidiendo revisiones hermanas;
- índice `(version_id, revision_number desc)`;
- revisión 1 sin previa; posteriores con previa y hash coincidentes;
- título y contenido ya canonicalizados y dentro de límites;
- solo se inserta si el estado efectivo es `draft`.

### 15.3 `real_editorial_library_version_findings`

Propósito: baseline y reconciliaciones append-only de trazabilidad para una revisión concreta.

Columnas esenciales:

- `id uuid primary key`;
- `revision_id uuid not null references ...version_revisions(id) on delete restrict`;
- `finding_key text not null`;
- `sequence integer not null check (sequence >= 1)`;
- `supersedes_finding_id uuid null references ...version_findings(id) on delete restrict`;
- enums/checks de `subject_kind`, `origin`, `disposition`, `claim_relation` y `support_status`;
- `original_reference text null`;
- `subject_text text not null`;
- `diff_anchor jsonb not null`;
- `claim_ids jsonb not null`;
- `evidence_ids jsonb not null`;
- `source_ids jsonb not null`;
- `editor_declaration text not null`;
- `rationale text not null`;
- `finding_hash text not null unique check sha256`;
- `reconciliation_key text not null unique check sha256`;
- `created_by uuid not null`;
- `created_at timestamptz not null`.

Restricciones e índices:

- unique `(revision_id, finding_key, sequence)`;
- unique parcial sobre `supersedes_finding_id`;
- índice `(revision_id, finding_key, sequence desc)`;
- FKs lógicas verificadas en RPC contra claims/evidencias/fuentes de la entrada v1;
- `unsupported` obligatorio para claim nuevo/modificado sin soporte;
- `accepted_risk` exige rationale no vacío;
- `resolved_editorially|not_applicable` exige ancla de diff;
- no se aceptan IDs externos a la procedencia v1 en este bloque.

### 15.4 `real_editorial_library_version_decisions`

Propósito: máquina de estados y decisiones humanas append-only.

Columnas esenciales:

- `id uuid primary key`;
- `version_id uuid not null references ...versions(id) on delete restrict`;
- `revision_id uuid not null references ...version_revisions(id) on delete restrict`;
- `sequence integer not null check (sequence >= 1)`;
- `operation_key text not null unique check sha256`;
- `action text not null check (...)`;
- `expected_state text not null`;
- `resulting_state text not null`;
- `revision_hash text not null check sha256`;
- `traceability_hash text not null check sha256`;
- `decision_target_hash text not null check sha256`;
- `decision_payload_hash text not null check sha256`;
- `actor_id uuid not null`;
- `actor_role_snapshot text not null`;
- `reason text not null`;
- `affected_finding_keys jsonb not null`;
- `accepted_risk_finding_keys jsonb not null`;
- `self_review_exception boolean not null default false`;
- `self_review_exception_reason text null`;
- `publication_count integer not null check (publication_count = 0)`;
- `trawel_connected boolean not null check (not trawel_connected)`;
- `automatic_enabled boolean not null check (not automatic_enabled)`;
- `decided_at timestamptz not null`.

Restricciones e índices:

- unique `(version_id, sequence)`;
- índice `(version_id, sequence desc)`;
- índice por `decision_target_hash`;
- unique parcial de una decisión terminal por versión;
- checks de pares acción/estado;
- aprobación con riesgo exige que la lista coincida exactamente con findings `accepted_risk` efectivos;
- excepción de autoaprobación exige motivo; sin excepción, creador y aprobador deben diferir cuando exista RBAC real.

### 15.5 Seguridad y borrado

Las cuatro tablas:

- RLS habilitada;
- privilegios retirados a `public`, `anon` y `authenticated`;
- lectura y RPC limitados al contexto local de main/service role;
- trigger común de rechazo de `UPDATE` y `DELETE`;
- FKs `on delete restrict`, nunca cascade;
- ninguna FK hacia publicación o Trawel.

Las funciones futuras usan advisory locks, `security definer`, `set search_path = public`, inputs tipados y verificación posterior. Este documento no contiene SQL ejecutable.

### 15.6 Read models

Se prevén vistas o queries de repositorio, no tablas mutables:

- estado efectivo de cada versión;
- última revisión de un draft;
- findings efectivos por revisión;
- versión aprobada vigente con fallback v1;
- historial cronológico completo;
- etiqueta derivada `superseded`.

## 16. Contratos y fronteras de aplicación

### 16.1 Shared

Crear en el futuro `src/shared/real-editorial-library-contracts.ts` con Zod strict para:

- referencias de origen/versión;
- contenido normalizado;
- versión y revisión;
- finding y reconciliación;
- decisiones discriminadas;
- queries de historial/comparación/current approved;
- resultados con `reused` y errores de conflicto estables;
- constantes de schemas, límites y estados.

No se amplía indefinidamente el contrato del piloto. Shared no accede a Supabase, Electron, red ni secretos.

### 16.2 Main y dominio

Un runtime propio de Biblioteca:

- valida Zod;
- obtiene o verifica el actor local;
- aplica capacidades;
- canonicaliza y calcula hashes;
- calcula diff;
- delega escrituras al repositorio;
- vuelve a validar el read model devuelto.

El repositorio de Biblioteca encapsula selects y RPCs. Ningún método del piloto inicia, reanuda o regenera investigación.

### 16.3 Preload y renderer

Preload expone solo operaciones tipadas:

- `getRealEditorialLibraryEntry`;
- `listRealEditorialLibraryVersions`;
- `createRealEditorialLibraryVersion`;
- `saveRealEditorialLibraryRevision`;
- `compareRealEditorialLibraryVersions`;
- `reconcileRealEditorialLibraryFinding`;
- `submitRealEditorialLibraryVersion`;
- `decideRealEditorialLibraryVersion`;
- `getCurrentApprovedRealEditorialLibraryVersion`.

Renderer consume read models, mantiene localmente `operation_key` hasta obtener confirmación y muestra conflictos. No recibe service role, no calcula hashes autoritativos, no ejecuta SQL y no dispone de `publish` o `enqueue`.

### 16.4 Writes transaccionales

Pasan obligatoriamente por repositorio + función SQL:

- crear versión y primera revisión;
- guardar revisión;
- reconciliar finding;
- enviar a revisión;
- aprobar, solicitar cambios, rechazar o abandonar.

Historial, detalle, comparación y current approved son lecturas. El diff no escribe.

### 16.5 Actor local y RBAC

Mientras no exista RBAC real, main acepta exclusivamente `MANUAL_LOCAL_ACTOR_ID` como operador local y no confía en un UUID libre del renderer. El snapshot registra capacidad equivalente a owner/editor/reviewer local.

La regla objetivo sigue siendo separación editor/reviewer. Como el MVP personal tiene un único actor, una autoaprobación requiere checkbox, motivo específico y `self_review_exception = true`. La excepción es visible y auditable; no se convierte en permiso de publicación.

## 17. Concurrencia, recuperación e idempotencia

### Dos editores abiertos

Ambos leen los mismos hashes. El primero que guarda bajo lock crea la revisión siguiente. El segundo recibe `STALE_REVISION`, recarga y compara; no se crea una rama ni se hace merge automático.

### Guardado sobre versión desactualizada

Se compara `expected_state`, head, última revisión y traceabilidad. Cualquier diferencia aborta toda la transacción sin filas parciales.

### Timeout después del commit

La UI conserva `operation_key` y reintenta el mismo payload. La función devuelve IDs y hashes ya confirmados con `reused = true`. También puede consultarse por key mediante el repositorio.

### Reintento divergente

Misma key y payload hash distinto devuelve `IDEMPOTENCY_CONFLICT`. No se intenta adaptar ni crear otra fila.

### Doble aprobación

El lock por versión y la decisión terminal única hacen que una sola gane. Otra key encuentra estado terminal y devuelve `STATE_CONFLICT`; la misma key/payload reutiliza.

### Aprobación contra hash antiguo

Devuelve `STALE_DECISION_TARGET`; no aprueba la última revisión por sustitución implícita.

### UI sin respuesta confirmada

Al reabrir, historial y current state muestran la operación durable. La UI reconcilia por `operation_key`, no repite con una key nueva.

### Fallo parcial

Cada write lógico es una única transacción. No puede existir versión sin revisión 1, submit sin snapshot, decisión sin target o finding efectivo a medias. Un error posterior de renderizado no revierte la confirmación durable.

## 18. Gates futuros separados

Cada gate requiere autorización expresa, commit propio y fronteras negativas verificadas. Ninguno incluye publicación o Trawel.

1. **BIB-V01 — esquema y contratos:** migración aditiva, tablas/RLS/triggers, Zod y validaciones deterministas de contenido canonicalizado; solo datos sintéticos. La producción de hashes y la paridad PostgreSQL/TypeScript quedan para BIB-V02.
2. **BIB-V02 — repositorio y transacciones:** locks, idempotencia, errores y rollback; sin IPC/UI.
3. **BIB-V03 — lectura e historial:** detalle, linaje, estado efectivo y current approved; sin writes nuevos.
4. **BIB-V04 — creación y guardado:** v2 y revisiones append-only; sin submit ni aprobación.
5. **BIB-V05 — comparación:** diff read-only y límites; sin reconciliación.
6. **BIB-V06 — trazabilidad:** baseline, reconciliaciones, candidatos locales y snapshot hash; sin decisiones terminales.
7. **BIB-V07 — decisiones humanas:** submit, approve, changes, reject, abandon y fallback v1; sin UI.
8. **BIB-V08 — interfaz:** editor híbrido, diff, findings, historial y decisiones; sin publicación.
9. **BIB-V09 — aceptación manual:** usar las entradas Morella existentes para probar exclusivamente el nuevo flujo; no repetir piloto ni incorporación.
10. **BIB-V10 — cierre documental:** resultados, invariantes, estado final y gate posterior todavía sin Trawel.

El siguiente gate no comienza automáticamente al cerrar el anterior.

BIB-V01 quedó materializado en una única migración aditiva y en el módulo shared específico. Las restricciones que necesitan observar varias filas o estado efectivo —versión abierta única, correlatividad, CAS de hashes, pertenencia de referencias, idempotencia divergente y separación real de funciones— no se simulan con estado mutable: deben resolverse bajo lock y transacción en BIB-V02.

## 19. Riesgos pendientes de implementación

- Paridad exacta RFC 8785/Unicode entre TypeScript y PostgreSQL.
- Coste de snapshots completos y diff en equipos modestos.
- Anchors de línea que cambian entre revisiones; siempre deben estar subordinados al hash.
- Falsos positivos/negativos de detectores factuales locales.
- Un único actor local obliga a una excepción de separación de funciones.
- Las referencias `[cN]` actuales no constituyen por sí solas un AST o grafo de citas.
- Fuentes capturadas pueden estar fechadas aunque sostengan el texto histórico.
- v1 no tiene `content_hash` propio; debe calcularse reproduciblemente sin alterarla.
- Las views de estado deben detectar secuencias corruptas, no ocultarlas.
- No debe filtrarse contenido o evidencia sensible por errores o logs del diff.
- El módulo general de publicación puede parecer utilizable, pero no es compatible ni durable para estas versiones.

Ninguno de estos riesgos reabre el gate de incorporación a Biblioteca. Son controles de entrada de los gates futuros.

## 20. Invariantes de aceptación del diseño

- v1 y toda su procedencia permanecen intactas.
- No hay ramas, merges o sobrescrituras silenciosas.
- Todo contenido guardado es un snapshot inmutable y hasheado.
- Toda decisión apunta a un aggregate hash congelado.
- Findings y claims se reconcilian sin borrar el original.
- Un claim nuevo no respaldado bloquea aprobación.
- Una aprobación más nueva no reescribe aprobaciones anteriores.
- La versión aprobada vigente se deriva de decisiones válidas y tiene fallback v1.
- Ningún contrato de este diseño puede encolar o publicar.
- Toda futura implementación se divide en gates autorizables.

## 21. Gate histórico autorizado tras BIB-V01

```text
SOLICITAR AUTORIZACIÓN PARA BIB-V02 — REPOSITORIO Y TRANSACCIONES,
SIN IPC, SIN UI, SIN DATOS REALES, SIN PROVEEDORES Y SIN PUBLICACIÓN
```

Esa autorización se recibió y BIB-V02 quedó implementado y validado como registra la sección siguiente. Este texto no autoriza BIB-V03.

## 22. Precisiones de implementación BIB-V02

BIB-V02 materializa el repositorio y las transacciones sin cambiar el modelo durable de cuatro tablas ni la inmutabilidad de v1. Las siguientes precisiones resuelven valores que no pueden quedar bajo control de un futuro cliente:

- los comandos de escritura reciben solo intención semántica, actor y tokens CAS; PostgreSQL determina IDs, `version_number`, `revision_number`, padres, secuencias, enlaces `supersedes` y recalcula todos los hashes;
- `request_fingerprint` se registra también en versiones, revisiones y findings; `operation_key` se comprueba globalmente contra las cuatro tablas antes de escribir;
- cada revisión comienza con findings `is_baseline = true` derivados por referencia de warnings, gaps, contradicciones y claims de v1. Una reconciliación añade otra fila, nunca actualiza la base, y la última secuencia por `finding_key` es la efectiva;
- `submit_for_review` rechaza cualquier finding efectivo todavía marcado como baseline y cualquier claim nuevo o modificado sin respaldo;
- `result_traceability_hash` conserva el resultado exacto de una reconciliación para que un retry posterior recupere el mismo snapshot aunque existan reconciliaciones posteriores;
- la lectura interna `current approved` devuelve la versión derivada aprobada de mayor número o, si no existe, v1 canonicalizada; no persiste punteros ni expone publicación.

La autoridad final de canonicalización, numeración, pertenencia, estado y hashes es PostgreSQL. TypeScript canonicaliza antes del repositorio, calcula el fingerprint que la función reconstruye y verifica, y comparte vectores deterministas con SQL. La serialización canónica ordena claves bajo el dominio versionado del contrato: sus claves son ASCII, sus enteros son seguros y no admite números no finitos ni `-0`. No se afirma compatibilidad RFC 8785 genérica para payloads arbitrarios fuera de ese dominio.

El arnés opt-in se ejecutó completo sobre una base PostgreSQL aislada con diez entradas exclusivamente sintéticas. Las cinco pruebas de instalación/paridad, transacciones, rollback, estados, idempotencia y carreras quedaron aprobadas sin omisiones; la base temporal se eliminó y no hubo datos reales ni efectos externos. BIB-V02 queda **formalmente cerrado**. BIB-V03 —lectura e historial sin writes nuevos— requirió autorización expresa independiente y queda registrado en la sección siguiente.

## 23. Precisiones de implementación BIB-V03

BIB-V03 añade exclusivamente proyecciones internas de lectura:

- `real-editorial-library-read-contracts.ts` define con Zod strict resumen, lista, detalle, revisiones, findings efectivos e históricos, decisiones, snapshot de estado, current approved y timeline;
- el puerto separa lecturas de escrituras y el adaptador Supabase usa únicamente RPC parametrizados, validando UUID de entrada y read model de salida;
- la migración `20260807120000_real_editorial_library_version_history_reads.sql` crea funciones `stable security definer`, sin tablas, triggers ni DML;
- el estado efectivo reutiliza `real_editorial_library_effective_state` de BIB-V02 y además valida secuencias, pertenencia y hashes; no existe una segunda máquina de estados TypeScript;
- un finding efectivo es la fila de mayor `sequence` para `version_id + revision_id + finding_key`, con `id` únicamente como desempate defensivo; el historial completo conserva todas las filas;
- `superseded` se calcula solo para una aprobación anterior cuando otra derivada aprobada tiene mayor `version_number`;
- current approved elige la derivada aprobada de número mayor y mantiene fallback reproducible a v1, sin puntero mutable;
- el timeline proyecta filas append-only y ordena por timestamp, número de versión, clase de evento, secuencia de origen e ID de fila;
- los flags de editabilidad y acciones son read models informativos, no autorización definitiva.

La validación PostgreSQL creó una base temporal con diez entradas sintéticas y escenarios solo-v1, draft multirrevisión, aprobaciones v2/v3, v3 abierta, riesgo aceptado, claim no respaldado, request changes, rechazo y abandono. Las seis pruebas se ejecutaron realmente y pasaron sin omisiones, incluida detección de historia y hashes corruptos, permisos y ausencia de escrituras. La base fue eliminada y no se aplicó ninguna migración a la base local principal.

BIB-V03 queda **formalmente cerrado**. Siguiente gate, solo con autorización expresa independiente:

```text
SOLICITAR AUTORIZACIÓN PARA BIB-V04 — CREACIÓN Y GUARDADO,
SIN SUBMIT, SIN DECISIONES NUEVAS, SIN UI, SIN DATOS REALES Y SIN PUBLICACIÓN
```

## 24. Precisiones de implementación BIB-V04

BIB-V04 incorpora una capa interna de aplicación, todavía desconectada de Electron y del renderer:

- `createDraft`, `saveDraft` y `recoverOperationResult` separan validación estricta, autorización local, preparación canónica, transacción BIB-V02, recibo confirmado y read-after-write BIB-V03;
- los comandos no aceptan correlativos, padres, estados, timestamps, IDs ni hashes derivados. Los límites canónicos siguen siendo 500 caracteres para título, 100.000 para contenido y 2.000 para motivo; el sobre de entrada reutiliza los máximos conservadores existentes de 1.000 y 200.000 antes de canonicalizar;
- un retry idéntico reutiliza el recibo confirmado; una operación o fingerprint divergente devuelve `IDEMPOTENCY_CONFLICT`; la recuperación exige `operation_key`, operación esperada, fingerprint esperado y actor autorizado;
- un save consulta primero el estado efectivo y CAS vigentes, pero PostgreSQL conserva la autoridad final bajo lock. Un estado no editable se presenta como `INVALID_STATE_TRANSITION` y un hash anterior como `STALE_REVISION`;
- toda respuesta exitosa se reconstruye desde detalle, revisión, estado y resumen BIB-V03. Cualquier discrepancia de identidad o hash se convierte en `HASH_MISMATCH` o `INVALID_VERSION_HISTORY`, sin compensaciones posteriores;
- la única migración nueva añade `real_editorial_library_draft_operation_receipt`, función `stable security definer` restringida a `service_role`; no crea tablas, triggers, DML ni estado mutable;
- el logging interno solo contiene operación, prefijo de clave, identidad objetivo, resultado, código seguro y duración; nunca título, contenido, credenciales o mensajes SQL.

La validación PostgreSQL opt-in creó `investighost_library_versioning_bib_v04_test`, aplicó BIB-V01 a BIB-V04 e insertó diez entradas sintéticas. Las seis pruebas reales cubrieron creación v2, múltiples revisiones, carreras create/save, retry y recuperación tras respuesta perdida, rechazo en estado terminal, rollback inducido después del insert de versión, detección de historia corrupta, v1 inmutable y publicación bloqueada. Resultado: 6/6 aprobadas sin omisiones. Las regresiones PostgreSQL BIB-V02 y BIB-V03 pasaron 5/5 y 6/6 respectivamente; todas las bases temporales se eliminaron y la base principal permaneció intacta.

BIB-V04 queda **formalmente cerrado**. Siguiente gate, solo con autorización expresa independiente:

```text
SOLICITAR AUTORIZACIÓN PARA BIB-V05 — COMPARACIÓN READ-ONLY,
SIN WRITES NUEVOS, SIN FINDINGS INTERACTIVOS, SIN UI, SIN DATOS REALES Y SIN PUBLICACIÓN
```

## 25. Precisiones de implementación BIB-V05

BIB-V05 añade una comparación interna determinista que depende exclusivamente del puerto de
lectura BIB-V03:

- los extremos son una unión cerrada entre `origin_v1` y una revisión identificada por
  `versionId + revisionId`; el servicio resuelve y valida pertenencia e historia antes de comparar;
- `compare` soporta v1 → revisión y revisión → revisión, incluso entre versiones derivadas del
  mismo artefacto; `compareToParent` exige el `previousRevisionId` inmediato y comprueba número y
  hash previo, sin fallback para una revisión 1;
- el diff usa LCS por líneas bajo `lcs-lines-v1`, con eliminación antes que adición como desempate
  fijo. Una modificación se representa como segmento `removed` seguido de `added`;
- cada segmento expone rangos de ambos lados, líneas y encabezado estable; las estadísticas cubren
  líneas añadidas, eliminadas, sin cambios, segmentos cambiados, segmentos totales y cambio de
  título;
- la canonicalización reutiliza NFC, LF, retirada de whitespace final por línea y un único LF
  final de BIB-V02. Una representación vacía se admite solo dentro del diff y no relaja el contrato
  durable de contenido;
- el resultado usa `investighost-library-comparison-v1`, incluye ambos extremos completos y genera
  un SHA-256 sobre su payload lógico mediante la serialización canónica ya existente, sin timestamp,
  UUID aleatorio ni persistencia;
- los límites son 5.000 líneas por lado y 4.000.000 de celdas LCS tras retirar prefijo y sufijo
  comunes; cualquier exceso devuelve `COMPARISON_LIMIT_EXCEEDED`;
- incompatibilidad, padre ausente, extremos inexistentes, pertenencia incorrecta e historia
  incoherente conservan errores tipados y mensajes deterministas;
- no existe migración BIB-V05: el servicio no posee puerto de escritura y el adaptador usa solo los
  RPC `stable` ya cerrados en BIB-V03.

Las 14 pruebas unitarias cubren identidad, adiciones, eliminaciones, modificaciones, bloques
separados, vacío, canonicalización, orden, estadísticas, fingerprints, límites, los tres modos de
comparación y errores de dominio. Las dos pruebas PostgreSQL se ejecutaron sobre
`investighost_library_versioning_bib_v05_test`, con una entrada y dos revisiones exclusivamente
sintéticas. Un snapshot JSONB de todas las columnas de transferencias, entradas, versiones,
revisiones, findings y decisiones fue idéntico antes y después de comparaciones repetidas; los
conteos permanecieron `1|2|8|0`, los estados de publicación continuaron bloqueados y no apareció
ninguna columna de comparación.

La validación cerró BIB-V05 con 14/14 pruebas unitarias, 2/2 PostgreSQL, regresiones PostgreSQL
BIB-V02 5/5, BIB-V03 6/6 y BIB-V04 6/6, suite normal 649/649, typecheck, lint y
`git diff --check` aprobados. Todas las bases temporales fueron eliminadas y la base local principal
no recibió las migraciones BIB-V01–V04.

BIB-V05 queda **formalmente cerrado**. Siguiente gate, solo con autorización expresa independiente:

```text
SOLICITAR AUTORIZACIÓN PARA BIB-V06 — TRAZABILIDAD,
SIN DECISIONES TERMINALES, SIN UI, SIN DATOS REALES Y SIN PUBLICACIÓN
```
