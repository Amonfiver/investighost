# TENEMOS NOTICIA — suficiencia editorial y parada económica

Fecha: 2026-09-08

## Diagnóstico previo

La decisión automática del workflow real dependía de `coverage.sufficient` y,
si era falso, de gaps `high`/`critical` con una query focalizada válida. Esto
protegía contra una tercera ronda y contra exceder el presupuesto, pero no
distinguía detalles omitibles de evidencia crítica ni justificaba el valor de
una llamada adicional frente a su coste. También podía declarar listo un
expediente de alta cobertura que conservase un gap peligroso.

## Decisión de diseño

`assessEditorialSufficiency` es un evaluador puro, determinista y sin llamadas
de proveedor. Se ejecuta después de cada análisis, antes de decidir la ronda 2
o la redacción, y se conserva dentro del checkpoint durable. La decisión no
reemplaza el ledger ni la conciliación: usa el gasto actual del ledger y el
coste marginal configurado de investigación + análisis.

Estados:

- `enough_to_write`: los gaps residuales son omitibles, contextualizables o
  declarables no verificados; se para aunque la cobertura no alcance un umbral.
- `targeted_gap_only`: exactamente la continuación permitida es una ronda 2
  focalizada, vinculada a un gap y query, con coste límite y condición de
  parada. No admite búsqueda general ni una tercera ronda.
- `insufficient`: falta evidencia material no sustituible; no se redacta hasta
  revisión o evidencia nueva.
- `unsafe_to_write`: una afirmación de seguridad/acceso/ruta u otra central no
  puede declararse como hecho. El resultado conserva el perfil y sección
  bloqueados, para que el modelo durable pueda tratar perfiles por separado.

La precedencia global es `unsafe_to_write` > `insufficient` >
`targeted_gap_only` > `enough_to_write`. Cada perfil conserva su propio estado:
por ejemplo, Estudiante puede estar listo y Aventura bloqueado por una ruta.
El pipeline actual conserva sus contratos terminales de ambos perfiles, por lo
que una decisión global no lista sigue escalando a revisión en vez de generar
solo uno de los dos borradores.

## Heurística auditable

Por cada gap se consideran centralidad, omisibilidad, contextualización,
declaración no verificada, sensibilidad temporal, riesgo de invención,
evidencia requerida y dos probabilidades estimadas. Los campos nuevos son
opcionales por compatibilidad con expedientes ya durables; si faltan, se aplica
una regla conservadora basada en importancia y vocabulario de seguridad.

El evaluador también registra recuento/calidad media/diversidad de fuentes,
evidencia disponible, contradicciones, gasto acumulado y coste marginal. Las
contradicciones de precio u horario se clasifican como contextualizables; las
de ruta/acceso/seguridad pasan a material de sección. No se gasta para eliminar
discrepancias tolerables.

Una ronda focalizada requiere simultáneamente: gap material y resoluble, query
concreta no repetida, presupuesto suficiente, y probabilidades de evidencia
útil y cambio editorial material de al menos `0.5`. El coste límite es el coste
marginal configurado; tras esa ronda la condición de parada obliga a revisión,
nunca a una tercera llamada automática.

## Albarracín retrospectivo

El expediente durable cerrado declara cobertura `0,72`, siete gaps y cuatro
contradicciones, y terminó con `0,360047 EUR` gastados. Con esos datos no se
puede reconstruir con rigor el coste por consulta ni asignar cada gap a una
ronda, por lo que no se afirma un ahorro exacto. El nuevo criterio habría
permitido declarar `enough_to_write` en cuanto los gaps restantes fueran
secundarios/contextualizables y las contradicciones temporales quedasen
advertidas; solo los gaps de ruta, acceso o seguridad de Aventura habrían
justificado `targeted_gap_only` o bloqueo de sección.

- Ahorro demostrado: ninguno, porque no se reejecutó Albarracín ni hay ledger
  por búsqueda atribuible en el expediente analizado.
- Ahorro potencial: evitar rondas destinadas solo a elevar cobertura de datos
  secundarios o temporales.
- Ahorro no cuantificable: la cantidad exacta depende de la secuencia de
  consultas y receipts históricos, que no se infieren ni se inventan.

No se ejecutaron llamadas Tavily/OpenAI, no se publicó en Trawel y no se inició
producción masiva para este análisis.
