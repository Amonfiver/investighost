# Parche arquitectónico: modo Automatic

Estado: decisión documental permanente aprobada el 2026-07-14. No autoriza implementación, migraciones ni conexión con producción.

## Decisión central

Investighost tendrá dos formas de iniciar producción editorial sobre un único pipeline canónico:

- **Manual:** una persona solicita un destino y ejecuta una investigación completa.
- **Automatic:** una futura campaña de investigación resuelve un alcance territorial y orquesta repetidamente el mismo caso de uso Manual, con ejecución secuencial primero y concurrencia limitada solo cuando sea estable.

Automatic no es un segundo motor. Manual y Automatic compartirán contratos Zod, prompts, proveedores, validadores, controles de calidad, estados editoriales, repositorios, resultados, mappers e itinerario de publicación. El nombre conceptual del caso de uso es `ResearchDestination(destination, editorialProfiles, options)`; su firma definitiva se cerrará al consolidar contratos y no se implementa en este parche.

## Pipeline único por destino

1. Resolver identidad geográfica desde una fuente canónica y versionada.
2. Detectar contenido existente y decidir omisión o reprocesado.
3. obtener y valorar fuentes;
4. extraer y normalizar hechos, lugares, actividades y referencias;
5. generar los perfiles editoriales canónicos, inicialmente Aventura y Estudiante;
6. comprobar cobertura, fiabilidad, repetición, clichés y diferenciación real entre perfiles;
7. persistir en Supabase local y enviar a revisión humana;
8. aprobar, rechazar o corregir;
9. preparar por separado el handoff validado hacia Trawel.

No se permite convertir Estudiante en una reescritura superficial de Aventura ni publicar automáticamente.

## Orquestación futura

Una campaña de investigación mantendrá alcance, snapshot de configuración, objetivos territoriales, progreso, costes, intentos y ejecuciones. Cada objetivo enlazará con las mismas solicitudes, ejecuciones y resultados usados por Manual; la campaña nunca almacenará contenido editorial paralelo.

La implementación futura deberá soportar persistencia tras cada destino, pausa/reanudación, recuperación tras reinicio, backoff, aislamiento, idempotencia, bloqueo de doble ejecución, límites de coste y concurrencia, parada ante errores repetidos y resumen auditable. Las entidades, tablas y estados exactos se diseñarán en esa fase; los nombres orientativos del parche original no son contratos vigentes.

“Campaña de investigación” es un concepto editorial distinto de `Campaign`, `CampaignAudience` y `CampaignDelivery`, reservados a campañas de correo de FASE 10. No compartirán estados ni requisitos legales de envío, aunque sí identidad, RBAC y auditoría comunes.

## Persistencia y Trawel

Supabase local/PostgreSQL y Storage local son la única persistencia del MVP. No habrá SQLite, base temporal adicional ni tablas manual/automatic duplicadas.

Trawel sigue siendo el escaparate final. Solo contenido aprobado atraviesa la ruta única:

```text
Contenido editorial canónico → TrawelMapper → contrato Trawel → cola de publicación → aprobación humana → Trawel
```

Campañas, borradores, notas, fuentes internas, costes y métricas privadas no salen de Investighost. Se resuelven IDs existentes, se conserva idempotencia y trazabilidad, y cualquier discrepancia se absorbe en el mapper, nunca duplicando el dominio. La referencia documental de Trawel no sustituye verificar su esquema real antes de una futura conexión autorizada.

## Posición obligatoria en la hoja de ruta

Automatic solo podrá implementarse después de:

1. finalizar FASE 2C, comenzando ahora por FASE 2C-C;
2. completar y aceptar el flujo Manual de extremo a extremo;
3. consolidar contratos editoriales y el modelo canónico;
4. implementar calidad, trazabilidad, recuperación, reintentos e idempotencia.

Después se implementará Automatic secuencial, y solo luego concurrencia limitada. La publicación seguirá siendo un subsistema separado y sometido a aprobación humana.

## Criterios futuros de aceptación

- Alcance territorial estable, versionado y auditable, sin listas inferidas cada vez por IA.
- Cada objetivo usa exactamente el pipeline Manual y termina en revisión humana.
- Reanudar no duplica; un fallo no bloquea la campaña; progreso, coste y errores son visibles.
- Aventura y Estudiante son útiles, diferentes y respaldados por fuentes.
- No hay SQLite, publicación automática ni conexión productiva implícita.
- El resultado aprobado usa el único mapper y contrato de Trawel.

Fuente incorporada: `INVESTIGHOST_PARCHE_ARQUITECTONICO_MODO_AUTOMATIC.txt`, recibida el 2026-07-14.

