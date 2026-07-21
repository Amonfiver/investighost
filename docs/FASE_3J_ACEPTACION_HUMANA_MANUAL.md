# FASE 3J — Protocolo de aceptación humana del flujo Manual

Fecha de preparación: 2026-07-21
Estado: **PREPARADA — ACEPTACIÓN HUMANA PENDIENTE**
Responsable de decisión: jefe del proyecto

## Alcance del gate

Este protocolo valida el único flujo Manual canónico en Electron, con Supabase local, catálogo/fixtures sintéticos y proveedores mock. La persona evaluadora no necesita SQL ni herramientas externas dentro del flujo. Un facilitador técnico puede arrancar previamente el entorno local.

Aceptar 3J no publica, no conecta Trawel o producción, no activa proveedores reales y no autoriza Automatic ni FASE 4. Cualquier trabajo posterior requiere un encargo nuevo y explícito.

## Preparación reproducible

1. Usar la rama `feat/investighost-reinvencion` sincronizada y anotar el hash probado.
2. Confirmar Supabase local operativo y la aplicación con el indicador `Supabase local`.
3. Confirmar el banner `Local · Manual · Simulado` y `Publicaciones: 0`.
4. Mantener Aventura y Estudiante seleccionados, idioma español, presupuesto de 2 EUR e intentos máximos 3 salvo indicación del escenario.
5. Usar únicamente Morella (`ES`) y los homónimos sintéticos San Pedro (`ZZ`). No introducir datos personales o destinos reales adicionales.
6. Guardar por escenario: resultado, observación, captura opcional, request ID visible en el detalle técnico si se solicita y defecto encontrado.

El selector `Escenario sintético de aceptación` ofrece: flujo válido, fuentes insuficientes, fuente rota, proveedor no disponible en el primer intento y ejecución lenta interrumpible. El selector solo cambia mocks locales y queda registrado en la configuración de la solicitud.

## Escenarios obligatorios

| ID | Acción humana | Resultado exigido |
|---|---|---|
| J01 Destino válido | Resolver `Morella`, país `ES`, tipo `Localidad`; ejecutar `Flujo válido`. | Identidad Morella/GeoNames visible; termina en revisión humana con dos borradores y sin publicación. |
| J02 Ambigüedad | Resolver `San Pedro`, país `ZZ`, tipo `Localidad`. | Se muestran Norte y Sur; no se elige silenciosamente. |
| J03 Corrección geográfica | En J02 elegir explícitamente `San Pedro › Sur`. | La selección humana resuelve el ID Sur y conserva método/procedencia. |
| J04 Destino duplicado | Ejecutar otra investigación válida de Morella. | Nueva solicitud, mismo ID geográfico canónico; no aparece otra entidad Morella. |
| J05 Fuentes insuficientes | Ejecutar Morella con `Fuentes insuficientes`. | Falla honestamente con `NO_ACCEPTED_SOURCES`; la incidencia queda en biblioteca y admite acción controlada. |
| J06 Fuente rota | Ejecutar Morella con `Una fuente rota`. | La fuente HTTP 404 figura `unavailable`; la fuente válida y la evidencia restante no se ocultan. |
| J07 Proveedor no disponible | Ejecutar `Proveedor no disponible en el primer intento`. | Primer intento falla `PERMANENT`; biblioteca muestra etapa/código/mensaje. |
| J08 Reintento idempotente | En J07 pulsar `Reintentar etapa`. | Segundo intento completa; sigue existiendo una solicitud, el historial muestra dos runs enlazados y no duplica el destino ni el agregado. |
| J09 Interrupción y reanudación | Ejecutar `Ejecución lenta para interrumpir`; cerrar Electron mientras progresa, esperar a que venza el lease si fuera necesario y abrir de nuevo. | La biblioteca conserva el scaffold; `Reanudar` continúa desde checkpoint o etapa durable y termina sin otra solicitud. |
| J10 Persistencia tras reinicio | Cerrar Electron con J01 ya completado y volver a abrir. | Biblioteca, detalle, fuentes, borradores, costes e historial reaparecen idénticos. |
| J11 Perfiles diferenciados | Comparar Aventura y Estudiante en J01. | Aventura prioriza ruta/preparación/riesgos; Estudiante presupuesto/vida diaria/estudio. No son una paráfrasis superficial. |
| J12 Regeneración | Regenerar una sola sección con un motivo concreto. | Se crea v2 enlazada, solo cambia la sección elegida, RevisIAtor se recalcula y se suma 0,02 EUR. |
| J13 Corrección editorial | Editar una sección, cambiar contenido y explicar el motivo. | Se conserva v1, aparece nueva versión humana y el historial registra actor/motivo. |
| J14 Rechazo | Enviar un borrador válido a revisión y rechazarlo con comentario. | Transición `ready → in_review → rejected`; no publica. |
| J15 Aprobación | Enviar el otro borrador válido a revisión y aprobarlo con comentario. | Estado local `approved`; mensaje explícito confirma que no se publicó ni envió a Trawel. |
| J16 Coste e historial | Abrir `Historial` después de J08 y J12. | Se ven intentos, recuperación, versiones, eventos, proveedor, unidades y costes reconciliables. |
| J17 Fronteras negativas | Revisar navegación, acciones y mensajes tras aprobar/rechazar. | No existe acción de publicar, Automatic, credencial, endpoint Trawel o producción; contador de publicaciones sigue en cero. |

## Criterio de aceptación

El gate solo puede aprobarse si J01–J17 están ejecutados y todos cumplen el resultado exigido. Un defecto de datos, recuperación, idempotencia, coste, trazabilidad, decisión humana o frontera negativa rechaza el gate. Un problema puramente cosmético puede anotarse, pero el jefe decide expresamente si bloquea.

## Acta de decisión humana

- Commit probado: ______________________________
- Fecha/hora: _________________________________
- Evaluador: __________________________________
- Escenarios aprobados: ________________________
- Defectos/bloqueos: ___________________________
- Decisión inequívoca: `APROBADO` / `RECHAZADO`
- Firma o confirmación escrita: _________________

Estado actual del acta: **sin decisión**. Automatic y FASE 4 permanecen bloqueados.
