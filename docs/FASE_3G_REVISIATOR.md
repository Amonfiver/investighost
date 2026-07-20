# FASE 3G — RevisIAtor y controles de calidad

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Motor independiente

`RevisiatorService` no usa el proveedor que generó el borrador ni realiza llamadas de red. La versión `revisiator-v1` aplica reglas deterministas a contratos ya estructurados y devuelve `QualityReview`/`QualityCheck` persistibles.

Cada check contiene código, severidad, resultado, evidencia, corrección sugerida, responsable, versión y fecha. Los IDs se derivan de borrador+versión+regla, por lo que revisar la misma versión es idempotente.

## Reglas v1

Los 17 controles por perfil cubren:

- schema canónico;
- perfil solicitado y cobertura/orden de plantilla;
- trazabilidad fuente→hecho→texto;
- fiabilidad y actualidad de fuentes;
- contradicciones;
- secciones/encabezados duplicados;
- clichés y densidad factual/relleno;
- identidad geográfica e idioma;
- posiciones/coherencia;
- diferenciación Aventura/Estudiante;
- tratamiento explícito de hechos volátiles;
- cobertura de hechos de seguridad en riesgos;
- recordatorio obligatorio de decisión humana.

## Resultados

La precedencia es:

1. perfil no solicitado → `rejected`;
2. blocker fallido → `blocked`;
3. error fallido → `changes_requested`;
4. warning → `passed_with_warnings`;
5. todo aprobado técnicamente → `passed`.

`passed` significa que las reglas automáticas no detectaron un problema; no cambia `EditorialDraft.state`, no equivale a `approved` y nunca crea/publica contenido en Trawel.

## Gate y evidencia

- 8/8 tests específicos.
- Caso limpio: 34 checks, dos revisiones `passed`, borradores aún `ready`.
- Fuentes débiles/antiguas y contradicción → advertencias.
- Geografía ausente, volatilidad sin cautela, duplicados o perfiles similares → cambios.
- Evidencia rota → bloqueo.
- Perfil no solicitado → rechazo.
- Schema inválido → error controlado sin checks engañosos.
- `requiresHumanDecision` siempre es `true`.

No hay proveedor real, aprobación automática, publicación, Automatic o conexión a Trawel/producción.
