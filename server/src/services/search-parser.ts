const MONTHS: Record<string, number> = {
  janeiro: 1, jan: 1, january: 1,
  fevereiro: 2, fev: 2, february: 2, feb: 2,
  'março': 3, marco: 3, mar: 3, march: 3,
  abril: 4, abr: 4, april: 4, apr: 4,
  maio: 5, mai: 5, may: 5,
  junho: 6, jun: 6, june: 6,
  julho: 7, jul: 7, july: 7,
  agosto: 8, ago: 8, august: 8, aug: 8,
  setembro: 9, set: 9, september: 9, sep: 9, sept: 9,
  outubro: 10, out: 10, october: 10, oct: 10,
  novembro: 11, nov: 11, november: 11,
  dezembro: 12, dez: 12, december: 12, dec: 12,
}
const VIDEO = new Set(['video', 'videos', 'vídeo', 'vídeos', 'filme', 'filmes'])
const IMAGE = new Set(['foto', 'fotos', 'fotografia', 'fotografias', 'imagem', 'imagens', 'photo', 'photos', 'picture', 'pictures', 'image', 'images'])
const FAVOURITE = new Set(['favorito', 'favoritos', 'favorita', 'favoritas', 'favourite', 'favourites', 'favorite', 'favorites'])
const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'e', 'a', 'o', 'os', 'as', 'of', 'in', 'from', 'the', 'and', 'my', 'meus', 'minhas'])
/** Tokens curtos ambíguos (ex.: "set", "mar", "out") só contam como mês junto de um ano. */
const AMBIGUOUS = new Set(['jan', 'fev', 'feb', 'mar', 'abr', 'apr', 'mai', 'may', 'jun', 'jul', 'ago', 'aug', 'set', 'sep', 'sept', 'out', 'oct', 'nov', 'dez', 'dec'])
const YEAR = /^(19|20)\d{2}$/

export interface ParsedQuery {
  text: string
  terms: string[]
  type: 'image' | 'video' | null
  favourite: boolean
  year: number | null
  month: number | null
  from: string | null
  to: string | null
}

/** Interpreta pesquisas em linguagem simples (pt/en): "setembro 2026", "vídeos de 2025", "favourite photos". */
export function parseSearch(query: string): ParsedQuery {
  const tokens = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  const r: ParsedQuery = { text: '', terms: [], type: null, favourite: false, year: null, month: null, from: null, to: null }
  const hasYear = tokens.some((t) => YEAR.test(t))
  const terms: string[] = []

  for (const raw of tokens) {
    const token = raw.replace(/^[\s,.;:!?"']+|[\s,.;:!?"']+$/g, '')
    if (!token) continue
    if (YEAR.test(token)) r.year = Number(token)
    else if (token in MONTHS && (!AMBIGUOUS.has(token) || hasYear)) r.month = MONTHS[token]
    else if (VIDEO.has(token)) r.type = 'video'
    else if (IMAGE.has(token)) r.type ??= 'image'
    else if (FAVOURITE.has(token)) r.favourite = true
    else if (!STOPWORDS.has(token)) terms.push(token)
  }

  const pad = (n: number) => String(n).padStart(2, '0')
  if (r.year && r.month) {
    const last = new Date(Date.UTC(r.year, r.month, 0)).getUTCDate()
    r.from = `${r.year}-${pad(r.month)}-01`
    r.to = `${r.year}-${pad(r.month)}-${pad(last)}`
  } else if (r.year) {
    r.from = `${r.year}-01-01`
    r.to = `${r.year}-12-31`
  }
  r.terms = [...new Set(terms)]
  r.text = r.terms.join(' ')
  return r
}
