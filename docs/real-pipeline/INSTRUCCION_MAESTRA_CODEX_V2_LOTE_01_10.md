# Instrucción maestra V2 para Codex — Lote autónomo sin gasto real

## Propósito

Ejecutar de forma autónoma y secuencial únicamente los bloques **PROMPT 01 a PROMPT 10** del documento:

`INVESTIGHOST_PROMPTS_IMPLEMENTACION_REAL.md`

Este lote prepara y audita el pipeline real, pero **no ejecuta Tavily ni OpenAI reales y no consume saldo**.

Al terminar PROMPT 10, Codex debe detenerse y entregar una auditoría consolidada. No debe ejecutar PROMPT 11 ni ningún bloque posterior.

## Proyecto y rama

- Proyecto: `D:\Proyectos\investighost`
- Rama obligatoria: `feat/investighost-real-pipeline`
- Punto protegido:
  - etiqueta: `checkpoint/pre-real-pipeline-20260725`
  - commit: `18d8d33113c1412de07fb9f4189116100ccfa84b`

Antes de comenzar, confirmar:

- rama correcta;
- upstream correcto;
- divergencia `0/0`;
- árbol limpio;
- HEAD parte del checkpoint protegido;
- backups y manifiesto existentes en:
  `D:\Backups\investighost\pre-real-pipeline-20260725-0336`

Si cualquier condición no se cumple, detenerse.

## Archivos de autoridad

Leer íntegramente y en este orden:

1. `INVESTIGHOST_HOJA_DE_RUTA_REAL.md`
2. `INVESTIGHOST_PROMPTS_IMPLEMENTACION_REAL.md`
3. `docs/INVESTIGHOST_REANUDACION_ACTUAL.md`
4. `docs/ROADMAP.md`
5. `D:\Backups\investighost\pre-real-pipeline-20260725-0336\CHECKPOINT_MANIFEST.md`

La hoja de ruta define la visión del producto.
Los prompts numerados definen el alcance ejecutable.
Los documentos canónicos del repositorio definen el estado histórico.
El manifiesto define el punto de retorno.

## Límite del lote

Ejecutar solamente:

- PROMPT 01
- PROMPT 02
- PROMPT 03
- PROMPT 04
- PROMPT 05
- PROMPT 06
- PROMPT 07
- PROMPT 08
- PROMPT 09
- PROMPT 10

No ejecutar:

- PROMPT 11 — Piloto real Morella
- PROMPT 12 — Piloto de 3–5 destinos
- PROMPT 13 — Cola durable
- PROMPT 14 — Importación CSV
- PROMPT 15 — Automatic
- PROMPT 16 — Auditoría final total

Los bloques 11–16 requieren una autorización posterior y un nuevo lote controlado.

## Forma de ejecución

Para cada prompt:

1. Leer el prompt completo.
2. Confirmar el HEAD y árbol limpio heredados del bloque anterior.
3. Presentar internamente un plan corto.
4. Implementar exclusivamente el alcance del prompt.
5. Ejecutar las validaciones exigidas.
6. Actualizar documentación canónica y el informe acumulado.
7. Ejecutar `git diff --check`.
8. Crear un único commit con el mensaje indicado en el prompt.
9. Hacer push a `origin/feat/investighost-real-pipeline`.
10. Confirmar:
    - árbol limpio;
    - upstream sincronizado;
    - divergencia `0/0`.
11. Continuar automáticamente con el siguiente prompt.

No pedir confirmación humana entre prompts si todo está correcto.

## Informe acumulado obligatorio

Crear o mantener:

`docs/REAL_PIPELINE_EXECUTION_REPORT.md`

Añadir una sección por bloque con:

- número y nombre del prompt;
- fecha/hora;
- HEAD inicial;
- HEAD final;
- commit;
- archivos modificados;
- migraciones;
- pruebas;
- builds;
- decisiones;
- riesgos;
- deuda;
- coste real consumido: `0`;
- llamadas reales realizadas: `0`;
- confirmación de fronteras negativas.

## Migraciones locales

Solo crear y aplicar migraciones cuando el prompt lo autorice expresamente.

Para migraciones autorizadas:

- usar únicamente Supabase local;
- no ejecutar `supabase link`;
- no ejecutar `supabase db push`;
- no ejecutar `supabase db reset`;
- no tocar producción;
- documentar SQL, tablas, funciones, índices y reversibilidad;
- ejecutar pruebas de esquema e integración local;
- no borrar ni reinterpretar datos humanos existentes;
- detenerse ante cualquier riesgo de pérdida.

## Credenciales

Durante PROMPT 02 puede implementarse y probarse el almacenamiento seguro con secretos sintéticos.

Está prohibido:

- leer claves reales existentes;
- imprimir claves;
- registrar claves;
- guardar claves en Supabase;
- guardar claves en Git;
- devolver claves al renderer;
- llamar a Tavily u OpenAI;
- probar conexión real.

Las pruebas deben usar credenciales falsas y adaptadores falsos.

## Proveedores y gasto

Hasta terminar PROMPT 10:

- Tavily real: desactivado.
- OpenAI real: desactivado.
- Feature flag real: desactivada.
- Créditos consumidos: 0.
- Tokens reales consumidos: 0.
- Coste real: 0 €.

Todos los clientes de proveedor deben ser falsos, simulados o inyectados.

## Detenciones obligatorias

Detener toda la secuencia, no hacer commit del bloque fallido y no continuar si:

- falla una prueba obligatoria;
- falla typecheck;
- falla ESLint;
- falla un build requerido;
- `git diff --check` falla;
- aparece un archivo ajeno al alcance;
- el árbol inicial no está limpio;
- la rama o upstream no coinciden;
- una migración amenaza datos;
- una clave puede filtrarse;
- `safeStorage` no resulta seguro;
- se realiza o podría realizar una llamada real;
- se consume saldo;
- el ledger puede quedar inconsistente;
- se detecta posibilidad de tercera ronda;
- existe posibilidad de loop;
- se requiere una decisión de producto no definida;
- se requiere Trawel, publicación, producción o Automatic;
- se necesita cualquier comando Supabase prohibido.

Al detenerse, entregar:

- bloque;
- error;
- estado Git;
- archivos afectados;
- última validación correcta;
- recomendación segura.

## Reglas de calidad

- No introducir arquitectura provisional destinada a desecharse.
- Mantener abstracciones `ResearchTool` e `IntelligenceEngine`.
- Tavily será la primera herramienta de investigación.
- OpenAI será el primer motor de inteligencia.
- Investighost seguirá siendo el orquestador.
- Máximo dos rondas de investigación.
- La segunda ronda será focalizada.
- No hay navegación web de OpenAI en esta arquitectura.
- Aventura y Estudiante comparten conocimiento maestro.
- Extensión por perfil es aproximada y sin relleno.
- Aprobar no publica.

## Cierre del lote

Después de PROMPT 10:

1. Ejecutar la auditoría previa completa definida allí.
2. Confirmar que PROMPT 11 permanece sin ejecutar.
3. Confirmar:
   - cero llamadas reales;
   - cero créditos Tavily;
   - cero tokens reales;
   - cero coste;
   - cero publicaciones;
   - Trawel desconectado;
   - Automatic no iniciado.
4. Confirmar árbol limpio y rama sincronizada.
5. Entregar un informe consolidado con:
   - commits 01–10;
   - migraciones;
   - pruebas;
   - riesgos;
   - defectos;
   - GO/NO-GO para el piloto real;
   - pasos humanos necesarios para configurar claves desde la aplicación;
   - presupuesto y límites que aparecerán en el preflight.
6. Detenerse.

No ejecutar PROMPT 11.
