import { describe, expect, it, vi, afterEach } from 'vitest'
import type { Candidate } from '../src/types'
import { hasOfficialCandidateIdentity, officialPhotoUrl, resolvePhotoElection } from '../src/data/candidatePhotos'

const candidate = (extra: Partial<Candidate> = {}): Candidate => ({
  id: '250002546642', name: 'Kim Kataguiri', number: '1414', party: 'MISSÃO', state: 'SP', office: 'deputado-federal',
  votes: null, expenses: null, revenue: null, electoralFund: null, status: 'pendente', ...extra,
})
const configuration = { pl: [{ c: 'ele2026', e: [
  { cd: '9999', t: '1', nm: 'Eleição Suplementar', sqele: '1234', abr: [{ cp: [{ cd: '6' }] }] },
  { cd: '6259', t: '1', nm: 'Eleição Ordinária Estadual', sqele: '20322002026', abr: [{ cp: [{ cd: '5' }, { cd: '6' }, { cd: '7' }, { cd: '8' }] }] },
  { cd: '6257', t: '1', nm: 'Eleição Ordinária Federal', sqele: '20322002026', abr: [{ cp: [{ cd: '1' }] }] },
] }] }
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
describe('fotos oficiais de candidaturas', () => {
  it('usa a eleição ordinária correspondente ao cargo e não a suplementar', () => {
    expect(resolvePhotoElection(configuration, candidate(), 2026)?.id).toBe('6259')
    expect(resolvePhotoElection(configuration, candidate({ office: 'presidente', state: 'BR' }), 2026)?.id).toBe('6257')
    expect(resolvePhotoElection(configuration, candidate(), 2022)).toBeNull()
  })
  it('aceita apenas URLs HTTPS oficiais e nunca consulta identidades demonstrativas', async () => {
    expect(officialPhotoUrl('https://resultados.tse.jus.br/foto.jpeg')).toBeTruthy()
    expect(officialPhotoUrl('https://tse.jus.br.evil.example/foto.jpeg')).toBeNull()
    expect(officialPhotoUrl('javascript:alert(1)')).toBeNull()
    expect(hasOfficialCandidateIdentity(candidate({ id: 'demo-2026-SP-1' }))).toBe(false)
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const { candidatePhotoSources } = await import('../src/data/candidatePhotos')
    expect(await candidatePhotoSources(candidate({ id: 'demo-2026-SP-1' }), 2026)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('aproveita a origem exata dos resultados sem consulta adicional', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    const { candidatePhotoSources } = await import('../src/data/candidatePhotos')
    expect(await candidatePhotoSources(candidate({ sourceUrl: 'https://resultados.tse.jus.br/oficial/ele2026/6259/dados/sp/sp-c0006-e006259-u.json' }), 2026))
      .toEqual(['https://resultados.tse.jus.br/oficial/ele2026/6259/fotos/sp/250002546642.jpeg'])
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('compartilha a descoberta oficial entre candidatos, com fallback oficial', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => configuration }); vi.stubGlobal('fetch', fetchMock)
    const { candidatePhotoSources } = await import('../src/data/candidatePhotos')
    const [first, second] = await Promise.all([candidatePhotoSources(candidate(), 2026), candidatePhotoSources(candidate({ id: '250002546643' }), 2026)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual(['https://resultados.tse.jus.br/oficial/ele2026/6259/fotos/sp/250002546642.jpeg', 'https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/20322002026/250002546642/SP'])
    expect(second[0]).toContain('250002546643.jpeg')
  })
})
