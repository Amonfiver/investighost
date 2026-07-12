# Plan del entorno Supabase de desarrollo — FASE 2A

Estado: plan; proyecto no creado y sin credenciales.

## Identidad y región

- Nombre recomendado: `investighost-trawel-dev`.
- Organización: la misma organización controlada por el owner, si su política lo permite.
- Región: **pendiente de confirmación humana** tras consultar la región visible del proyecto productivo; preferir la misma o equivalente cercana.
- Entornos canónicos: `local`, `development`, `production`; sin staging en MVP.

## Variables y separación

Nombres previstos, sin valores en Git:

- renderer/main autenticado dev: `INVESTIGHOST_ENV=development`, `SUPABASE_DEV_URL`, `SUPABASE_DEV_ANON_KEY`, `SUPABASE_DEV_PROJECT_REF`.
- automatización administrativa futura, solo CI/terminal segura: `SUPABASE_DEV_DB_URL` y `SUPABASE_DEV_SERVICE_ROLE_KEY`; nunca Electron ni renderer.
- producción usa nombres distintos (`SUPABASE_PROD_*`) y no se cargará en comandos dev.

La aplicación debe fallar cerrada si `INVESTIGHOST_ENV`, host y project ref no coinciden con una allowlist versionada sin secretos. Development bloquea toda ref productiva y muestra banner permanente `DESARROLLO`.

## Reproducción del esquema Trawel

1. Obtener autorización de lectura de esquema y backup vigente.
2. Exportar **solo DDL** del proyecto productivo con herramienta oficial, sin filas, `auth.users`, objetos Storage ni secretos.
3. Guardar el snapshot revisado en un artefacto seguro/versionable sin owners, grants sensibles ni credenciales.
4. Comparar snapshot con `TRAWEL_DATABASE_REFERENCE_FOR_INVESTIGHOST.txt`; registrar divergencias antes de proponer SQL.
5. Aplicar primero el baseline compatible al proyecto dev vacío mediante proceso separado (FASE 2B).
6. Aplicar migraciones Investighost una a una, probar constraints/RLS y registrar hashes.

No se usará un dump de producción con datos. Si hace falta catálogo geográfico, se generan fixtures mínimos ficticios o un subconjunto expresamente autorizado y sin PII.

## Datos ficticios

- Seeds separados y marcados `DEV ONLY`; IDs/hosts/emails reservados para ejemplo.
- Un usuario owner de prueba y cuentas por rol solo cuando se pruebe RLS.
- País/ciudad/destino ficticios o registros públicos expresamente autorizados.
- Storage usa archivos sintéticos con licencia de test; nunca fotos privadas reales.

## Protecciones contra producción

- scripts dev/prod separados, sin fallback entre variables;
- confirmación escrita de entorno y project ref antes de cualquier operación destructiva;
- CI de ramas feature solo conoce secretos dev;
- cuenta/database role de desarrollo sin acceso a producción;
- banner visible y telemetría/log con environment;
- service role ausente de Electron y de `.env` compartido;
- migraciones productivas requieren backup, diff, dry-run donde sea viable, dos revisiones y pausa humana.

## Gate para crear el proyecto

Hace falta que el owner confirme nombre, organización, región y responsable de costes/backups. Crear el proyecto pertenece al siguiente bloque, no a FASE 2A.

