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
