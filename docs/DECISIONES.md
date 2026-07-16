# DECISIONES.md — Investighost

## 1. Propósito
Este documento recoge las decisiones estratégicas, funcionales y técnicas tomadas para Investighost, con el fin de evitar rediscutir continuamente el mismo contexto y mantener una línea clara de trabajo entre sesiones y agentes.

---

## 2. Decisiones estratégicas del producto

### Decisión 2.1 — Investighost será el trabajador personal de investigación del usuario
Investighost no nace como producto público desde el primer día.  
Nace como herramienta personal del usuario para investigar, estructurar y preparar contenido útil para Trawel.

### Motivo
Esto permite enfocarlo en utilidad real inmediata, sin distraerse con necesidades de producto público, cuentas multiusuario, permisos o despliegues innecesarios.

---

### Decisión 2.2 — Trawel no almacenará “todo el mundo”
Trawel no intentará construir una base de datos gigantesca con todos los lugares, hoteles, restaurantes y datos cambiantes del planeta.

### Motivo
Ese enfoque sería costoso, difícil de mantener y poco realista.

### Consecuencia
Trawel trabajará con:
- una base curada de contenido estable y valioso,
- y apoyo en búsquedas o enlaces externos para información volátil.

---

### Decisión 2.3 — La prioridad es contenido útil, no cantidad masiva
Se priorizará tener contenido bueno, específico y publicable, aunque al principio cubra pocos destinos.

### Motivo
Un catálogo pequeño pero valioso es mejor que una masa enorme de texto genérico.

---

### Decisión 2.4 — Investighost debe investigar antes de redactar
Investighost no trabajará con prompts vacíos del estilo “háblame de Roma”.  
Primero deberá investigar, recoger señales y estructurar información; después redactará.

### Motivo
Este enfoque evita textos clónicos, vagos o intercambiables.

---

### Decisión 2.5 — El contenido generado siempre tendrá revisión humana
La publicación automática no forma parte del MVP inicial.

### Motivo
El usuario debe mantener control editorial y validar calidad antes de publicar en Trawel.

---

### Decisión 2.6 — Kimi será analista/redactor, no recolector web
Kimi se usará principalmente para analizar material recopilado y generar estructura/borradores editoriales.

La recolección de información real de internet será responsabilidad de un proveedor de búsqueda web separado.

### Motivo
Preguntar directamente a un modelo sobre un destino produce contenido más genérico y menos trazable.

Separar búsqueda y análisis permite:
- trabajar con fuentes reales,
- guardar trazabilidad,
- cambiar proveedor de búsqueda sin tocar prompts de redacción,
- usar Kimi sobre contexto concreto y verificable.

### Consecuencia
El flujo objetivo pasa a ser:

**Destino → búsqueda web → WebResearchBundle → análisis IA → estructura → borrador**

---

## 3. Decisiones sobre el tipo de contenido

### Decisión 3.1 — Se guardará contenido estable
Sí se almacenará en base de datos contenido como:
- lugares emblemáticos,
- barrios,
- zonas bonitas,
- rutas,
- monumentos,
- miradores,
- planes duraderos,
- recomendaciones editoriales.

### Motivo
Este tipo de contenido es más estable y merece formar parte del valor propio de Trawel.

---

### Decisión 3.2 — La información volátil no será núcleo fijo de la base
No se tratará como contenido fijo:
- disponibilidad de hoteles,
- restaurantes abiertos/cerrados,
- horarios exactos,
- precios actuales,
- eventos temporales,
- promociones,
- vacaciones.

### Motivo
Ese tipo de información cambia demasiado y genera mantenimiento excesivo.

### Consecuencia
Se resolverá con:
- búsqueda en tiempo real,
- enlaces externos,
- o redirección a webs oficiales o partners.

---

## 4. Decisiones sobre plataforma

### Decisión 4.1 — Investighost empezará como herramienta local/de escritorio
La primera versión se planteará como aplicación local o herramienta de escritorio, pensada para ejecutarse en el ordenador del usuario.

### Motivo
- es una herramienta personal,
- simplifica el arranque,
- evita despliegue prematuro,
- facilita trabajar con archivos, caché y bitácoras,
- permite iterar rápido sin dependencia de infraestructura web.

### Consecuencia
La arquitectura inicial debe poder vivir bien en entorno local.

---

### Decisión 4.2 — La versión web no es prioridad inicial
Aunque más adelante podría existir una interfaz web o panel online, eso no será objetivo del MVP.

### Motivo
Antes de empaquetar o abrir el sistema, primero debe demostrar valor funcionando localmente.

---
### Decisión 4.3 — Stack cerrado para el MVP de Investighost
Se decide que la primera versión de Investighost se desarrollará con el siguiente stack cerrado:

- Electron
- React
- TypeScript
- Vite
- SQLite
- Drizzle ORM
- Zod

### Motivo
Este stack permite construir una herramienta local/de escritorio moderna, mantenible y preparada para:
- interfaz cómoda,
- persistencia local,
- acceso a internet,
- validación de datos,
- y futura integración con Trawel.

### Consecuencia
- No se deberán proponer ni introducir tecnologías alternativas en esta fase salvo decisión explícita posterior.

> Estado histórico: la parte SQLite + Drizzle de esta decisión queda sustituida por la Decisión 15. Electron, React, TypeScript, Vite y Zod permanecen.

## 5. Decisiones sobre método de trabajo

### Decisión 5.1 — Se trabajará con SDD
Investighost se desarrollará con enfoque Spec Driven Development.

### Documentos base
- `SPEC.md`
- `ARCHITECTURE.md`
- `DECISIONES.md`
- `BITACORA.md`

### Motivo
Reducir improvisación, conservar contexto y facilitar trabajo con agentes.

---

### Decisión 5.2 — Después de definir estructura, Cline implementará por bloques
Una vez definida la estructura documental y técnica, el flujo de trabajo consistirá en preparar prompts acotados para que Cline programe la app por bloques pequeños.

### Motivo
Permite mantener control, reducir errores y avanzar de forma auditable.

---

### Decisión 5.3 — Cada bloque debe ir precedido de checkpoint
Antes de cada bloque de trabajo se debe recomendar un commit/checkpoint.

### Motivo
Tener control total del estado del proyecto y poder volver atrás si algo falla.

---

### Decisión 5.4 — Los cambios deben documentarse en bitácora
Cada bloque de trabajo debe dejar constancia en `BITACORA.md`.

### Debe incluir
- objetivo,
- archivos tocados,
- cambios realizados,
- explicación breve,
- estado final,
- problemas,
- siguiente paso.

---

### Decisión 5.5 — La bitácora será rotativa
Cuando una bitácora supere aproximadamente 1000 líneas, se creará la siguiente:
- `BITACORA2.md`
- `BITACORA3.md`
- etc.

Cada nueva bitácora comenzará con un resumen compacto de la anterior.

### Motivo
Mantener el contexto útil sin arrastrar documentación enorme.

---

## 6. Decisiones sobre salida del sistema

### Decisión 6.1 — Investighost devolverá dos capas de resultado
1. una capa estructurada de datos  
2. una capa editorial lista para revisar

### Motivo
Separar información reutilizable de la narrativa.

---

### Decisión 6.2 — El tono editorial debe ser natural y amable
La salida no debe sonar robótica, genérica ni inflada.

### Debe sonar
- natural,
- útil,
- clara,
- amable,
- cercana,
- orientada a ayudar a decidir.

---

## 7. Decisiones sobre integración con Trawel

### Decisión 7.1 — El flujo será investigar → revisar → publicar
Investighost debe dejar el contenido listo para revisión y posterior publicación manual o semiasistida en Trawel.

### Motivo
Mantener calidad y evitar errores prematuros.

---

### Decisión 7.2 — Trawel se rehace después de validar Investighost
La hoja de ruta acordada es:
1. construir Investighost,
2. conseguir que funcione bien,
3. rehacer Trawel,
4. comenzar a llenarlo.

### Decisión 7.3 — Trawel será rehecho por el propio equipo
Se decide que Trawel, aunque ya tuvo una versión previa, será rehecho por el propio equipo en una futura etapa.

### Motivo
Esto permitirá adaptar su arquitectura al flujo real de trabajo definido para Investighost, evitando arrastrar decisiones antiguas que limiten la conectividad o la publicación.

### Consecuencia
La integración futura entre Investighost y Trawel se diseñará como conectividad nativa, limpia y controlada, en lugar de como un parche sobre una estructura heredada.

### Motivo
No tiene sentido rehacer Trawel sin tener resuelto antes el motor que alimentará su contenido.

---

## 8. Decisiones sobre mantenimiento futuro

### Decisión 8.1 — Trawel podrá recibir reportes de enlaces rotos
Más adelante se podrá implementar:
- reporte de link roto,
- reporte de información desactualizada,
- sugerencia de nueva web,
- panel de revisión de incidencias.

### Motivo
Tener un mantenimiento guiado por uso real, no por revisión manual total.

---

## 9. Decisiones abiertas aún no cerradas
Estas decisiones todavía no están completamente definidas y deberán resolverse en próximos bloques:
- stack exacto de escritorio,
- lenguaje principal del runtime,
- formato de persistencia inicial,
- esquema exacto de base de datos,
- interfaz mínima de revisión,
- método exacto de publicación hacia Trawel,
- integración concreta con motores de búsqueda o APIs.

---

## 10. Resumen ejecutivo
Las decisiones centrales tomadas hasta ahora son:

- Investighost será una herramienta personal del usuario.
- Empezará como solución local/de escritorio.
- Investigará antes de redactar.
- Separará datos estructurados y texto editorial.
- Tendrá revisión humana obligatoria en MVP.
- Se desarrollará con SDD.
- Cline programará por bloques pequeños.
- Trawel no almacenará todo el mundo, solo contenido curado y estable.
- Lo volátil se resolverá con búsquedas o enlaces vivos.
- La hoja de ruta es: Investighost → Rehacer Trawel → Poblar Trawel.
- El stack inicial de Investighost queda cerrado en Electron + React + TypeScript + Vite + SQLite + Drizzle + Zod.
- Trawel será rehecho por el propio equipo y su conectividad futura con Investighost se diseñará de forma nativa.

---

## 11. Decisiones de estabilización (FASE 1A)

### Decisión 11.1 — Barra técnica mínima

Cada bloque debe poder ejecutar `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y, cuando corresponda, `npm run dev`.

Vitest 2 es el runner mínimo por compatibilidad con Vite 5, TypeScript y Node 20. Su configuración queda separada de `vite.config.ts` para no activar Electron en tests unitarios.

### Decisión 11.2 — Normalizar el entorno hijo de desarrollo

`npm run dev` usa `scripts/dev.mjs` para retirar `ELECTRON_RUN_AS_NODE` solo del proceso hijo. No modifica el entorno del usuario y evita que Electron arranque accidentalmente como Node.

### Decisión 11.3 — Un único conjunto mínimo de estados validables

Hasta que FASE 1B cierre los contratos completos, `ResearchStatusSchema` acepta la unión actual de estados de producción y publicación declarada en TypeScript. Una entidad válida por tipos no debe ser rechazada por Zod.

---

## 12. Decisiones canónicas de FASE 1B

- **Fuente contractual:** Zod en `src/shared/contracts.ts`; TypeScript se infiere. Los tipos MVP quedan solo como compatibilidad temporal.
- **Frontera (sustituida por V2/Decisión 13):** SQLite conserva trabajo/caché; la topología cloud se cerró posteriormente como un Supabase productivo compartido.
- **Supabase (sustituida por V2/Decisión 13):** la recomendación histórica de proyecto productivo separado ya no está vigente.
- **Estados:** producción/publicación son ortogonales; moderación, campañas, anuncios y verificación tienen enums propios.
- **Handoff:** resolver IDs, upsert idempotente, crear draft/review, conservar intentos parciales y publicar solo con acción humana.
- **Privacidad:** PII local excluida por defecto; RLS, supresión, consentimiento y auditoría privilegiada son requisitos obligatorios.

---

## 13. Decisiones vinculantes de FASE 2A (V2)

### Decisión 13.1 — Una única base productiva compartida

Trawel e Investighost compartirán el proyecto Supabase productivo actual de Trawel. Se sustituye la recomendación 1B de “Supabase Investighost separado” y la idea de Trawel como base destino. Investighost gestiona datos privados y públicos; Trawel solo consume filas/vistas autorizadas. No hay sincronización entre dos bases productivas.

### Decisión 13.2 — Proyecto Supabase separado solo para desarrollo

El entorno dev reproducirá estructura relevante y añadirá el esquema privado, RLS/Auth/Storage y migraciones propuestas. Producción permanece intacta. No se copian PII, emails, consentimientos, campañas, secretos ni fotos privadas; se usan fixtures ficticios/anonimizados/autorizados.

### Decisión 13.3 — SQLite no es fuente compartida

SQLite conserva caché, borradores, outbox y recuperación offline parcial. Roles, PII, consentimientos, campañas, secretos y auditoría histórica no se guardan localmente por defecto. Conflictos editoriales crean versión y revisión; no hay sobrescritura silenciosa.

**Sustituida por Decisión 15.** Se conserva para explicar el diseño de FASE 2A, no para implementación nueva.

### Decisión 13.4 — Protección contra producción

Variables dev/prod distintas, allowlist de project ref, banner de entorno, scripts separados, bloqueo de escritura productiva durante desarrollo y service role ausente de Electron. Toda migración productiva futura exige backup, diff, revisión y autorización humana.

### Decisión 13.5 — Diseño antes de SQL

En FASE 2A no se crean proyectos ni migraciones SQL materiales: primero se contrasta un export solo de esquema de producción con la referencia documental. El catálogo y orden quedan en `MIGRATION_STRATEGY.md`, todos con estado **NO EJECUTADA**.

### Decisiones todavía humanas

Región/organización/nombre final del proyecto dev; autorización para exportar solo DDL; MFA, invitaciones y sesiones; retenciones/cifrado local; buckets existentes, antivirus y límites; responsable de backups; adopción futura de vistas por Trawel.

---

## 14. Parche vinculante de contribuciones — FASE 2B

- Trawel es buzón temporal para contribuciones pendientes; la revisión ocurre principalmente en Investighost local.
- Tras persistencia, Zod, archivos, tamaños, SHA-256, transacción y backup verificados, el origen remoto puede eliminarse por registro.
- SQLite y la carpeta local pasan a ser copia autoritativa de trabajo para esas contribuciones; esta excepción no convierte SQLite en fuente multiusuario general.

**Sustituida por Decisión 15.** Los controles de integridad siguen vigentes, pero la persistencia será PostgreSQL/Storage local.

---

## Decisión 15 — Supabase local es la única persistencia del MVP

### Decisión

Desde FASE 2C-A, PostgreSQL/Supabase es la única tecnología de persistencia. Supabase local es el entorno principal de desarrollo; sus migraciones SQL versionadas reproducen el schema y Storage local guarda archivos. SQLite queda fuera del MVP y no se mantiene como fallback, caché, cola, outbox ni modo offline.

### Motivo y consecuencias

Se elimina la duplicidad de motores, sincronización y recuperación, se acerca desarrollo al stack final compatible con Trawel y se reduce el riesgo de una copia autoritativa en un único equipo. La implementación SQLite de FASE 2B fue reemplazada y retirada en FASE 2C-C. Sus contratos Zod, checksums, idempotencia, reintentos y borrado seguro se reutilizan sobre PostgreSQL/Storage.

Un eventual modo offline requiere una fase futura separada. Esta decisión no autoriza conectar producción: el Supabase real de Trawel permanece totalmente desconectado hasta aprobación humana explícita, backup/restauración, diff y plan de reversión revisados.

Documento detallado: `INVESTIGHOST_DECISION_SUPABASE_UNICO.md`.
- Un fallo afecta solo al registro/archivo, conserva el remoto, continúa el lote y usa retry acotado.
- El borrado real queda bloqueado hasta adaptador dev, Auth/RLS, backup/restauración probada y autorización humana. FASE 2B usa exclusivamente mock.
- La anterior secuencia “2B = crear Supabase dev” se desplaza a FASE 2C; la hoja de ruta no se reinicia.

---

## Decisión 16 — Manual y Automatic comparten un único pipeline

### Decisión

Manual ejecutará una investigación canónica para un destino. Automatic será, en una fase futura, un orquestador persistente que invoca exactamente ese mismo caso de uso para objetivos de un alcance territorial. No existirán contratos, prompts, validadores, mappers, tablas editoriales, estados de contenido ni rutas de publicación específicos por modo.

Automatic solo podrá comenzar después de finalizar FASE 2C, aceptar el flujo Manual extremo a extremo, consolidar contratos editoriales y probar calidad, trazabilidad, recuperación, reintentos e idempotencia. FASE 2C ya está finalizada, pero los demás gates continúan abiertos: Automatic no está iniciado. La primera versión será secuencial; concurrencia limitada vendrá después.

### Vocabulario y contradicciones resueltas

- “Campaña de investigación” designa la orquestación Automatic; `Campaign` sigue designando campañas de correo de FASE 10. Son dominios distintos y no comparten estados.
- Los estados y entidades propuestos en el adjunto son orientativos. No sustituyen `ProductionStatus`, `PublicationStatus` ni los contratos Zod actuales; se diseñarán por SDD en su fase.
- Toda prescripción histórica de SQLite o base temporal queda sustituida por Decisión 15: Automatic usará exclusivamente Supabase local.
- La automatización editorial nunca implica publicación automática. Aprobación, mapper, contrato, cola y autorización Trawel permanecen separados.
- No se infieren catálogos territoriales ni cambios del esquema Trawel. Toda fuente territorial deberá ser canónica/versionada y toda integración se contrastará con el esquema real antes de una conexión autorizada.

Documento detallado: `INVESTIGHOST_PARCHE_ARQUITECTONICO_MODO_AUTOMATIC.md`.

---

## Decisión 17 — Recuperación verificable como gate obligatorio

### Decisión

FASE 2C-C completa técnicamente la Decisión 15: SQLite, Better SQLite y Drizzle quedan retirados y Supabase local/PostgreSQL con Storage local es la única persistencia del MVP. La aceptación de una persistencia durable exige probar tanto backup como restauración, no solo crear artefactos o reconstruir un seed.

PostgreSQL se verificó en CHECKPOINT 5 mediante dump custom `-Fc` y restauración aislada. Storage se verificó separadamente en CHECKPOINT 7 mediante descarga, backup y restauración por API. La auditoría técnica final de regresión y reconstrucción se aprobó en CHECKPOINT 8. `SupabaseDurabilityCheckpointService` es un checkpoint lógico y `supabase db reset` una prueba de reconstrucción; ninguno sustituye un backup real.

### Alcance y consecuencia

El dump PostgreSQL probado cubre `public`, no Auth, Storage, Vault, roles ni ACL de toda la plataforma. La prueba Storage cubre un objeto sintético sin concurrencia, no un snapshot global. Cualquier futura ampliación o conexión productiva deberá definir y volver a probar su alcance de recuperación.

Manual y Automatic no se implementaron en FASE 2C-C. Ambos siguen sometidos a sus fases y gates propios; producción y Trawel permanecen desconectados.
