# Auditoría completa de Investighost — FASE 0

Fecha: 2026-07-11  
Rama auditada: `feat/investighost-reinvencion`  
Alcance: lectura, inspección y verificaciones; sin cambios funcionales ni arquitectónicos.

## 1. Resumen ejecutivo

Investighost es hoy un prototipo Electron/React/TypeScript con un flujo vertical parcial de investigación. El renderer crea solicitudes mediante IPC; el proceso principal puede recolectar snippets con Brave Search y enviarlos a Kimi para producir un resultado estructurado y un borrador. Cuando faltan claves o Brave no está configurado, el flujo usa una simulación explícita.

No es todavía un centro de operaciones listo para producción. Toda la información se guarda en memoria y se pierde al cerrar. SQLite/Drizzle solo existen como esquema no conectado y sin migraciones. Revisión, edición, biblioteca, cola editorial, publicación Trawel, Supabase, usuarios/roles, moderación, CRM, correo, campañas, anuncios, analytics, informes y automatización cloud no están implementados o son placeholders.

El estado técnico tampoco es verde: typecheck y compilación Vite pasan, pero lint, tests, build empaquetado y arranque dev no pasan completamente. Por ello no debe iniciarse FASE 1 hasta aceptar explícitamente la auditoría y decidir las cuestiones humanas indicadas abajo.

## 2. Evidencia e inventario

### Documentación

- Leídos completos: prompt maestro, `README.md`, `SPEC.md`, `ARCHITECTURE.md`, `DECISIONES.md`, `BITACORA.md` y referencia de base de datos Trawel.
- `README.md` está vacío.
- No existían al inicio `ROADMAP.md`, `ACCEPTANCE_TESTS.md` ni `SECURITY_AND_PRIVACY.md`.
- `BITACORA.md` tiene 1402 líneas y supera el umbral rotativo; esta auditoría abre `BITACORA2.md` sin reescribir el histórico.
- La documentación histórica contiene afirmaciones ya obsoletas o no verificadas (por ejemplo, arranque dev correcto y SQLite bloqueado exclusivamente por build tools).

### Código y configuración

- 28 archivos bajo `src/`.
- Stack instalado: Electron 33, React 19, TypeScript 5.6, Vite 5, Zod 3, Drizzle ORM y `better-sqlite3`.
- Scripts: `dev`, `build`, `build:vite`, `preview`, `lint`, `db:generate`, `db:migrate`. No hay `typecheck` ni `test`.
- Esquema Drizzle con 12 tablas declaradas: solicitudes/resultados, lugares, actividades, consejos, fuentes, borradores/secciones, cola/configuración, logs de proveedor y piezas de contenido.
- No existe directorio de migraciones efectivo ni conexión runtime a SQLite.
- `.env` está ignorado y no versionado. Se revisaron solo nombres de variables, nunca valores.

## 3. Estado real por subsistema

### Electron y seguridad local

Existe una ventana con `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true`. El preload expone una API acotada y no entrega claves al renderer. Esto es una base razonable.

Las entradas IPC no validan en el borde todos sus argumentos: `research:create` termina validándose dentro del módulo, pero IDs y `search:collect` cruzan como datos no tipados en runtime. No hay autorización, rate limiting ni auditoría durable. El proceso principal carga `.env` desde el directorio de trabajo en desarrollo y desde una ruta relativa al bundle en producción; esta segunda ruta no está verificada en una app instalada.

El arranque actual está roto: `npm run dev` prepara Vite, main y preload, pero Electron termina con `TypeError: Cannot read properties of undefined (reading 'isPackaged')` en `const isDev = !app.isPackaged`. La causa probable es la forma `import electron from 'electron'` al generar main como CJS.

### Investigación, búsqueda e IA

Funciona a nivel de código el pipeline:

`UI → preload/IPC → researchModule → Brave Search → bundle compacto → Kimi → resultado + borrador → memoria`

Brave realiza búsquedas concurrentes con timeout de 20 s y Kimi tiene timeout y diagnóstico mínimo opcional. Los prompts intentan limitar invenciones y conservan URLs del bundle. No hay extracción del contenido completo de las fuentes, deduplicación editorial robusta, contraste factual real, verificación de afirmaciones, retry/fallback entre proveedores ni pruebas automatizadas.

Kimi es el único proveedor IA real. OpenAI y local son placeholders. Los tipos anuncian SerpAPI, SearchAPI y Tavily, pero la configuración solo acepta `mock` o `brave`; además, `serpapi` y `searchapi` se enrutan incorrectamente a Brave si se usan programáticamente. La estrategia multi-proveedor existe principalmente como infraestructura en memoria, no como capacidad de producto demostrada.

El modo mock genera contenido genérico y potencialmente falso, aunque el flujo lo etiqueta como simulación y reemplaza las fuentes por `internal://mock-fallback`. La UI decide el badge de simulación solo según Kimi configurado; no refleja necesariamente que Brave falte y el resultado haya caído a mock.

### Contratos Zod y tipos

Hay tipos TypeScript y esquemas Zod para el MVP inicial, pero no cubren el contrato completo del prompt maestro ni el paquete Trawel. Los estados están desalineados: TypeScript permite estados de publicación adicionales y `rejected`, mientras `ResearchStatusSchema` no contiene todos ellos. Los resultados generados por IA se ensamblan con conversiones tolerantes y no pasan por el `ResearchResultSchema` antes de persistirse.

No hay contratos para roles, permisos, Supabase, CRM, campañas, anuncios, moderación, fotos, analytics, consentimientos ni publicación Trawel. Tampoco están modelados de forma canónica `adventure`, `student`, `pendingVerification` ni los payloads exactos de Trawel.

### Persistencia y auditoría

La persistencia operativa es `Map` en memoria. Solicitudes, resultados, borradores, cola y logs se pierden al cerrar. El módulo de persistencia SQLite lanza un error deliberado y el servicio DB es placeholder. El esquema Drizzle no equivale a una base funcional: no hay migraciones, inicialización, repositorios, transacciones, backup ni pruebas.

La auditoría de costes usa estimaciones y arrays en memoria; no guarda respuestas, errores, payloads ni identidad del actor de forma durable. No existe Supabase, Auth, RLS, Storage, Edge Functions, Cron ni sincronización local/cloud.

### Interfaz y flujo editorial

La UI permite listar solicitudes de la sesión, crear una, observar polling y consultar resultado/borrador en pestañas. Es útil como demo técnica.

No permite editar ni guardar cambios, versionar, aprobar/rechazar, añadir notas, comparar proveedores, gestionar biblioteca o cola, publicar, administrar configuración, revisar fuentes en profundidad ni operar los dominios nuevos. No hay evidencia de accesibilidad, pruebas de usabilidad o experiencia validada con una persona no técnica.

### Cola y Trawel

La cola posee funciones en memoria para prioridades, programación y ritmo, pero no está conectada al flujo real, IPC, UI, scheduler o persistencia. No publica automáticamente y no puede sobrevivir al cierre.

El servicio Trawel y `publishToTrawel` son placeholders. No existe mapper, validación del contrato de Trawel, resolución de IDs, idempotencia, logging durable, rollback lógico ni conexión Supabase. La referencia de base de datos es detallada, pero todavía solo documental.

### Dominios empresariales y cloud

No existen implementación ni contratos suficientes para usuarios/roles, moderación de aportaciones/fotos, CRM, correo individual, campañas, prospección, clientes, anuncios, placements, caducidad, analytics, informes, compliance operativo o automatización cloud.

## 4. Comprobaciones técnicas ejecutadas

| Comprobación | Resultado | Evidencia / impacto |
|---|---|---|
| `npm run lint` | Falla | 15 errores `no-unused-vars`, concentrados en placeholders de publishing, OpenAI/local y research. Impide un pipeline verde. |
| `npx tsc --noEmit` | Pasa | TypeScript actual compila en modo estricto. No existe script `typecheck` dedicado. |
| `npm test` | Falla | `Missing script: test`; no hay framework, archivos ni suite de tests. |
| `npm run build:vite` (incluido en build) | Pasa | Renderer, main CJS y preload compilan correctamente. |
| `npm run build` | Parcial / falla | Compila TypeScript/Vite y prepara `win-unpacked`, pero `electron-builder` falla al extraer `winCodeSign` porque Windows no permite crear symlinks. No se genera instalador validado. También falta icono propio. |
| `npm run dev` | Falla | Vite queda listo, pero Electron se cierra por `app.isPackaged` sobre `app` indefinido. No se pudo probar la UI ni el pipeline real en esta sesión. |

No se ejecutaron escrituras de base de datos, migraciones, llamadas Brave/Kimi ni publicación Trawel. Una clave presente no demuestra validez, saldo, permisos ni funcionamiento end-to-end.

## 5. Qué funciona

- Estructura base Electron/React/TypeScript/Vite y compilación de bundles.
- Typecheck estricto.
- Aislamiento básico renderer/main y preload acotado.
- Validación Zod del formulario de entrada.
- Flujo de investigación y polling implementados en código.
- Adaptador básico Brave y proveedor Kimi con timeouts.
- Etiquetado explícito del fallback mock en los datos.
- Esquema conceptual SQLite/Drizzle y cola en memoria reutilizable como referencia.
- `.env` ignorado por Git; no se detectaron secretos versionados en los archivos revisados.

## 6. Qué es placeholder o simulación

- OpenAI, proveedor local, signals, editorial independiente, review, persistencia SQLite, servicio web genérico y servicio Trawel.
- Publicación y preview Trawel.
- Resultados turísticos mock cuando no hay IA/búsqueda real.
- Cola editorial y logs de proveedores: lógica en memoria sin integración operativa.
- Tablas Drizzle: definición sin base activa ni migraciones.
- Estrategias `compare`/`fallback`: infraestructura sin UI ni verificación real del producto.

## 7. Qué está roto

- Arranque dev de Electron.
- Lint (15 errores).
- Tests (inexistentes).
- Build instalable completo en este entorno.
- La aplicación pierde todo al cerrar.
- `cancelResearch` no cambia estado; es una operación nominal sin efecto.
- La configuración/tipos de proveedores de búsqueda están desalineados.
- El README vacío y documentos obligatorios ausentes reducen la capacidad de relevo y aceptación.

## 8. Qué falta

Además de estabilizar la base, faltan todos los dominios del prompt salvo una fracción de investigación: arquitectura híbrida local/cloud, Auth/RLS/roles, persistencia, contratos canónicos, edición/revisión/biblioteca, cola durable, adaptador Trawel, moderación, CRM, correo/campañas, anuncios/placements, analytics/informes, compliance y automatizaciones cloud.

## 9. Riesgos prioritarios

1. **Pérdida de datos (crítico):** toda la producción desaparece al cerrar o fallar el proceso.
2. **Falsa percepción de producto funcional (crítico):** documentación y UI pueden sugerir capacidad real aunque haya mock o componentes desconectados.
3. **Arranque no reproducible (alto):** no hay aplicación ejecutable en desarrollo en el estado auditado.
4. **Contenido no suficientemente verificado (alto):** Kimi recibe snippets, no páginas completas; no hay verificador de afirmaciones ni revisión implementada.
5. **Contratos divergentes (alto):** tipos, Zod, Drizzle y Trawel no forman una fuente canónica única.
6. **Seguridad/autorización (alto):** IPC sin validación integral, sin usuarios, roles, RLS ni auditoría durable.
7. **Operación cloud inexistente (alto):** cualquier cola futura local dependería de mantener Electron abierto.
8. **Calidad no medible (alto):** cero tests y lint rojo.
9. **Legal/privacidad (alto):** faltan políticas y bloqueos antes de correo, tracking, CRM y fotos.
10. **Release (medio-alto):** packaging Windows falla, faltan iconos, firma, estrategia de actualización y recuperación.

## 10. Decisiones humanas necesarias

- Aceptar o corregir esta auditoría y la clasificación de brechas.
- Definir si el primer bloque de estabilización previo a contratos debe corregir arranque/lint/tests o si se incorpora al inicio de FASE 1; recomendación: estabilizar primero sin ampliar negocio.
- Elegir Supabase separado o compartido con Trawel y confirmar entornos dev/staging/prod.
- Confirmar usuarios iniciales y combinación de roles.
- Confirmar política ante falta de claves: bloquear investigación real o permitir demo mock bajo modo explícito separado.
- Confirmar proveedor/modelos IA, presupuesto y política de fallback/compare.
- Confirmar proveedor de búsqueda y requisitos de extracción/contraste de fuentes.
- Validar el contrato vigente de Trawel y quién autoriza la primera escritura.
- Definir proveedor de correo, dominio/remitente y base jurídica/consentimiento antes de fases comerciales.
- Definir analytics, retención, privacidad, fotos/derechos y placements con responsables humanos.

## 11. Próximo bloque exacto

**PAUSA HUMANA 0.** Revisar y aprobar `INVESTIGHOST_FULL_AUDIT.md`, `INVESTIGHOST_GAP_MATRIX.md` y `ROADMAP.md`.

Tras aprobación, el siguiente bloque recomendado es **FASE 1A — estabilización y contratos de la fundación**, limitado a: reproducir y especificar la corrección del arranque Electron; acordar una barra mínima de lint/typecheck/tests/build; cerrar el modelo de dominio y los contratos Zod; decidir el reparto SQLite/Supabase; y documentar seguridad, aceptación y decisiones. No implementar dominios nuevos ni conectar producción Trawel en ese bloque.

