# FASE 3E — estructuración factual

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Entrada y salida

`FactualStructuringService` recibe únicamente documentos de fuentes `accepted` y leídas en 3D. Un `FactualStructuringProvider` neutral propone:

- hechos con clave canónica, valor normalizado, afirmación, categoría, confianza, volatilidad y vigencia;
- lugares con clave, categoría, relevancia por perfil y claves factuales;
- actividades con público, duración, coste estable, temporada, requisitos, accesibilidad, riesgos y claves factuales.

La salida usa directamente `ResearchFact`, `ResearchPlace` y `ResearchActivity`. El único adaptador de esta fase es `MockFactualStructuringProvider`, marcado como simulación y sin red.

## Invariantes

- Cada hecho conserva uno o más `sourceIds` existentes.
- Un duplicado con misma clave/valor se fusiona y acumula fuentes; no genera otra afirmación.
- Una misma clave con valores distintos conserva todas las variantes como `contradiction = confirmed` y `reviewStatus = disputed`.
- Confianza combina propuesta y fiabilidad de la fuente; volatilidad/vigencia quedan explícitas.
- Lugares y actividades no pueden referenciar claves factuales ausentes.
- Lugares/actividades equivalentes fusionan hechos, fuentes, relevancia, audiencias, requisitos, accesibilidad y riesgos.
- IDs derivados de solicitud+clave+valor son deterministas para la misma entrada.
- Todo resultado vuelve a validarse con los schemas Zod canónicos.

Consejos y advertencias no forman texto libre desconectado: se representan como hechos de logística/seguridad o como requisitos/riesgos de actividades con fuentes.

## Checkpoint y reanudación

Después de cada fuente se sobrescribe idempotentemente el checkpoint `(run, fact_structuring, attempt)` con:

- versión contractual;
- orden completo de fuentes y siguiente índice;
- fuentes ya procesadas;
- hechos y su índice clave/valor;
- lugares y actividades;
- SHA-256 del snapshot.

Al reanudar se exige mismo run, intento, contrato, orden de fuentes y hash. Si cualquiera cambia, se devuelve `CHECKPOINT_MISMATCH`; nunca se mezcla un parcial con otra entrada. Una prueba fuerza caída en la segunda fuente y verifica que la reanudación invoca solo esa fuente.

## Gate y evidencia

- 8/8 tests específicos.
- Hechos duplicados fusionados y trazabilidad completa.
- Contradicción de coste conservada y marcada para revisión.
- IDs estables y schemas canónicos aprobados.
- Un checkpoint tras cada fuente y reanudación sin reprocesar.
- Orden distinto, referencia factual ausente, cero fuentes y cancelación fallan explícitamente.

No se genera texto editorial definitivo en esta fase. No hay proveedor real, Automatic, producción, Trawel o publicación.
