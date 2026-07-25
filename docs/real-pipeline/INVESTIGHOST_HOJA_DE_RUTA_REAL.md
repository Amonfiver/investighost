# Investighost — Hoja de ruta maestra hacia producto real

## Estado de partida

- FASE 3J aprobada y cerrada.
- FASE 4A-01 y 4A-01B implementadas.
- Biblioteca durable, paginada y navegable.
- Supabase local es la persistencia canónica.
- Publicaciones en cero.
- Trawel, producción y Automatic permanecen desconectados.
- OpenAI será el primer motor de inteligencia.
- Tavily será la primera herramienta de investigación web.
- Investighost es el sistema operativo editorial que coordina herramientas, motor, memoria, presupuestos, tareas, revisión y decisiones humanas.

## Arquitectura conceptual

```text
Octavio
  ↓ define destino, perfiles, roles, extensión, límites y lotes

Investighost — sistema operativo editorial
  ├── controla proveedores, claves y selección activa
  ├── prepara misiones de investigación
  ├── administra presupuesto, intentos y concurrencia
  ├── organiza cola y lotes
  ├── detecta duplicados y conocimiento existente
  ├── guarda progreso, fuentes, hechos, costes y versiones
  ├── presenta incidencias y resultados
  └── nunca publica sin una fase separada y autorización humana

Tavily — herramienta de investigación
  ├── ejecuta búsquedas
  ├── recupera y extrae fuentes
  └── responde a ampliaciones focalizadas

Motor de IA — OpenAI inicialmente
  ├── analiza el expediente de investigación
  ├── extrae y contrasta hechos
  ├── detecta carencias
  ├── propone búsquedas complementarias
  ├── crea conocimiento maestro
  ├── redacta Aventura y Estudiante
  └── revisa calidad y cumplimiento

Supabase local — memoria durable
  └── tareas, runs, fuentes, hechos, borradores, costes,
      incidencias, decisiones, proveedores y auditoría
```

## Principios no negociables

1. Una investigación compartida por destino.
2. Aventura y Estudiante reutilizan el mismo conocimiento maestro.
3. Tavily no decide el producto editorial; ejecuta misiones preparadas por Investighost.
4. El motor de IA no vuelve a navegar de forma general cuando falta información.
5. Las ampliaciones son focalizadas.
6. Máximo de dos rondas de investigación por tarea:
   - ronda 1: investigación inicial;
   - ronda 2: ampliación focalizada.
7. Tras la segunda ronda, la tarea se detiene y requiere revisión humana.
8. No hay bucles ilimitados.
9. No hay reintento completo automático tras un fallo ambiguo.
10. El primer modo real trabaja con concurrencia global 1.
11. Toda llamada real se reserva y se registra antes de ejecutarse.
12. El primer límite alcanzado detiene la tarea:
    - consultas;
    - URLs;
    - tokens;
    - presupuesto por tarea;
    - presupuesto por lote;
    - límite diario;
    - intentos.
13. Aprobar no publica.
14. Automatic ejecuta listas humanas autorizadas; no decide libremente qué producir.
15. Las claves nunca se guardan en Git, Supabase, logs o archivos del proyecto.
16. El renderer nunca puede recuperar una clave.
17. Las credenciales se introducen desde la aplicación y se almacenan mediante el almacén seguro del sistema operativo.
18. Un proveedor activo por categoría:
    - herramienta de investigación;
    - motor de inteligencia.
19. No hay fallback automático entre proveedores sin política y confirmación explícitas.
20. El conocimiento durable pertenece a Investighost y debe poder reutilizarse.

## Perfiles y controles

### Aventura

- Rol: aventurero experimentado.
- Extensión aproximada configurable.
- Incrementos de 100 palabras.
- Rutas identificables.
- Lugares y actividades concretas.
- Accesos.
- Distancias.
- Duración.
- Desnivel.
- Dificultad.
- Terreno.
- Condiciones.
- Riesgos.
- Servicios reales.
- Sin generalidades intercambiables.

### Estudiante

- Rol: profesor o divulgador cercano.
- Extensión aproximada configurable.
- Incrementos de 100 palabras.
- Historia.
- Fechas.
- Población.
- Lenguas.
- Moneda.
- Administración.
- Patrimonio.
- Cultura.
- Personajes.
- Economía.
- Educación.
- Vida cotidiana.
- Lugares emblemáticos.
- Datos integrados de forma natural.

### Reglas comunes

- Escritura natural, práctica y propia de cada destino.
- Sin clichés.
- Sin plantillas repetidas.
- Sin copia-pega.
- Sin relleno artificial.
- Ningún dato crítico sin evidencia.
- La extensión es objetivo, no obligación rígida.
- Si la evidencia no permite la extensión, se registra advertencia.

## Ciclo de investigación controlado

### Ronda 1

1. El operador configura la tarea.
2. Investighost genera la misión de investigación conjunta.
3. Tavily ejecuta consultas y extracción.
4. Investighost normaliza técnicamente:
   - URLs;
   - duplicados exactos;
   - tamaño;
   - contenido vacío;
   - hashes;
   - metadatos.
5. OpenAI analiza el expediente.
6. Produce:
   - hechos;
   - lugares;
   - actividades;
   - rutas;
   - contradicciones;
   - confianza;
   - vigencia;
   - carencias;
   - búsquedas focalizadas sugeridas.

### Ronda 2

Solo si existen carencias importantes y hay presupuesto:

1. OpenAI devuelve consultas concretas.
2. Investighost las valida contra:
   - campos permitidos;
   - número máximo;
   - presupuesto;
   - repetición;
   - seguridad.
3. Tavily busca únicamente esas carencias.
4. OpenAI actualiza el conocimiento maestro.
5. No se permite una tercera ronda automática.

### Tras la segunda ronda

- Si el conocimiento es suficiente: redactar.
- Si falta información secundaria: redactar con advertencia.
- Si falta información crítica: detener como `review_required`.
- Mostrar:
  - qué falta;
  - qué se buscó;
  - qué fuentes se obtuvieron;
  - qué coste se consumió;
  - qué decisión humana se necesita.

## Centro de proveedores

### Categorías

1. Herramientas de investigación.
2. Motores de inteligencia.

### Datos visibles por proveedor

- Nombre.
- Categoría.
- Configurado/no configurado.
- Activo/inactivo.
- Modelo o variante.
- Última prueba.
- Resultado de conexión.
- Consumo cuando la API lo permita.
- Botones:
  - configurar;
  - probar;
  - activar;
  - desactivar;
  - sustituir clave;
  - eliminar clave.

### Almacenamiento de credenciales

- Entrada desde la UI.
- Transporte mediante IPC específico y validado.
- Cifrado en Electron main con `safeStorage`.
- Nunca devolver la clave al renderer.
- El renderer solo ve estado y máscara.
- Eliminar o reemplazar credenciales debe requerir confirmación.
- Fallar de forma cerrada si el backend seguro no es adecuado.

## Formas de trabajo

### Investigación individual

- Crear y ejecutar una tarea.
- O añadirla a la cola.

### Lista manual

- Añadir varios destinos uno por uno.
- Revisar el lote.
- Confirmar coste máximo.
- Ejecutar secuencialmente.

### Importación CSV

Formato mínimo:

```csv
destination,country
Roma,IT
Florencia,IT
Venecia,IT
```

Formato avanzado:

```csv
destination,country,type,adventure,student,adventure_words,student_words
Roma,IT,locality,true,true,1000,1800
Florencia,IT,locality,true,true,1000,1800
Venecia,IT,locality,true,true,1000,1800
```

### Vista previa obligatoria

- Filas válidas.
- Filas inválidas.
- Países inválidos.
- Homónimos.
- Duplicados internos.
- Destinos existentes.
- Conocimiento reutilizable.
- Tareas nuevas reales.
- Coste estimado por tarea.
- Coste máximo del lote.
- Confirmación humana antes de crear o ejecutar.

## Automatic

Automatic es un ejecutor secuencial controlado.

```text
Tareas o CSV
  ↓
Validación, identidad canónica y deduplicación
  ↓
Estimación y límites
  ↓
Confirmación humana
  ↓
Cola durable
  ↓
Ejecución secuencial
  ↓
Resultados e incidencias
  ↓
Revisión humana
```

### Reglas iniciales

- Concurrencia 1.
- Una tarea a la vez.
- Dos rondas máximas.
- Sin regeneración automática.
- Sin repetición completa automática.
- Presupuesto por tarea.
- Presupuesto por lote.
- Límite diario.
- Pausa.
- Reanudación.
- Cancelación.
- Continuar con la siguiente tarea solo si la incidencia es local a un destino y la política lo permite.
- Detener lote ante:
  - fallo de credenciales;
  - fallo general del proveedor;
  - presupuesto global;
  - contabilidad inconsistente;
  - pérdida de persistencia;
  - riesgo de duplicación;
  - error desconocido repetido.

### Resultado matinal

- Completadas listas para revisar.
- Completadas con advertencias.
- Falta de información.
- Presupuesto agotado.
- Proveedor no disponible.
- Destino ambiguo.
- Duplicadas.
- Ya existentes.
- Canceladas.
- Pendientes por límite diario.

## Hoja de ruta de implementación

### CHECKPOINT 00 — Punto de retorno

- Etiqueta Git.
- Rama nueva.
- Backup PostgreSQL.
- Backup Storage.
- Manifiesto.
- Procedimiento de restauración.

### REAL-01 — Contratos y arquitectura neutral

- `ResearchTool`.
- `IntelligenceEngine`.
- Orquestador Investighost.
- Contratos de misión.
- Expediente.
- Carencias.
- Búsquedas focalizadas.
- Límites.
- Estados reales.
- Sin llamadas externas.

### REAL-02 — Centro de proveedores y credenciales

- Catálogo.
- UI.
- `safeStorage`.
- Activación por categoría.
- Prueba de conexión simulada.
- Sin llamadas reales.

### REAL-03 — Ledger, tarifas y presupuestos

- Ledger append-only.
- Reservas.
- Tarifas versionadas.
- Presupuesto por tarea.
- Presupuesto por lote.
- Límite diario.
- Guard global.
- Sin llamadas reales.

### REAL-04 — Adaptador Tavily

- Search.
- Extract.
- Créditos.
- Request IDs.
- Fuentes.
- Límites.
- Clientes falsos.
- Sin red real.

### REAL-05 — Motor OpenAI

- Structured Outputs.
- Conocimiento maestro.
- Carencias.
- Consultas focalizadas.
- Aventura.
- Estudiante.
- Revisión final.
- Clientes falsos.
- Sin red real.

### REAL-06 — Dos rondas y prevención de loops

- Ronda inicial.
- Ampliación focalizada.
- Máximo 2.
- Detección de repetición.
- Presupuesto.
- Estado `review_required`.
- Sin llamadas reales.

### REAL-07 — Controles de roles y Extensión

- Aventura.
- Estudiante.
- Incrementos de 100 palabras.
- Defaults.
- Instrucciones por perfil.
- Advertencia por evidencia insuficiente.

### REAL-08 — Piloto integral sin red

- Morella.
- Tavily falso.
- OpenAI falso.
- Presupuesto.
- Ledger.
- Dos perfiles.
- Incidencias.
- Recuperación.
- Cero publicaciones.

### REAL-09 — Piloto real Morella

- Una tarea.
- Tavily real.
- OpenAI real.
- Máximo 0,20 EUR normal.
- Desviación manual hasta 0,25 EUR.
- Límite absoluto 0,50 EUR.
- Dos rondas.
- Sin regeneración.
- Cero publicaciones.
- Auditoría humana.

### REAL-10 — Piloto real 3–5 destinos

- Distintos tipos.
- Coste.
- Calidad.
- Repetición.
- Incidencias.
- Ajustes.

### FASE 5A — Cola durable

- Tareas.
- Prioridad.
- Pausa.
- Reanudación.
- Cancelación.
- Estado.
- Progreso.
- Presupuestos.

### FASE 5B — Importación CSV

- Parser.
- Validación.
- Vista previa.
- Duplicados.
- Homónimos.
- Identidad.
- Coste.
- Confirmación.

### AUTOMATIC-01 — Ejecución secuencial nocturna

- Lote autorizado.
- Concurrencia 1.
- Límites.
- Resumen.
- Incidencias.
- Sin publicación.

### AUTOMATIC-02 — Escalado gradual

- Lotes de 10.
- Lotes de 20.
- Lotes de 50.
- Lotes de 100 solo tras estabilidad demostrada.

### AUDITORÍA FINAL

- Código.
- Seguridad.
- Persistencia.
- Costes.
- Idempotencia.
- Loops.
- Claves.
- Calidad.
- Automatic.
- Fronteras negativas.
- Documentación.
- Restauración.

## Política de avance autónomo

Codex puede avanzar sin confirmación entre prompts cuando:

- el prompt anterior termina correctamente;
- todas las validaciones pasan;
- el árbol queda limpio;
- el commit y push del bloque se completan;
- no hay gasto real;
- no hay operación destructiva;
- no aparece una decisión de producto nueva.

Debe detenerse cuando:

- falla una prueba, typecheck, lint o build;
- aparece un cambio inesperado;
- una migración no coincide con el diseño;
- existe riesgo de pérdida de datos;
- puede exponerse una clave;
- el ledger y el proveedor discrepan;
- una llamada real supera o puede superar el presupuesto;
- hay timeout de facturación ambigua;
- se alcanza el máximo de dos rondas;
- se requiere una tercera búsqueda;
- hay pérdida de trazabilidad;
- la calidad real no alcanza el mínimo;
- se requiere ampliar el lote real;
- se llega a REAL-09, REAL-10 o cualquier ejecución con coste sin autorización preexistente expresa.

## Fronteras vigentes

Hasta una fase posterior separada:

- Trawel desconectado.
- Producción desconectada.
- Publicación bloqueada.
- Aprobación no publica.
- No hay campañas.
- No hay correo.
- No hay concurrencia mayor que 1.
- No hay borrado destructivo.
