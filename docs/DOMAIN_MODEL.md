# Modelo de dominio canónico

Estado: FASE 1B, contrato de diseño; no implica persistencia implementada.  
Fuente ejecutable: `src/shared/contracts.ts`. TypeScript inferido desde Zod es la fuente de verdad; `src/shared/types.ts` conserva compatibilidad con el prototipo MVP.

## Convenciones comunes

- IDs internos: UUID generados por Investighost/Supabase. Los IDs Trawel siempre se resuelven; nunca se inventan.
- Fechas: UTC en almacenamiento; la zona del usuario solo afecta presentación.
- Ownership: toda entidad mutable tiene actor propietario o responsable; toda operación privilegiada genera `AuditLog`.
- Local/privado/público: `L` Supabase local (PostgreSQL + Storage), `C` futura área privada del Supabase compartido y `T` tablas/vistas públicas del mismo Supabase productivo. Durante el MVP solo `L` está operativo; producción permanece desconectada.
- Sensibilidad: `—` ordinario; `P` personal; `S` secreto/operativo; `L` legal/consentimiento.
- Retención propuesta: contenido/auditoría 5 años; datos de contacto mientras exista finalidad más plazos legales; telemetría detallada 13 meses; temporales de Storage según TTL; borradores según política editorial. Requiere validación legal antes de producción.
- Todos los inputs se validan con Zod antes de persistir. Estados y transiciones están en `STATE_MACHINES.md`.

## Entidades

| Entidad | Propósito e identificador | Obligatorios | Opcionales | Relaciones | Estado | Owner | Ubicación | Sens. / retención | Validaciones | Alcance |
|---|---|---|---|---|---|---|---|---|---|---|
| ResearchRequest | Intención de investigación; `id` UUID | país, idioma, estado, requestedBy, fechas | región, foco, notas | AppUser; ResearchRun | producción | solicitante | L+C | S / 5a | país no vacío, idioma ISO corto | MVP |
| ResearchRun | Ejecución reproducible; `id` | request, estrategia, proveedores, modelo, estado, fecha | inicio/fin, error, coste, tokens | ResearchRequest, ResearchSource/Result | run | sistema+solicitante | L+C | S / 5a | costes ≥0; fin coherente | MVP |
| ResearchSource | Evidencia capturada; `id` | run, título, HTTPS URL, tipo, fiabilidad, verificación, captura | supports | ResearchRun/Result | verificación | sistema/editor | L+C; selección a T | — / 5a | HTTPS, score 0–1, no URL inventada | MVP |
| ResearchResult | Paquete rico estructurado; `id` | request/run, país, ciudad, destinos, pendientes, confianza | contenidos y coordenadas | Request, Run, Source | producción/verificación | editor | L+C; mapeado a T | S / 5a | slugs, confianza 0–1, fuentes por destino | MVP |
| EditorialDraft | Texto editable versionado; `id` | result, versión, título, secciones, tono, idioma, actor, fechas | — | Result, Revision, ContentPiece | draft workflow | editor | L+C; selección a T | S / 5a | versión positiva, secciones ordenadas | MVP |
| EditorialRevision | Decisión de revisión; `id` | draft, reviewer, decisión, notas, versión, fecha | — | Draft, AppUser | decisión | reviewer | C; caché L | S / 5a | reviewer distinto y autorizado | MVP |
| ContentPiece | Agregado editorial; `id` | request/result/draft, estados separados, owner, versión, fechas | aprobación | entidades de producción y cola | producción + publicación | editor | C; caché L | S / 5a | publicar solo si aprobado; evidencia de aprobación | MVP |
| PublicationQueueItem | Unidad ordenable; `id` | content, estado, prioridad, actor, fechas | programación | ContentPiece, Attempts | publicación | publisher | C; caché L | S / 5a | prioridad 1–10; aprobado | MVP |
| PublicationAttempt | Intento idempotente; `id` | queue, key, target, estado, hash, actor, fecha | respuesta/error | QueueItem, AuditLog | attempt | publisher/sistema | C | S / 5a | key única, hash inmutable | MVP publicación |
| UserContribution | Aporte externo; `id` | tipo, cuerpo, moderación, fechas | externalId, asignación | Photo, Decision | moderación | moderator | C | P / finalidad+plazo | contenido mínimo, no auto-publicar | Futuro F7 |
| UserPhoto | Imagen y derechos; `id` | path, alt, autor, licencia, consentimiento, estado, dimensiones, fecha | aporte, caption | Contribution, Consent, Decision | moderación | moderator | C+Storage; selección T | P+L / licencia+plazo | derechos/consentimiento, dimensiones >0 | Futuro F7 |
| ModerationDecision | Resolución trazable; `id` | subject, moderator, decisión, razón, fecha | — | Contribution/Photo, User | moderación | moderator | C | P / 5a | razón obligatoria, rol autorizado | Futuro F7 |
| Contact | Persona/contacto CRM; `id` | nombre, estado, fechas | organización, email, teléfono, país, owner | Organization, Consent, Communication | CRM | sales | C; caché cifrada/excluida L | P / finalidad+plazo | email válido; supresión prevalece | Futuro F8 |
| Organization | Negocio/entidad; `id` | nombre, tipo, estado, fechas | web, owner | Contact, Advertiser | CRM | sales | C | P / relación+plazo | web HTTPS, no duplicado fiscal/comercial | Futuro F8 |
| ConsentRecord | Prueba de base legal; `id` | contact, finalidad, base, estado, fuente, fecha | evidencia, concesión/retirada | Contact, Campaign/Communication | consentimiento | privacy/owner | C | L+P / obligación legal | retirada irreversible históricamente | Futuro F8 |
| Communication | Interacción individual; `id` | contact, tipo, canal, estado, actor, fecha | campaña, asunto, consentimiento | Contact, Campaign, Consent | delivery | sales/sistema | C | P+L / finalidad+plazo | marketing exige base y no supresión | Futuro F9 |
| Campaign | Definición de envío; `id` | nombre, propósito, estado, baja, actor, fechas | audiencia, remitente, aprobación legal, programación | Audience, Delivery, User | campaña | sales | C | P+L / 5a | fuera de draft exige aprobación y baja | Futuro F10 bloqueado legal |
| CampaignAudience | Segmento/snapshot; `id` | campaign, nombre, filtro, fecha | snapshot | Campaign, Contact | campaign | sales | C | P / campaña+plazo | exclusión de suprimidos obligatoria | Futuro F10 |
| CampaignDelivery | Resultado por contacto; `id` | campaign/contact/communication, estado, fechas | — | Campaign, Contact | delivery | sistema | C | P+L / 5a | unicidad campaña+contacto+intento | Futuro F10 |
| Advertiser | Perfil comercial; `id` | organización, estado, fechas | email facturación | Organization, Advertisement | comercial | sales | C | P / relación+plazo | organización única | Futuro F11 |
| Advertisement | Creatividad publicitaria; `id` | advertiser, placement, nombre, estado, URLs HTTPS, CTA, fechas | periodo, aprobador | Advertiser, Placement, Booking | anuncio | sales | C; payload futuro T | P / contrato+plazo | aprobado para activar; fin > inicio | Futuro F11 |
| AdPlacement | Inventario nombrado; `id` | key, página, formato, estado, fecha | dimensiones | Advertisement, Booking | inventario | admin/sales | C; definición coordinada T | — / permanente | key única, dimensiones positivas | Futuro F11, depende Trawel |
| AdBooking | Reserva comercial; `id` | ad/placement, periodo, precio, moneda, estado, fecha | — | Advertisement, Placement | booking | sales | C | P / contrato+plazo | no solapamiento incompatible, fin > inicio | Futuro F11 |
| RenewalReminder | Aviso de renovación; `id` | ad, días, programación, estado, fecha | — | Advertisement | reminder | sistema/sales | C | P / 5a | solo 30/15/7/3/1 días | Futuro F11/13 |
| AnalyticsEvent | Evento atómico; `id` | nombre, fecha, properties | sesión, usuario, entidad | Aggregate, AppUser | inmutable | sistema | C | P potencial / 13m | minimización, sin secretos/PII libre | Futuro F12 bloqueado |
| AnalyticsAggregate | Métrica agregada; `id` | métrica, periodo, dimensiones, valor, muestra, calidad, fecha | — | Events, Reports | inmutable | sistema | C; lectura comercial | — / 5a | periodo válido; calidad explícita | Futuro F12 |
| CommercialReport | Selección presentable; `id` | periodo, estado, aggregates, actor, fecha | organización | Aggregate, Organization | report | analyst | C | P / contrato+plazo | solo datos reales/etiquetados | Futuro F14 |
| AuditLog | Evento de trazabilidad; `id` | acción, entidad, outcome, correlation, metadata, fecha | actor/entityId | cualquier entidad/User | inmutable | sistema | C; buffer L | S+P / 5a | append-only, sin secretos | Fundación F2 |
| AppUser | Operador; `id` | authUserId, email, nombre, roles, estado, fechas | — | Role y entidades con owner | usuario | owner/admin | C; sesión L | P / cuenta+plazo | Auth id único, ≥1 rol | Fundación F2 |
| Role | Agrupación de permisos; `id` | nombre, permisos | — | AppUser, Permission | activo | owner | C | S / permanente | nombres canónicos | Fundación F2 |
| Permission | Acción atómica; `id` | nombre, descripción | — | Role | activo | owner | C | S / permanente | deny by default | Fundación F2 |

## Datos que nunca salen de Investighost

Prompts, respuestas crudas no aprobadas, costes/tokens, evaluaciones privadas, errores técnicos, claves, secretos, logs internos, resultados rechazados, notas internas, consentimientos y PII CRM. Trawel consulta únicamente la proyección validada descrita en `TRAWEL_HANDOFF_CONTRACT.md`, dentro del mismo Supabase productivo.

## Vista futura del modo Automatic

Automatic no introduce otro agregado editorial: cada objetivo referencia `ResearchRequest`, `ResearchRun`, `ResearchResult`, `EditorialDraft` y `ContentPiece` existentes. En su fase futura se diseñarán una campaña de investigación, sus objetivos territoriales y sus ejecuciones para guardar únicamente alcance, snapshot, progreso, intentos, costes y enlaces al pipeline canónico; no contenido duplicado.

El término **campaña de investigación** queda reservado a esa orquestación. `Campaign`, `CampaignAudience` y `CampaignDelivery` de la tabla anterior significan exclusivamente campañas de comunicación de F10. Los nombres, campos y contratos Automatic permanecen abiertos hasta su diseño SDD y no son entidades ejecutables en esta fase.

## Consolidación V3 — FASE 3A

La fuente ejecutable del nuevo pipeline editorial es `src/shared/editorial-contracts.ts`. Añade `GeographicEntity`, `EditorialResearchRequest`, `EditorialResearchRun`, `ResearchSource`, `ResearchFact`, `ResearchPlace`, `ResearchActivity`, `EditorialDraft`, `EditorialSection`, `QualityReview`, `QualityCheck`, `ProviderUsage` y `ResearchEvent`.

Los contratos de FASE 1B permanecen para los dominios futuros y compatibilidad histórica. Para FASE 3 prevalecen los contratos V3: perfiles Aventura/Estudiante, evidencia obligatoria, versionado, idempotencia, ambigüedad geográfica y etapas recuperables. La matriz completa de ownership/ciclo de vida está en `FASE_3A_DOMAIN_DESIGN.md`.

FASE 3B materializa estas entidades en tablas normalizadas de Supabase local y valida que todos los identificadores del agregado pertenecen a la misma solicitud, ejecución y destino antes de persistir. Checkpoints y locks son infraestructura de recuperación compartida, no entidades de un modo Manual/Automatic.

FASE 3C separa `GeographicEntity` de su procedencia versionada (`GeographicSourceSnapshot`/artefactos), IDs externos y decisiones de resolución humana. El resultado de resolución tiene tres salidas explícitas: resuelto, ambiguo o ausente. Una corrección pertenece a la consulta normalizada y versión del catálogo, no modifica silenciosamente la identidad fuente.
