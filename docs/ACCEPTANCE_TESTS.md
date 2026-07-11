# Criterios de aceptación canónicos

## Contratos automatizados de FASE 1B

- Enums válidos aceptados y valores desconocidos rechazados.
- Transiciones permitidas/prohibidas de producción y publicación.
- ResearchRequest y ResearchResult válidos.
- ResearchSource exige URL HTTPS real con formato válido.
- ContentPiece no entra en publicación sin producción aprobada y evidencia.
- Campaign fuera de draft exige aprobación legal y baja.
- Advertisement aprobado exige aprobador y rango de fechas válido.
- Handoff Trawel acepta draft revisado, rechaza `published` directo y URLs malformadas.

Evidencia: `tests/contracts.test.ts`. Estos tests verifican contrato, no persistencia ni integración real.

## Gates por fase futura

- F2: Auth/RLS probadas por rol, secretos ausentes del renderer, sync/conflictos y auditoría durable.
- F3: fuentes reales trazables, fallos honestos, coste/tokens auditados y aceptación editorial humana.
- F4: usuario no técnico crea, edita, revisa y aprueba sin ayuda externa.
- F6: handoff idempotente en entorno controlado, draft visible y cero escrituras no autorizadas.
- F7–F14: criterios específicos de legal, moderación, campañas, anuncios y métricas reales antes de activación.
- F15: backups/restauración, E2E, accesibilidad, seguridad y release aprobados.

## Gate de FASE 1B

`npm run lint`, `npm run typecheck`, `npm test` y `npm run build:vite` deben pasar. La aceptación humana debe cerrar o aplazar explícitamente las decisiones de Supabase, usuarios/roles, correo, consentimiento y analytics antes de FASE 2.
