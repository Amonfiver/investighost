# FASE 3C — identidad geográfica canónica

Fecha: 2026-07-21
Estado: aprobada técnicamente

## Fuente canónica y snapshot

El catálogo MVP usa **GeoNames Gazetteer**, cuyo dump oficial es UTF-8 tabulado, descargable por país y publicado bajo Creative Commons Attribution 4.0. La referencia oficial es `https://download.geonames.org/export/dump/`; el runtime no llama a la API ni depende de red.

El snapshot `geonames-2026-07-20` está fijado en `data/geography/geonames-es-mvp-2026-07-20.json`. Su alcance mínimo es España → Comunitat Valenciana → Morella. Registra URL, licencia, fecha de adquisición, última modificación y SHA-256 de:

| Artefacto | SHA-256 |
|---|---|
| `ES.zip` | `7eabc21e26b96136e6228080eb9fdfb937a58badcae89378fa44488662780069` |
| `alternateNames-ES.zip` | `1e648d98ef18163595dc70c615f4ccdbb0f8692b8a81389a9aa5d0ae53050ecf` |
| `admin1CodesASCII.txt` | `34784457b76b988a669dff7c3e4b104e4902c0875643cff019281ac79dfa2992` |
| `countryInfo.txt` | `93bafc525813f22e4711ff9ed6d626343094ce48c26388dc7c49189b3d7d5512` |

IDs GeoNames importados: España `2510769`, Comunitat Valenciana `2593113` y Morella `3116121`. Los homónimos Testland/San Pedro son fixtures CC0 claramente separados y no se presentan como datos reales.

## Persistencia y procedencia

La migración `20260721020000_geography_resolution.sql` añade:

- `geographic_source_snapshots` y `geographic_source_artifacts` para versión, licencia, alcance, URL y hashes;
- `geographic_external_ids` para IDs externos normalizados;
- `geographic_resolution_corrections` para decisiones humanas ligadas a consulta, versión de catálogo y actor;
- `source_snapshot_id` y `source_checked_at` en las entidades geográficas.

Todos los objetos tienen RLS de denegación por defecto y acceso exclusivo de `service_role` local. La migración también corrige las FKs de las tablas puente editoriales para que la eliminación de un agregado borre sus relaciones dependientes sin violar el orden de cascadas.

## Algoritmo determinista

`GeographicResolver` opera únicamente sobre `GeographyCatalogRepository`:

1. normaliza Unicode, diacríticos, apóstrofes, puntuación y espacios;
2. aplica filtros explícitos de país, región y tipo;
3. busca corrección humana para la misma consulta y versión de catálogo;
4. puntúa nombre exacto, alias completo y similitud Levenshtein;
5. usa los segmentos separados por coma para contrastar jerarquía;
6. devuelve `resolved`, `ambiguous` o `not_found`.

Los empates dentro del margen definido siempre son visibles. El resolver no crea entidades ni pide a una IA que improvise destinos. Una corrección solo puede elegir uno de los candidatos mostrados y solo afecta a la versión de catálogo en la que se registró.

## Gate y evidencia

- Nombre exacto y alias devuelven el mismo UUID local.
- Un typo tolerable resuelve Morella; una entrada ausente devuelve `not_found`.
- `San Pedro` muestra dos candidatos; `San Pedro, Norte, Testland` resuelve por jerarquía.
- La elección humana se repite en la misma versión y vuelve a ambigua al cambiar la versión.
- Snapshot/migración: 4 pruebas; resolución: 7 pruebas; total específico 11/11.
- Integraciones locales: catálogo/corrección 1/1 y agregado/limpieza 1/1.
- Reset y lint de base aprobados; seed limpio: 8 entidades, 7 aliases, 3 IDs externos, 1 snapshot, 4 artefactos, 0 correcciones y 0 solicitudes.

No se conectaron producción, Trawel o proyectos remotos; no se ejecutaron `supabase link` ni `supabase db push`. No se implementó Automatic.
