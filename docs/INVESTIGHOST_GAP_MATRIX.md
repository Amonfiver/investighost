# Matriz de brechas — Investighost

Fecha: 2026-07-11. Estados referidos al código ejecutable actual, no a intención documental.

| Función / dominio | Estado | Dependencias / bloqueo | Brecha principal |
|---|---|---|---|
| Electron + renderer | Parcial / roto | Decisión técnica | Bundles compilan, pero dev falla al importar Electron main. |
| Preload e IPC seguro | Parcial | Decisión de seguridad | Aislamiento correcto; falta validación runtime integral, autorización y auditoría. |
| Configuración y secretos | Parcial | Claves + decisión humana | `.env` ignorado; no hay almacén seguro, rotación ni secretos cloud. |
| Investigación y contenido | Parcial | Brave/Kimi + claves | Pipeline existe; sin contraste factual completo, retries, versiones o persistencia. |
| IA multi-proveedor | Placeholder/parcial | Claves + modelos + presupuesto | Solo Kimi real; OpenAI/local y compare/fallback de producto no demostrados. |
| Búsqueda web | Parcial | Clave Brave | Brave usa snippets; mock disponible; otros proveedores no existen y hay tipos desalineados. |
| Contratos TypeScript/Zod | Parcial | Decisión humana | Cubren MVP antiguo; estados divergentes y sin contrato completo Trawel/domínios. |
| SQLite/Drizzle local | Placeholder | Decisión técnica | 12 tablas declaradas; sin conexión, migraciones, repositorios ni datos durables. |
| Supabase/Auth/RLS/Storage | No existe | Proyecto/keys + decisión humana | No hay arquitectura cloud ejecutable ni multiusuario. |
| Biblioteca de producción | No existe | Persistencia + UX | Solo listado de solicitudes de la sesión. |
| Edición y versionado | No existe | Contratos + UX | El borrador solo se visualiza. |
| Revisión/aprobación/rechazo | Placeholder | Roles + UX | Módulo lanza error; sin acciones UI ni trazabilidad. |
| Cola editorial | Parcial/placeholder | Persistencia + cloud | Algoritmo en memoria, desconectado de IPC/UI/scheduler. |
| Publicación Trawel | Placeholder | Trawel + autorización humana | Sin mapper, idempotencia, validación, conexión o prueba controlada. |
| Aportaciones de usuarios | No existe | Trawel/Supabase + decisión humana | Sin bandeja, estados ni respuesta. |
| Moderación de fotos | No existe | Storage/Trawel + legal | Sin subida, derechos, consentimiento, retirada ni publicación. |
| CRM y contactos | No existe | Supabase + legal + roles | Sin contactos, consentimientos, segmentos, tareas o supresión. |
| Correo individual | No existe | Proveedor/clave/dominio | Sin adaptador, plantillas, historial, webhooks o bajas. |
| Campañas y correo grupal | Bloqueada | Pausa legal + proveedor | Sin implementación; requiere base jurídica y validación humana. |
| Prospección comercial | Bloqueada | Pausa legal | No implementar hasta política legal y fuentes legítimas aprobadas. |
| Anunciantes y clientes | No existe | Modelo + roles | Sin fichas, contratos, pagos, renovaciones ni historial. |
| Anuncios | No existe | Trawel + decisión humana | Sin estados, creatividades, fechas, métricas o caducidad. |
| Placements/inventario | Bloqueada | Depende de Trawel | Nombres, formatos, páginas, límites y almacenamiento no definidos. |
| Alertas de caducidad | No existe | Cloud/Cron + correo | Sin scheduler, reglas ni historial. |
| Analytics | Bloqueada | Instrumentación Trawel + proveedor | Sin contrato de eventos, ingestión, agregados o dashboards. |
| Informes comerciales | No existe | Analytics real | Sin datos, comparativas ni exportación; no deben inventarse métricas. |
| Auditoría operativa | Parcial/placeholder | Persistencia + identidad | Logs de IA en memoria; sin actor, payload durable ni eventos completos. |
| Seguridad y privacidad | No existe documental/operativa | Decisión humana/legal | Falta documento, retención, incidentes, consentimiento y controles. |
| Automatización Edge/Cron | No existe | Supabase + zona horaria | Ninguna tarea funciona con Electron cerrado. |
| Tests y aceptación | No existe | Decisión técnica | No hay script, framework, suite ni `ACCEPTANCE_TESTS.md`. |
| Lint | Roto | Corrección técnica | 15 errores actuales. |
| Typecheck | Existe / funciona | — | `npx tsc --noEmit` pasa; falta script canónico. |
| Build Vite | Existe / funciona | — | Renderer/main/preload compilan. |
| Packaging/release | Roto | Entorno Windows + release | Fallo de symlinks en winCodeSign; icono/firma/update no resueltos. |
| Documentación de entrada | Placeholder | Decisión editorial | README vacío; documentos canónicos incompletos y algunos desactualizados. |

## Lectura global

- **Existe y funciona:** base de compilación Vite, typecheck, IPC básico, validación de input y piezas del pipeline Brave/Kimi.
- **Parcial:** investigación, búsqueda, proveedores, contratos, UI, cola y auditoría.
- **Placeholder:** persistencia, revisión/editorial modular, publicación Trawel y proveedores alternativos.
- **No existe:** la mayor parte de dominios operativos, empresariales, cloud, seguridad/compliance y calidad automatizada.
- **Bloqueada:** campañas/prospección por legal; publicación/placements/analytics por Trawel; cloud por decisiones/credenciales.

