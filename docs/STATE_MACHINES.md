# Máquinas de estado canónicas

## Producción

`pending → researching → structured → drafted → under_review → approved|rejected|drafted`; cualquier etapa operativa puede ir a `error`; `error → pending` mediante retry explícito. Publicación no modifica producción.

## Publicación

`not_published → queued → scheduled|publishing → published|failed`; queued/scheduled/failed pueden pausarse; `paused → queued|scheduled`; cualquier estado no activo puede archivarse. `published → archived` representa retirada lógica, nunca borrado destructivo.

## Moderación

`submitted → pending_review → approved|rejected`; el autor puede pasar a `withdrawn` antes de publicación; un aprobado puede pasar a `removed` con decisión y motivo auditados.

## Campañas

`draft → pending_approval → scheduled → sending → sent`; pending/scheduled/sending pueden pasar a `paused` o `failed`; antes de sending puede cancelarse; terminales pueden archivarse. Sin aprobación legal, remitente y baja no se abandona draft.

## Anuncios

`draft → pending_review → approved → scheduled → active → expiring → expired → archived`; approved/scheduled/active pueden pausarse; review puede rechazar; un anuncio vencido nunca vuelve a active sin nueva reserva/aprobación.

## Verificación

`pending → partially_verified → verified`; cualquier estado puede pasar a `disputed` con evidencia contradictoria; `disputed → partially_verified|verified` exige revisión humana.

Las transiciones de producción/publicación ejecutables están en `src/shared/contracts.ts`. Las demás quedan documentales hasta su fase de implementación.

