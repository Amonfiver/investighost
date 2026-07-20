# FASE 3H — Interfaz Manual completa

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Caso de uso único

`ManualResearchService` encadena el dominio ya aprobado: resolución geográfica, adquisición mock, estructuración factual, generación de perfiles, RevisIAtor y revisión humana. No existe un agregado, repositorio o pipeline alternativo para la interfaz.

Antes del primer checkpoint factual se persisten en Supabase local el destino, la solicitud y la ejecución. El runtime adquiere un lock por solicitud, actualiza etapa/estado y termina con un `ResearchDestinationResult` canónico. Si Supabase local no está disponible, la UI muestra el fallo y no activa memoria, SQLite ni otro fallback.

## Vistas operativas

La aplicación Electron ofrece, sin SQL ni terminal dentro del flujo:

- biblioteca persistente con estado, etapa, perfiles, coste e incidencias;
- formulario de destino con resolución exacta/alias/tolerante, ausencia y selección humana de ambigüedad;
- perfiles Aventura/Estudiante, profundidad, notas y presupuesto;
- progreso completo hasta revisión humana;
- fuentes con procedencia, URL, actualidad y fiabilidad;
- hechos con confianza, volatilidad, contradicción y fuentes;
- lugares y actividades con relevancia, preparación, accesibilidad y riesgos;
- borradores comparados por perfil y sección;
- RevisIAtor con outcome, severidad, evidencia y corrección;
- edición humana y regeneración parcial con motivo y nueva versión;
- transición explícita `ready → in_review → approved|changes_requested|rejected`;
- historial de versiones, eventos, proveedor, unidades y costes.

Una aprobación queda en la biblioteca local. No existe botón, IPC ni efecto de publicación.

## Frontera de seguridad

El renderer solo invoca un API IPC estrecho. La URL y la clave local privilegiada se leen exclusivamente en Electron main, se validan como loopback y nunca se exponen al renderer. Todos los proveedores del flujo 3H son mocks deterministas marcados como simulación.

La superficie IPC legado de investigación/búsqueda y la inicialización de proveedores remotos se retiraron del arranque activo. Sus módulos históricos no forman un runtime alternativo ni son invocables desde el renderer.

No se conectaron producción, Trawel o proveedores reales; no se usaron credenciales remotas; no se ejecutaron `supabase link` ni `supabase db push`; no se implementó Automatic.

## Evidencia

- 5/5 tests unitarios del flujo Manual: agregado completo, idempotencia terminada, edición/versiones, regeneración costada y gate humano.
- 1/1 integración Supabase local: scaffold, lock, checkpoints, agregado, edición v2, historial y limpieza dirigida.
- Gates completos: typecheck, lint, 127/127 tests generales y build renderer/Electron aprobados; cuatro integraciones locales opt-in omitidas en la suite general.

## Límite hacia 3I

La ejecución feliz y las incidencias persistidas son visibles. FASE 3I añade recuperación tras reinicio, reintento de etapa fallida, cancelación durable, leases/heartbeats, presupuesto global, fallos inyectados y protección completa frente a concurrencia accidental. Automatic continúa bloqueado hasta aprobar 3I y la aceptación humana 3J.
