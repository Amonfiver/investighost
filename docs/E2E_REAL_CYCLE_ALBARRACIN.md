# E2E-05 — Cierre del ciclo real de Albarracín

Fecha: 2026-08-09

Estado: PASS real validado

Rama: `feat/investighost-real-pipeline`

HEAD de partida: `570f63f8ef09d24b010f00c005f49d1321d425b4`

## 1. Alcance ejecutado

Se cerró exclusivamente el ciclo autorizado para Albarracín:

```text
resultado humano aprobado del Prompt 43
  → Biblioteca durable local
  → current approved inequívoco por perfil
  → dos drafts privados en Trawel
  → read-back real
  → comparación contractual exacta
```

No se regeneró contenido, no se llamó a Tavily ni OpenAI, no se publicó, no se
conectó Automatic y no se inició producción masiva. El repositorio Trawel se
inspeccionó en modo read-only y no recibió cambios de código.

## 2. Aprobación y Biblioteca durable

La decisión humana terminal es
`b0a93f4c-e64c-4886-8fe7-845ed81e6c10`. La incorporación durable a Biblioteca
es una única transferencia idempotente:

- `transferId`: `fa97dae8-a824-450a-a9dc-d9bf799f99f5`;
- `transferKey`: `186dfe20623ebf8ef569a98990c7d3dda25e2af049d5faae82c37549daa88f9e`;
- estado: `ready_for_library`;
- coste de la incorporación: `0 EUR`;
- publicación: cero;
- Trawel y Automatic permanecieron desconectados en el expediente local.

Las dos entradas son `approved_unpublished`, `approved`,
`ready_for_library` y `unpublished`:

| Perfil | `libraryEntryId` | Hash del artefacto humano aprobado | `current approved` | `contentHash` | `versionHash` |
|---|---|---|---|---|---|
| Aventura | `2311ae35-e677-4cf2-aa78-e7ebbb0b6180` | `a9bec92333f4589305d9eb521272057b2674cb923106f3c8f7655ec79abfd81d` | `origin_v1`, versión 1 | `d8454e6f9a489cc2a0588ed570090dd61a9386229501aa65bfdec7976bed8a06` | `bc2230d4d11cd877fa465d88c30b28ea51cef047d0f63aa3050f7f23ca94a88e` |
| Estudiante | `7a686367-bb9f-40ee-a92e-42dcf2ef4d64` | `d00f4c45c5bebb59ca93e79f4095ff685faac0108c65d12f3338321d85a7d9ce` | `origin_v1`, versión 1 | `d1437e8a94bc129819dd8c9c1ba0e5aed6889e3b43109bff51e645fe3d1a76b0` | `8bddb15111d0d1a1f701465ff4b6f16f62deae7f3d417700b96289f06c13fb24` |

Los siete gaps, las cuatro contradicciones, las advertencias y la cobertura
`0,72` siguen en las entradas y en su trazabilidad. El handoff no los resolvió,
reinterpretó ni convirtió en datos verificados.

## 3. Incidencia canónica cerrada antes de Trawel

El primer preflight se detuvo antes de toda escritura remota porque el read
model `origin_v1` añade el salto de línea terminal exigido por
`investighost-library-c14n-v1`, mientras que los dos artefactos aprobados no lo
traían. En ambos perfiles:

- coincidían entry ID, título y hashes de artefacto;
- el origen tenía exactamente un carácter adicional;
- ese carácter era exclusivamente `\n` terminal;
- no existía ninguna otra diferencia de contenido.

Se corrigió el validador para admitir solo esas dos representaciones: igualdad
literal o el único `\n` terminal añadido por el read model. Cualquier cambio
interno, añadido editorial o diferencia distinta sigue fallando. La prueba de
regresión usa exclusivamente datos sintéticos.

## 4. Preflight Trawel y target

Antes de insertar se comprobó de nuevo:

- URL, project ref enlazado y credenciales coherentes, sin exponer secretos;
- migraciones remotas 001–014 presentes y alineadas con Trawel;
- columnas contractuales de `editorial_contents` accesibles;
- país activo `espana`, código `ES`;
- zona activa `albarracin`, ID
  `2aa4f21f-a2f3-4325-9f08-44b9b452041e`;
- cero filas editoriales previas para ese target;
- cero filas para los dos IDs deterministas;
- cero filas visibles por el cliente público.

El target cerrado fue `zone / espana / albarracin`. No se creó ni modificó el
catálogo territorial.

## 5. Transferencia y verificación real

La identidad durable del handoff es:

- `handoffKey`: `4fa1519ccf060cb7a76c8776da85cd700c4833b9af17f65fb968c3ecc6428471`;
- `payloadFingerprint`: `0f5debd8a1b3f5a28c7f58e9b716d6b4bd0441e0183fac5a1e0b9a4ffe2fe28a`;
- filas: `0a2cb328-d11b-89b6-8bb4-6ca70ecfd995` y
  `65f99196-09de-8f8d-bba8-a0d5a57c6a57`.

El primer pase insertó exactamente las dos filas. El servicio releyó el estado
durable y comparó todas las columnas contractuales: target, perfil, título,
contenido, campos vacíos cerrados, fuentes públicas proyectadas, procedencia,
versión, hashes, estado `draft`, revisión y ausencia de publicación. Solo se
excluyeron `created_at` y `updated_at`, gestionados por Trawel.

Resultado:

- outcome `PASS`, operación `inserted`;
- dos filas privadas exactas;
- cero diferencias;
- cero pérdidas silenciosas;
- dos filas totales para el target, sin filas adicionales;
- cero filas devueltas por el cliente público;
- `status = draft`, `published_at = null`;
- coste local sin cambios: `0,360047 EUR` gastados y `0 EUR` reservados.

Un segundo pase inmediato devolvió `reused`. Después se abrió otro proceso,
se reconstruyó la identidad desde Biblioteca y el target, y se repitió la
verificación: encontró las mismas dos filas, devolvió otra vez `reused`, no
insertó ninguna y mantuvo cero filas públicas. Esto demuestra recuperación e
idempotencia posteriores, no solo éxito dentro del proceso escritor.

La trazabilidad recuperable queda tanto en los IDs y fingerprints anteriores
como en `metadata.investighost` de cada fila, que conserva entrada, transferencia,
piloto, run, decisión terminal, perfil, versión aprobada y hashes.

## 6. Recomendación para un piloto de producción masiva

No se ha iniciado ningún lote. La recomendación es un primer lote de **tres
destinos**, siempre secuencial y con un único destino en vuelo:

- referencia observada por destino: `0,360047 EUR`;
- techo prudencial por destino: `0,420000 EUR`;
- coste observado estimado del lote: `1,080141 EUR`;
- límite diario recomendado: tres destinos y `1,260000 EUR`, aplicando el
  primero de los dos límites que se alcance;
- cada destino debe pasar preflight, investigación, revisión humana, Biblioteca
  y transferencia privada por separado;
- no se debe publicar en el mismo paso de transferencia.

Tratamiento operativo recomendado:

1. Una cola durable FIFO con estados explícitos y como máximo un destino en
   ejecución; las decisiones humanas no bloquean ni reordenan silenciosamente
   otros expedientes.
2. Retry automático solo para operaciones demostrablemente idempotentes. Una
   llamada de proveedor ambigua se concilia o escala; nunca se repite a ciegas.
3. Un parcial privado de Trawel se conserva y recupera por los mismos IDs. Un
   conflicto o read-back distinto se detiene sin overwrite, delete ni publish.
4. Revisión humana obligatoria de ambos perfiles antes de Biblioteca. La
   transferencia usa exclusivamente `current approved` y la publicación requiere
   una autorización independiente.
5. Ritmo máximo: incorporar y transferir un destino, verificarlo, y solo entonces
   tomar el siguiente. La eventual publicación debe ir en otra cola humana.
6. Paradas automáticas ante presupuesto insuficiente, reserva ambigua, source cap,
   cobertura o contradicciones que exijan decisión, proveedor no conciliado,
   target divergente, fila inesperada, read-back parcial/diferente, visibilidad
   pública no autorizada o pérdida de idempotencia.

Tras los tres destinos debe hacerse una revisión humana del coste medio, tasa de
gaps, intervenciones, fallos y calidad antes de aumentar lote o límite diario.

## 7. Validación de cierre

- Biblioteca, handoff y adaptadores afectados: 91 pruebas aprobadas, más la
  integración de transición local aprobada; las integraciones opcionales de
  versionado se ejecutaron después de forma explícita;
- BIB-V02 PostgreSQL sintético aislado: 5/5;
- BIB-V03 PostgreSQL sintético aislado: 6/6;
- BIB-V04 PostgreSQL sintético aislado: 6/6;
- BIB-V05 PostgreSQL sintético aislado y read-only: 2/2;
- suite completa: 705 aprobadas, 30 integraciones opcionales omitidas, cero
  fallos; las 19 pruebas opcionales BIB omitidas aquí son las mismas aprobadas
  por separado en los cuatro puntos anteriores;
- typecheck: aprobado;
- lint estricto: aprobado;
- `git diff --check`: aprobado;
- diff final: revisado antes del commit.

## 8. Declaración

Con la evidencia real anterior, el resultado funcional es:

`E2E REAL CERRADO — APTO PARA PILOTO DE PRODUCCIÓN MASIVA`

Esta declaración habilita únicamente proponer el piloto pequeño descrito. No
autoriza ni inicia producción masiva ni publicación.
