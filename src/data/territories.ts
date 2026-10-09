import type { ElectoralZone, Municipality } from '../types'
import { ALL_STATES } from './regions'

export interface TerritoriesMetadata {
  version: number
  preparedAt: string
  sources: Record<string, string>
  municipalities: Municipality[]
  zones: Record<string, Record<string, Record<string, number[]>>>
  geometryUnavailable: string[]
}
type OfficialMunicipality = { cd: string; cdi?: string; nm?: string; z?: string[] }
type OfficialTerritoryConfig = { abr?: Array<{ cd: string; mu?: OfficialMunicipality[] }> }
let metadataCache: TerritoriesMetadata | null = null
const officialCache = new Map<number, OfficialTerritoryConfig>()

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Consulta cancelada', 'AbortError')
}
function validatedState(state: string): string {
  const normalized = state.toUpperCase()
  if (!ALL_STATES.includes(normalized)) throw new Error('Selecione uma UF brasileira válida.')
  return normalized
}
async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  abortIfNeeded(signal)
  const response = await fetch(url, { signal, credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error('Não foi possível carregar os metadados territoriais (HTTP ' + response.status + ').')
  const result: T = await response.json()
  abortIfNeeded(signal)
  return result
}

/** Prepared from IBGE IDs and the explicit cdi↔cd mapping published in TSE's 2026 municipality configuration. */
export async function loadTerritoriesMetadata(signal?: AbortSignal): Promise<TerritoriesMetadata> {
  abortIfNeeded(signal)
  if (metadataCache) return metadataCache
  const result = await json<TerritoriesMetadata>('/data/territories.json', signal)
  if (result.version !== 1 || !Array.isArray(result.municipalities)) throw new Error('Os metadados municipais locais são inválidos.')
  metadataCache = result
  return result
}
export async function loadMunicipalities(state: string, signal?: AbortSignal): Promise<Municipality[]> {
  const uf = validatedState(state)
  const metadata = await loadTerritoriesMetadata(signal)
  return metadata.municipalities.filter(municipality => municipality.state === uf)
}

/** A zone number is an electoral filter. This configuration does not provide boundaries or coordinates. */
export function normalizeOfficialZones(
  payload: OfficialTerritoryConfig, state: string, municipalityTseCode: string, municipalityId: string, municipalityName?: string,
): ElectoralZone[] {
  const code = municipalityTseCode.padStart(5, '0')
  const municipality = payload.abr?.find(scope => scope.cd.toUpperCase() === state.toUpperCase())?.mu
    ?.find(item => item.cd.padStart(5, '0') === code)
  return [...new Set((municipality?.z ?? []).map(Number))]
    .filter(number => Number.isInteger(number) && number > 0)
    .sort((a, b) => a - b).map(number => ({ number, municipalityId, municipalityName }))
}
async function loadOfficialTerritories(year: number, signal?: AbortSignal): Promise<OfficialTerritoryConfig> {
  abortIfNeeded(signal)
  const cached = officialCache.get(year)
  if (cached) return cached
  const root = await json<{ pl?: Array<{ c?: string; e?: Array<{ cd?: string; t?: string; abr?: Array<{ cp?: Array<{ cd?: string }> }> }> }> }>(
    'https://resultados.tse.jus.br/oficial/comum/config/ele-c.json', signal,
  )
  const election = root.pl?.find(pleito => pleito.c === 'ele' + year)?.e?.find(item =>
    item.t === '1' && item.abr?.some(scope => scope.cp?.some(office => office.cd === '6')),
  )
  if (!election?.cd || !/^[0-9]+$/.test(election.cd)) {
    throw new Error('O TSE não disponibiliza uma configuração acessível de zonas eleitorais para ' + year + '.')
  }
  const id = election.cd
  const result = await json<OfficialTerritoryConfig>(
    'https://resultados.tse.jus.br/oficial/ele' + year + '/' + id + '/config/mun-e' + id.padStart(6, '0') + '-cm.json', signal,
  )
  officialCache.set(year, result)
  return result
}
export async function loadZones(
  year: number, state: string, municipalityTseCode: string, signal?: AbortSignal,
): Promise<ElectoralZone[]> {
  const uf = validatedState(state)
  if (!/^[0-9]{1,5}$/.test(municipalityTseCode)) throw new Error('Código municipal do TSE inválido.')
  const code = municipalityTseCode.padStart(5, '0')
  const metadata = await loadTerritoriesMetadata(signal)
  const municipality = metadata.municipalities.find(item => item.state === uf && item.tseCode === code)
  if (!municipality) throw new Error('O código municipal não corresponde à UF selecionada.')
  const snapshot = metadata.zones[String(year)]?.[uf]?.[code]
  if (snapshot) return snapshot.map(number => ({ number, municipalityId: municipality.id, municipalityName: municipality.name }))
  const official = await loadOfficialTerritories(year, signal)
  return normalizeOfficialZones(official, uf, code, municipality.id, municipality.name)
}
