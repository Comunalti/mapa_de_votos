import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { TerritoriesMetadata } from '../src/data/territories'
import { loadMunicipalities, loadZones, normalizeOfficialZones } from '../src/data/territories'
import { ALL_STATES } from '../src/data/regions'
import { STATE_BY_UF } from '../src/data/geography'

const metadata = JSON.parse(readFileSync(new URL('../public/data/territories.json', import.meta.url), 'utf8')) as TerritoriesMetadata
const directory = new URL('../public/data/municipalities/', import.meta.url)

describe('metadados territoriais oficiais preparados', () => {
  it('cobre o cadastro de 5.571 municípios com códigos IBGE e TSE distintos e únicos', () => {
    expect(metadata.municipalities).toHaveLength(5571)
    expect(new Set(metadata.municipalities.map(item => item.id)).size).toBe(5571)
    for (const state of ALL_STATES) {
      const municipalities = metadata.municipalities.filter(item => item.state === state)
      expect(municipalities.length).toBeGreaterThan(0)
      expect(new Set(municipalities.map(item => item.tseCode)).size).toBe(municipalities.length)
      for (const item of municipalities) {
        expect(item.id).toMatch(/^[0-9]{7}$/)
        expect(item.id.startsWith(STATE_BY_UF[state].id)).toBe(true)
        expect(item.tseCode).toMatch(/^[0-9]{5}$/)
      }
    }
    expect(metadata.municipalities.find(item => item.id === '3550308')).toMatchObject({ name: 'São Paulo', state: 'SP', tseCode: '71072' })
    expect(metadata.sources.election2026).toBe('https://resultados.tse.jus.br/oficial/ele2026/6259/config/mun-e006259-cm.json')
  })
  it('entrega as 27 malhas e relaciona cada polígono ao município da UF correta', () => {
    expect(readdirSync(directory).filter(name => name.endsWith('.json'))).toHaveLength(27)
    const geometryIds = new Set<string>()
    for (const state of ALL_STATES) {
      const geometry = JSON.parse(readFileSync(new URL(state.toLowerCase() + '.json', directory), 'utf8'))
      expect(geometry.type).toBe('FeatureCollection')
      for (const feature of geometry.features) {
        const id = feature.properties.codarea as string
        expect(geometryIds.has(id)).toBe(false)
        geometryIds.add(id)
        expect(metadata.municipalities.find(item => item.id === id)?.state).toBe(state)
        expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type)
      }
    }
    expect(geometryIds.size).toBe(5571)
    expect(metadata.municipalities.filter(item => !geometryIds.has(item.id)).map(item => item.id)).toEqual(metadata.geometryUnavailable)
    expect(metadata.geometryUnavailable).toEqual([])
  })
  it('associa zonas reais a municípios sem inventar localização ou fronteiras', () => {
    for (const item of metadata.municipalities) {
      const zones = metadata.zones['2026'][item.state][item.tseCode!]
      expect(zones.length).toBeGreaterThan(0)
      expect(new Set(zones).size).toBe(zones.length)
      expect(zones.every(number => Number.isInteger(number) && number > 0)).toBe(true)
    }
    expect(metadata.zones['2026'].SP['71072']).toHaveLength(57)
    expect(metadata.zones['2026'].SP['71072']).toContain(1)
    expect(metadata.zones['2026'].SP['71072']).toContain(422)
  })
})

describe('carregamento local de municípios e zonas', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(metadata), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  })
  afterAll(() => vi.unstubAllGlobals())
  it('filtra municípios por UF sem consultar um servidor de aplicação', async () => {
    const municipalities = await loadMunicipalities('sp')
    expect(municipalities).toHaveLength(645)
    expect(municipalities.every(item => item.state === 'SP')).toBe(true)
    expect(await loadMunicipalities('DF')).toHaveLength(1)
  })
  it('carrega as zonas da eleição de 2026 com o IBGE correto', async () => {
    const zones = await loadZones(2026, 'SP', '71072')
    expect(zones).toHaveLength(57)
    expect(zones[0]).toEqual({ number: 1, municipalityId: '3550308', municipalityName: 'São Paulo' })
    expect(zones.every(zone => zone.locations === undefined)).toBe(true)
  })
  it('rejeita códigos sem relação com a UF em vez de estimar a correspondência', async () => {
    await expect(loadMunicipalities('ZZ')).rejects.toThrow(/UF brasileira/)
    await expect(loadZones(2026, 'RJ', '71072')).rejects.toThrow(/não corresponde/)
    await expect(loadZones(2026, 'SP', '3550308')).rejects.toThrow(/Código municipal/)
  })
  it('respeita cancelamento mesmo quando os metadados já estão em cache', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(loadMunicipalities('SP', controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('normaliza os números de zona publicados pelo TSE sem produzir coordenadas', () => {
    const zones = normalizeOfficialZones({ abr: [{ cd: 'sp', mu: [{ cd: '71072', z: ['0002', '0001', '0002'] }] }] }, 'SP', '71072', '3550308', 'São Paulo')
    expect(zones).toEqual([
      { number: 1, municipalityId: '3550308', municipalityName: 'São Paulo' },
      { number: 2, municipalityId: '3550308', municipalityName: 'São Paulo' },
    ])
    expect(normalizeOfficialZones({ abr: [] }, 'SP', '71072', '3550308')).toEqual([])
  })
})
