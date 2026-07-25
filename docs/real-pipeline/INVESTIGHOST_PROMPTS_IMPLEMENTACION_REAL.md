# Investighost — Prompts de implementación del pipeline real

> Ejecutar mediante la instrucción maestra.
> Todos los bloques anteriores al piloto real deben usar clientes falsos y coste real cero.

---

# PROMPT 01 — Arquitectura neutral y contratos del sistema operativo editorial

## Objetivo

Formalizar en código la arquitectura:

- Investighost como orquestador.
- `ResearchTool` para investigación web.
- `IntelligenceEngine` para comprensión, estructuración, redacción y revisión.
- Supabase como memoria durable.

No hacer llamadas externas.

## Alcance

Crear contratos compartidos Zod para:

- proveedor/categoría;
- misión de investigación;
- perfiles;
- extensión;
- profundidad;
- límites;
- expediente de investigación;
- fuente;
- evidencia;
- conocimiento maestro;
- cobertura;
- carencia;
- consulta focalizada;
- resultado de ronda;
- decisión de continuar o detener;
- estados del pipeline real.

Definir:

- `ResearchTool`;
- `IntelligenceEngine`;
- `InvestighostRealWorkflow` o nombre equivalente.

El diseño debe permitir:

- Tavily como primera herramienta;
- OpenAI como primer motor;
- sustitución futura;
- un proveedor activo por categoría.

## Reglas

- Máximo de dos rondas representado contractualmente.
- No permitir tercera ronda.
- No incluir claves en contratos compartidos.
- No modificar todavía persistencia.
- No modificar UI salvo tipos mínimos.
- No activar modo real.

## Pruebas

- contratos válidos e inválidos;
- extensiones en incrementos de 100;
- límites;
- rondas 1 y 2;
- rechazo de ronda 3;
- carencias;
- consultas focalizadas;
- perfiles distintos;
- serialización;
- ausencia de secretos.

## Validaciones

Suite específica, suite normal, typecheck, lint, builds, diff check.

## Commit

```text
feat: definir arquitectura neutral del pipeline real
```

---

# PROMPT 02 — Centro de proveedores y credenciales seguras

## Objetivo

Crear el Centro de proveedores sin llamadas reales.

## Alcance

Añadir UI para:

- Herramientas de investigación.
- Motores de inteligencia.
- Configurar credencial.
- Sustituir.
- Eliminar.
- Activar uno por categoría.
- Mostrar configurado/no configurado.
- Mostrar máscara no reversible.
- Modelo seleccionado.
- Última prueba.
- Estado de conexión simulado.

Implementar almacenamiento con Electron `safeStorage` en main.

## Seguridad

- Claves solo en main.
- IPC específico y validado.
- Renderer nunca recibe clave.
- No Supabase.
- No logs.
- No eventos.
- No crash report.
- Fallar cerrado si almacenamiento no es seguro.
- Confirmación al eliminar.
- No guardar en archivo del proyecto.

## Proveedores iniciales

- Tavily, categoría investigación.
- OpenAI, categoría inteligencia.

Preparar catálogo extensible.

## Pruebas

- guardar;
- reemplazar;
- eliminar;
- activar;
- impedir dos activos en una categoría;
- renderer sin secreto;
- IPC inválido;
- almacenamiento no disponible;
- máscara;
- restart simulado;
- no filtración en errores.

## Sin red

Las pruebas de conexión deben usar adaptadores falsos. No hacer llamadas reales.

## Commit

```text
feat: añadir centro seguro de proveedores
```

---

# PROMPT 03 — Ledger, tarifas, reservas y límites

## Objetivo

Implementar contabilidad durable por llamada y cortafuegos económicos.

## Migración autorizada

Crear tablas y funciones locales necesarias para:

- `provider_calls`;
- catálogo/versionado de tarifas;
- reservas;
- guard global de ejecución real;
- presupuesto por tarea;
- presupuesto por lote;
- límite diario.

Preferir ledger append-only.

## Campos mínimos

- request/run/task;
- etapa;
- operación;
- proveedor;
- modelo;
- estado;
- intento;
- retry_of;
- timestamps;
- remote ID;
- tokens;
- herramientas;
- créditos;
- coste estimado;
- reserva;
- coste calculado;
- moneda;
- tarifa;
- error sanitizado;
- versión de prompt y esquema;
- hashes.

## Reglas

- reservar antes de llamar;
- conciliar después;
- no reintentar timeout ambiguo;
- una ejecución real global;
- presupuesto tarea;
- presupuesto lote;
- límite diario;
- parada al primer límite.

## Pruebas

- reserva;
- liberación;
- conciliación;
- fallo;
- cancelación;
- desconocido;
- doble reserva;
- concurrencia;
- presupuesto;
- límite diario;
- idempotencia;
- append-only;
- no secretos.

## Coste real

Cero. Usar datos simulados.

## Commit

```text
feat: añadir ledger y cortafuegos de gasto real
```

---

# PROMPT 04 — Adaptador Tavily sin red real

## Objetivo

Implementar Tavily Search y Extract detrás de `ResearchTool`.

## Alcance

- REST con `fetch`.
- Clientes inyectables.
- Search.
- Extract.
- URL, título, contenido, score, request ID.
- Créditos.
- Límites.
- Timeout.
- Cancelación.
- 429/5xx.
- respuesta inválida.
- normalización.
- deduplicación técnica.
- hashes.
- contenido máximo por fuente.

## No permitido

- No usar clave real.
- No llamar Tavily real.
- No consumir créditos.

## Pruebas

Fixtures completos para:

- éxito;
- sin resultados;
- fuente rota;
- duplicados;
- extracción parcial;
- timeout;
- cancelación;
- 429;
- 500;
- payload inválido;
- coste/créditos;
- request ID;
- límite de URLs;
- límite de caracteres.

## Commit

```text
feat: añadir herramienta de investigación Tavily
```

---

# PROMPT 05 — Motor OpenAI sin red real

## Objetivo

Implementar OpenAI como `IntelligenceEngine` usando Responses API y Structured Outputs, pero con cliente falso.

## Operaciones

1. Analizar expediente.
2. Crear conocimiento maestro.
3. Detectar contradicciones.
4. Detectar carencias.
5. Proponer consultas focalizadas.
6. Generar Aventura.
7. Generar Estudiante.
8. Revisión final.

## Reglas

- No navegar por Internet.
- Trabajar solo con el expediente.
- Salidas estructuradas.
- Refusal/incomplete.
- Max output tokens.
- Timeout.
- Cancelación.
- Sin reintento ambiguo.
- Medición completa.
- Prompt versionado.
- Modelo configurable.

## Calidad

Implementar contratos de cobertura para Aventura y Estudiante.

## Pruebas

- conocimiento correcto;
- carencias;
- contradicciones;
- consultas focalizadas;
- perfiles diferenciados;
- extensión;
- insuficiencia;
- refusal;
- incomplete;
- JSON inválido;
- timeout;
- cancelación;
- uso y coste;
- ausencia de navegación web.

## No permitido

No usar OpenAI real ni saldo.

## Commit

```text
feat: añadir motor editorial OpenAI estructurado
```

---

# PROMPT 06 — Dos rondas, ampliación focalizada y prevención de loops

## Objetivo

Orquestar el ciclo completo de investigación controlada.

## Comportamiento

### Ronda 1

- misión inicial;
- Tavily;
- expediente;
- OpenAI;
- cobertura.

### Ronda 2

Solo si:

- existe carencia relevante;
- la consulta no repite otra;
- hay presupuesto;
- no se exceden límites.

### Tras ronda 2

- continuar a redacción;
- o `review_required`.

## Prevención de loops

- máximo 2;
- hash de consultas;
- detección de equivalencias;
- máximo de consultas focalizadas;
- máximo de fuentes;
- máximo de contenido;
- máximo de llamadas;
- presupuesto;
- límite diario.

## Pruebas

- suficiente en ronda 1;
- ampliación en ronda 2;
- bloqueo de ronda 3;
- repetición;
- presupuesto;
- carencia crítica;
- carencia secundaria;
- reanudación durable;
- cancelación;
- no duplicados;
- no coste doble.

## Commit

```text
feat: limitar investigación real a dos rondas focalizadas
```

---

# PROMPT 07 — Roles editoriales y control Extensión

## Objetivo

Incorporar controles de perfil y extensión a la misión y al motor.

## UI

Por perfil:

- activar/desactivar;
- extensión;
- incrementos de 100;
- valor predeterminado;
- rol visible;
- profundidad;
- aviso de evidencia insuficiente.

## Valores iniciales

- Aventura: 1.000.
- Estudiante: 1.800.
- Permitir 800 como mínimo orientativo configurable.
- Definir límites razonables.

## Reglas

- objetivo aproximado;
- no relleno;
- investigación debe cubrir la extensión;
- misma investigación compartida;
- instrucciones específicas por rol.

## Pruebas

- controles;
- validación;
- persistencia;
- reinicio;
- prompts;
- perfiles independientes;
- extensión insuficiente;
- no duplicar investigación.

## Commit

```text
feat: añadir roles y extensión configurable por perfil
```

---

# PROMPT 08 — Piloto integral Morella sin red

## Objetivo

Ejecutar de extremo a extremo con Tavily y OpenAI falsos.

## Escenario

- Morella.
- Aventura 1.000.
- Estudiante 1.800.
- Presupuesto 0,20 EUR.
- Dos rondas posibles.
- Concurrencia 1.
- Sin regeneración.
- Cero publicación.

## Debe demostrar

- proveedor configurado simulado;
- misión;
- fuentes;
- expediente;
- carencia focalizada;
- ronda 2;
- conocimiento;
- dos borradores;
- revisión;
- ledger;
- reservas;
- costes;
- reanudación;
- incidencia;
- cero loops;
- cero efectos externos.

## Gate técnico

Crear protocolo humano breve, pero no ejecutarlo en nombre del jefe.

## Commit

```text
test: validar pipeline real completo sin red
```

---

# PROMPT 09 — Preparación del piloto real

## Objetivo

Dejar el sistema listo para una única ejecución real, sin ejecutarla.

## Controles

- feature flag real desactivada por defecto;
- whitelist Morella;
- una tarea;
- concurrencia 1;
- 0,20 EUR;
- aviso 0,16;
- ampliación manual hasta 0,25;
- límite absoluto 0,50;
- 2 rondas;
- sin regeneración;
- sin publicación;
- Tavily activo;
- OpenAI activo.

## Preflight

- claves configuradas;
- conexión;
- modelo;
- tarifas;
- presupuesto;
- saldo cuando sea consultable;
- Supabase;
- ledger;
- guard;
- cero tareas reales activas.

## No ejecutar

No hacer llamada real.

## Commit

```text
feat: preparar puerta segura para piloto real Morella
```

---

# PROMPT 10 — Auditoría previa sin gasto

## Objetivo

Auditar todo antes del piloto real.

## Revisar

- arquitectura;
- claves;
- IPC;
- safeStorage;
- logs;
- ledger;
- reservas;
- tarifas;
- límites;
- dos rondas;
- loops;
- feature flags;
- whitelist;
- publicación;
- Trawel;
- Automatic;
- restauración;
- pruebas;
- documentación.

## Herramientas

- pruebas;
- typecheck;
- lint;
- builds;
- diff;
- búsqueda de secretos;
- revisión de migraciones;
- comprobación de backups.

## Resultado

Informe GO/NO-GO.

No ejecutar piloto real.

## Commit

```text
docs: cerrar auditoría previa al piloto real
```

---

# PROMPT 11 — Piloto real Morella

> Este prompt no se ejecuta automáticamente salvo autorización humana expresa y claves configuradas.

## Presupuesto

- objetivo 0,125 EUR;
- aviso 0,16 EUR;
- parada normal 0,20 EUR;
- ampliación manual hasta 0,25 EUR;
- límite absoluto 0,50 EUR.

## Ejecución

- una tarea;
- Morella;
- Tavily real;
- OpenAI real;
- dos rondas;
- Aventura 1.000;
- Estudiante 1.800;
- sin regeneración;
- sin publicación.

## Detenciones

- preflight >0,20;
- clave ausente;
- saldo insuficiente;
- timeout ambiguo;
- ledger inconsistente;
- falta de trazabilidad;
- ronda 3;
- presupuesto;
- calidad crítica.

## Resultado

- coste;
- créditos;
- tokens;
- fuentes;
- hechos;
- borradores;
- carencias;
- tiempo;
- incidencias;
- evaluación humana pendiente.

No aprobar en nombre del jefe.

---

# PROMPT 12 — Piloto de 3–5 destinos

> Solo tras aprobación humana de Morella.

- Destinos variados.
- Presupuesto individual.
- Presupuesto de lote.
- Concurrencia 1.
- Comparación.
- Ajustes.
- Sin publicación.

---

# PROMPT 13 — Cola durable

## Objetivo

Implementar tareas individuales y lotes secuenciales.

- prioridad;
- estados;
- pausa;
- reanudación;
- cancelación;
- presupuestos;
- progreso;
- recuperación;
- una tarea real simultánea;
- sin CSV todavía.

## Commit

```text
feat: añadir cola durable de producción editorial
```

---

# PROMPT 14 — Importación CSV

## Objetivo

- parser;
- esquema sencillo;
- esquema avanzado;
- vista previa;
- validación;
- duplicados;
- identidad;
- homónimos;
- conocimiento existente;
- coste;
- confirmación;
- no ejecutar al importar.

## Commit

```text
feat: añadir importación segura de tareas CSV
```

---

# PROMPT 15 — Automatic secuencial nocturno

## Objetivo

Ejecutar lotes humanos autorizados durante periodos prolongados.

- concurrencia 1;
- límites;
- dos rondas;
- presupuesto;
- pausa;
- reanudación;
- incidencias;
- resumen;
- seguir o detener según política;
- cero publicación.

## Escalado

Primero datos falsos y lotes pequeños.

## Commit

```text
feat: añadir automatic secuencial controlado
```

---

# PROMPT 16 — Auditoría final

## Revisar

- seguridad;
- claves;
- presupuesto;
- ledger;
- idempotencia;
- loops;
- dos rondas;
- cola;
- CSV;
- Automatic;
- recuperación;
- duplicados;
- identidad;
- calidad;
- publicación;
- Trawel;
- documentación;
- backups.

## Resultado

- informe completo;
- defectos;
- deudas;
- GO/NO-GO;
- árbol limpio;
- rama sincronizada;
- sin ejecutar publicación.
