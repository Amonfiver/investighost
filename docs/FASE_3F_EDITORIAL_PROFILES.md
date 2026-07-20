# FASE 3F — perfiles Aventura y Estudiante

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Plantillas versionadas

`editorialPromptSpecs` es la fuente ejecutable de propósito, tono, prioridades, estructura, expresiones prohibidas y longitudes.

| Perfil | Versión | Secciones obligatorias | Prioridad distintiva |
|---|---|---|---|
| Aventura | `adventure-v1` | contexto, destacados, ruta, práctica, riesgos, fuentes | exploración, naturaleza, esfuerzo, temporada, preparación y logística |
| Estudiante | `student-v1` | contexto, presupuesto, vida diaria, estudio, práctica, riesgos, fuentes | costes, transporte, servicios, seguridad, estudio, trámites y estancia cotidiana |

El proveedor no puede reordenar, omitir o duplicar secciones. Cada sección debe respetar longitud, vocabulario prohibido y trazabilidad a hechos/fuentes existentes.

## Generación neutral

`EditorialGenerationProvider` recibe perfil, especificación y el mismo contexto factual. `EditorialGenerationService` valida propuestas, crea IDs deterministas, estado `ready`, versiones, uso y coste. El único adaptador de esta fase es `MockEditorialGenerationProvider`, sin red y marcado como simulación.

La diferenciación se valida estructuralmente: Aventura requiere `highlights`/`route`; Estudiante requiere `budget`/`daily_life`/`study`. También se rechaza contenido idéntico por el contrato global. No basta cambiar el tono.

## Regeneración parcial e historial

Regenerar exige sección y motivo. El resultado:

- crea un nuevo `EditorialDraft` con `contentVersion + 1`;
- enlaza `previousDraftId` y registra `regenerationReason`;
- crea nuevas filas de sección para el nuevo borrador;
- cambia solo contenido/versión de la sección solicitada;
- conserva literalmente las demás secciones;
- devuelve el borrador anterior intacto como historial;
- registra uso/coste específico `perfil:section:tipo`.

La migración `20260721030000_editorial_history.sql` añade enlace y motivo al historial. El repositorio Supabase conserva ambas versiones; una integración verificó v1 → v2 y limpieza completa.

## Gate y evidencia

- 8/8 tests específicos.
- Perfiles con estructura, intención y utilidad diferentes.
- Todas las secciones conservan fuente→hecho→texto.
- IDs estables; longitud y expresiones prohibidas validadas.
- Coste/budget y cancelación explícitos.
- Regeneración de `route`: solo esa sección cambia, historial intacto y versión enlazada.
- Reset y lint SQL aprobados; integración Supabase de historial 1/1.

No existe proveedor editorial real, publicación, Automatic o conexión con Trawel/producción.
