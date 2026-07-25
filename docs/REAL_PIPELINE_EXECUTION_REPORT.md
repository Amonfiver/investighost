# Informe de ejecución del pipeline real

Este informe acumula la evidencia del lote autónomo PROMPT 01–10. Hasta que exista una autorización posterior, todos los proveedores permanecen simulados, el modo real está inactivo y PROMPT 11 no se ejecuta.

## PROMPT 01 — Arquitectura neutral y contratos del sistema operativo editorial

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `d270a395695a6d6ede16d7c12bf40e8c54f61d43`.
- HEAD final: commit único de este bloque, con mensaje `feat: definir arquitectura neutral del pipeline real`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: contratos compartidos del pipeline real, puertos neutrales, export del módulo, pruebas específicas, documentos canónicos e informe acumulado.
- Migraciones: ninguna.
- Pruebas: contratos válidos e inválidos, categorías de proveedor, extensiones de 100 palabras, límites económicos, rondas 1–2, rechazo de ronda 3, perfiles, carencias, consultas focalizadas, decisiones, serialización y ausencia de secretos.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: contratos serializables con timestamps ISO; `ResearchTool` e `IntelligenceEngine` sustituibles; Investighost conserva la orquestación; `maxRounds` es literalmente 2; la única continuación automática posible apunta a ronda 2.
- Riesgos: todavía no existen implementaciones reales, selección durable de proveedores, ledger ni orquestación ejecutable.
- Deuda: conectar estos contratos a almacenamiento durable y UI solo en sus bloques autorizados posteriores.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: sin claves, red, persistencia nueva, UI funcional, proveedores activos, Trawel, producción, publicación ni Automatic.

## PROMPT 02 — Centro de proveedores y credenciales seguras

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `9f4adbf8c65470ab4490897384cb1847fa551868`.
- HEAD final: commit único de este bloque, con mensaje `feat: añadir centro seguro de proveedores`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: contratos IPC públicos, servicio seguro, runtime Electron main, handlers, preload, UI, estilos, pruebas y documentación.
- Migraciones: ninguna; las credenciales no usan Supabase.
- Pruebas: guardar, sustituir con confirmación, eliminar con confirmación, activar, exclusividad por categoría, proveedor no configurado, almacenamiento no disponible, máscara constante, reinicio, prueba simulada, IPC inválido, error sin filtración y rechazo de rutas dentro del proyecto.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: Tavily y OpenAI inauguran un catálogo extensible; Electron `safeStorage` cifra en main; la configuración cifrada reside bajo `app.getPath('userData')`; Linux con backend `basic_text` o indeterminado falla cerrado; la prueba de conexión es determinista y sin red.
- Riesgos: la seguridad efectiva depende del almacén de credenciales del sistema operativo; un backend no adecuado mantiene toda mutación bloqueada.
- Deuda: las integraciones reales y la consulta de consumos pertenecen a bloques posteriores y continúan inactivas.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: ninguna clave en Git, Supabase, logs, eventos o respuestas; sin red, proveedores reales, publicación, Trawel, producción ni Automatic.

## PROMPT 03 — Ledger, tarifas, reservas y límites

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `f4e35d6c864f4247343a230359dbbff3402ee45f`.
- HEAD final: commit único de este bloque, con mensaje `feat: añadir ledger y cortafuegos de gasto real`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: contratos económicos, servicio y repositorio en memoria, migración SQL, pruebas unitarias/de esquema/integración y documentación de migración.
- Migraciones: `20260725050000_real_provider_ledger.sql`, aplicada solo a Supabase local mediante `migration up --local`.
- Pruebas: reserva, inicio, liberación, conciliación, fallo, cancelación, resultado desconocido, reintento ambiguo, doble reserva, concurrencia idempotente, guarda global, tarea/lote/día, exceso de coste, append-only y ausencia de secretos. La integración local se ejecutó en transacción con rollback.
- Builds: suite específica, integración local, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: ledger de estados append-only; tarifas versionadas sin sobrescritura; reserva previa atómica; conciliación posterior; un timeout de facturación ambigua retiene reserva y no se reintenta; límites en orden tarea → lote → día; una única ejecución real global.
- Riesgos: una reserva `unknown` requiere resolución humana; eliminar un ledger con datos reales nunca será un rollback automático.
- Deuda: poblar tarifas reales verificadas y conectar el repositorio durable al orquestador solo en los bloques que lo autorizan.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: datos de integración exclusivamente sintéticos y revertidos; sin claves, red, proveedores reales, publicación, Trawel, producción o Automatic; ningún comando Supabase prohibido.

## PROMPT 04 — Adaptador Tavily sin red real

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `60cd8aabafb1a849639925d3e3231282dc463e70`.
- HEAD final: commit único de este bloque, con mensaje `feat: añadir herramienta de investigación Tavily`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: adaptador `ResearchTool`, extensión del resultado del puerto, fixtures, pruebas y documentación.
- Migraciones: ninguna.
- Pruebas: éxito Search/Extract, vacío, fuente rota, duplicados, extracción parcial, timeout, cancelación, 429, 500, payload inválido, créditos, request ID, máximo de URLs, máximo de caracteres y bloqueo de fetch.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: REST vive tras un transporte inyectable; el transporte `fetch` falla cerrado por defecto; normalización elimina fragmentos y tracking, ordena parámetros, deduplica técnicamente y calcula SHA-256; créditos y request IDs permanecen en el resultado.
- Riesgos: la forma de payload real deberá confirmarse otra vez antes del piloto; el adaptador no autoriza red por sí mismo.
- Deuda: la activación y credencial seguras solo podrán conectarse en un bloque real posterior y con feature flag.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: fixtures completos, transporte falso y `networkEnabled=false`; sin claves reales, red, créditos, publicación, Trawel, producción ni Automatic.

## PROMPT 05 — Motor OpenAI sin red real

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `25f20760b7cfc43113d65e61f21b50af574a82d5`.
- HEAD final: commit único de este bloque, con mensaje `feat: añadir motor editorial OpenAI estructurado`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: contratos de cobertura, motor `IntelligenceEngine`, puertos, pruebas y documentación.
- Migraciones: ninguna.
- Pruebas: conocimiento, carencias, contradicciones, consultas focalizadas, perfiles, extensión, cobertura insuficiente, revisión, refusal, incomplete, JSON/schema inválidos, prohibición de tercera ronda, timeout, cancelación, uso/coste y ausencia de web.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: Responses API queda representada por un cliente inyectable; Structured Outputs usa JSON Schema derivado de Zod; cada operación fija modelo, prompt, schema, límite de salida y `store=false`; el motor solo recibe expediente/conocimiento y no declara tools.
- Riesgos: modelo y tarifas actuales son sintéticos; el cliente real no se instancia y deberá auditarse antes del piloto.
- Deuda: persistencia de checkpoints y orquestación de rondas se conectan en PROMPT 06.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: cliente falso, sin instancia OpenAI, claves, red, tokens reales, web search, publicación, Trawel, producción ni Automatic.

## PROMPT 06 — Dos rondas, ampliación focalizada y prevención de loops

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `de82014dc71223d77752430078cb440b5cfccfd7`.
- HEAD final: commit único de este bloque, con mensaje `feat: limitar investigación real a dos rondas focalizadas`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: orquestador, checkpoint store, ejecutor idempotente, puertos, motor, pruebas y documentación.
- Migraciones: ninguna.
- Pruebas: suficiencia en ronda 1, ampliación en ronda 2, bloqueo de tercera, equivalencias/repetición, presupuesto, carencia crítica/secundaria, reanudación, cancelación, deduplicación y ausencia de doble coste.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: las consultas se canonizan, ordenan y hashean; solo carencias high/critical resolubles habilitan ronda 2; los checkpoints se verifican por SHA-256; operaciones de proveedor son idempotentes; tras ronda 2 solo existen redacción o `review_required`.
- Riesgos: el store durable usado por el piloto fake es un puerto con implementación en memoria reiniciable; no se añadió una migración fuera de alcance.
- Deuda: el piloto integral conectará redacción/revisión y demostrará el flujo completo con dobles en PROMPT 08.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: máximo literal de dos rondas, sin loops, red, claves, proveedores reales, publicación, Trawel, producción ni Automatic.

## PROMPT 07 — Roles editoriales y control Extensión

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `f518765098a3c5ad587dfab4a970af47553acfc5`.
- HEAD final: commit único de este bloque, con mensaje `feat: añadir roles y extensión configurable por perfil`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: contratos/preferencias, store local, runtime e IPC, UI/estilos, prompts del motor, pruebas y documentación.
- Migraciones: ninguna; las preferencias se guardan fuera del proyecto en `userData`.
- Pruebas: defaults, controles, incrementos/rangos, unicidad/activación, persistencia, reinicio, prompts, perfiles independientes, evidencia insuficiente e investigación compartida.
- Builds: suite específica, regresión motor/workflow, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: mínimo 800 y máximo 4000; paso 100; Aventura 1000/standard y Estudiante 1800/deep; objetivo aproximado sin relleno; profundidad por perfil; el expediente siempre es compartido.
- Riesgos: el aviso previo solo puede indicar evidencia pendiente; la suficiencia efectiva se calcula después de investigar.
- Deuda: enlazar la evaluación de cobertura real al resumen del piloto fake en PROMPT 08.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: guardar preferencias no ejecuta investigación ni crea solicitudes; sin red, proveedores reales, publicación, Trawel, producción ni Automatic.

## PROMPT 08 — Piloto integral Morella sin red

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `596df16dd2a3106657c192195115e8635e6581af`.
- HEAD final: commit único de este bloque, con mensaje `test: validar pipeline real completo sin red`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: ejecutor con ledger, orquestador editorial integral, exports, piloto automatizado, protocolo humano y documentación.
- Migraciones: ninguna.
- Pruebas: misión Morella, proveedor simulado, dos fuentes, expediente, carencia focalizada, ronda 2, conocimiento, Aventura 1.000, Estudiante 1.800, revisión, reservas, ledger, coste, concurrencia 1, incidencia, reanudación idempotente, ausencia de loops y cero efectos externos.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: una operación solo alcanza al proveedor tras reservar; éxito, fallo y reintento producen asientos separados; el pipeline comparte investigación, prohíbe regeneración y fija publicación en cero; la prueba usa los adaptadores Tavily/OpenAI reales con transportes falsos inyectados.
- Riesgos: los checkpoints del piloto siguen en memoria y el protocolo visual aún requiere decisión humana; ninguna evidencia fake acredita conectividad o tarifas reales.
- Deuda: PROMPT 09 podrá preparar una puerta real cerrada por defecto, sin ejecutar el piloto.
- Coste simulado conciliado: `0,19 EUR` de un máximo de `0,20 EUR`.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: protocolo humano no ejecutado por Codex; sin claves, red, saldo, regeneración, publicación, Trawel, producción ni Automatic.

## PROMPT 09 — Preparación del piloto real

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `f46a3d7ec5cd20afd2ad0b15af89421d4f25fbea`.
- HEAD final: commit único de este bloque, con mensaje `feat: preparar puerta segura para piloto real Morella`.
- Commit: el hash queda reflejado en la auditoría consolidada posterior para evitar una referencia circular dentro del propio commit.
- Archivos modificados: gate de piloto, export, UI/estilos, pruebas, guía de preparación y documentación canónica.
- Migraciones: ninguna.
- Pruebas: feature flag cerrada, whitelist, tarea única, concurrencia 1, límites 0,20/0,25/0,50 EUR, aviso 0,16, dos rondas, cero regeneración/publicación, proveedores, modelos, conexión, tarifas, presupuesto, saldos, Supabase, ledger, guarda y tareas activas.
- Builds: suite específica, suite normal, typecheck, ESLint y builds renderer/main/preload ejecutados antes del commit.
- Decisiones: el token de activación es estricto; todo estado no comprobado bloquea; una prueba simulada nunca acredita conexión real; saldo no consultable avisa y saldo insuficiente bloquea; la UI no ofrece acción de ejecución.
- Riesgos: el preflight real de conexión, tarifas, saldo e infraestructura aún no se ha realizado porque implicaría el gate humano posterior; el modelo actual solo se valida contra el catálogo configurado.
- Deuda: una autorización posterior deberá aportar las sondas reales y decidir el gate sin modificar los límites ni saltarse el ledger.
- Gate actual: `NO-GO` esperado, con feature flag apagada y comprobaciones reales pendientes.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: no se leyeron claves ni se conectaron Tavily/OpenAI; sin tareas reales, saldo, publicación, Trawel, producción ni Automatic.

## PROMPT 10 — Auditoría previa sin gasto

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `80a0f42559a86c4cc833ca4c123697182dc0ec6f`.
- HEAD final: commit único de este bloque, con mensaje `docs: cerrar auditoría previa al piloto real`.
- Commit: el hash se entrega después de crear el commit para evitar una referencia circular dentro de sí mismo.
- Archivos modificados: auditoría previa, reanudación canónica, roadmap e informe acumulado.
- Migraciones: ninguna nueva; se revisó `20260725050000_real_provider_ledger.sql` y su estado local.
- Pruebas: suite normal, integración ledger local transaccional, typecheck, ESLint, builds, diff, secreto versionado, esquema/datos locales y hashes de backup.
- Builds: renderer, Electron main y preload aprobados antes del commit.
- Decisiones: dictamen `NO-GO operativo`; no ocultar el defecto durable tras el éxito del repositorio en memoria; mantener feature flag y ejecución inexistentes.
- Riesgos: `reserve_provider_call` reutiliza una clave sin comparar parámetros; integraciones, tarifas y comprobaciones reales siguen pendientes; rutas legacy de proveedores deben aislarse antes de release.
- Deuda: nueva migración aditiva y test de conflicto idempotente; después, clientes/sondas reales autorizados y repetición íntegra del preflight.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: PROMPT 11 no ejecutado; cero créditos, tokens, publicaciones, Trawel, producción y Automatic; ningún comando Supabase prohibido.

## PROMPT 10B — Corrección de idempotencia y reauditoría

- Fecha/hora: 2026-07-25 (Europe/Madrid).
- HEAD inicial: `dac00762cbb0f66ab5968917f6b3bade4168fcba`.
- HEAD final: commit único de este bloque, con mensaje `fix: endurecer idempotencia de reservas reales`.
- Commit: el hash se entrega después de crear el commit para evitar una referencia circular dentro de sí mismo.
- Archivos modificados: migración aditiva, ledger en memoria, guardas legacy, pruebas unitarias/esquema/integración y documentación de reauditoría.
- Migraciones: `20260725183730_fix_provider_reservation_idempotency.sql`, aplicada exclusivamente mediante `migration up --local`; la migración original no se modificó.
- Pruebas: 71 específicas y 3 de regresión Morella falsa; fingerprint estable, misma clave idéntica, conflictos por cada campo relevante, carreras idénticas/conflictivas, presupuesto, ledger, reserva intacta, error tipado/no retryable, rutas legacy y ausencia de imports desde el runtime nuevo.
- Integración: 2 pruebas locales aprobadas; una transacción termina en rollback y la prueba concurrente usa una base aislada eliminada al finalizar. Datos humanos comparados antes/después.
- Suite y builds: 337 pruebas normales, typecheck, ESLint, renderer, Electron main y preload aprobados antes del commit.
- Decisiones: comparación explícita bajo advisory lock; `reserved_cost` equivale a la reserva máxima; `input_hash` cubre canónicamente atribución, facturación, payload y límites; conflicto estable `IDEMPOTENCY_CONFLICT`; guard legacy anterior a entorno, cliente, red o logs de input.
- Riesgos: los clientes y el preflight reales siguen pendientes de una autorización posterior; el código legacy continúa presente, aunque deprecado y fail-closed.
- Deuda: configurar desde la aplicación, verificar modelos/tarifas/saldos/conexiones y obtener autorización humana antes de PROMPT 11.
- Dictamen: `GO técnico para configurar credenciales y preparar autorización humana de PROMPT 11`.
- Coste real consumido: `0 EUR`.
- Llamadas reales realizadas: `0`.
- Fronteras negativas: feature flag apagada; PROMPT 11 no ejecutado; cero créditos, tokens y publicaciones; Trawel, producción y Automatic desconectados; ningún comando Supabase prohibido.
