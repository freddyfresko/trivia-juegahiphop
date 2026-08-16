/**
 * Mejora de redacción + contexto — dataset de preguntas de la Trivia
 *
 * Problemas detectados (auditoría 2026-08):
 *  1. 622 preguntas citan el término entre «» sin contexto ("¿Cuándo surgió «Bronx»?")
 *     → se convierten al estilo establecido "Sobre «Término»: ¿Pregunta?".
 *  2. 365 preguntas ultra-cortas sin contexto ("¿Qué es Suicide?")
 *     → pista contextual con área + subcategoría (la UI la muestra bajo demanda).
 *  3. 7 preguntas con la respuesta filtrada o gramática rota → reescritura manual.
 *  4. 168 preguntas con opciones evidentes: las 4 opciones repiten el sujeto
 *     ("Los primeros breakers son…") y la correcta nombra el término → se recorta
 *     el sujeto ("son los bailarines que…") + cópulas uniformes + "¿Qué es Primer…?"
 *     → "¿Qué son los/las Primer…?".
 *
 * Uso: node scripts/mejorar-preguntas.mjs
 * Respaldo automático en scripts/backups/. Idempotente.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const DATA = 'src/data/preguntas.json'
const areas = JSON.parse(readFileSync('src/data/areas.json', 'utf8'))
const d = JSON.parse(readFileSync(DATA, 'utf8'))
const ps = d.preguntas ?? d

// ─── Respaldo ───
mkdirSync('scripts/backups', { recursive: true })
const backup = join('scripts/backups', `preguntas-${new Date().toISOString().slice(0, 10)}.json`)
writeFileSync(backup, JSON.stringify(d))
console.log(`respaldo → ${backup}`)

// ─── Reescrituras manuales (respuesta filtrada / gramática rota) ───
const REWRITES = new Map([
  ['¿Cuándo surgió «Block Party del 11 de agosto de 1973 (1520 Sedgwick Avenue)»?', 'Sobre «Block Party de Sedgwick Avenue»: ¿Cuándo se celebró?'],
  ['¿Dónde surgió «Block Party del 11 de agosto de 1973 (1520 Sedgwick Avenue)»?', 'Sobre «Block Party de Sedgwick Avenue»: ¿Dónde se celebró?'],
  ['¿Cuándo surgió «Hip hop chileno en los años 2010»?', '¿Cuándo el freestyle chileno pasó a competir de igual a igual en el circuito hispanoamericano?'],
  ['¿Cuándo surgió «Hip hop chileno de los años 80»?', '¿En qué año se realizó la primera grabación profesional del hip hop chileno?'],
  ['¿Cuándo surgió «Hip hop chileno de los años 90»?', '¿Cuándo empezó el rap chileno a grabarse y masificarse?'],
  ['¿Cuándo surgió «Batalla del Lincoln Center (1981)»?', '¿Cuándo se realizó la batalla de baile del Lincoln Center?'],
  ['¿Qué es Herculoids?', '¿Quiénes eran los Herculoids?'],
  // Términos-lugar: la ciudad no "surge" — el hip hop surge EN ella
  ['Sobre «Bronx»: ¿Cuándo surgió?', '¿En qué época surgió el hip hop en el Bronx?'],
  ['Sobre «Bronx»: ¿Dónde surgió?', '¿En qué barrio de Nueva York surgió el hip hop?'],
  ['Sobre «Nueva York»: ¿Cuándo surgió?', '¿En qué época surgió el hip hop en Nueva York?'],
  ['Sobre «Nueva York»: ¿Dónde surgió?', '¿En qué ciudad surgió el hip hop?'],
  // Artículo plural mal derivado (descripción plural con término singular)
  ['¿Qué es los funk style?', '¿Qué es el funk style?'],
  ['¿Cuándo surgió los funk style?', '¿Cuándo surgió el funk style?'],
])

// ─── Patrón "El/La/Los/Las X es/son/fue…" ───
const ART_COP = /^(El|La|Los|Las)\s+(.+?)\s+(es|son|fue|fueron|era|eran)\s+/i
// Sujeto (artículo + nombre) — conservando la cópula ("Los primeros MCs " → "son los pioneros…")
const ART_SUBJ = /^(El|La|Los|Las)\s+(.+?)\s+(?=(es|son|fue|fueron|era|eran)\s)/i
const NORM = (s) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9áéíóúüñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

let convertidas = 0
let reescritas = 0
let sinPista = 0
let opcionesRecortadas = 0
let copulasUnificadas = 0
let gramaticaArreglada = 0
const raras = []

for (const p of ps) {
  // 1. Reescrituras manuales
  if (REWRITES.has(p.pregunta)) {
    p.pregunta = REWRITES.get(p.pregunta)
    reescritas++
  }

  // 2. "¿Pregunta «Término»?" → "Sobre «Término»: ¿Pregunta?"
  if (p.pregunta.startsWith('¿') && /«[^»]+»/.test(p.pregunta)) {
    const term = p.pregunta.match(/«([^»]+)»/)?.[1] ?? ''
    const resto = p.pregunta.replace(/«[^»]*»/g, '').replace(/\s+/g, ' ').replace(/\s+([?¿])/g, '$1').trim()
    const nuevo = `Sobre «${term}»: ${resto}`
    if (term && resto.startsWith('¿') && nuevo.length > 15) {
      p.pregunta = nuevo
      convertidas++
    } else {
      raras.push(p.pregunta)
    }
  }

  // 3. Pista contextual: Área · Subcategoría (nunca revela la respuesta)
  const a = areas[p.area]
  const sub = Array.isArray(p.subcategoria) ? p.subcategoria.join(', ') : p.subcategoria
  const pista = a ? `${a.nombre}${sub ? ` · ${sub}` : ''}` : (sub || '')
  if (pista) {
    p.pista = pista
  } else {
    sinPista++
    raras.push(`SIN PISTA: ${p.pregunta}`)
  }

  // 4. Opciones evidentes: 4/4 con "El/La/Los/Las X es/son…" y la correcta nombra el término
  const termino = String(p.termino ?? '').trim()
  const terminoN = NORM(termino)
  if (terminoN.length >= 3 && p.opciones.every((o) => ART_COP.test(o))) {
    const correctaN = NORM(p.opciones[p.indice_correcta]).slice(0, 90)
    if (correctaN.includes(terminoN)) {
      // 4a. Recortar el sujeto de todas las opciones (conservando la cópula)
      p.opciones = p.opciones.map((o) => {
        const m = o.match(ART_SUBJ)
        if (!m) return o
        const resto = o.slice(m[0].length).trim()
        if (resto.length < 12) {
          raras.push(`OPCIÓN CORTA: ${p.pregunta} → "${o.slice(0, 60)}…"`)
          return o // no recortar si queda demasiado corta
        }
        opcionesRecortadas++
        return resto
      })
      // Alinear respuesta con la opción correcta recortada
      const mr = p.respuesta.match(ART_SUBJ)
      if (mr) p.respuesta = p.respuesta.slice(mr[0].length).trim()
      // 4b. Unificar cópulas (evita inferir por singular/plural)
      const copulas = p.opciones.map((o) => o.match(/^(es|son|fue|fueron|era|eran)\b/i)?.[1].toLowerCase() ?? '')
      const moda = copulas.reduce((acc, c) => {
        acc[c] = (acc[c] ?? 0) + 1
        return acc
      }, {})
      const unica = Object.entries(moda).sort((x, y) => y[1] - x[1])[0]?.[0]
      if (unica && copulas.some((c) => c !== unica)) {
        p.opciones = p.opciones.map((o) => o.replace(/^(es|son|fue|fueron|era|eran)\b/i, unica))
        p.respuesta = p.respuesta.replace(/^(es|son|fue|fueron|era|eran)\b/i, unica)
        copulasUnificadas++
      }
      // 4c. Gramática: "¿Qué es Primeros MCs?" → "¿Qué son los Primeros MCs?"
      const g = p.pregunta.match(/^¿Qué es (Primer[oa]s? )(.+)\?$/)
      if (g) {
        const art = g[1].toLowerCase().startsWith('primeras') ? 'las' : 'los'
        p.pregunta = `¿Qué son ${art} ${g[1]}${g[2]}?`
        gramaticaArreglada++
      } else if (/Sobre «(Primer[oa]s? [^»]+)»: ¿Qué es\?/.test(p.pregunta)) {
        p.pregunta = p.pregunta.replace(/Sobre «(Primer[oa]s? [^»]+)»: ¿Qué es\?/, 'Sobre «$1»: ¿Qué son?')
        gramaticaArreglada++
      }
    }
  }
}

// ─── Opciones arregladas a mano (colisiones post-strip / duplicados pre-existentes) ───
// Índices → texto final. El resto de opciones conserva el resultado del strip.
const OPTS_FIX = {
  '¿Qué es Twelve Step?': {
    0: 'es un paso de footwork del breaking: con el cuerpo agachado y las manos apoyadas en el suelo, el b-boy completa un recorrido de doce apoyos que combina el six step con una patada lateral en cada paso',
    1: 'es un paso de footwork del breaking: con el cuerpo agachado y las manos apoyadas en el suelo, el b-boy completa un recorrido de cinco apoyos, una variante compacta y rápida del six step',
    3: 'es un paso de footwork del breaking: con el cuerpo agachado y las manos apoyadas en el suelo, el b-boy completa un recorrido de siete apoyos que alarga la caminata base',
  },
  '¿Qué es Seven Step?': {
    0: 'es un paso de footwork del breaking: con el cuerpo agachado y las manos apoyadas en el suelo, el b-boy completa un recorrido de doce apoyos que combina el six step con una patada lateral en cada paso',
    2: 'es un paso de footwork del breaking: con el cuerpo agachado y las manos apoyadas en el suelo, el b-boy completa un recorrido de siete apoyos que alarga la caminata base',
  },
  'Sobre «Airflare»: ¿Quién lo creó?': {
    0: 'Es discutido: algunos power moves aéreos se atribuyen a distintos b-boys de los años 80, sin un consenso claro en la historiografía',
    3: 'Es discutido: varias escenas reclaman su origen, pero ninguna tiene un registro contemporáneo verificable',
  },
  '¿Qué es Golden Era?': {
    1: 'es el periodo del Hip Hop —la «era dorada»—, aproximadamente entre mediados de los 80 y mediados de los 90, en que el rap dejó de ser un sonido de fiesta y alcanzó su madurez artística',
  },
  // Distractores curados a mano: clase semántica = correcta (pool agotado en etapa 9)
  '¿Qué es *Beat Street*?': {
    1: 'La película de 1985 dirigida por Michael Schultz que llevó a la pantalla a Run-DMC, LL Cool J y los Fat Boys en la escena del hip hop de Nueva York',
  },
  '¿Qué es Roxanne Wars?': {
    0: 'son los videoclips de rap que MTV comenzó a rotar a mediados de los años 80 y que masificaron el género en televisión',
    1: 'son las canciones de breakbeat que los DJs del Bronx repetían en las fiestas para extender la parte bailable de los discos',
  },
  '¿Qué es Batalla del Lincoln Center (1981)?': {
    1: 'La competencia de baile que enfrentó a las principales crews del Bronx y Brooklyn en los parques de Nueva York a inicios de los años 80',
    2: 'La fiesta de block party de 1973 en el 1520 Sedgwick Avenue, organizada por Cindy Campbell con DJ Kool Herc, considerada el origen del Hip Hop',
    3: 'La batalla de DJs pioneros que enfrentó a Grandmaster Flash y Afrika Bambaataa por el dominio del turntablism a fines de los años 70',
  },
  '¿Qué es Vinilo?': {
    0: 'es un disco compacto de audio digital que reemplazó al vinilo en la industria a partir de los años 90',
    2: 'es una grabación de larga duración que reúne el repertorio de un artista y que el rap adoptó como soporte principal en los años 80',
    3: 'es una mezcla de dos o más temas grabados en un mismo soporte, típica de los DJs para las radios y las fiestas',
  },
  '¿Qué son las Primeras Grabaciones de Rap?': {
    0: 'son las canciones pioneras del rap grabadas en Nueva York a fines de los años 70, antes del éxito comercial masivo',
    1: 'son los vinilos de breakbeat que los DJs de las block parties alargaban para que la gente bailara',
  },
  // Smoke de producción: distractores de lugar coherentes para la Block Party
  '¿Dónde se celebró Block Party de Sedgwick Avenue?': {
    2: 'En Brooklyn, Nueva York',
    3: 'En Queens, Nueva York',
  },
  // Familia equipos (07-beatmaking): opciones "En <lugar>" compuestas y rotas
  '¿Dónde apareció Caja de ritmos?': {
    0: 'En Japón (Roland) y EE. UU. (Linn Electronics): las primeras cajas de ritmos nacieron en los años 60 y se masificaron con el TR-808 y la LM-1',
    1: 'En Reino Unido, con las primeras cajas de ritmos de los estudios del pop británico',
    2: 'En Alemania, con los sintetizadores modulares de la escuela electrónica',
    3: 'En Francia, con los instrumentos de la música concreta',
  },
  '¿Dónde surgió Tocadiscos?': {
    0: 'En Japón, con el Technics SL-1200 (1972), el plato que se volvió el estándar de los DJs a nivel global',
    1: 'En Reino Unido, con los sound systems que pinchaban dub en las fiestas de Londres',
    2: 'En Alemania, con los tocadiscos de las emisoras de radio de posguerra',
    3: 'En Francia, con los platos de las discotecas parisinas',
  },
  '¿En qué lugar surgió MPC?': {
    0: 'En EE. UU. (diseñada por Roger Linn) y Japón (fabricada por Akai, 1988)',
    1: 'En Reino Unido, dentro de la escena del jungle y el drum and bass',
    2: 'En Alemania, con los samplers de la electrónica industrial',
    3: 'En Francia, con los productores del hip hop francés de los años 90',
  },
  '¿En qué lugar surgió Sampler?': {
    0: 'En Australia (Fairlight CMI), EE. UU. y Japón, con fabricación dispersa y uso mundial',
    1: 'En Reino Unido, con los primeros samplers digitales del pop británico',
    2: 'En Alemania, con los instrumentos electrónicos de posguerra',
    3: 'En Francia, con la música concreta y los estudios de radio',
  },
}

for (const p of ps) {
  const fix = OPTS_FIX[p.pregunta]
  if (fix) {
    for (const [idx, texto] of Object.entries(fix)) p.opciones[Number(idx)] = texto
    // Alinear la respuesta con la nueva opción correcta
    const correcta = p.opciones[p.indice_correcta]
    if (correcta) p.respuesta = correcta
  }
}

// ─── "¿Cuándo estuvo activo?" → "¿Desde cuándo estuvo activo?" + respuestas correctas ───
// El generador respondía el FINAL del periodo para unos ("1973–1980s" → "En los años 80")
// y el INICIO para otros; además Rahzel respondió su año de nacimiento. El patrón
// consistente: la respuesta = INICIO de la actividad.
const ACTIVO_FIX = new Map([
  ['Sobre «DJ Kool Herc»: ¿Cuándo estuvo activo?', { idx: 1, resp: 'En 1973' }],
  ['Sobre «Coke La Rock»: ¿Cuándo estuvo activo?', { idx: 0, resp: 'En los años 70' }],
  ['Sobre «Grandmaster Flash»: ¿Cuándo estuvo activo?', { idx: 0, resp: 'En los años 70' }],
  ['Sobre «Afrika Bambaataa»: ¿Cuándo estuvo activo?', { idx: 3, resp: 'En los años 70', opcionIdx: 3, opcion: 'En los años 70' }],
  ['Sobre «Rahzel»: ¿Cuándo estuvo activo?', { idx: 0, resp: 'En los años 80' }],
])

for (const p of ps) {
  if (!/Sobre «[^»]+»: ¿Cuándo estuvo activo\?/.test(p.pregunta)) continue
  const fix = ACTIVO_FIX.get(p.pregunta)
  if (fix) {
    if (fix.opcionIdx !== undefined) p.opciones[fix.opcionIdx] = fix.opcion
    p.indice_correcta = fix.idx
    p.respuesta = fix.resp
  }
  p.pregunta = p.pregunta.replace('¿Cuándo estuvo activo?', '¿Desde cuándo estuvo activo?')
}

// ─── Alineación general respuesta ↔ opción correcta ───
// Si la respuesta conserva el sujeto ("Los Herculoids fueron…") y la opción
// correcta arranca con la cópula ("son…"), recortar y unificar la cópula.
for (const p of ps) {
  const correcta = p.opciones[p.indice_correcta] ?? ''
  const cop = correcta.match(/^(es|son|fue|fueron|era|eran)\b/i)?.[1]
  const mr = p.respuesta.match(ART_SUBJ)
  if (cop && mr) {
    p.respuesta = p.respuesta.slice(mr[0].length).trim().replace(/^(es|son|fue|fueron|era|eran)\b/i, cop)
  }
}

// ─── Humanización: eliminar la fórmula "Sobre «X»: ¿…?" (65% del dataset) ───
// Fragmentos ("¿Dónde surgió?") → integrar el término como sujeto: "¿Dónde surgió Crazy Legs?"
// Completas (pregunta con sujeto propio) → encabezado de categoría: "Rap británico y grime: ¿…?"
// Rotación determinista de stems para romper la repetición ("¿Cuándo surgió?" ×280).
const HASH = (s) => [...s].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7)
const PLURALIZAR = {
  surgió: 'surgieron', 'se originó': 'se originaron', nació: 'nacieron', 'se fundó': 'se fundaron',
  estuvo: 'estuvieron', empezó: 'empezaron', comenzó: 'comenzaron', llegó: 'llegaron',
  'se consolidó': 'se consolidaron', 'se popularizó': 'se popularizaron', 'se masificó': 'se masificaron',
  'se desarrolló': 'se desarrollaron', 'se expandió': 'se expandieron', 'se difundió': 'se difundieron',
  'se celebró': 'se celebraron', 'se realizó': 'se realizaron', 'se grabó': 'se grabaron',
  'se estrenó': 'se estrenaron', 'se gestó': 'se gestaron', 'se hizo': 'se hicieron', 'se volvió': 'se volvieron',
}

let humanizadas = 0
// Términos que terminan en "s" pero son SINGULARES (personas, títulos, aparatos, escenas)
const SINGULAR_TERMS = new Set([
  'Crazy Legs', 'Flying Steps', 'Style Wars', 'Tocadiscos', 'Throat bass',
  'Hip Hop francés', 'Caja de ritmos', 'Bass', 'DVS (Sistema de vinilo digital)',
  'Realness (Autenticidad)',
])
for (const p of ps) {
  const m = p.pregunta.match(/^Sobre «([^»]+)»: ¿(.*?)\?$/)
  if (!m) continue
  const term = m[1].trim()
  const resto = `¿${m[2]}?`
  const termSinParen = term.replace(/\([^)]*\)/g, '').trim()
  const pluralTerm = /s$/i.test(termSinParen) && !SINGULAR_TERMS.has(term)
  const h = HASH(p.id)
  let q = null
  let nueva = null

  // 1) Fragmento: "¿Qué es?" → "¿Qué es X?"
  if (/^¿Qué (es|son|fue|eran)\??$/i.test(resto)) {
    if (/^¿Qué (fue|eran)\??$/i.test(resto)) nueva = `¿Qué fue ${term}?`
    else if (pluralTerm) nueva = `¿Qué son ${term}?`
    else nueva = `¿Qué es ${term}?`
  } else if (/^¿(Quién|Quiénes) (es|son|fue|fueron)\??$/i.test(resto)) {
    nueva = resto.replace(/\?$/, ` ${term}?`)
  } else if (/^¿Cuál(es)? es\??$/i.test(resto)) {
    nueva = resto.replace(/\?$/, ` ${term}?`)
  } else if ((q = resto.match(/^¿Quién lo (creó|inventó|popularizó|fundó|hizo)\??$/i))) {
    nueva = `¿Quién ${q[1]} ${term}?`
  } else if (/^¿Para qué (sirve|sirven|se usa|se usan|se utiliza|se utilizan)\??$/i.test(resto)) {
    nueva = `¿Para qué sirve ${term}?`
  } else if (/^¿Cómo (se llama|se llaman)\??$/i.test(resto)) {
    nueva = `¿Cómo se llama ${term}?`
  } else if (/^¿Cuántos? (hay|existen|son|fueron)\??$/i.test(resto)) {
    nueva = resto.replace(/\?$/, ` ${term}?`)
  } else {
    // Fragmento temporal: "¿Cuándo/Dónde/En qué… + verbo?"
    const r = resto.match(
      /^¿(Cuándo|Dónde|En qué año|En qué época|En qué década|En qué momento|Desde cuándo|Hasta cuándo)\s+(surgió|se originó|nació|se fundó|estuvo activo|empezó|comenzó|se gestó|se consolidó|se popularizó|se masificó|se desarrolló|se expandió|se difundió|se celebró|se realizó|se grabó|se estrenó|llegó|se hizo|se volvió)\?$/i,
    )
    if (r) {
      const verbo = pluralTerm ? (PLURALIZAR[r[2].toLowerCase()] ?? r[2]) : r[2]
      nueva = `¿${r[1]} ${verbo} ${term}?`
    }
  }

  if (!nueva) {
    // 2) Completa → encabezado de categoría: "X: ¿pregunta?"
    nueva = `${term}: ${resto}`
  }

  // 3) Rotación determinista de stems (rompe la repetición masiva)
  if (/^¿Cuándo surgi[oó] .+?$/.test(nueva)) {
    nueva = nueva.replace(/^¿Cuándo surgi/, h % 3 === 0 ? '¿Cuándo surgi' : h % 3 === 1 ? '¿En qué época surgi' : '¿En qué momento surgi')
  } else if (/^¿Dónde surgi[oó] .+?$/.test(nueva)) {
    nueva = nueva.replace(/^¿Dónde surgi/, h % 3 === 0 ? '¿Dónde surgi' : h % 3 === 1 ? '¿En qué lugar surgi' : '¿Dónde apareci')
  } else if (/^¿Qué es [^?]+\?$/.test(nueva) && h % 2 === 1) {
    nueva = nueva.replace(/^¿Qué es/, '¿Qué significa')
  }

  p.pregunta = nueva
  humanizadas++
}

// 4) Artículos capitalizados en medio de la pregunta ("¿Cuándo surgió La llegada…?" → "…la llegada…")
// El encabezado de categoría ("La llegada del Hip Hop a Chile: ¿…?") conserva la mayúscula.
const ART_TERMINOS = ['La llegada del Hip Hop a Chile', 'El MC chileno']
let articulosFijados = 0
for (const p of ps) {
  for (const t of ART_TERMINOS) {
    if (p.pregunta.includes(t) && !p.pregunta.startsWith(t)) {
      p.pregunta = p.pregunta.replace(t, t.charAt(0).toLowerCase() + t.slice(1))
      articulosFijados++
    }
  }
}

// ─── Etapa 9: distractores con clase semántica ≠ correcta (preguntas de definición) ───
// Para "¿Qué es X?" la correcta define una clase ("El proceso…", "es un power move…");
// un distractor de OTRA clase ("El bailarín…", "El distrito…") se descarta por gramática.
// Se reemplaza por una definición de la MISMA clase del pool del propio dataset,
// con el MISMO primer token (regla de oro).
const GRUPOS = {
  persona: ['bailarín', 'bailarina', 'artista', 'dj', 'mc', 'writer', 'productor', 'creador', 'pionero', 'b-boy', 'b-girl', 'breaker', 'grupo', 'crew', 'banda', 'rapero', 'cantante', 'vocalista', 'duo', 'colectivo', 'organización', 'figura', 'nombre', 'seudónimo', 'apodo', 'rapera', 'solista', 'persona'],
  lugar: ['distrito', 'barrio', 'ciudad', 'país', 'territorio', 'comuna', 'zona', 'región', 'isla', 'estado', 'población', 'lugar', 'vecindario', 'esquina', 'parque', 'club', 'sala', 'escenario', 'borough', 'centro'],
  media: ['película', 'documental', 'álbum', 'disco', 'canción', 'serie', 'filme', 'cinta', 'largometraje', 'video', 'videoclip', 'tema', 'single', 'mixtape', 'revista', 'fanzine', 'programa', 'libro', 'episodio', 'fuente'],
  evento: ['fiesta', 'block', 'batalla', 'competencia', 'evento', 'concierto', 'jam', 'torneo', 'campeonato', 'festival', 'celebración', 'reunión', 'cypher', 'sesión', 'encuentro'],
  proceso: ['proceso', 'expansión', 'consolidación', 'llegada', 'evolución', 'difusión', 'origen', 'nacimiento', 'desarrollo', 'globalización', 'crecimiento', 'transición', 'boom', 'auge', 'era', 'época', 'periodo', 'fenómeno', 'historia', 'cambio', 'extensión', 'explosión'],
  tecnica: ['técnica', 'paso', 'giro', 'freeze', 'power', 'variante', 'práctica', 'método', 'estilo', 'sonido', 'golpe', 'patrón', 'aparato', 'instrumento', 'herramienta', 'máquina', 'dispositivo', 'sistema', 'loop', 'scratch', 'sample', 'beat', 'ritmo', 'flow', 'rima', 'punchline', 'ad-lib', 'frase', 'barra', 'movimiento', 'caja', 'sintetizador', 'sampler', 'mezcladora', 'tocadiscos', 'vinilo', 'acorde', 'frecuencia', 'plato', 'aguja', 'crossfader', 'vocal', 'sílaba', 'patada', 'barrido', 'equilibrio', 'torsión', 'salto', 'caída', 'vuelta', 'impulso', 'recorrido', 'caminata', 'lazo', 'resonancia', 'vibración', 'articulación', 'respiración', 'variación', 'combinación', 'encadenado', 'secuencia', 'drop', 'trick', 'combo', 'merry', 'pose', 'posición', 'pose'],
  concepto: ['concepto', 'valor', 'principio', 'regla', 'idea', 'código', 'tradición', 'cultura', 'identidad', 'comunidad', 'respeto', 'paz', 'conocimiento', 'elemento', 'fundamento', 'base', 'actitud', 'disciplina', 'creatividad', 'originalidad', 'autenticidad', 'realness', 'espíritu', 'filosofía', 'ética', 'estética', 'género', 'subgénero', 'escena', 'corriente', 'ola', 'tendencia', 'forma', 'manera', 'modo', 'función', 'papel', 'relación', 'diferencia', 'característica', 'cualidad', 'señal', 'marca', 'huella', 'firma', 'legado', 'aportación', 'contribución', 'influencia', 'importancia', 'relevancia', 'clave', 'punto', 'aspecto', 'dimensión', 'nivel', 'rol', 'pilar', 'columna', 'ingrediente', 'material', 'recurso', 'medio', 'canal', 'plataforma', 'red', 'espacio', 'momento', 'contexto', 'entorno', 'ambiente', 'vibe', 'fuerza', 'poder', 'mensaje', 'contenido', 'discurso', 'narrativa', 'relato', 'crónica', 'testimonio', 'evidencia', 'prueba', 'dato', 'información', 'documento', 'registro', 'archivo', 'carta', 'grabación', 'audio', 'imagen', 'foto', 'dibujo', 'pintura', 'pieza', 'obra', 'trabajo', 'producción', 'proyecto', 'iniciativa', 'estructura', 'institución', 'entidad', 'personaje', 'representante', 'vocero', 'líder', 'referente', 'ícono', 'símbolo', 'emblema', 'sello', 'rap', 'hip', 'conjunto', 'versión', 'parte', 'familia', 'formato'],
}

const NOUN = (o) => {
  let m = o.match(/^(El|La|Los|Las)\s+([a-záéíóúüñ]+)/i)
  if (m) return m[2].toLowerCase().replace(/s$/, '')
  m = o.match(/^(es|son|fue|fueron|era|eran)\s+(un|una|el|la|los|las)\s+([a-záéíóúüñ]+)/i)
  if (m) return m[3].toLowerCase().replace(/s$/, '')
  return null
}
const nounGroup = (n) => {
  if (n === 'hip') return 'concepto' // "El hip hop…"
  for (const [g, words] of Object.entries(GRUPOS)) if (words.includes(n)) return g
  return null
}
const esDefinicion = (q) => /^(?:[^¿]+: )?¿Qué (es|son|fue|eran|significa) /i.test(q)

let distractoresReemplazados = 0
{
  // Pool: opciones correctas clasificadas por (grupo | primer token)
  const pool = new Map()
  for (const p of ps) {
    const correcta = p.opciones[p.indice_correcta]
    const g = nounGroup(NOUN(correcta))
    if (!g) continue
    const ft = (correcta.match(/^(\S+)/)?.[1] ?? '').toLowerCase()
    const key = `${g}|${ft}`
    if (!pool.has(key)) pool.set(key, [])
    pool.get(key).push({ texto: correcta, termino: p.termino, norm: NORM(correcta) })
  }
  for (const p of ps) {
    if (!esDefinicion(p.pregunta)) continue
    const correcta = p.opciones[p.indice_correcta]
    const gc = nounGroup(NOUN(correcta))
    if (!gc) continue
    const ft = (correcta.match(/^(\S+)/)?.[1] ?? '').toLowerCase()
    const actuales = new Set(p.opciones.map((o) => NORM(o)))
    for (let i = 0; i < p.opciones.length; i++) {
      if (i === p.indice_correcta) continue
      const gd = nounGroup(NOUN(p.opciones[i]))
      if (!gd || gd === gc) continue // ya calza o no clasificable → dejar
      const candidatos = (pool.get(`${gc}|${ft}`) ?? []).filter((c) => {
        if (c.termino === p.termino) return false
        if (actuales.has(c.norm)) return false
        const nC = NORM(correcta)
        if (nC.length > 25 && (c.norm.includes(nC.slice(0, 40)) || nC.includes(c.norm.slice(0, 40)))) return false
        return true
      })
      if (candidatos.length === 0) continue
      const elegido = candidatos[HASH(p.id + i) % candidatos.length]
      p.opciones[i] = elegido.texto
      actuales.add(elegido.norm)
      distractoresReemplazados++
    }
  }
}

// ─── Etapa 10: "Primeros X" — artículos, número y "Quiénes fueron" ───
// A) "¿Cuándo surgieron Primeros DJs?" → "¿Cuándo surgieron los primeros DJs?"
// B) "¿Qué son los Primeros MCs?" (personas) → "¿Quiénes fueron los primeros MCs?" + cópula "fueron"
let primerosFijados = 0
for (const p of ps) {
  const m10a = p.pregunta.match(
    /^(¿(?:Cuándo|Dónde|En qué época|En qué lugar|En qué momento|En qué año|En qué década)\s+)(surgió|surgieron|apareció|aparecieron|se originó|se originaron|nació|nacieron)\s+(Primeros|Primeras)\s+/,
  )
  if (m10a) {
    const art = m10a[3] === 'Primeros' ? 'los' : 'las'
    const verbo = m10a[2]
    const verboP =
      verbo.endsWith('ron') || verbo === 'se originaron'
        ? verbo
        : ({ surgió: 'surgieron', apareció: 'aparecieron', nació: 'nacieron', 'se originó': 'se originaron' }[verbo] ?? verbo)
    p.pregunta = p.pregunta.replace(
      /^(¿(?:Cuándo|Dónde|En qué época|En qué lugar|En qué momento|En qué año|En qué década)\s+)(surgió|surgieron|apareció|aparecieron|se originó|se originaron|nació|nacieron)\s+(Primeros|Primeras)\s+/,
      `${m10a[1]}${verboP} ${art} ${m10a[3].toLowerCase()} `,
    )
    primerosFijados++
  }
  const m10b = p.pregunta.match(/^¿Qué son los Primeros (MCs|DJs|Breakers|Writers)\?$/)
  if (m10b) {
    p.pregunta = `¿Quiénes fueron los primeros ${m10b[1]}?`
    p.opciones = p.opciones.map((o) => o.replace(/^son /i, 'fueron '))
    p.respuesta = p.opciones[p.indice_correcta]
    primerosFijados++
  }
  if (p.pregunta === '¿Qué son las Primeras Grabaciones de Rap?') {
    p.pregunta = '¿Qué son las primeras grabaciones de rap?'
    primerosFijados++
  }
}

// ─── Etapa 11: restaurar opciones truncadas ("…") desde la Enciclopedia HH ───
// El generador corta las definiciones a ~140-170 chars con "…" (cortar/MAX_OPCION).
// Las fuentes completas viven en dist/enciclopedia.json: descripcion, importancia y
// preguntas[].respuesta. Se restaura conservando la primera palabra (regla de oro).
import { fileURLToPath } from 'node:url'
const ENC_PATH = fileURLToPath(new URL('../../Enciclopedia HH/dist/enciclopedia.json', import.meta.url))
let encEntries = []
try {
  encEntries = JSON.parse(readFileSync(ENC_PATH, 'utf8')).entries ?? []
} catch {
  console.warn('⚠️ enciclopedia.json no encontrada — etapa 11 omitida (ruta: ' + ENC_PATH + ')')
}
const ART_REST = /^(El|La|Los|Las|Un|Una)\s+(.+?)\s+(?=(es|son|fue|fueron|era|eran|está|están)\s)/i
const COPI_REST = /^(es|son|fue|fueron|era|eran)\b/i
const stripSujeto = (t) => {
  const m = t.match(ART_REST)
  return m ? t.slice(m[0].length).trim() : t
}
const limpiarTexto = (t) => t.replace(/\(\s*ver\s+`?[^)]*`?\s*\)/gi, ' ').replace(/\s+/g, ' ').trim()

let opcionesRestauradas = 0
const preguntasConRestauracion = new Set()
if (encEntries.length) {
  const pool = encEntries.flatMap((e) => {
    const fuentes = [e.descripcion, e.importancia, ...(e.preguntas ?? []).map((q) => q.respuesta)]
    return fuentes.filter(Boolean).map((t) => {
      const limpia = limpiarTexto(t)
      return { id: e.id, termino: e.termino, fuente: limpia, def: stripSujeto(limpia) }
    })
  })
  const cuerpoDe = (t) => {
    const cop = (t.match(COPI_REST)?.[1] ?? '').toLowerCase()
    return cop ? t.slice(t.indexOf(' ') + 1) : t
  }
  const encontrar = (candidato) => {
    // 1) fuente completa (con sujeto) que arranca con el candidato tal cual —
    //    prioridad para opciones NO recortadas (conserva sujeto y partícula)
    let hit = pool.find((e) => e.fuente.toLowerCase().startsWith(candidato.toLowerCase()))
    if (hit) return { tipo: 'fuente', e: hit }
    const cStrip = stripSujeto(candidato)
    const cCuerpo = cuerpoDe(cStrip)
    const cLow = cCuerpo.toLowerCase()
    // 2) definición sin sujeto que arranca con el cuerpo (opciones ya recortadas)
    hit = pool.find((e) => cCuerpo.length > 40 && cuerpoDe(e.def).toLowerCase().startsWith(cLow))
    if (hit) return { tipo: 'def', e: hit }
    // 3) fallback: prefijo de 40 chars con límite de palabra
    if (cCuerpo.length >= 60) {
      const p40 = cLow.slice(0, 40)
      const ult = p40.lastIndexOf(' ')
      const p39 = p40.slice(0, ult > 0 ? ult : 40)
      hit = pool.find((e) => cuerpoDe(e.def).toLowerCase().startsWith(p39))
      if (hit) return { tipo: 'def', e: hit }
    }
    return null
  }

  for (const p of ps) {
    const normActuales = new Set(p.opciones.map((o) => o.toLowerCase().replace(/\s+/g, ' ').trim()))
    const correctaEraTruncada = p.opciones[p.indice_correcta].endsWith('…')
    for (let i = 0; i < p.opciones.length; i++) {
      const o = p.opciones[i]
      if (!o.endsWith('…')) continue
      const res = encontrar(o.slice(0, -1).trim())
      if (!res) continue
      let nuevo
      if (res.tipo === 'fuente') nuevo = res.e.fuente
      else {
        // conservar la primera palabra de la opción (partícula/cópula uniforme)
        const oCop = (o.match(COPI_REST)?.[1] ?? '')
        nuevo = oCop ? `${oCop} ${cuerpoDe(res.e.def)}` : res.e.def
      }
      const nNorm = nuevo.toLowerCase().replace(/\s+/g, ' ').trim()
      if (normActuales.has(nNorm)) continue // no duplicar dentro de la pregunta
      p.opciones[i] = nuevo
      normActuales.add(nNorm)
      opcionesRestauradas++
    }
    if (opcionesRestauradas > 0 || correctaEraTruncada) {
      // si la correcta fue restaurada, la respuesta se alinea con ella
      const correcta = p.opciones[p.indice_correcta]
      if (correcta && !correcta.endsWith('…')) p.respuesta = correcta
    }
  }
  // marcar preguntas con restauración (para el conteo)
  for (const p of ps) {
    if (p.opciones.some((o) => o.length > 200)) preguntasConRestauracion.add(p.id)
  }
}

// ─── Etapa 11b: fixes puntuales detectados en smoke de producción ───
let fixesPuntuales = 0
for (const p of ps) {
  const qAntes = p.pregunta
  p.pregunta = p.pregunta.replace(
    /^(¿(?:Cuándo|Dónde) se celebró) Block Party de (Sedgwick Avenue\?)$/,
    '$1 la Block Party de $2',
  )
  if (p.pregunta !== qAntes) fixesPuntuales++
  const idxGarbage = p.opciones.findIndex((o) => o === 'En Global fabricado en Japón')
  if (idxGarbage !== -1 && idxGarbage !== p.indice_correcta) {
    p.opciones[idxGarbage] = 'En Reino Unido'
    fixesPuntuales++
  }
}

// ─── Etapa 12: artículos para términos-concepto ("surgió Rima" → "surgió la rima") ───
// La humanización integró los términos sin artículo (estilo nombre propio), pero los
// conceptos son nombres comunes: "Rima", "Beat", "Tocadiscos", "Mixtape"…
// El artículo se deriva de la descripción de la enciclopedia ("La rima es…" → "la";
// "Un mixtape es…" → "el" — el indefinido de definición se vuelve definido en la pregunta).
// Solo aplica si la descripción define AL término (las entidades no tienen artículo).
let conectoresFijados = 0
// Sin \b final: en V8 falla tras vocales acentuadas ("surgió"). Lookbehind explícito
// para el inicio del verbo (evita "es" dentro de otra palabra).
const VERBOS_ART =
  /(?<![A-Za-zÁÉÍÓÚÑáéíóúñ0-9])(?:surgi[oó]|surgieron|naci[oó]|nacieron|apareci[oó]|aparecieron|se origin[oó]|se originaron|empez[oó]|empezaron|comenz[oó]|comenzaron|se fund[oó]|se fundaron|se celebr[oó]|se celebraron|se estren[oó]|se estrenaron|se consolid[oó]|se consolidaron|se populariz[oó]|se popularizaron|se masific[oó]|se masificaron|se desarroll[oó]|se desarrollaron|se expandi[oó]|se expandieron|se difundi[oó]|se difundieron|se gest[oó]|se gestaron|se hic[oó]|se hicieron|se volvi[oó]|se volvieron|lleg[oó]|llegaron|es|fue|son|fueron|sirve|sirven|se usa|se usan|se utiliza|se utilizan)/i
const ART_ENC = { el: 'el', la: 'la', los: 'los', las: 'las', un: 'el', una: 'la' }
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Nombres propios SEGUROS (nunca nombres comunes) — conservan mayúscula palabra a palabra
const KEEP_CAPS = new Set([
  'MC', 'MCs', 'DJ', 'DJs', 'FMS', 'DVS', 'CC', 'EE', 'TAKI', 'Taki',
  'Chile', 'Concepción', 'Talcahuano', 'Europa', 'Japón', 'Asia', 'África', 'Sudáfrica',
  'México', 'Kingston', 'Jamaica', 'Bronx', 'Brooklyn', 'Queens', 'Manhattan',
  'Santiago', 'Valparaíso', 'Viña', 'York', 'Nueva', 'Estados', 'Unidos',
  'Kool', 'Herc', 'Grandmaster', 'Flash', 'Wizzard', 'Theodore', 'Afrika', 'Bambaataa',
  'Sugarhill', 'Furious', 'Five', 'Tiro', 'Gracia', 'Zulu', 'Universal', 'Nation', 'Wiz',
])
// Frases propias con mayúsculas de título (se restauran tras el formateo palabra a palabra)
const KEEP_PHRASES = [
  ['rock steady crew', 'Rock Steady Crew'],
  ['lincoln center', 'Lincoln Center'],
  ['red bull bc one', 'Red Bull BC One'],
  ['red bull', 'Red Bull'],
  ['block party', 'Block Party'],
  ['charlie rock', 'Charlie Rock'],
  ['roxanne wars', 'Roxanne Wars'],
  ['style wars', 'Style Wars'],
  ['bridge wars', 'Bridge Wars'],
  ['universal zulu nation', 'Universal Zulu Nation'],
  ['sedgwick avenue', 'Sedgwick Avenue'],
  ['nueva york', 'Nueva York'],
  ['estados unidos', 'Estados Unidos'],
  ['furious five', 'Furious Five'],
  ['disco wiz', 'Disco Wiz'],
  ['kool herc', 'Kool Herc'],
  ['grandmaster flash', 'Grandmaster Flash'],
  ['grand wizzard theodore', 'Grand Wizzard Theodore'],
  ['afrika bambaataa', 'Afrika Bambaataa'],
  ['sugarhill gang', 'Sugarhill Gang'],
  ['taki 183', 'TAKI 183'],
  ['sp-1200', 'SP-1200'],
  ['sl-1200', 'SL-1200'],
  ['tr-808', 'TR-808'],
  ['lm-1', 'LM-1'],
  ['e-mu', 'E-mu'],
  // acrónimos que el formateo palabra a palabra pudo destrozar (EP→eP, DJ→dJ…)
  ['ep', 'EP'],
  ['dvs', 'DVS'],
  ['mc', 'MC'],
  ["cc's", "CC's"],
  ['ufo', 'UFO'],
  ['mpc', 'MPC'],
  ['midi', 'MIDI'],
  ['dj', 'DJ'],
  ['fms', 'FMS'],
]
const PHRASE_RE = KEEP_PHRASES.map(([f]) => [
  new RegExp(`\\b${f.replace(/ /g, '\\s+')}\\b`, 'gi'),
  KEEP_PHRASES.find(([p]) => p === f)[1],
])
const formatearTermino = (t) => {
  const KEEP_LOW = new Map([...KEEP_CAPS].map((w) => [w.toLowerCase(), w]))
  let out = t
    .split(' ')
    .map((w) => {
      const limpia = w.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9.'-]/g, '')
      const canon = KEEP_LOW.get(limpia.toLowerCase())
      if (canon) return canon
      if (/^[A-ZÁÉÍÓÚÑ0-9.'-]{2,}$/.test(limpia)) return w
      if (/^[A-ZÁÉÍÓÚÑ](-|'s|’s)/.test(limpia)) return w // G-Funk, CC's, E-mu…
      return w.charAt(0).toLowerCase() + w.slice(1)
    })
    .join(' ')
  for (const [re, canon] of PHRASE_RE) out = out.replace(re, canon)
  return out
}

if (encEntries.length) {
  const artPorTermino = new Map()
  for (const e of encEntries) {
    const m = (e.descripcion ?? '').match(/^(El|La|Los|Las|Un|Una)\s+([a-záéíóúñ]+)/i)
    if (!m) continue
    const art = ART_ENC[m[1].toLowerCase()]
    if (!art) continue
    const primera = m[2].toLowerCase()
    if (!(e.termino ?? '').toLowerCase().startsWith(primera)) continue
    artPorTermino.set(e.termino, art)
  }
  for (const p of ps) {
    for (const [term, art] of artPorTermino) {
      // flag 'u': \b tras vocales acentuadas ("surgió" → "ó" es \w en modo unicode)
      const re = new RegExp(`(${VERBOS_ART.source})\\s+(${escapar(term)})(?=\\s|\\?|$)`, 'giu')
      if (!re.test(p.pregunta)) continue
      re.lastIndex = 0
      p.pregunta = p.pregunta.replace(re, (_, verbo, t) => {
        conectoresFijados++
        return `${verbo} ${art} ${formatearTermino(t)}`
      })
    }
  }
  // Auto-reparación: mayúsculas internas tras artículo ("el coin Drop" → "el coin drop")
  // y conectores que quedaron sin insertar (corrección idempotente sobre data ya escrita).
  // Patrón: artículo + palabras en minúscula + palabra(s) capitalizada(s) — la capital
  // puede ir en 3ª+ posición ("el coin Drop"), no solo tras el artículo.
  for (const p of ps) {
    p.pregunta = p.pregunta.replace(
      /(\b(?:el|la|los|las)\s+[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+)*\s+)([A-ZÁÉÍÓÚÑ][a-zA-Záéíóúñ.'-]+(?:\s+[A-ZÁÉÍÓÚÑ][a-zA-Záéíóúñ.'-]*)*)/g,
      (_, pre, resto) => `${formatearTermino((pre + resto).trim())}`,
    )
  }
  // Cópula/verbo singular + artículo plural ("¿Qué es los power moves?" → "¿Qué son los power moves?")
  for (const p of ps) {
    const antes = p.pregunta
    p.pregunta = p.pregunta.replace(/^¿Qué es (los|las) /i, '¿Qué son $1 ')
    p.pregunta = p.pregunta.replace(
      /(¿(?:Cuándo|Dónde|En qué época|En qué momento|En qué lugar)\s+)(surgió|nació|apareció|se originó|empezó|comenzó|se fundó|se celebró|se estrenó|llegó|se consolidó|se popularizó|se masificó|se desarrolló|se expandió|se difundió|se gestó|se hizo|se volvió)\s+(los|las) ([a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){0,3})/i,
      (_, pre, verbo, art, frase) => {
        const plural = /[a-záéíóúñ]s\b/i.test(frase)
        if (plural) {
          const vp = { surgió: 'surgieron', nació: 'nacieron', apareció: 'aparecieron', 'se originó': 'se originaron', empezó: 'empezaron', comenzó: 'comenzaron', 'se fundó': 'se fundaron', 'se celebró': 'se celebraron', 'se estrenó': 'se estrenaron', llegó: 'llegaron', 'se consolidó': 'se consolidaron', 'se popularizó': 'se popularizaron', 'se masificó': 'se masificaron', 'se desarrolló': 'se desarrollaron', 'se expandió': 'se expandieron', 'se difundió': 'se difundieron', 'se gestó': 'se gestaron', 'se hizo': 'se hicieron', 'se volvió': 'se volvieron' }[verbo] ?? verbo
          return `${pre}${vp} ${art} ${frase}`
        }
        return `${pre}${verbo} ${art === 'los' ? 'el' : 'la'} ${frase}`
      },
    )
    if (p.pregunta !== antes) conectoresFijados++
  }
  // Restaurar acrónimos y frases propias en TODA la pregunta (case-insensitive)
  for (const p of ps) {
    for (const [re, canon] of PHRASE_RE) p.pregunta = p.pregunta.replace(re, canon)
  }
  // Eliminar variantes rotas que tras la corrección duplican una pregunta existente
  // ("¿Qué es los nikes?" → ya existía "¿Qué son los nikes?" → se descarta la rota)
  {
    const vistos = new Map()
    for (const p of ps) if (!vistos.has(p.pregunta)) vistos.set(p.pregunta, p)
    for (let i = ps.length - 1; i >= 0; i--) {
      if (vistos.get(ps[i].pregunta) !== ps[i]) ps.splice(i, 1)
    }
  }
}

// ─── Validación ───
const sinCtx = ps.filter((p) => p.pregunta.startsWith('¿') && /«[^»]+»/.test(p.pregunta))
const sinPregunta = ps.filter((p) => !p.pregunta.includes('¿'))
const sinPistaFinal = ps.filter((p) => !p.pista)
const duplicadas = []
for (const p of ps) {
  const vistos = new Set()
  for (const o of p.opciones) {
    const n = NORM(o)
    if (vistos.has(n)) duplicadas.push(`${p.pregunta} → "${o.slice(0, 60)}…"`)
    vistos.add(n)
  }
}
// Regla de oro: opciones con el mismo primer token
const particulas = ps.filter((p) => {
  const prim = p.opciones.map((o) => o.split(' ')[0]?.toLowerCase())
  return new Set(prim).size > 1
})
// Lugares que "no surgen": la ciudad no surge, el hip hop surge EN ella
const LUGARES = ['«Bronx»', '«Nueva York»', '«Brooklyn»', '«Queens»', '«Harlem»', '«Chile»']
const lugarRoto = ps.filter((p) =>
  LUGARES.some((l) => p.pregunta.includes(`Sobre ${l}: ¿Cuándo surgió?`) || p.pregunta.includes(`Sobre ${l}: ¿Dónde surgió?`)),
)
// Respuesta debe coincidir con la opción marcada correcta (alineación de contenido)
const NORM2 = (s) => s.toLowerCase().replace(/[«»"'—–]/g, ' ').replace(/[^a-z0-9áéíóúüñ ]/g, ' ').replace(/\s+/g, ' ').trim()
const desalineadas = ps.filter((p) => {
  const a = NORM2(p.respuesta)
  const b = NORM2(p.opciones[p.indice_correcta])
  return !a || !b || (!a.includes(b) && !b.includes(a))
})
// "estuvo activo" sin el prefijo "Desde cuándo" (todas deben haber sido reescritas)
const activoSinDesde = ps.filter((p) => /¿Cuándo estuvo activo\?/.test(p.pregunta))
// Humanización: no debe quedar ninguna fórmula "Sobre «X»:"
const conSobre = ps.filter((p) => p.pregunta.startsWith('Sobre «'))
// Textos de pregunta duplicados (tras humanizar, dos preguntas no pueden ser idénticas)
const preguntasDuplicadas = []
{
  const vistos = new Map()
  for (const p of ps) {
    const prev = vistos.get(p.pregunta)
    if (prev) preguntasDuplicadas.push(`${p.pregunta} (${prev} y ${p.id})`)
    else vistos.set(p.pregunta, p.id)
  }
}

console.log(`\nresultados:`)
console.log(`  reescritas (leaks/gramática): ${reescritas}`)
console.log(`  convertidas a "Sobre «…»:": ${convertidas}`)
console.log(`  pistas añadidas: ${ps.length - sinPistaFinal.length}`)
console.log(`  opciones con sujeto recortado: ${opcionesRecortadas}`)
console.log(`  preguntas con cópulas unificadas: ${copulasUnificadas}`)
console.log(`  gramática "¿Qué son los/las Primer…?": ${gramaticaArreglada}`)
console.log(`  restantes sin contexto «»: ${sinCtx.length}`)
console.log(`  restantes sin ¿: ${sinPregunta.length}`)
console.log(`  restantes sin pista: ${sinPistaFinal.length}`)
console.log(`  opciones duplicadas: ${duplicadas.length}`)
console.log(`  violaciones regla de oro (1er token distinto): ${particulas.length}`)
console.log(`  términos-lugar con "surgió" (semántica rota): ${lugarRoto.length}`)
console.log(`  respuesta ≠ opción correcta: ${desalineadas.length}`)
console.log(`  "estuvo activo" sin "Desde cuándo": ${activoSinDesde.length}`)
console.log(`  con fórmula "Sobre «": ${conSobre.length}`)
console.log(`  preguntas duplicadas: ${preguntasDuplicadas.length}`)
console.log(`  humanizadas: ${humanizadas}`)
console.log(`  artículos capitalizados fijados: ${articulosFijados}`)
console.log(`  distractores reemplazados (clase ≠ correcta): ${distractoresReemplazados}`)
console.log(`  "Primeros X" fijados (artículo/qué son→quiénes fueron): ${primerosFijados}`)
console.log(`  opciones restauradas (truncadas→completas): ${opcionesRestauradas}`)
console.log(`  fixes puntuales (Block Party la/En Global→Reino Unido): ${fixesPuntuales}`)
console.log(`  conectores/artículos insertados (surgió Rima→surgió la rima): ${conectoresFijados}`)
console.log(`  opciones aún truncadas (sin match en enciclopedia): ${ps.filter((p) => p.opciones.some((o) => o.endsWith('…'))).length} preguntas`)
console.log(`  casos raros: ${raras.length}`)
if (raras.length) raras.slice(0, 10).forEach((r) => console.log(`    • ${r}`))

if (
  sinCtx.length ||
  sinPregunta.length ||
  sinPistaFinal.length ||
  duplicadas.length ||
  particulas.length ||
  lugarRoto.length ||
  desalineadas.length ||
  activoSinDesde.length ||
  conSobre.length ||
  preguntasDuplicadas.length
) {
  console.log('\n⚠️ validación falló — NO se escribe el archivo')
  if (desalineadas.length) {
    console.log('\n— respuesta ≠ opción correcta (muestra) —')
    desalineadas.slice(0, 8).forEach((p) => console.log(`  • ${p.pregunta}\n      resp: ${p.respuesta.slice(0, 70)}\n      opc:  ${p.opciones[p.indice_correcta].slice(0, 70)}`))
  }
  if (duplicadas.length) {
    console.log('\n— opciones duplicadas —')
    duplicadas.slice(0, 8).forEach((x) => console.log('  •', x))
  }
  if (particulas.length) {
    console.log('\n— violaciones regla de oro (muestra) —')
    particulas.slice(0, 8).forEach((p) => {
      console.log('  •', p.pregunta)
      p.opciones.forEach((o) => console.log(`      "${o.split(' ')[0]}…" → ${o.slice(0, 60)}…`))
    })
  }
  process.exit(1)
}

// ─── Escribir (formato minificado original) ───
writeFileSync(DATA, JSON.stringify(d))
console.log(`\n✅ escrito: ${DATA} (${ps.length} preguntas)`)

// ─── Muestras ───
const ej = ps.find((p) => p.pregunta.startsWith('¿Qué son los Primeros MCs'))
if (ej) {
  console.log('\n--- pregunta de Freddy arreglada ---')
  console.log(' ', ej.pregunta)
  ej.opciones.forEach((o, i) => console.log(`   ${i === ej.indice_correcta ? '✓' : ' '} ${o.slice(0, 100)}…`))
}
console.log('\n--- otras muestras recortadas ---')
ps.filter((p) => /¿Qué es Suicide|¿Qué es Coin Drop|¿Quiénes eran los Herculoids/.test(p.pregunta)).forEach((p) => {
  console.log(' ', p.pregunta)
  p.opciones.forEach((o, i) => console.log(`   ${i === p.indice_correcta ? '✓' : ' '} ${o.slice(0, 90)}…`))
})
