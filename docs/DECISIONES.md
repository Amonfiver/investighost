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