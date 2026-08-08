# E2E-01 — Diagnóstico Biblioteca → Trawel

Fecha: 2026-08-08

Estado: diagnóstico cerrado; no se ha conectado Trawel ni se ha realizado ninguna escritura remota

Rama de referencia: `feat/investighost-real-pipeline`

HEAD de partida: `d3f664ab7245b551ee7b174c8ddd19a5e3b28077`

## 1. Dictamen

El camino más corto y seguro hasta una prueba E2E real es:

```text
decisión humana approve_editorial_result
  → transferencia durable a Biblioteca (dos entradas v1)
  → lectura de current approved para Aventura y Estudiante
  → proyección cerrada a dos editorial_contents de Trawel en draft
  → escritura privilegiada e idempotente por IDs deterministas
  → relectura privilegiada desde Trawel
  → proyección comparable + igualdad exacta + hashes
```

No hace falta publicar, modificar Trawel visual, crear otra plataforma ni aplicar una migración nueva a la base principal. La tabla `editorial_contents` ya admite una fila por `mode`, conserva por separado los dos títulos y textos aprobados y permite guardar procedencia mínima en `metadata`. En cambio, `cities` y `destinations` solo tienen un título común para ambos modos y perderían uno de los títulos aprobados si fueran el único destino del handoff.

La primera prueba debe terminar con dos filas `draft`, `published_at = null` y cero visibilidad pública. Validará el handoff de datos, no el renderizado público de Trawel.

## 2. Evidencia inspeccionada y límites del diagnóstico

En Investighost se inspeccionaron los contratos, runtime, repositorios, migraciones y documentación de la decisión terminal, la incorporación a Biblioteca, BIB-V01–V05 y el handoff Trawel histórico. No se ejecutó el pipeline real, Tavily, OpenAI, una nueva ejecución editorial de Morella, Automatic ni una conexión Trawel.

También se inspeccionó en solo lectura el repositorio local `D:\Proyectos\trawel`. Su snapshot observado está en `main`, HEAD `d5b4f02bca0b687a24b81fbddb17c5a75a5f15dc`, 160 commits por delante de `origin/main` y con muchos cambios sin confirmar. Por ello sirve para conocer el contrato local vigente, pero no acredita por sí solo el DDL desplegado en `trawel-prod`. No se leyó ninguna credencial ni se consultó la base remota.

Referencias principales:

- `supabase/migrations/20260802090000_real_editorial_terminal_review.sql`;
- `supabase/migrations/20260802170000_real_editorial_library_transition.sql`;
- `supabase/migrations/20260806120000_real_editorial_library_versioning.sql`;
- `supabase/migrations/20260806230000_real_editorial_library_versioning_transactions.sql`;
- `supabase/migrations/20260807120000_real_editorial_library_version_history_reads.sql`;
- `src/shared/real-editorial-pilot-contracts.ts`;
- `src/shared/real-editorial-library-read-contracts.ts`;
- `src/modules/real-pipeline/real-editorial-repository.ts`;
- `src/modules/library-versioning/supabase-repository.ts`;
- `docs/TRAWEL_HANDOFF_CONTRACT.md` y `docs/TRAWEL_DATABASE_REFERENCE_FOR_INVESTIGHOST.txt`;
- en Trawel, `supabase/migrations/001_create_trawel_schema.sql`, `007_create_product_content_tables.sql`, `src/features/travelData/productContent/productContent.service.ts`, `src/features/travelData/sources/supabaseTravelData.source.ts`, `docs/INVESTIGHOST_CONTRACT.md` y `docs/INVESTIGHOST_TO_TRAWEL_HANDOFF_MANUAL.md`.

## 3. Mapa exacto del flujo actual

### 3.1 Resultado editorial aprobado

Un resultado real revisable consta de un snapshot terminal, dos artefactos editoriales inmutables (`draft_adventure` y `draft_student`), una revisión final, gaps, contradicciones, claims, evidencia y fuentes. La decisión humana `approve_editorial_result` se persiste en `real_editorial_terminal_decisions`, acepta expresamente los warnings y mueve piloto y run de `pending_human_review` a `human_approved`.

La aprobación no publica, no llama proveedores y no conecta Trawel. Los hashes de los cuatro artefactos, actor, fecha, coste ya conciliado y fronteras de cero efectos quedan fijados en la decisión.

### 3.2 Paso a Biblioteca

`moveApprovedResultToLibrary` vuelve a comprobar decisión, estado, guarda, reservas, presupuesto y artefactos. La función SQL homónima toma un advisory lock y, en una transacción:

1. crea una transferencia append-only e idempotente;
2. crea exactamente dos entradas append-only, una `adventure` y otra `student`;
3. conserva identidad geográfica, título, texto, idioma, artefactos, revisión, warnings, gaps, contradicciones, claims, evidencia, fuentes, actores, coste y timestamps;
4. deja ambas entradas como `approved_unpublished`, `ready_for_library` y `unpublished`;
5. deja `publication_count = 0`, `trawel_connected = false` y `automatic_enabled = false`;
6. mueve piloto y run a `ready_for_library` y registra auditoría.

La repetición idéntica reutiliza la misma transferencia; una repetición incompatible falla.

### 3.3 Versión aprobada que debe salir

La entrada de Biblioteca es el origen v1 inmutable. Las versiones derivadas empiezan en v2 y también son append-only. `real_editorial_library_current_approved_detail` elige para cada entrada:

1. la derivada aprobada de mayor número, si existe;
2. en otro caso, la v1 original.

Un draft, `changes_requested`, rechazo o abandono más reciente no desplaza la última aprobación. Por tanto, el handoff no debe leer sin más `real_editorial_library_entries.title/content`: debe obtener `CurrentApprovedLibraryContent` para cada `libraryEntryId` inmediatamente antes de proyectar y conservar sus hashes e identidad de versión.

### 3.4 Estado de la integración Trawel

No existe una ruta funcional Biblioteca → Trawel:

- `src/services/trawel` es un placeholder desconectado;
- `src/modules/publishing` conserva una cola histórica en memoria y `publishToTrawel` no implementa la integración;
- `TrawelHandoffContractSchema` modela el dominio genérico `ContentPiece`, no el par `current approved` de la Biblioteca real;
- no existe mapper del par Aventura/Estudiante, escritor durable, recibo de handoff, lector de verificación ni comparación de retorno;
- no existe UI necesaria para este E2E, y no debe crearse.

La decisión arquitectónica reutilizable sí está cerrada: Investighost y Trawel compartirán el Supabase productivo de Trawel; el handoff es una proyección controlada a tablas de Trawel, no una sincronización entre dos bases productivas.

## 4. Contrato Trawel observado

### 4.1 Tablas legacy

Trawel define `countries`, `cities`, `destinations` y `destination_sources`. `destinations` contiene `adventure_content_es` y `student_content_es`, pero un único `title_es`; nace como `draft` y solo `published` es visible públicamente. La fuente Supabase del frontend filtra destinos publicados y todavía no carga `destination_sources`.

Estas tablas siguen siendo útiles para resolver el catálogo territorial y, más adelante, para una ficha pública. No son el destino mínimo del contenido aprobado porque:

- el resultado actual puede representar `country`, `region`, `locality` o `zone`, no necesariamente un lugar visitable concreto;
- los UUID y slugs de país/zona pertenecen a Trawel y no están en la proyección `current approved`;
- hay dos títulos aprobados y `destinations.title_es` solo admite uno;
- categoría, tags, duración, precio, horario y destacado no se derivan legítimamente del texto.

### 4.2 Contenido editorial genérico

`editorial_contents` admite `entity_type` (`country`, `zone`, `place`, `route`, `plan`, `static_page` o `generic`), referencias territoriales, `mode` (`adventure` o `student`), `headline`, `intro`, bloques JSON, fuentes, metadatos y estados `draft`, `review`, `published` o `archived`.

La RLS local observada concede lectura pública solo a `published`; la escritura queda reservada a un rol privilegiado. El lector público actual de Trawel filtra expresamente `status = 'published'`. No hay constraint única por entidad y modo ni función transaccional de handoff.

## 5. Contrato preliminar Investighost → Trawel

### 5.1 Entrada cerrada

El comando mínimo debe recibir:

- los dos `libraryEntryId` de una misma transferencia/destino, exactamente un perfil de cada tipo;
- un target Trawel confirmado explícitamente: `entityType`, `entityId` si existe, `entitySlug`, `countrySlug` y `zoneSlug` cuando aplique;
- actor humano y confirmación explícita;
- identificador de proyecto/entorno esperado, validado sin aceptar un destino implícito.

Antes de cualquier write debe leer ambas entradas y sus dos `current approved`, comprobar mismo `transferId`, `pilotId`, `runId`, destino canónico e idioma, y exigir estado aún no publicado. Los IDs/slugs Trawel se resuelven por lectura del catálogo; nunca se inventan a partir del nombre.

### 5.2 Identidad e idempotencia

La identidad estable del intento se calcula como `handoffKey = sha256(canonical(schema, libraryEntryIds ordenados, target))`. No incluye el texto ni la versión aprobada: debe seguir resolviendo los mismos IDs aunque un retry encuentre un contenido fuente incompatible.

El payload canónico `investighost-trawel-editorial-handoff-v1` debe contener esa `handoffKey`, el target, los dos perfiles ordenados y, por perfil:

- `libraryEntryId`;
- `profile`;
- `versionId`, `versionNumber` y `revisionId` de `current approved`;
- `contentHash`, `versionHash`, `revisionHash` y `approvalDecisionId`;
- `title`, `content` y `language`.

Su `payloadFingerprint` es SHA-256 sobre la serialización canónica completa ya usada por Biblioteca. De `handoffKey` y el perfil se derivan dos UUID estables para `editorial_contents.id`. Así, un retry consulta siempre los mismos IDs: si `payloadFingerprint` y proyección coinciden, reutiliza; si la versión o cualquier campo difiere, devuelve conflicto. No depende de una constraint nueva ni de búsquedas ambiguas por slug.

Trawel no ofrece hoy una transacción para insertar las dos filas. El adaptador mínimo puede insertar/reutilizar una por una con IDs deterministas y declarar éxito solo tras releer y verificar ambas. Una interrupción puede dejar una fila privada `draft`; el retry seguro completa el par. No se debe borrar ni publicar para compensar.

### 5.3 Proyección de cada perfil

| Biblioteca `current approved` | `editorial_contents` | Regla |
|---|---|---|
| `profile` | `mode` | igualdad literal `adventure`/`student` |
| `title` | `headline` | igualdad exacta, sin recortar ni reformatear |
| `content` | `intro` | igualdad exacta, incluido el LF canónico final |
| target confirmado | `entity_type`, `entity_id`, `entity_slug`, `country_slug`, `zone_slug` | igualdad con la selección Trawel, no inferida del texto |
| procedencia y hashes | `metadata.investighost` | proyección cerrada y versionada |
| fuentes públicas mínimas | `sources` | solo título, URL, publisher/fecha/hash cuando existan; nunca raw capturado, score, coste o prompts |
| constante | `status` | `draft` |
| constante | `review_state` | `approved_in_investighost` |
| constante | `published_at` | `null` |
| constante | `highlights`, `practical_tips`, `sections` | arrays vacíos; no extraer hechos por heurística |
| constante | `what_makes_special`, `suggested_route` | `null`; no duplicar ni reinterpretar el contenido |

`metadata.investighost` debe ser una estructura cerrada, no un cajón de sastre: schema, `handoffKey`, `payloadFingerprint`, identidad de entrada y versión, hashes aprobados, perfil, idioma y target confirmado. No debe incluir costes, prompts, respuestas crudas, notas internas, datos personales, credenciales ni cabeceras.

### 5.4 Campos que deben coincidir exactamente

La comparación automática debe exigir igualdad exacta de:

- los dos perfiles, sin ausencias ni duplicados;
- `headline` frente a `title` y `intro` frente a `content`;
- target confirmado y `language = es-ES` conservado en metadata;
- `handoffKey`, `payloadFingerprint`, IDs/números/hashes de la versión aprobada;
- proyección pública permitida de fuentes, con orden canónico;
- `status = draft`, `review_state = approved_in_investighost` y `published_at = null`;
- arrays y nulos constantes del contrato.

La igualdad es de strings ya canónicos y objetos proyectados, no una similitud semántica ni un diff tolerante.

### 5.5 Campos propios de Trawel no comparables literalmente

Quedan fuera de la igualdad con Biblioteca:

- UUID y timestamps generados por Trawel, salvo los dos IDs deterministas del handoff;
- UUID de país/ciudad, slugs y clasificación territorial resueltos desde Trawel;
- `destinations.title_es`, `summary_es`, `type`, `tags`, duración, precio, horarios, consejo, `featured`, `verification_status` y `pending_verification`;
- el orden físico de claves JSON y detalles internos de PostgREST;
- estados futuros de revisión o publicación posteriores a este E2E.

Esos datos requieren selección humana o una fase pública posterior. No se derivan para hacer pasar la prueba.

## 6. Estrategia de transferencia y verificación

La prueba sintética y la real deben aplicar el mismo algoritmo:

1. leer las dos entradas y sus `current approved`;
2. construir, validar y congelar la proyección comparable esperada;
3. calcular `handoffKey`, `payloadFingerprint` y dos IDs deterministas;
4. confirmar entorno y target Trawel mediante lecturas;
5. comprobar que los IDs no existen o que contienen exactamente la misma proyección;
6. insertar/reutilizar únicamente las dos filas `draft`;
7. releer ambas desde Trawel mediante el canal privilegiado;
8. proyectarlas de vuelta al contrato comparable, ordenadas por perfil;
9. validar igualdad profunda y recalcular hashes/fingerprint;
10. releer `current approved` en Investighost y verificar que sus hashes no cambiaron durante la operación;
11. comprobar que la lectura pública/anon no devuelve esas filas y que `published_at` sigue nulo;
12. repetir el comando y demostrar reutilización sin filas adicionales.

El resultado debe distinguir `verified`, `partial_private_draft` y `conflict`; nunca puede convertir un fallo de comparación en éxito parcial. Un parcial sigue siendo privado y recuperable por retry.

La evidencia mínima durable del éxito puede vivir en las propias dos filas Trawel: IDs deterministas, `handoffKey`, `payloadFingerprint` e identidad fuente dentro de `metadata`. No hace falta mutar la entrada append-only de Biblioteca ni crear una tabla de recibos para una única prueba controlada.

## 7. Piezas reutilizables

- decisión terminal y transferencia a Biblioteca, ya transaccionales e idempotentes;
- entrada v1 y read model `current approved` de BIB-V01–V03;
- canonicalización y SHA-256 versionados de Biblioteca;
- contratos Zod estrictos y patrón repositorio/servicio de main;
- comparación determinista read-only de BIB-V05 como precedente de pureza, aunque su diff visual no es el comparador del handoff;
- cliente Supabase inyectable y dobles ya usados por los repositorios;
- catálogo y DDL local documentado de Trawel;
- `editorial_contents` y su frontera RLS `published` para lectura pública.

No son reutilizables como ruta real el placeholder `src/services/trawel`, la cola en memoria de `src/modules/publishing` ni el handoff genérico `ContentPiece` sin un mapper explícito al `current approved`.

## 8. Piezas faltantes

1. contrato Zod cerrado del par fuente, target, proyección y resultado de verificación;
2. mapper puro `current approved pair → editorial_contents drafts`;
3. IDs/fingerprint deterministas e idempotencia conflictiva;
4. puerto Trawel mínimo con `resolveTarget`, `readByIds` e `insertDraft`;
5. doble sintético y pruebas de éxito, retry, parcial, conflicto, target incorrecto y cero publicación;
6. adaptador Supabase privilegiado, sin acceso desde renderer;
7. preflight real que contraste columnas, constraints, RLS, proyecto y ausencia/conflicto de IDs;
8. verificador de retorno exacto y comprobación de invisibilidad pública;
9. selección y aprobación humana del único destino nuevo que alimentará la prueba;
10. ejecución única controlada y evidencia durable del resultado.

Ninguna de estas piezas exige UI, IPC, preload, editor, BIB-V06, Automatic o publicación.

## 9. Orden recomendado para Prompts 41–44

1. **Prompt 41 — contrato y mapper sin red:** cerrar esquemas, proyección, fingerprint/IDs, comparador exacto y puerto Trawel. No conectar nada.
2. **Prompt 42 — E2E sintético:** implementar el doble Trawel y demostrar transferencia, relectura, retry, parcial recuperable, conflictos y cero publicación con datos exclusivamente sintéticos.
3. **Prompt 43 — un único resultado real nuevo:** ejecutar solo el destino autorizado, completar decisión humana e incorporación a Biblioteca y detenerse donde el prompt exija aprobación. No transferir antes de esa aprobación.
4. **Prompt 44 — handoff real controlado:** verificar el schema remoto, hacer backup/preflight que el propio prompt exija, transferir el resultado ya aprobado sin regenerarlo, releer y demostrar coincidencia e invisibilidad pública.

Ninguno de los cuatro pasos es hoy innecesario. Parte de la infraestructura genérica existe, pero faltan el contrato específico (41), la prueba sintética (42), el resultado nuevo aprobado (43) y la ejecución/verificación real (44).

## 10. Riesgos que pueden bloquear la prueba real

- El repositorio local de Trawel no está limpio ni sincronizado con `origin/main`; debe fijarse qué commit representa el contrato autorizado sin modificar ese árbol durante este flujo.
- El DDL local no acredita que `editorial_contents`, constraints y RLS estén desplegados igual en `trawel-prod`. Prompt 44 debe comprobarlo en read-only antes de escribir.
- La documentación de Trawel contiene estados de aplicación de migraciones de épocas distintas; no se debe resolver la discrepancia por suposición.
- `editorial_contents` permite duplicados lógicos. Sin IDs deterministas, un retry podría duplicar el par.
- No hay transacción remota de dos filas. Debe probarse recuperación desde una sola fila privada sin borrar ni publicar.
- Biblioteca y Trawel usan identidades territoriales distintas. Un slug o UUID no confirmado puede asociar texto correcto al lugar incorrecto.
- Una aprobación derivada posterior puede cambiar `current approved` entre lectura y write; la segunda lectura y los hashes deben detectarlo.
- Trawel público solo consume `published` y no renderiza hoy necesariamente editorial `zone/place`. El éxito del E2E de datos no debe presentarse como publicación ni como validación visual.
- Las credenciales privilegiadas, project ref, backup/reversión y autorización humana son condiciones operativas de Prompt 44; no deben incorporarse al contrato ni imprimirse en logs.
- Las fuentes contienen material capturado e información interna que no debe copiarse íntegra. Solo viaja la proyección pública explícita.

Ante una diferencia de schema, target ambiguo, fila preexistente incompatible, fallo de RLS, cambio de hashes o imposibilidad de demostrar `draft` privado, la prueba real debe detenerse antes de publicar o continuar.

## 11. Elementos aplazados explícitamente

- publicación o cambio a `published`;
- renderizado y prueba visual en Trawel;
- creación o modificación automática de `countries`, `cities` o `destinations`;
- taxonomía, tags, resumen, datos prácticos, imágenes y promociones;
- UI, IPC, preload, renderer y editor;
- BIB-V06 y cualquier cambio al modelo de versionado;
- cola de publicación general o producción masiva;
- Automatic;
- Tavily/OpenAI fuera de la única ejecución autorizable del Prompt 43;
- migraciones nuevas en la base principal;
- sincronización bidireccional, webhooks, jobs, reintentos masivos o monitorización;
- modificación del repositorio local de Trawel;
- transferencia del resultado real ya existente usado para cerrar Biblioteca.

E2E-01 no concede autorización para ninguno de estos elementos.
