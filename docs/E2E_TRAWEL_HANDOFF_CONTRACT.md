# E2E-02 — Contrato durable Investighost → Trawel

Fecha: 2026-08-08

Estado: contrato, adaptación estructural y verificación pura implementados; transferencia real no iniciada

Rama: `feat/investighost-real-pipeline`

HEAD de partida: `ac3531f83a9974f779235ea7b8ed938e271cc7fb`

## 1. Alcance cerrado

E2E-02 implementa exclusivamente la transformación determinista:

```text
dos entradas de una misma transferencia de Biblioteca
  + current approved de cada entrada
  + target Trawel resuelto y confirmado
  → dos filas editorial_contents privadas draft
  → subconjunto comparable para igualdad exacta posterior
```

No existe cliente Supabase, write, conexión, credencial, migración, publicación, proveedor, destino real, UI, IPC, preload o renderer en este gate.

Implementación:

- contratos Zod: `src/shared/trawel-editorial-handoff-contracts.ts`;
- mapper y verificador puros: `src/modules/trawel-handoff/contract-adapter.ts`;
- export del módulo: `src/modules/trawel-handoff/index.ts`;
- pruebas sintéticas: `tests/trawel-editorial-handoff-contract.test.ts`.

## 2. Única fuente transferible

El comando exige exactamente dos elementos `LibraryTrawelApprovedSource`, uno `adventure` y otro `student`. Cada elemento une:

- una `RealEditorialLibraryEntry` durable;
- su `CurrentApprovedLibraryContent` obtenido por el read model autoritativo.

El contrato comprueba que ambos perfiles pertenecen al mismo `transferId`, `pilotId`, `runId`, decisión terminal y destino canónico. La entrada conserva obligatoriamente:

- `approved_unpublished`;
- `editorialState = approved`;
- `libraryState = ready_for_library`;
- `publicationState = unpublished`;
- `origin = real_editorial_pilot`.

No se acepta una revisión candidata, la última revisión guardada ni la versión de mayor número por su mera posición. El llamador debe aportar el resultado explícito de `current approved`; el adaptador no recibe una lista entre la que pueda elegir.

Para v1 exige:

- `source = origin_v1`;
- versión 1;
- IDs de versión/revisión y decisión derivada nulos;
- título, contenido, hashes y fecha iguales al origen v1;
- aprobación identificada por la decisión terminal humana.

Para una derivada exige:

- `source = derived`;
- `versionId`, `revisionId`, `revisionHash` y `approvalDecisionId` presentes;
- aprobación identificada por la decisión de versión.

En ambos casos recalcula `contentHash`. También recalcula `contentHash` y `originVersionHash` de v1 y rechaza cualquier divergencia antes de proyectar.

## 3. Target Trawel obligatorio

El target no se deriva del nombre editorial. Debe llegar ya resuelto y confirmado con:

- `projectRef` de 20 caracteres alfanuméricos minúsculos;
- `entityType` `country` o `zone`;
- `entityId` UUID existente en el catálogo Trawel;
- `entitySlug`, `countrySlug` y `zoneSlug` cuando corresponda;
- código de país ISO alfa-2 en mayúsculas.

Un origen `country` solo admite target `country`. `region`, `locality` y `zone` solo admiten target `zone`. El código de país debe coincidir con Biblioteca. Para `country`, `entitySlug = countrySlug` y `zoneSlug = null`; para `zone`, `entitySlug = zoneSlug`.

La confirmación literal `confirmed: true` y el `actorId` UUID son obligatorios. E2E-02 no resuelve ni consulta el target; esa lectura pertenece al adaptador controlado posterior.

## 4. Transformaciones permitidas

Solo se permiten:

1. cambiar nombres TypeScript a columnas snake_case de Trawel;
2. ordenar perfiles por `adventure`, `student` y fuentes por `sourceId`;
3. representar `publisher` o `publishedAt` ausentes como `null`;
4. proyectar de cada fuente únicamente ID, título, URL, publisher, fecha pública y `contentHash`;
5. rellenar campos no derivados con constantes seguras `null`, `[]` o `draft`;
6. añadir procedencia, hashes e identidad del handoff en `metadata.investighost`.

No se recortan, canonicalizan de nuevo, resumen, traducen, reescriben ni interpretan `title` y `content`: ya deben cumplir el contrato canónico de Biblioteca y se copian literalmente a `headline` e `intro`.

Nunca viajan captura raw de fuentes, score, costes, prompts, respuestas crudas, notas internas, PII, credenciales o cabeceras.

## 5. Proyección exacta a `editorial_contents`

Cada perfil crea una fila con:

| Campo Trawel | Valor |
|---|---|
| `id` | UUIDv8 determinista derivado de `handoffKey + profile` |
| `entity_type/id/slug`, `country_slug`, `zone_slug` | target confirmado |
| `mode` | perfil literal |
| `headline` | título `current approved` exacto |
| `intro` | contenido `current approved` exacto |
| `what_makes_special`, `suggested_route` | `null` |
| `highlights`, `practical_tips`, `sections` | `[]` |
| `sources` | proyección pública cerrada y ordenada |
| `metadata.investighost` | identidad fuente, versión aprobada, hashes, actor y hashes del handoff |
| `status` | `draft` |
| `review_state` | `approved_in_investighost` |
| `published_at` | `null` |

Los schemas son estrictos: no admiten `price`, tags, imágenes, prácticos, secciones inventadas ni campos adicionales.

## 6. Identidad, fingerprint e idempotencia futura

`handoffKey` usa el contrato `investighost-trawel-handoff-identity-v1` y cubre:

- los dos `libraryEntryId` ordenados;
- el target completo confirmado.

No cubre texto, versión o actor. Así, un retry de la misma pareja y target conserva los mismos dos IDs aunque la fuente haya cambiado de forma incompatible.

`payloadFingerprint` usa `investighost-trawel-handoff-fingerprint-v1` y cubre la proyección completa, incluido actor, procedencia, versión/revisión aprobada, título, contenido, fuentes, constantes y target. Excluye únicamente su propio valor para evitar circularidad.

Los IDs usan un UUIDv8 custom derivado mediante SHA-256 del schema de ID, `handoffKey` y perfil, con bits RFC de versión y variante fijados. Un retry posterior debe:

- reutilizar si IDs, `handoffKey`, `payloadFingerprint` y filas coinciden;
- devolver conflicto si los IDs existen con cualquier diferencia.

E2E-02 solo calcula estas identidades. No lee ni escribe Trawel.

## 7. Igualdad verificable

`verifyTrawelEditorialHandoff` acepta el payload esperado y dos filas observadas. Recalcula:

- `handoffKey` desde entrada+target;
- ambos IDs;
- `payloadFingerprint` desde toda la proyección.

Después ordena por ID y exige igualdad canónica profunda de todas las columnas del draft. Solo excluye `created_at` y `updated_at`, porque Trawel los genera. No admite comparación semántica, normalización tolerante, campos ausentes ni filas adicionales.

Resultados cerrados:

- `verified`, con `publicationState = private_draft`;
- `VALIDATION_ERROR`;
- `PAYLOAD_INTEGRITY_ERROR`;
- `ROW_SET_MISMATCH`;
- `CONTENT_MISMATCH`.

Una fila `published`, con `published_at` no nulo o con cualquier campo editorial extra no supera el contrato privado.

## 8. Campos creados o gestionados por Trawel

En este subconjunto Trawel solo crea `created_at` y `updated_at`; no se comparan con Biblioteca. Los IDs editoriales los aporta Investighost de forma determinista para habilitar idempotencia sin migración.

El catálogo territorial (`entityId` y slugs) pertenece a Trawel, pero debe resolverse antes y forma parte literal del target confirmado. Estados futuros de revisión/publicación, fichas `cities/destinations`, taxonomía, tags, imágenes, precios y horarios permanecen fuera del contrato.

## 9. Evidencia sintética

Las pruebas cubren:

- origen v1 y derivada aprobada en el mismo par;
- copia exacta de ambos títulos y textos;
- orden de entrada irrelevante;
- IDs UUIDv8, claves y fingerprint deterministas;
- mismo target + fuente distinta → mismos IDs y fingerprint distinto;
- target distinto → identidad e IDs distintos;
- perfiles duplicados, procedencia cruzada, país/tipo incorrectos y confirmación falsa;
- hash de contenido manipulado o revisión no aprobada;
- exclusión de raw, coste y campos no autorizados;
- relectura exacta con timestamps Trawel distintos;
- fila ausente, contenido alterado, estado publicado e integridad falsa;
- pureza estática: sin Supabase, fetch, Tavily, OpenAI o métodos de escritura.

Todos los fixtures son sintéticos y no contienen el resultado real existente.

## 10. Aplazado

- puerto y doble E2E de transferencia/retry parcial;
- cliente Supabase y preflight de schema/RLS;
- consulta real del target;
- write/relectura durable;
- prueba con un destino real;
- publicación y renderizado;
- UI, IPC, preload, renderer y editor;
- migraciones;
- BIB-V06, Automatic y producción masiva.

E2E-02 no autoriza ninguna conexión o transferencia.
