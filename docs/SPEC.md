# SPEC.md — Investighost

## 1. Visión
Investighost es el agente/trabajador personal de investigación creado por el usuario para recopilar, estructurar y preparar información útil sobre países, ciudades y zonas concretas, con el objetivo de alimentar Trawel con contenido natural, útil y publicable.

No debe generar textos genéricos ni clónicos. Debe trabajar sobre investigación real, transformar esa investigación en datos estructurados y producir borradores con tono agradable y amable que luego el usuario revisará antes de publicar.

---

## 2. Problema que resuelve
Trawel no falla por falta de diseño, sino por la dificultad de conseguir y mantener contenido útil, específico y escalable.

Hacer este trabajo de forma manual consume demasiado tiempo. Pedir directamente a una IA “háblame de X lugar” produce respuestas genéricas, repetitivas y poco naturales.

Investighost nace para resolver ese cuello de botella.

---

## 3. Objetivo principal
Permitir que el usuario pueda dedicar unas pocas horas a:
1. indicar un país, ciudad o zona,
2. obtener una investigación útil y estructurada,
3. revisar el borrador generado,
4. publicarlo en Trawel.

---

## 4. Rol del sistema
Investighost no sustituye el criterio del usuario.

### Investighost se encarga de:
- investigar fuentes relevantes,
- recopilar señales útiles,
- organizar la información,
- generar borradores naturales,
- preparar contenido listo para revisión.

### El usuario se encarga de:
- decidir qué destino investigar,
- validar calidad,
- corregir,
- aprobar,
- publicar en Trawel.

---

## 5. Alcance funcional inicial

### Entrada esperada
El usuario podrá indicar, de forma simple:
- país,
- ciudad,
- zona o barrio,
- tipo de investigación opcional,
- perfil de viajero opcional,
- duración del viaje opcional.

### Ejemplos de entrada
- España > Valencia
- Italia > Roma > Trastevere
- Japón > Tokio > viaje de 3 días
- México > Ciudad de México > viaje en pareja

---

## 6. Salidas esperadas
Investighost debe devolver dos capas de salida:

### A. Capa estructurada (datos)
Información organizada y reutilizable.

#### Campos base orientativos
- país
- ciudad
- zona
- categoría
- nombre del lugar o recomendación
- tipo de sitio
- resumen factual
- por qué merece la pena
- perfil de viajero ideal
- tiempo recomendado
- presupuesto orientativo
- consejos prácticos
- señales destacadas encontradas
- fuentes consultadas
- fecha de investigación
- estado de revisión

### B. Capa editorial (borrador natural)
Un texto agradable, claro y útil, con tono Trawel, listo para ser revisado por el usuario.

Debe sonar:
- natural,
- útil,
- cercano,
- amable,
- nada robótico,
- nada genérico.

---

## 7. Tipos de contenido que sí debe producir

### Contenido estable y útil para Trawel
- lugares emblemáticos,
- monumentos,
- miradores,
- barrios interesantes,
- zonas recomendadas,
- playas,
- rutas,
- museos,
- pueblos bonitos,
- planes por tipo de viajero,
- ideas de itinerario,
- consejos de visita,
- selección de experiencias memorables.

---

## 8. Tipos de contenido que NO deben fijarse como verdad estable
Esta información es volátil y no debe depender exclusivamente de la base de datos de Trawel:
- disponibilidad hotelera,
- precios actuales,
- horarios exactos,
- restaurantes activos o cerrados,
- vacaciones,
- eventos temporales,
- promociones,
- plazas disponibles.

Para estos casos se deberá:
- consultar en tiempo real,
- enlazar a webs oficiales,
- redirigir a partners o servicios externos,
- o mostrar la información como orientativa, nunca como certeza permanente.

---

## 9. Filosofía de contenido
Investighost no debe “copiar y maquillar”.

Debe:
1. investigar,
2. detectar hechos y señales útiles,
3. estructurarlos,
4. redactar contenido original con voz propia de Trawel.

El contenido final debe basarse en investigación real, no en prompts vacíos.

---

## 10. Tono editorial de salida
El tono del borrador debe ser:
- agradable,
- amable,
- natural,
- útil,
- claro,
- evocador sin exageración,
- orientado a ayudar al usuario a decidir.

### Ejemplo de intención tonal
En lugar de textos tipo guía genérica, el contenido debe sonar como una recomendación pensada para una persona que quiere aprovechar bien su viaje.

---

## 11. Flujo de trabajo previsto
1. El usuario indica un destino.
2. Investighost investiga y recopila señales.
3. Investighost estructura los datos.
4. Investighost genera un borrador natural.
5. El usuario revisa.
6. El usuario pulsa publicar.
7. El contenido pasa a Trawel.

---

## 12. Integración futura con Trawel
Trawel tendrá:
- una base de datos curada y mantenible,
- un flujo de publicación simple,
- contenido estable guardado,
- información volátil derivada a tiempo real o a enlaces externos.
### Aclaración estratégica de integración
- Investighost está concebido para integrarse con una nueva versión de Trawel que será rehecha por el propio equipo.

- Esto implica que la futura conexión entre ambos sistemas no dependerá de estructuras heredadas problemáticas, sino que podrá diseñarse de forma limpia y compatible desde el inicio.

- Como consecuencia, Investighost debe preparar contenido y datos con una lógica de publicación clara, pensando en una conectividad futura nativa con Trawel.

- El flujo ideal será:

**Investigar → Revisar → Publicar**

---

## 13. Criterios de calidad
Una salida de Investighost será válida si:
- no suena genérica,
- no repite frases vacías,
- aporta especificidad,
- ayuda a decidir,
- está bien estructurada,
- no mezcla datos dudosos como certezas,
- deja al usuario con un borrador publicable.

---

## 14. Problemas a evitar
- textos demasiado parecidos entre destinos,
- contenido clónico,
- exceso de relleno,
- afirmaciones no verificadas,
- mezclar datos estables con datos volátiles,
- depender de una base gigantesca imposible de mantener,
- hacer perder tiempo al usuario corrigiendo demasiado.

---

## 15. MVP de Investighost
La primera versión debe centrarse en:
- recibir país/ciudad/zona,
- recopilar información útil,
- devolver estructura clara,
- generar un borrador editorial decente,
- dejarlo listo para revisión manual.

No hace falta resolver desde el principio:
- automatización total,
- publicación automática,
- cobertura mundial,
- mantenimiento completo,
- enriquecimiento en tiempo real de hoteles/restaurantes.

---

## 16. Roadmap general ligado a Trawel
1. Construir Investighost.
2. Conseguir que devuelva información útil y publicable.
3. Rehacer Trawel con enfoque híbrido.
4. Conectar flujo de revisión/publicación.
5. Empezar a poblar destinos prioritarios.
6. Añadir mantenimiento y reportes de enlaces rotos.

---

## 17. Persistencia, contexto y documentación viva
Investighost debe apoyarse en persistencia de datos y documentación viva para no depender únicamente del contexto temporal del chat o del agente.

### Persistencia de datos
Se deberá conservar de forma estructurada:
- investigaciones realizadas,
- destinos consultados,
- resultados útiles,
- borradores generados,
- estado de revisión,
- estado de publicación,
- fuentes consultadas,
- metadatos relevantes del proceso.

El objetivo es que el sistema pueda reutilizar trabajo ya hecho, continuar sesiones anteriores y evitar repetir investigación innecesaria.

### Contexto operativo
El proyecto debe mantener contexto acumulado de trabajo a través de documentación viva. La pieza principal será el archivo `BITACORA.md`, que servirá como memoria operativa del proyecto.

### Función de BITACORA.md
BITACORA debe registrar de forma breve y útil:
- fecha o sesión de trabajo,
- objetivo del bloque trabajado,
- archivos tocados,
- cambios realizados,
- breve explicación del motivo,
- estado final,
- problemas detectados,
- siguientes pasos sugeridos.

La finalidad es conocer el rumbo del proyecto, entender qué se hizo en cada iteración y facilitar el relevo de contexto entre sesiones o agentes.

### Regla de crecimiento de BITACORA
Cuando `BITACORA.md` supere aproximadamente 1000 líneas:
1. el archivo actual se cierra como histórico,
2. el siguiente archivo pasa a llamarse `BITACORA2.md`,
3. `BITACORA2.md` debe comenzar con un resumen corto de `BITACORA.md`,
4. ese resumen debe explicar qué partes ya funcionan, qué decisiones siguen vigentes y cuál es el estado real del proyecto,
5. después del resumen, la bitácora continúa normalmente desde la nueva etapa.

La misma lógica aplicará sucesivamente:
- `BITACORA3.md` resumirá `BITACORA2.md` al comenzar,
- `BITACORA4.md` resumirá `BITACORA3.md`,
- y así de forma indefinida.

### Criterio del resumen de arranque
Cada nueva bitácora debe arrancar con un resumen compacto que indique:
- qué ya está bien,
- qué ya funciona,
- qué arquitectura está vigente,
- qué flujo se sigue,
- qué queda pendiente.

El resumen debe ser corto, útil y orientado a ahorrar contexto.

---

## 18. Mantenimiento futuro
Trawel podrá incluir mecanismos como:
- reporte de enlace roto,
- reporte de información desactualizada,
- sugerencia de nueva web,
- panel de incidencias,
- revisión de enlaces problemáticos.

Esto permitirá un mantenimiento realista y guiado por uso real.

---

## 19. Decisión estratégica principal
La prioridad no es almacenar todo el mundo.

La prioridad es construir:
- una base curada y útil,
- un sistema de investigación potente,
- un flujo de publicación rápido,
- y un producto mantenible.

---

## 20. Definición resumida
**Investighost es el agente personal de investigación del usuario. Busca, recopila, estructura y redacta información útil sobre destinos concretos para que el usuario revise y publique contenido de calidad en Trawel de forma rápida y escalable.**

---

## 21. Próximas decisiones a concretar
- arquitectura técnica,
- formato exacto de entrada,
- formato exacto de salida,
- esquema de base de datos,
- pipeline de investigación,
- pipeline de redacción,
- flujo de publicación hacia Trawel,
- panel o interfaz mínima para revisión.