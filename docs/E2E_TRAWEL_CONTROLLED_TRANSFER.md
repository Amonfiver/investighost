# E2E-03 — Transferencia controlada y read-back sintético

Fecha: 2026-08-08

Estado: mecanismo y E2E sintético cerrados; adaptador y destino reales no conectados

Rama: `feat/investighost-real-pipeline`

HEAD de partida: `b6e44337ee6a51990e010648499cced89a448d7a`

## 1. Alcance

E2E-03 añade el caso de uso mínimo que ejecuta:

```text
dos libraryEntryId confirmados
  → lectura autoritativa de un único current approved por entrada
  → payload determinista de E2E-02
  → confirmación exacta del target Trawel
  → inspección privada por los dos IDs deterministas
  → inserción exclusiva de filas ausentes
  → read-back privado obligatorio
  → comparación exacta + diferencias
  → lectura pública obligatoria = cero filas
  → PASS o FAIL tipado
```

La implementación está en:

- `src/shared/trawel-editorial-transfer-contracts.ts`;
- `src/modules/trawel-handoff/transfer-service.ts`;
- `tests/trawel-editorial-transfer.test.ts`;
- `tests/support/trawel-handoff-fixture.ts`.

No se añadió cliente Supabase, credencial, endpoint, migración, UI, IPC, preload, renderer, editor, publicación ni proveedor. Todos los puertos usados por las pruebas son objetos en memoria y todos sus datos son sintéticos.

## 2. Entrada y selección de fuente

El comando cerrado `investighost-trawel-editorial-transfer-v1` exige:

- exactamente dos `libraryEntryIds` distintos;
- target Trawel completo;
- actor UUID;
- `confirmed: true`.

`TrawelEditorialApprovedSourcePort` debe devolver exactamente dos uniones `entry + currentApproved`, una por cada ID solicitado. El servicio rechaza antes de tocar Trawel:

- cero, una, tres o más selecciones;
- dos selecciones para el mismo ID;
- un ID no solicitado o un ID solicitado ausente;
- entradas que no estén `approved_unpublished`, `approved`, `ready_for_library` y `unpublished`;
- un `current approved` publicado;
- cualquier incoherencia de perfil, versión, revisión, aprobación, origen o hash detectada por E2E-02.

El puerto no entrega una colección de revisiones entre las que el servicio pueda escoger. Debe materializar el read model autoritativo; el servicio solo acepta una respuesta inequívoca por entrada.

## 3. Puerto Trawel mínimo

`TrawelEditorialTransferPort` define únicamente cuatro operaciones:

1. `resolveTarget`: relee la identidad territorial y debe coincidir exactamente con el target confirmado;
2. `readPrivateDrafts`: lectura privilegiada por los dos IDs deterministas;
3. `insertPrivateDraft`: inserta una fila privada ya validada;
4. `readPublicRows`: comprueba por el canal público que esos IDs no son visibles.

El puerto no admite update, upsert, delete, publish, búsqueda por slug, creación territorial ni compensación. E2E-03 solo define la frontera; no crea su implementación remota.

## 4. Secuencia fail-closed

Antes de cualquier insert, el servicio:

1. valida el comando;
2. carga y valida las dos fuentes aprobadas;
3. prepara y verifica internamente el payload;
4. confirma el target exacto;
5. lee en privado ambos IDs;
6. rechaza cualquier fila preexistente incompatible.

Después inserta secuencialmente solo los IDs ausentes. Tanto si las inserciones responden correctamente como si una arroja error, el servicio relee el estado durable. Nunca convierte el OK del write en prueba de éxito.

La igualdad reutiliza el contrato E2E-02. Se comparan todas las columnas editoriales, target, estado privado, procedencia, versión aprobada, hashes e identidad. Solo `created_at` y `updated_at`, gestionados por Trawel en este subconjunto, se proyectan fuera de la comparación.

La comprobación pública ocurre después del read-back. Cualquier fila devuelta produce `PUBLIC_VISIBILITY_VIOLATION`; `status = draft` en la lectura privilegiada no sustituye esa prueba.

## 5. Resultados

Todos los resultados contienen `outcome` y nunca representan un parcial como éxito:

| `status` | `outcome` | Significado |
|---|---|---|
| `verified` | `PASS` | dos filas exactas tras read-back y cero filas públicas |
| `partial_private_draft` | `FAIL` | una fila exacta presente y otra ausente; retry seguro posible |
| `conflict` | `FAIL` | fila preexistente incompatible o read-back divergente |
| `error` | `FAIL` | comando, fuente, target, lectura, write o frontera pública fallidos |

Un `verified` distingue:

- `inserted`: no había filas y aparecieron ambas;
- `reused`: ambas ya existían idénticas y no hubo insert;
- `recovered_partial`: había una fila idéntica y solo se completó la ausente.

Los FAIL de comparación incluyen una lista ordenada y acotada de diferencias con `path`, clase, valor esperado y valor observado. Los errores de infraestructura se sanitizan y no propagan mensajes del puerto.

## 6. Idempotencia y parciales

No se inventa un recibo paralelo. La evidencia durable sigue siendo la definida en E2E-02:

- `handoffKey` estable para pareja y target;
- dos UUIDv8 deterministas;
- `payloadFingerprint` completo;
- procedencia dentro de cada fila.

Un retry idéntico relee los mismos IDs y los reutiliza sin insertar. Si solo existe una fila exacta, inserta la otra. Si el contenido aprobado cambió con la misma identidad, los IDs siguen siendo los mismos pero el fingerprint y la proyección difieren: el servicio devuelve conflicto y no sobrescribe.

Una interrupción tras la primera fila deja un `partial_private_draft` privado, sin delete compensatorio. La prueba repite el mismo comando y demuestra que se recupera insertando exclusivamente la fila faltante.

## 7. Evidencia sintética

Las pruebas demuestran:

- transferencia correcta y read-back posterior;
- copia exacta de Aventura v1 y Estudiante derivada aprobada;
- timestamps distintos permitidos;
- retry idéntico sin duplicados;
- parcial preexistente recuperado;
- interrupción en el segundo insert y recuperación posterior;
- discrepancia deliberada con diferencias por path;
- aprobación posterior incompatible sin overwrite;
- entrada no aprobada y fuente ambigua bloqueadas antes de Trawel;
- target leído divergente bloqueado antes de escribir;
- lectura pública no vacía tratada como violación;
- ausencia estática de clientes reales, proveedores, publicación y Electron.

El doble usa `Villa Sintética`, país `ZZ`, `example.test`, UUID reservados para fixture y coste cero. No usa Morella ni ningún dato durable real.

Validación de cierre:

- E2E-02 + E2E-03: 22/22;
- bloque afectado de Biblioteca + handoff: 54/54;
- suite completa: 671/671, con 41 integraciones condicionadas omitidas;
- typecheck: aprobado;
- lint: aprobado;
- `git diff --check`: aprobado.

## 8. Aplazado

- adaptadores Supabase reales para Biblioteca y Trawel;
- credenciales y project ref desplegado;
- preflight remoto de tabla, columnas, constraints y RLS;
- backup o evidencia de reversión que exija el gate real;
- selección y ejecución de un destino nuevo real;
- publicación o renderizado;
- UI, IPC, preload, renderer y editor;
- Tavily, OpenAI, Automatic, BIB-V06 y producción masiva.

E2E-03 no autoriza ninguna conexión remota ni transferencia real.
