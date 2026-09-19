import { describe, expect, it } from 'vitest'
import {
  EditorialDepthPolicyError,
  assertContentNotTooThin,
  assertProfilesDifferentiated,
  assertReadableAndScannable,
  assertStudentCanonicalProfile,
  assertStudentEducationalValue,
} from '@modules/library-versioning/editorial-depth-policy'

const evidence = {
  validClaimCount: 10,
  thematicAreas: ['paisaje', 'patrimonio', 'naturaleza', 'arte', 'cultura', 'paleontología'],
  namedPlaces: ['Casas Colgadas', 'Ciudad Encantada', 'Museo de Arte Abstracto'],
}

function adventure(content: string) { return { profile: 'adventure' as const, title: 'Cuenca para explorar', content, evidence, sourceLimited: false } }

const richAdventure = `## [intro] Llegar con curiosidad
Cuenca invita a explorar una ciudad construida entre paisaje y patrimonio. El relieve, las calles y los lugares nombrados permiten alternar una visita urbana con el interés por la serranía.

## [overview] Una ciudad entre paisaje e historia
Las hoces, el casco histórico y la declaración patrimonial explican el carácter del destino. El visitante puede leer la relación entre la ciudad y la naturaleza cercana mientras recorre sus espacios destacados.

## [highlights] Paradas con sentido
- Casas Colgadas y Museo de Arte Abstracto para unir arquitectura y arte.
- Puente de San Pablo como parte del conjunto patrimonial citado.
- Plaza Mayor, catedral y torre Mangana como referencias del casco histórico.
- Ciudad Encantada y torcas para observar el paisaje kárstico de la serranía.
- Las Hoyas y el museo paleontológico para enlazar paisaje y ciencia.

## [route] Combinar ciudad y serranía
Empieza por los lugares del casco histórico y deja la naturaleza para otra parte de la visita. La ruta no fija tiempos ni distancias: el orden permite separar patrimonio, paisaje y actividades con una comprobación previa de las condiciones vigentes.

## [practical] Preparar la exploración
- Comprueba horarios, reservas y accesibilidad antes de entrar en museos o monumentos.
- Confirma acceso y condiciones del día antes de salir a la serranía o a los senderos.
- Ajusta el plan a la información actualizada disponible en cada lugar.

## [risks] Límites prácticos
Las condiciones de acceso, terreno y servicios pueden variar. No hay datos operativos suficientes para fijar una dificultad, una duración o un coste; verifica esos aspectos antes de iniciar actividades al aire libre.`

const richStudent = `## [intro] Una visita para aprender
Cuenca permite estudiar cómo paisaje, historia y patrimonio se relacionan. La visita sirve para observar una ciudad y su entorno sin separar los edificios de las formas del relieve.

## [overview] Geografía e historia como contexto
Las hoces y el casco histórico dan una base para comprender por qué el paisaje forma parte del carácter patrimonial. La conquista de 1177 ofrece un punto de partida para ordenar la historia local.

## [budget] Organizar con prudencia
No hay cifras fiables disponibles para entradas, transporte o alojamiento. Antes de preparar una salida de estudio, confirma precios, reservas y condiciones actualizadas con cada lugar.

## [daily_life] Cultura que se puede reconocer
La Semana Santa, las Turbas y la música religiosa permiten tratar tradición y celebración. El ajoarriero, morteruelo, pisto y resolí abren una conversación sobre gastronomía local sin convertirla en una lista de consumo.

## [study] Preguntas para mirar mejor
Observa cómo las hoces sitúan la ciudad y pregunta qué relación establecen el relieve y el casco histórico. Compara las Casas Colgadas con el Museo de Arte Abstracto: ¿qué cambia cuando un lugar patrimonial también alberga arte? Sitúa 1177 y 1966 en una línea temporal y explica qué tipo de historia puede estudiarse con cada fecha. En el Museo Paleontológico, relaciona Las Hoyas, el Cretácico inferior, fósiles y Concavenator. En la serranía, usa Ciudad Encantada y torcas para identificar formas del paisaje kárstico. Estas preguntas convierten lugares concretos en conceptos de geografía, historia, arte y paleontología.

## [practical] Preparar la visita
- Reúne horarios, reservas y accesibilidad actualizados antes de repartir actividades.
- Lleva una libreta para anotar observaciones y comparar paisaje, arquitectura y colecciones.
- Separa las visitas urbanas de las salidas a naturaleza según las condiciones confirmadas.

## [risks] Límites que conviene actualizar
La información disponible no fija costes, transportes, duración, accesibilidad ni condiciones de los espacios al aire libre. Comprueba esos aspectos antes de convertir la guía en un plan de grupo.`

describe('editorial depth policy', () => {
  it('fails thin content when abundant evidence is available', () => {
    expect(() => assertContentNotTooThin(adventure(`## [intro] Breve\nCuenca es bonita.\n\n## [overview] Breve\nPatrimonio.\n\n## [highlights] Breve\n- Un lugar.\n\n## [route] Breve\nRecorre.\n\n## [practical] Breve\n- Consulta.\n\n## [risks] Breve\nCuidado.`))).toThrow(/CONTENT_TOO_THIN/)
  })

  it('does not impose a word-only rule when durable evidence is source-limited', () => {
    const limited = { ...adventure(richAdventure), sourceLimited: true, evidence: { validClaimCount: 1, thematicAreas: ['patrimonio'], namedPlaces: [] } }
    expect(() => assertContentNotTooThin(limited)).not.toThrow()
  })

  it('fails nearly identical profiles and accepts distinct purposes', () => {
    expect(() => assertProfilesDifferentiated(
      { title: 'A', content: richAdventure }, { title: 'B', content: richAdventure.replaceAll('[adventure]', '[student]') },
    )).toThrow(EditorialDepthPolicyError)
    expect(() => assertProfilesDifferentiated(
      { title: 'A', content: richAdventure }, { title: 'B', content: richStudent },
    )).not.toThrow()
  })

  it('fails a wall of prose but accepts structured, useful copy', () => {
    expect(() => assertReadableAndScannable({ profile: 'adventure', title: 'A', content: richAdventure }))
      .not.toThrow()
    expect(() => assertReadableAndScannable({
      profile: 'adventure', title: 'A',
      content: richAdventure.replace('Cuenca invita a explorar una ciudad construida entre paisaje y patrimonio.',
        `${'Una frase repetida que impide encontrar lo importante. '.repeat(35)}`),
    })).toThrow(/READABILITY/)
  })

  it('requires scan-friendly highlights rather than a title-only adventure profile', () => {
    expect(() => assertReadableAndScannable({
      profile: 'adventure', title: 'A',
      content: richAdventure.replace('- Las Hoyas y el museo paleontológico para enlazar paisaje y ciencia.\n', ''),
    })).toThrow(/SCANNABILITY/)
  })

  it('requires Student to develop named places, dates, learning blocks and real questions', () => {
    expect(() => assertStudentEducationalValue({ title: 'S', content: richStudent, evidence, sourceLimited: false }))
      .toThrow(/STUDENT_DEPTH/)
    const educational = `${richStudent}

## [history] Historia
En 1177 la conquista ayuda a ordenar una parte de la historia de Cuenca.

## [heritage] Patrimonio
Casas Colgadas, puente de San Pablo y plaza Mayor permiten reconocer patrimonio.

## [art_culture] Arte y cultura
El Museo de Arte Abstracto Español abrió en 1966 y se relaciona con arte y cultura.

## [nature_science] Naturaleza y ciencia
Ciudad Encantada, torcas, Las Hoyas y el Cretácico inferior conectan naturaleza y paleontología.

## [observation] Observación
La catedral, torre Mangana, arco de Bezudo, túnel de Alfonso VIII y Semana Santa añaden referencias para observar.

## [gastronomy] Gastronomía
Ajoarriero, morteruelo, pisto y resolí sitúan la gastronomía dentro de la cultura local.

## [study] Preguntas
¿Cómo se relaciona el paisaje con la ciudad? ¿Qué puede explicar 1996 sobre patrimonio? ¿Qué cambia entre arte y arquitectura? ¿Qué enseñan fósiles y museo?

${'Una explicación educativa conecta paisaje, historia, patrimonio, arte, cultura y ciencia sin convertir la visita en una lista. '.repeat(24)}`
    expect(() => assertStudentEducationalValue({ title: 'S', content: educational, evidence, sourceLimited: false })).not.toThrow()
  })

  it('makes Student informational and non-travel by canonical policy', () => {
    const canonical = `## [intro] Introducción
Cuenca se explica mediante la relación entre paisaje, historia, patrimonio, arte, ciencia y cultura.

## [overview] Geografía y paisaje
Las hoces y el relieve explican la relación entre ciudad y territorio.

## [history] Historia
La conquista de 1177 organiza una referencia histórica importante.

## [heritage] Patrimonio
Casas Colgadas y puente de San Pablo forman parte del patrimonio reconocido en 1996.

## [art_culture] Arte y cultura
El Museo de Arte Abstracto Español abrió en 1966 y conecta patrimonio y arte.

## [nature_science] Naturaleza y ciencia
Ciudad Encantada, Las Hoyas y el Cretácico inferior relacionan paisaje y paleontología.

## [daily_life] Tradiciones
La Semana Santa expresa una dimensión cultural de la ciudad.

## [gastronomy] Gastronomía
Ajoarriero y morteruelo sitúan la cocina dentro de la cultura local.

## [budget] Datos clave
1177, 1966 y 1996 son fechas para ordenar los temas principales.

## [practical] Relaciones
- El relieve ayuda a explicar la ciudad.
- El patrimonio conecta historia y arquitectura.
- La naturaleza se relaciona con la ciencia.

## [study] Preguntas
¿Cómo se relacionan las hoces y la ciudad? ¿Qué explica 1177? ¿Por qué arte y patrimonio conviven? ¿Qué enseña Las Hoyas?

${'La explicación conecta geografía, historia, patrimonio, arte, naturaleza, ciencia, cultura y conceptos clave con hechos concretos. '.repeat(60)}`
    expect(() => assertStudentCanonicalProfile({ title: 'S', content: canonical, evidence, sourceLimited: false })).not.toThrow()
    expect(() => assertStudentCanonicalProfile({ title: 'S', content: canonical.replace('Cuenca se explica', 'Antes de ir, Cuenca se explica'), evidence, sourceLimited: false }))
      .toThrow(/STUDENT_NON_TRAVEL/)
  })
})
