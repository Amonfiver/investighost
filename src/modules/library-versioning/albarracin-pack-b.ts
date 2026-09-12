export type AlbarracinPackBProfile = 'adventure' | 'student'

export interface AlbarracinPackBCandidate {
  profile: AlbarracinPackBProfile
  libraryEntryId: string
  title: string
  expectedOriginVersionHash: string
  content: string
  taxonomy: readonly string[]
  changeSummary: string
}

export const ALBARRACIN_PACK_B_CANDIDATES: Record<
  AlbarracinPackBProfile,
  AlbarracinPackBCandidate
> = {
  adventure: {
    profile: 'adventure',
    libraryEntryId: '2311ae35-e677-4cf2-aa78-e7ebbb0b6180',
    title: 'Albarracín: murallas, piedra y dos caminos del Guadalaviar',
    expectedOriginVersionHash: 'bc2230d4d11cd877fa465d88c30b28ea51cef047d0f63aa3050f7f23ca94a88e',
    taxonomy: ['intro', 'overview', 'highlights', 'route', 'practical', 'risks', 'sources'],
    changeSummary: 'Reestructura editorial canónica Pack B desde origin_v1; pendiente de revisión humana.',
    content: `## [intro]
Albarracín combina patrimonio y una ruta breve junto al agua. La localidad está declarada Bien de Interés Cultural como Conjunto Histórico y reúne murallas, alcazaba, torres, Catedral, Palacio Episcopal, casas señoriales y otros edificios históricos [c1]. El expediente no documenta un itinerario urbano señalizado completo ni tiempos para todos los lugares, por lo que la visita debe mantenerse flexible.

## [overview]
El conjunto histórico se entiende como una relación entre murallas, alcazaba, torres, edificios religiosos, palacios y viviendas, no como una suma de monumentos aislados. La declaración monumental data de 1961 y la delimitación del conjunto histórico fue recogida en una orden publicada en 2011 [c3]. La Fundación Santa María de Albarracín desarrolla restauración, museos, cursos, conciertos, exposiciones, residencias culturales y visitas patrimoniales [c14], sin que el expediente confirme un calendario concreto para cada actividad.

## [highlights]
- Murallas y alcazaba, junto con las torres del Andador y del Agua [c1].
- Catedral, Palacio Episcopal, casas señoriales y otros edificios del conjunto histórico [c1].
- Visita combinada de ciudad y Catedral de la Fundación, documentada en español y con una duración aproximada de una hora y cuarenta y cinco minutos [c4].
- Paseo fluvial del Guadalaviar inmediato a Albarracín, distinto del Camino Natural iniciado en San Blas [c6, c8].

## [route]
Una jornada puede comenzar en el conjunto histórico y reservar la duración documentada para la visita combinada de ciudad y Catedral [c4]. Después, el paseo fluvial que rodea la localidad figura con aproximadamente 1,6 kilómetros, unos 35 minutos, desniveles de 90 y 105 metros y dificultad baja; incluye tierra, escaleras, pasarelas y puentes [c6]. El Camino Natural del Guadalaviar desde San Blas es otro itinerario: 7,7 kilómetros, unas tres horas, 150 metros de desnivel acumulado, señalización y pasarelas [c8]. No deben mezclarse las cifras ni las características de ambos recorridos.

## [practical]
- El expediente confirma comunicación con Teruel, Valencia, Cuenca y Zaragoza, pero no aporta rutas, horarios, frecuencias ni tiempos de transporte público fiables [c9].
- Las tarifas patrimoniales no son uniformes: aparecen referencias antiguas, condiciones y descuentos distintos en una página de compra de 2026, y visitas privadas desde 7 y 9 euros [c5]. Comprueba producto, fecha, reserva y precio vigente antes de desplazarte.
- Una referencia menciona aparcamientos exteriores a 4 euros por 24 horas y un estudio de 2014 recoge 606 plazas y saturación en días punta; no son datos equivalentes ni actuales [c10].
- La documentación registra mayor afluencia en agosto, Semana Santa, puentes y fines de semana [c12].

## [risks]
El paseo fluvial requiere atención por sus cambios de superficie, escaleras, pasarelas y puentes [c6]. La evidencia incorporada recomienda calzado adecuado y agua porque no hay fuentes; también indica que no es apto para carritos de bebé ni para personas con movilidad reducida y que puede resultar incómodo para personas con vértigo [c7]. No se documentan barandillas concretas, puntos de escape, aseos, cobertura telefónica, servicios de emergencia, fuentes adicionales, refugios ni alternativas de evacuación. Tampoco hay ficha completa de rutas oficiales, horarios de monumentos, precios vigentes, transporte o aparcamiento actual: esas ausencias y las contradicciones de tarifas y recorridos permanecen pendientes de revisión.

## [sources]
Las fuentes públicas se proyectan exclusivamente desde las ocho fuentes durables asociadas a esta entrada de Biblioteca, ordenadas por sourceId. Este bloque no sustituye sus referencias ni expone capturas, prompts, costes o metadatos operativos.
`,
  },
  student: {
    profile: 'student',
    libraryEntryId: '7a686367-bb9f-40ee-a92e-42dcf2ef4d64',
    title: 'Albarracín: historia, patrimonio y vida de una pequeña ciudad turolense',
    expectedOriginVersionHash: '8bddb15111d0d1a1f701465ff4b6f16f62deae7f3d417700b96289f06c13fb24',
    taxonomy: ['intro', 'overview', 'budget', 'daily_life', 'study', 'practical', 'risks', 'sources'],
    changeSummary: 'Reestructura editorial canónica Pack B desde origin_v1; pendiente de revisión humana.',
    content: `## [intro]
Albarracín permite estudiar la continuidad de los asentamientos humanos, la transformación de una ciudad histórica en destino turístico y las dificultades de mantener población y servicios en un territorio poco poblado. El expediente la presenta como pequeña localidad y cabeza comarcal; una cifra aproximada de 1.100 habitantes procede de datos de 2013 y no debe presentarse como actual [c11].

## [overview]
La documentación reúne asentamientos epipaleolíticos y celtibéricos, romanización, etapa musulmana vinculada a los Beni Razín, incorporación a la Corona de Aragón y evolución contemporánea [c2]. Albarracín está declarado Bien de Interés Cultural como Conjunto Histórico: la declaración monumental se fecha en 1961 y la delimitación se publicó en 2011 [c1, c3]. Murallas, alcazaba, torres, Catedral, Palacio Episcopal, casas señoriales y viviendas forman un paisaje urbano histórico cuya conservación y difusión también apoya la Fundación Santa María de Albarracín [c14].

## [budget]
La evidencia solo permite hablar de costes parciales de visita, no de un presupuesto de estancia ni de coste de vida. Una fuente patrimonial antigua menciona 4 euros para Albarracín más Catedral y 3 euros para Castillo y Museos; una página de compra más reciente ofrece condiciones y descuentos distintos, y otra fuente recoge visitas privadas con importes diferentes [c5]. No hay una tarifa única verificable: antes de una visita hay que confirmar producto, fecha y condiciones. El expediente no respalda alquiler, alojamiento, manutención, matrícula ni un presupuesto mensual.

## [daily_life]
La información disponible describe una localidad pequeña, cabeza comarcal y rodeada por un territorio muy despoblado [c11]. La economía documentada está fuertemente vinculada a alojamientos, restauración, comercio y empresas de turismo activo [c12], con mayor afluencia en agosto, Semana Santa, puentes y fines de semana [c12]. Una publicación de la Fundación atribuye más de 415.000 visitantes a 2024 y señala masificación, presión sobre la vivienda, gestión de flujos y calidad de los servicios como retos en estudio [c13]. No hay datos recientes suficientes sobre población, servicios cotidianos, empleo ni estacionalidad residencial; no se completa este bloque con estereotipos.

## [study]
La Fundación Santa María de Albarracín desarrolla restauración, museos, cursos, conciertos, exposiciones, residencias culturales y visitas patrimoniales [c14]. Esta evidencia permite describir actividad cultural y educativa vinculada al patrimonio. El expediente no confirma una oferta académica formal, universidad, campus, grado, matrícula, calendario, plazas ni disponibilidad de estudios; esos aspectos deben declararse como no confirmados, no inferirse de las actividades culturales.

## [practical]
- La visita combinada de ciudad y Catedral dura aproximadamente una hora y cuarenta y cinco minutos, se realiza en español y vincula el acceso a la Catedral a las visitas de la Fundación [c4].
- Albarracín se comunica con Teruel, Valencia, Cuenca y Zaragoza, pero el expediente no aporta itinerarios, horarios, frecuencias ni tiempos de transporte público [c9].
- La información sobre aparcamiento combina una opinión de 4 euros por 24 horas con un estudio de 2014 sobre 606 plazas y saturación; no permite describir la situación actual [c10].
- El paseo fluvial de 1,6 kilómetros no es el mismo que el Camino Natural del Guadalaviar de 7,7 kilómetros; sus distancias y duraciones no son intercambiables [c6, c8].

## [risks]
Los precios documentados son discrepantes y deben conservarse como costes variables, no como una tarifa única [c5]. La cifra de población procede de 2013 y las cifras de visitantes recientes no son directamente comparables con las series históricas [c11, c13]. El paseo fluvial incluye tierra, escaleras, pasarelas y puentes; la evidencia incorporada recomienda calzado y agua, indica limitaciones para carritos de bebé y personas con movilidad reducida, y advierte posible incomodidad para personas con vértigo [c6, c7]. No hay evidencia suficiente para afirmar horarios, accesibilidad completa, riesgos específicos de Pinares del Rodeno, servicios, transporte o oferta académica formal.

## [sources]
Las fuentes públicas se proyectan exclusivamente desde las ocho fuentes durables asociadas a esta entrada de Biblioteca, ordenadas por sourceId. Este bloque no sustituye sus referencias ni expone capturas, prompts, costes o metadatos operativos.
`,
  },
}

export function canonicalHeadingKinds(content: string): string[] {
  return [...content.matchAll(/^## \[([a-z_]+)]$/gm)].map(match => match[1] ?? '')
}
