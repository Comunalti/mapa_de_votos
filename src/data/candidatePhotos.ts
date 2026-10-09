import type { Candidate } from '../types'

const RESULTS_ORIGIN = 'https://resultados.tse.jus.br'
const CONFIG_URL = RESULTS_ORIGIN + '/oficial/comum/config/ele-c.json'
const CANDIDACIES_ORIGIN = 'https://divulgacandcontas.tse.jus.br'
const officeCodes = { presidente: 1, senador: 5, 'deputado-federal': 6, 'deputado-estadual': 7 } as const
type Json = Record<string, unknown>
type PhotoElection = { cycle: string; id: string; financeId: string | null }
const record = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
const records = (value: unknown): Json[] => Array.isArray(value) ? value.map(record) : []
let configPromise: Promise<unknown> | null = null
const sourceCache = new Map<string, Promise<string[]>>()

/** Photos are served from TSE's own public image endpoints; demo identities never request them. */
export function hasOfficialCandidateIdentity(candidate: Candidate): boolean {
  return /^\d{6,20}$/.test(candidate.id) && /^(?:[A-Z]{2})$/.test(candidate.state)
}
export function officialPhotoUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === 'tse.jus.br' || url.hostname.endsWith('.tse.jus.br')) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
function fromResultSource(candidate: Candidate, year: number): string | null {
  if (!candidate.sourceUrl) return null
  try {
    const url = new URL(candidate.sourceUrl)
    const path = url.pathname.match(/^\/oficial\/(ele\d{4})\/(\d+)\/(?:dados|fotos)\//)
    if (url.origin !== RESULTS_ORIGIN || !path || path[1] !== 'ele' + year) return null
    return RESULTS_ORIGIN + '/oficial/' + path[1] + '/' + path[2] + '/fotos/' + candidate.state.toLowerCase() + '/' + candidate.id + '.jpeg'
  } catch { return null }
}
async function configuration(): Promise<unknown> {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000) })
      .then(response => response.ok ? response.json() : null).catch(() => null)
  }
  return configPromise
}
export function resolvePhotoElection(config: unknown, candidate: Candidate, year: number): PhotoElection | null {
  const code = candidate.office === 'deputado-estadual' && candidate.state === 'DF' ? 8 : officeCodes[candidate.office]
  for (const cycle of records(record(config).pl)) {
    if (cycle.c !== 'ele' + year) continue
    for (const election of records(cycle.e)) {
      if (/SUPLEMENTAR/i.test(String(election.nm ?? '')) || String(election.t) !== String(candidate.round ?? 1)) continue
      if (!records(election.abr).some(area => records(area.cp).some(office => Number(office.cd) === code))) continue
      if (!/^\d+$/.test(String(election.cd))) continue
      const financeId = /^\d+$/.test(String(election.sqele)) ? String(election.sqele) : null
      return { cycle: String(cycle.c), id: String(election.cd), financeId }
    }
  }
  return null
}
function resultPhoto(candidate: Candidate, election: PhotoElection): string {
  return RESULTS_ORIGIN + '/oficial/' + election.cycle + '/' + election.id + '/fotos/' + candidate.state.toLowerCase() + '/' + candidate.id + '.jpeg'
}
/**
 * Prefer the exact election already used for the result. For imported identities, discover the
 * election once for the entire browser session. Images themselves load only when visible.
 */
export function candidatePhotoSources(candidate: Candidate, year: number): Promise<string[]> {
  if (!hasOfficialCandidateIdentity(candidate)) return Promise.resolve([])
  const explicit = officialPhotoUrl(candidate.photoUrl)
  const result = fromResultSource(candidate, year)
  if (explicit || result) return Promise.resolve([...new Set([explicit, result].filter((url): url is string => !!url))])
  const key = [year, candidate.id, candidate.state, candidate.office, candidate.round ?? 1].join(':')
  let source = sourceCache.get(key)
  if (!source) {
    source = configuration().then(config => {
      const election = resolvePhotoElection(config, candidate, year)
      if (!election) return []
      const sources = [resultPhoto(candidate, election)]
      if (election.financeId) {
        sources.push(CANDIDACIES_ORIGIN + '/divulga/rest/arquivo/img/' + election.financeId + '/' + candidate.id + '/' + candidate.state)
      }
      return sources
    })
    sourceCache.set(key, source)
  }
  return source
}
export async function candidatePhotoFallback(candidate: Candidate, year: number): Promise<string | null> {
  if (!hasOfficialCandidateIdentity(candidate)) return null
  const election = resolvePhotoElection(await configuration(), candidate, year)
  return election?.financeId ? CANDIDACIES_ORIGIN + '/divulga/rest/arquivo/img/' + election.financeId + '/' + candidate.id + '/' + candidate.state : null
}
