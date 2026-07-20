# FASE 3D — proveedores y adquisición de fuentes

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Contrato desacoplado

`EditorialSourceProvider` separa tres operaciones:

1. `discover`: consulta y devuelve candidatos HTTPS limitados;
2. `read`: obtiene un documento o clasifica enlace roto/no disponible;
3. `evaluate`: decide aceptación, tipo, ámbito, actualidad, fiabilidad y motivo.

El contrato no contiene API keys, tokens, headers de autorización ni configuración de renderer. Un proveedor futuro autorizado se inyectará desde Electron main y deberá implementar el mismo puerto sin cambiar `ResearchSource`, `ProviderUsage`, `ResearchEvent` o el resto del dominio.

## Orquestación segura

`SourceAcquisitionService` aporta:

- timeout por operación con `AbortSignal` y cancelación explícita;
- retry solo de errores transitorios, intentos máximos y backoff acotado;
- límites de consultas, resultados, fuentes y caracteres de documento;
- estimación/cobro por operación, moneda y presupuesto máximo;
- circuit breaker por proveedor con umbral y ventana configurables;
- normalización de URL, deduplicación por URL y detección de contenido duplicado;
- clasificación honesta de enlaces rotos/no disponibles y contratos inválidos;
- `ProviderUsage` por intento y eventos sin consulta, documento o secreto;
- ejecución secuencial y determinista.

Los documentos leídos se entregan en memoria a 3E; PostgreSQL recibe metadatos/fuentes, huellas, uso y eventos, no claves ni cuerpos crudos por defecto.

## Simulación obligatoria en 3D

`MockEditorialSourceProvider` es el único proveedor nuevo de esta fase. Declara `simulation = true`, usa fixtures deterministas y permite simular fallos de descubrimiento, lectura, evaluación, latencia, enlaces rotos y respuestas duplicadas. No realiza red ni lee variables de credenciales.

## Gate y evidencia

- Descubrimiento/lectura/evaluación completos con mock y dominio canónico.
- URLs normalizadas y duplicadas; contenido espejo enlazado mediante `duplicateOfId`.
- Enlace roto persiste como `unavailable`, no como fuente aceptada.
- Dos fallos de lectura transitorios se recuperan en el tercer intento.
- Timeout, cancelación, presupuesto y límite de consultas producen códigos explícitos.
- Dos fallos consecutivos abren el circuit breaker.
- Coste `0.06 EUR` se reconcilia con tres operaciones y los eventos no contienen consulta ni cuerpo secreto.
- Tests específicos: 9/9.

No se activó OpenAI, Kimi, Brave u otro proveedor real; no se usaron credenciales, producción o Trawel. No se implementó Automatic.
