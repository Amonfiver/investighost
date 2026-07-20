# Máquinas de estado canónicas

## Producción

`pending → researching → structured → drafted → under_review → approved|rejected|drafted`; cualquier etapa operativa puede ir a `error`; `error → pending` mediante retry explícito. Publicación no modifica producción.

## Publicación

`not_published → queued → scheduled|publishing → published|failed`; queued/scheduled/failed pueden pausarse; `paused → queued|scheduled`; cualquier estado no activo puede archivarse. `published → archived` representa retirada lógica, nunca borrado destructivo.

## Moderación

`submitted → pending_review → approved|rejected`; el autor puede pasar a `withdrawn` antes de publicación; un aprobado puede pasar a `removed` con decisión y motivo auditados.

## Campañas de comunicación (FASE 10)

`draft → pending_approval → scheduled → sending → sent`; pending/scheduled/sending pueden pasar a `paused` o `failed`; antes de sending puede cancelarse; terminales pueden archivarse. Sin aprobación legal, remitente y baja no se abandona draft.

## Anuncios

`draft → pending_review → approved → scheduled → active → expiring → expired → archived`; approved/scheduled/active pueden pausarse; review puede rechazar; un anuncio vencido nunca vuelve a active sin nueva reserva/aprobación.

## Verificación

`pending → partially_verified → verified`; cualquier estado puede pasar a `disputed` con evidencia contradictoria; `disputed → partially_verified|verified` exige revisión humana.

Las transiciones de producción/publicación ejecutables están en `src/shared/contracts.ts`. Las demás quedan documentales hasta su fase de implementación.

## Automatic / campañas de investigación — futuro

Automatic no define ahora un enum alternativo para producción: cada destino conserva las máquinas canónicas de producción, verificación, revisión y publicación. La futura máquina de orquestación solo gobernará campaña/objetivo (preparación, ejecución, pausa, finalización, retry o fallo) y nunca sustituirá el estado editorial del resultado.

Los nombres orientativos del parche adjunto no se adoptan aún como contrato. Antes se diseñarán transiciones, invariantes de reanudación, bloqueo, idempotencia, límites de coste y parada segura. Publicación seguirá separada y ningún estado de campaña implicará `approved`, `publication_ready` ni `published`.

## Importación de contribuciones — reutilizable en Supabase local

`pending → downloading → verifying → imported → deleting_remote → completed`.

- Un fallo recuperable desde descarga/verificación pasa a `retry_pending`; el reintento vuelve a `downloading` solo para ese registro.
- Un fallo permanente o el quinto intento pasa a `failed`; requiere acción manual.
- Un fallo de borrado conserva `deleting_remote` con error y próxima acción; nunca revierte ni duplica la copia verificada en PostgreSQL/Storage local.
- `completed` exige transacción PostgreSQL confirmada, Zod, tamaños, SHA-256, objetos Storage completos, backup reciente y confirmación del borrado mock/remoto.
- Ningún fallo de job cancela los demás jobs del `ImportBatch`.
- Los estados sobreviven como lógica de dominio; desde FASE 2C-B la persistencia activa de contribuciones es Supabase local y FASE 2C-C retiró completamente el legado operativo SQLite. No se rediseñaron estados ni se introdujo Automatic.

## Pipeline editorial V3 — FASE 3A

Investigación: `draft → queued → researching → structuring → validating → completed`, con ramas `retry_pending`, `failed` y `cancelled`.

Borrador: `generating → ready → in_review → approved`, con `changes_requested → generating`, `rejected` y `archived`. `ready` no salta a aprobación.

Ejecución: `queued → running → checkpointed|completed`, con `retry_pending`, `failed` y `cancelled` por etapa.

RevisIAtor devuelve `passed`, `passed_with_warnings`, `changes_requested`, `blocked` o `rejected`; nunca cambia por sí mismo a aprobación humana ni a publicación.

Las transiciones ejecutables viven en `src/shared/editorial-contracts.ts` y sus invariantes se prueban en `tests/editorial-contracts.test.ts`.

La resolución geográfica previa no añade un estado de investigación implícito. Produce uno de tres resultados explícitos: `resolved`, `ambiguous` o `not_found`. Solo `resolved` permite crear/continuar la solicitud; `ambiguous` espera una elección humana entre candidatos visibles y `not_found` exige corregir la consulta o importar un snapshot versionado.

RevisIAtor no ejecuta una transición de `EditorialDraft`. Sus outcomes (`passed`, `passed_with_warnings`, `changes_requested`, `blocked`, `rejected`) pertenecen a `QualityReview`. Incluso `passed` deja el borrador en `ready`; solo una acción humana posterior puede llevarlo a `in_review`/`approved` según el flujo permitido.

FASE 3H expone esas transiciones en la UI. `ready → in_review` exige un resultado RevisIAtor `passed|passed_with_warnings`; `in_review → approved|changes_requested|rejected` exige comentario y actor humanos. Editar/regenerar un borrador devuelto o rechazado crea una nueva versión `ready`. Ninguna transición editorial conduce a publicación.
