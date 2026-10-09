import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { areaEstimate, campaignRate, campaignVotes, summarize } from '../src/lib/metrics'
import type { Candidate, ElectionQuery } from '../src/types'
import { costPerVote, normalizeStatus, officeFromCode, parseNumber } from '../src/data/normalize'
import { createImportStore, importElectionFilesInWorker, ingestCsv, selectImportedCandidates } from '../src/data/importer'
import { normalizeFinance, normalizeResultCandidates, resolveElection } from '../src/data/tse'
import { ALL_STATES, REGION_STATES, stateRegion } from '../src/data/regions'

const query = (changes: Partial<ElectionQuery> = {}): ElectionQuery => ({
  year: 2026, round: 1, office: 'deputado-federal', region: null, state: null, ...changes,
})

/** Fixtures use the official TSE header names, delimiter and decimal notation. */
function csv(rows: Record<string, string | number>[]) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))]
  const escaped = (value: string | number | undefined) => '"' + String(value ?? '').replaceAll('"', '""') + '"'
  return [keys.map(escaped).join(';'), ...rows.map(row => keys.map(key => escaped(row[key])).join(';'))].join('\r\n')
}
function candidate(changes: Record<string, string | number> = {}) {
  return { ANO_ELEICAO: 2026, CD_CARGO: 6, SQ_CANDIDATO: '60000001', SG_UF: 'SP',
    NM_URNA_CANDIDATO: 'Candidata Áurea', NR_CANDIDATO: '1234', SG_PARTIDO: 'EXEMPLO', ...changes }
}

describe('normalização dos campos do TSE', () => {
  it('preserva centavos e distingue zero de desconhecido', () => {
    expect(parseNumber('1.234.567,89')).toBeCloseTo(1234567.89)
    expect(parseNumber('1234,56')).toBe(1234.56)
    expect(parseNumber('R$ 1.234,50')).toBe(1234.5)
    expect(parseNumber('520071')).toBe(520071)
    expect(parseNumber('0')).toBe(0)
    expect(parseNumber(0)).toBe(0)
  })
  it('não converte sentinelas, campos malformados ou negativos em zero', () => {
    for (const unknown of [null, undefined, '', '#NULO#', '#NE#', '-1', '-3', 'N/A', 'NaN', 'R$', 'abc', Infinity]) {
      expect(parseNumber(unknown)).toBeNull()
    }
  })
  it('reconhece eleitos sem confundir a expressão não eleito', () => {
    expect(normalizeStatus('ELEITO')).toBe('eleito')
    expect(normalizeStatus('ELEITO POR QP')).toBe('eleito')
    expect(normalizeStatus('ELEITO POR MÉDIA')).toBe('eleito')
    expect(normalizeStatus('NÃO ELEITO')).toBe('nao-eleito')
    expect(normalizeStatus('SUPLENTE')).toBe('nao-eleito')
    expect(normalizeStatus('2º TURNO')).toBe('segundo-turno')
    expect(normalizeStatus('SEGUNDO TURNO')).toBe('segundo-turno')
    expect(normalizeStatus('#NULO#')).toBe('pendente')
  })
  it('inclui deputado distrital no recorte de deputados estaduais', () => {
    expect(officeFromCode(1)).toBe('presidente')
    expect(officeFromCode(5)).toBe('senador')
    expect(officeFromCode(6)).toBe('deputado-federal')
    expect(officeFromCode(7)).toBe('deputado-estadual')
    expect(officeFromCode(8)).toBe('deputado-estadual')
    expect(officeFromCode('DEPUTADO DISTRITAL')).toBe('deputado-estadual')
    expect(officeFromCode(3)).toBeNull()
  })
  it('só calcula custo com votos positivos e despesas conhecidas', () => {
    expect(costPerVote({ votes: 200, expenses: 1000 })).toBe(5)
    expect(costPerVote({ votes: 200, expenses: 0 })).toBe(0)
    expect(costPerVote({ votes: 0, expenses: 1000 })).toBeNull()
    expect(costPerVote({ votes: null, expenses: 1000 })).toBeNull()
    expect(costPerVote({ votes: 200, expenses: null })).toBeNull()
  })
})

describe('importação e cruzamento de arquivos oficiais', () => {
  it('soma zonas diferentes, relaciona receitas e despesas por SQ e separa o FEFC', () => {
    const store = createImportStore()
    ingestCsv(store, '\uFEFF' + csv([
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100, DS_SIT_TOT_TURNO: 'ELEITO POR QP' }),
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 2, QT_VOTOS_NOMINAIS_VALIDOS: 150, DS_SIT_TOT_TURNO: 'ELEITO POR QP' }),
    ]), 'votacao_candidato_munzona_2026_SP.csv')
    ingestCsv(store, csv([
      candidate({ SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '1.000,50' }),
      candidate({ SQ_DESPESA: 'D2', VR_DESPESA_CONTRATADA: '499,50' }),
    ]), 'despesas_contratadas_candidatos_2026_SP.csv')
    ingestCsv(store, csv([
      candidate({ SQ_RECEITA: 'R1', VR_RECEITA: '1.200,00', DS_FONTE_RECEITA: 'Fundo Especial de Financiamento de Campanha' }),
      candidate({ SQ_RECEITA: 'R2', VR_RECEITA: '500,00', DS_FONTE_RECEITA: 'Fundo Partidário' }),
      candidate({ SQ_RECEITA: 'R3', VR_RECEITA: '300,00', DS_FONTE_RECEITA: 'Outros Recursos' }),
    ]), 'receitas_candidatos_2026_SP.csv')
    const [result] = selectImportedCandidates(store, query())
    expect(result).toMatchObject({ name: 'Candidata Áurea', votes: 250, expenses: 1500, revenue: 2000, electoralFund: 1200, status: 'eleito' })
    expect(costPerVote(result)).toBe(6)
  })
  it('mantém finanças desconhecidas quando só foram importados votos', () => {
    const store = createImportStore()
    ingestCsv(store, csv([candidate({ NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 0 })]))
    const [result] = selectImportedCandidates(store, query())
    expect(result).toMatchObject({ votes: 0, expenses: null, revenue: null, electoralFund: null })
  })
  it('não soma despesas pagas nem receitas de doador originário às tabelas principais', () => {
    const store = createImportStore()
    ingestCsv(store, csv([candidate({ SQ_DESPESA: 'D1', VR_DESPESA: '100,00' })]), 'despesas_contratadas_candidatos_2026_SP.csv')
    ingestCsv(store, csv([candidate({ SQ_DESPESA: 'D2', VR_DESPESA: '80,00' })]), 'despesas_pagas_candidatos_2026_SP.csv')
    ingestCsv(store, csv([candidate({ SQ_RECEITA: 'R1', VR_RECEITA: '100,00', DS_FONTE_RECEITA: 'FEFC' })]), 'receitas_candidatos_2026_SP.csv')
    ingestCsv(store, csv([candidate({ SQ_RECEITA: 'R2', VR_RECEITA: '100,00', DS_FONTE_RECEITA: 'FEFC' })]), 'receitas_candidatos_doador_originario_2026_SP.csv')
    expect(selectImportedCandidates(store, query())[0]).toMatchObject({ expenses: 100, revenue: 100, electoralFund: 100 })
  })
  it('mantém FEFC desconhecido quando o arquivo não identifica a fonte da receita', () => {
    const store = createImportStore()
    ingestCsv(store, csv([candidate({ SQ_RECEITA: 'R1', VR_RECEITA: '100,00' })]), 'receitas_candidatos.csv')
    expect(selectImportedCandidates(store, query())[0]).toMatchObject({ revenue: 100, electoralFund: null })
  })
  it('deduplica o mesmo arquivo e os mesmos lançamentos em exportações sobrepostas', () => {
    const store = createImportStore()
    const zone = candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100 })
    const text = csv([zone])
    expect(ingestCsv(store, text, 'votos.csv')).toBe(1)
    expect(ingestCsv(store, text, 'mesmo-arquivo-outro-nome.csv')).toBe(0)
    ingestCsv(store, csv([zone, candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 2, QT_VOTOS_NOMINAIS_VALIDOS: 150 })]), 'votos-complementares.csv')
    const expense = candidate({ SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '100,00' })
    ingestCsv(store, csv([expense]), 'contas.csv')
    ingestCsv(store, csv([{ ...expense, DT_GERACAO: '08/10/2026' }]), 'contas-nova-exportacao.csv')
    expect(selectImportedCandidates(store, query())[0]).toMatchObject({ votes: 250, expenses: 100 })
  })
  it('não adiciona votação agregada aos mesmos votos detalhados em zonas', () => {
    const store = createImportStore()
    ingestCsv(store, csv([
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100 }),
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 2, QT_VOTOS_NOMINAIS_VALIDOS: 150 }),
    ]), 'votos-zonas.csv')
    ingestCsv(store, csv([candidate({ NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 250 })]), 'votos-uf.csv')
    expect(selectImportedCandidates(store, query())[0].votes).toBe(250)
  })
  it('isola eleições, cargos e UFs mesmo que o identificador seja igual', () => {
    const store = createImportStore()
    ingestCsv(store, csv([
      candidate({ NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100 }),
      candidate({ ANO_ELEICAO: 2022, NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 999 }),
      candidate({ CD_CARGO: 5, NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 777 }),
      candidate({ SQ_CANDIDATO: '60000002', SG_UF: 'BA', NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 500 }),
    ]))
    expect(selectImportedCandidates(store, query({ state: 'SP' }))).toHaveLength(1)
    expect(selectImportedCandidates(store, query({ state: 'SP' }))[0].votes).toBe(100)
    expect(selectImportedCandidates(store, query({ year: 2022 }))[0].votes).toBe(999)
    expect(selectImportedCandidates(store, query({ office: 'senador' }))[0].votes).toBe(777)
    expect(selectImportedCandidates(store, query({ region: 'nordeste' }))[0].votes).toBe(500)
  })
  it('não soma turnos e não reutiliza uma situação do primeiro no segundo', () => {
    const store = createImportStore()
    const presidential = { CD_CARGO: 1, SG_UF: 'BR' }
    ingestCsv(store, csv([
      candidate({ ...presidential, NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 1000, DS_SIT_TOT_TURNO: '2º TURNO' }),
      candidate({ ...presidential, NR_TURNO: 2, QT_VOTOS_NOMINAIS_VALIDOS: 1800, DS_SIT_TOT_TURNO: 'ELEITO' }),
    ]))
    expect(selectImportedCandidates(store, query({ office: 'presidente' }))[0]).toMatchObject({ votes: 1000, status: 'segundo-turno' })
    expect(selectImportedCandidates(store, query({ office: 'presidente', round: 2 }))[0]).toMatchObject({ votes: 1800, status: 'eleito' })
    expect(selectImportedCandidates(store, query({ round: 2 }))).toEqual([])
  })
  it('preserva contas presidenciais nacionais e calcula estimativas dos recortes', () => {
    const store = createImportStore()
    const presidential = { CD_CARGO: 1 }
    ingestCsv(store, csv([
      candidate({ ...presidential, SG_UF: 'BR', NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 1000 }),
      candidate({ ...presidential, SG_UF: 'SP', NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 400 }),
      candidate({ ...presidential, SG_UF: 'RJ', NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 200 }),
      candidate({ ...presidential, SG_UF: 'MG', NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 0 }),
      candidate({ ...presidential, SG_UF: 'ES', NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 0 }),
    ]), 'votos-presidente.csv')
    ingestCsv(store, csv([candidate({ ...presidential, SG_UF: 'BR', SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '5.000,00' })]), 'despesas_contratadas.csv')
    ingestCsv(store, csv([candidate({ ...presidential, SG_UF: 'BR', SQ_RECEITA: 'R1', VR_RECEITA: '6.000,00', DS_FONTE_RECEITA: 'FEFC' })]), 'receitas.csv')
    expect(selectImportedCandidates(store, query({ office: 'presidente' }))[0]).toMatchObject({ votes: 1000, expenses: 5000, revenue: 6000, electoralFund: 6000 })
    expect(selectImportedCandidates(store, query({ office: 'presidente', state: 'SP' }))[0]).toMatchObject({ votes: 400, totalVotes: 1000, expenses: 5000, revenue: 6000, electoralFund: 6000, estimatedExpenses: 2000 })
    const regional = selectImportedCandidates(store, query({ office: 'presidente', region: 'sudeste' }))[0]
    expect(regional).toMatchObject({ votes: 600, totalVotes: 1000, expenses: 5000, estimatedExpenses: 3000 })
    expect(costPerVote(regional)).toBe(5)
  })
  it('rejeita formato desconhecido e CSV com aspas incompletas', () => {
    expect(() => ingestCsv(createImportStore(), 'nome;valor\nPessoa;100')).toThrow(/Formato não reconhecido/)
    expect(() => ingestCsv(createImportStore(), 'ANO_ELEICAO;CD_CARGO;SQ_CANDIDATO\n2026;6;"123')).toThrow(/aspas incompletas/)
  })
})

describe('recortes do Brasil', () => {
  it('inclui exatamente 27 UFs, em uma única região cada', () => {
    expect(ALL_STATES).toHaveLength(27)
    expect(new Set(ALL_STATES).size).toBe(27)
    expect(REGION_STATES.norte).toHaveLength(7)
    expect(REGION_STATES.nordeste).toHaveLength(9)
    expect(REGION_STATES['centro-oeste']).toHaveLength(4)
    expect(REGION_STATES.sudeste).toHaveLength(4)
    expect(REGION_STATES.sul).toHaveLength(3)
    expect(stateRegion('DF')).toBe('centro-oeste')
    expect(stateRegion('SP')).toBe('sudeste')
    expect(stateRegion('BR')).toBeNull()
  })
})


describe('adapters dos serviços públicos do TSE', () => {
  it('descobre a eleição por ano, turno e cargo sem assumir IDs fixos', () => {
    const config = { pl: [{ c: 'ele2026', e: [
      { cd: '6257', t: '1', sqele: '2026000001', abr: [{ cp: [{ cd: '6' }] }] },
      { cd: '6258', t: '2', sqele: '2026000002', abr: [{ cp: [{ cd: '1' }] }] },
    ] }] }
    expect(resolveElection(config, query())).toEqual({ cycle: 'ele2026', id: '6257', financeId: '2026000001' })
    expect(resolveElection(config, query({ year: 2022 }))).toBeNull()
    expect(resolveElection(config, query({ office: 'senador' }))).toBeNull()
    expect(resolveElection(config, query({ office: 'presidente', round: 2 }))?.id).toBe('6258')
  })
  it('normaliza resultado hierárquico com SQ e deixa finanças desconhecidas', () => {
    const payload = { carg: [{ agr: [{ par: [{ sg: 'EXEMPLO', cand: [
      { sqcand: '60000001', nmu: 'Candidata Áurea', n: '1234', vap: '520071', st: 'ELEITO POR QP' },
      { nmu: 'Votos sem identificação', vap: '123', st: 'ELEITO' },
    ] }] }] }] }
    expect(normalizeResultCandidates(payload, query(), 'SP', 'https://resultados.tse.jus.br/exemplo')).toEqual([
      expect.objectContaining({ id: '60000001', name: 'Candidata Áurea', party: 'EXEMPLO', state: 'SP',
        votes: 520071, expenses: null, revenue: null, electoralFund: null, status: 'eleito' }),
    ])
  })
  it('não interpreta um payload desconhecido de contas como valores zerados', () => {
    expect(normalizeFinance({ inesperado: 42 })).toEqual({ expenses: null, revenue: null, electoralFund: null, donations: null })
    expect(normalizeFinance({ totalDespesasContratadas: 0, totalReceitas: '0,00', totalFEFC: '0,00' }))
      .toEqual({ expenses: 0, revenue: 0, electoralFund: 0, donations: null })
  })
  it('usa somente campos explícitos de despesas contratadas e FEFC', () => {
    expect(normalizeFinance({ despesas: { totalDespesasContratadas: '1.500,20', totalDespesasPagas: '600,00' },
      receitas: { total: '2.000,00', fontes: [
        { descricao: 'Fundo Especial de Financiamento de Campanha', valor: '1.200,00' },
        { descricao: 'Fundo Partidário', valor: '800,00' },
      ] } })).toEqual({ expenses: 1500.2, revenue: 2000, electoralFund: 1200, donations: null })
  })
})



describe('arquivos ZIP do TSE', () => {
  it('descompacta CSV Latin-1 no worker e ignora tabelas auxiliares duplicadoras', async () => {
    const store = createImportStore()
    const archive = zipSync({
      'consulta_cand_2026_SP.csv': strToU8(csv([candidate({ NR_TURNO: 1, DS_SIT_TOT_TURNO: 'ELEITO POR MÉDIA' })]), true),
      'votacao_candidato_munzona_2026_SP.csv': strToU8(csv([candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100 })])),
      'despesas_contratadas_candidatos_2026_SP.csv': strToU8(csv([candidate({ SQ_DESPESA: 'D1', VR_DESPESA: '500,00' })])),
      'despesas_pagas_candidatos_2026_SP.csv': strToU8(csv([candidate({ SQ_DESPESA: 'D2', VR_DESPESA: '400,00' })])),
      'receitas_candidatos_2026_SP.csv': strToU8(csv([candidate({ SQ_RECEITA: 'R1', VR_RECEITA: '600,00', DS_FONTE_RECEITA: 'FEFC' })])),
      'receitas_candidatos_doador_originario_2026_SP.csv': strToU8(csv([candidate({ SQ_RECEITA: 'R2', VR_RECEITA: '600,00', DS_FONTE_RECEITA: 'FEFC' })])),
      'leiame.pdf': strToU8('Auxiliar não importado'),
    })
    const progress: string[] = []
    const count = await importElectionFilesInWorker(store, [new File([archive], 'arquivo-oficial.zip')], message => progress.push(message))
    expect(count).toBe(4)
    expect(store.files).toHaveLength(4)
    expect(progress.some(message => message.includes('Processando'))).toBe(true)
    expect(selectImportedCandidates(store, query())[0]).toMatchObject({
      name: 'Candidata Áurea', votes: 100, expenses: 500, revenue: 600, electoralFund: 600, status: 'eleito',
    })
  })
  it('não usa o número de documento de fornecedores distintos como identidade da despesa', () => {
    const store = createImportStore()
    ingestCsv(store, csv([
      candidate({ NR_DOCUMENTO: '123', NM_FORNECEDOR: 'Fornecedor A', VR_DESPESA_CONTRATADA: '100,00' }),
      candidate({ NR_DOCUMENTO: '123', NM_FORNECEDOR: 'Fornecedor B', VR_DESPESA_CONTRATADA: '200,00' }),
    ]), 'despesas_contratadas.csv')
    expect(selectImportedCandidates(store, query())[0].expenses).toBe(300)
  })
  it('não apresenta FEFC parcial como total quando um valor da fonte é desconhecido', () => {
    expect(normalizeFinance({ receitas: { fontes: [
      { descricao: 'FEFC', valor: '100,00' }, { descricao: 'Fundo Especial', valor: '#NULO#' },
    ] } }).electoralFund).toBeNull()
  })
})



describe('cobertura nacional de campanhas presidenciais', () => {
  it('não divide contas nacionais por uma UF importada isoladamente', () => {
    const store = createImportStore()
    const presidential = { CD_CARGO: 1 }
    ingestCsv(store, csv([candidate({ ...presidential, NR_TURNO: 1, SG_UF: 'SP', QT_VOTOS_NOMINAIS_VALIDOS: 100 })]), 'votos-SP.csv')
    ingestCsv(store, csv([candidate({ ...presidential, SG_UF: 'BR', SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '10.000,00' })]), 'despesas_contratadas.csv')
    const result = selectImportedCandidates(store, query({ office: 'presidente', state: 'SP' }))[0]
    expect(result.votes).toBe(100)
    expect(result.expenses).toBe(10000)
    expect(result.totalVotes).toBeNull()
    expect(result.estimatedExpenses).toBeNull()
    expect(costPerVote(result)).toBeNull()
  })
  it('permite comparação nacional com totais das 27 UFs e exterior', () => {
    const store = createImportStore()
    const presidential = { CD_CARGO: 1 }
    ingestCsv(store, csv([...ALL_STATES, 'ZZ'].map(state => candidate({
      ...presidential, NR_TURNO: 1, SG_UF: state, QT_VOTOS_NOMINAIS_VALIDOS: state === 'ZZ' ? 0 : 100,
    }))), 'totais-por-UF.csv')
    ingestCsv(store, csv([candidate({ ...presidential, SG_UF: 'BR', SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '27.000,00' })]), 'despesas_contratadas.csv')
    const result = selectImportedCandidates(store, query({ office: 'presidente' }))[0]
    expect(result).toMatchObject({ votes: 2700, expenses: 27000 })
    expect(costPerVote(result)).toBe(10)
  })
})


function metricCandidate(votes: number | null, expenses: number | null): Candidate {
  return { id: 'metric', name: 'Teste', number: '1', party: 'TESTE', state: 'SP', office: 'deputado-federal',
    status: 'pendente', votes, expenses, revenue: null, electoralFund: null }
}
describe('indicadores agregados e cobertura', () => {
  it('inclui despesas de candidatos com zero votos na razão do conjunto', () => {
    expect(summarize([metricCandidate(100, 100), metricCandidate(0, 900)]))
      .toMatchObject({ votes: 100, expenses: 1000, costPerVote: 10, votesPerReal: 0.1, count: 2, expenseCount: 2, voteCount: 2 })
  })
  it('exibe despesas conhecidas mas exclui pares incompletos da razão', () => {
    expect(summarize([metricCandidate(100, 200), metricCandidate(null, 800), metricCandidate(50, null)]))
      .toEqual({ votes: 150, expenses: 1000, campaignExpenses: 1000, estimated: false, costPerVote: 2, votesPerReal: 0.5, count: 1, expenseCount: 2, voteCount: 2 })
  })
  it('usa a razão entre totais em vez da média aritmética dos custos individuais', () => {
    const result = summarize([metricCandidate(100, 100), metricCandidate(900, 9000)])
    expect(result.costPerVote).toBe(9.1)
    expect(result.costPerVote).not.toBe(5.5)
  })
  it('não produz infinito para eficiência quando despesas conhecidas são zero', () => {
    expect(summarize([metricCandidate(100, 0)])).toMatchObject({ costPerVote: 0, votesPerReal: null, count: 1, expenseCount: 1 })
  })
  it('distingue uma razão sem votos de uma razão com zero gasto', () => {
    expect(summarize([metricCandidate(0, 100)])).toMatchObject({ costPerVote: null, votesPerReal: 0 })
    expect(summarize([])).toEqual({ costPerVote: null, votesPerReal: null, votes: 0, expenses: 0, campaignExpenses: 0, estimated: false, count: 0, expenseCount: 0, voteCount: 0 })
  })
})



describe('estrutura atual de contas TSE 2026', () => {
  it('relaciona AA_ELEICAO nas contas com ANO_ELEICAO nos votos', () => {
    const store = createImportStore()
    ingestCsv(store, csv([candidate({ NR_TURNO: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100 })]), 'votos.csv')
    ingestCsv(store, csv([{ AA_ELEICAO: 2026, CD_CARGO: 6, SQ_CANDIDATO: '60000001', SG_UF: 'SP',
      ST_TURNO: '1', SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '1.234,56' }]), 'despesas_contratadas_candidatos_2026_SP.csv')
    ingestCsv(store, csv([{ AA_ELEICAO: 2026, DS_CARGO: 'DEPUTADO FEDERAL', SQ_CANDIDATO: '60000001', SG_UF: 'SP',
      ST_TURNO: '1', SQ_RECEITA: 'R1', VR_RECEITA: '2.000,00', DS_FONTE_RECEITA: 'Fundo Especial de Financiamento de Campanha' }]), 'receitas_candidatos_2026_SP.csv')
    expect(selectImportedCandidates(store, query())[0]).toMatchObject({ votes: 100, expenses: 1234.56, revenue: 2000, electoralFund: 2000 })
  })
  it('permite votos presidenciais completos em município e zona com as 27 UFs e exterior', () => {
    const store = createImportStore()
    ingestCsv(store, csv([...ALL_STATES, 'ZZ'].map((state, index) => candidate({
      CD_CARGO: 1, NR_TURNO: 1, SG_UF: state, CD_MUNICIPIO: 10000 + index, NR_ZONA: 1,
      QT_VOTOS_NOMINAIS_VALIDOS: state === 'ZZ' ? 5 : 100,
    }))), 'votacao_candidato_munzona_2026.csv')
    ingestCsv(store, csv([candidate({ CD_CARGO: 1, SG_UF: 'BR', SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '27.050,00' })]), 'despesas_contratadas.csv')
    const result = selectImportedCandidates(store, query({ office: 'presidente' }))[0]
    expect(result).toMatchObject({ votes: 2705, expenses: 27050 })
    expect(costPerVote(result)).toBe(10)
  })
})


describe('despesas da campanha e estimativas geográficas', () => {
  it('preserva o custo de campanha ao reduzir o recorte de votos', () => {
    const scoped = { ...metricCandidate(200, 5000), totalVotes: 1000 }
    expect(campaignVotes(scoped)).toBe(1000)
    expect(campaignRate(scoped)).toBe(5)
    expect(costPerVote(scoped)).toBe(5)
    expect(areaEstimate(scoped)).toBe(1000)
    expect(scoped.expenses).toBe(5000)
  })
  it('não usa votos locais como denominador quando o total da campanha é desconhecido', () => {
    const scoped = { ...metricCandidate(200, 5000), totalVotes: null }
    expect(campaignVotes(scoped)).toBeNull()
    expect(campaignRate(scoped)).toBeNull()
    expect(areaEstimate(scoped)).toBeNull()
    expect(summarize([scoped])).toMatchObject({ votes: 200, expenses: 0, campaignExpenses: 5000, expenseCount: 0, count: 0, costPerVote: null })
  })
  it('respeita uma estimativa explicitamente indisponível ou zero', () => {
    expect(areaEstimate({ ...metricCandidate(100, 1000), totalVotes: 1000, estimatedExpenses: null })).toBeNull()
    expect(areaEstimate({ ...metricCandidate(100, 1000), totalVotes: 1000, estimatedExpenses: 0 })).toBe(0)
  })
  it('conserva a despesa da campanha ao alocar todos os votos em áreas disjuntas', () => {
    const estimates = [100, 400, 500].map(votes => areaEstimate({ ...metricCandidate(votes, 10000), totalVotes: 1000 }))
    expect(estimates).toEqual([1000, 4000, 5000])
    expect(estimates.reduce((sum, amount) => sum + (amount ?? 0), 0)).toBe(10000)
  })
  it('não calcula uma alocação para votos superiores ao total nem votos negativos', () => {
    expect(areaEstimate({ ...metricCandidate(1001, 10000), totalVotes: 1000 })).toBeNull()
    expect(areaEstimate({ ...metricCandidate(-1, 10000), totalVotes: 1000 })).toBeNull()
  })
  it('agrega estimativas locais separadamente das despesas totais de campanha', () => {
    const result = summarize([
      { ...metricCandidate(200, 5000), totalVotes: 1000 },
      { ...metricCandidate(100, 10000), totalVotes: 1000 },
    ])
    expect(result).toMatchObject({ votes: 300, expenses: 2000, campaignExpenses: 15000, estimated: true, count: 2 })
    expect(result.costPerVote).toBeCloseTo(2000 / 300)
  })
  it('filtra município e zona TSE mantendo a base de votos da UF', () => {
    const store = createImportStore()
    ingestCsv(store, csv([
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 1, QT_VOTOS_NOMINAIS_VALIDOS: 100 }),
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 71072, NR_ZONA: 2, QT_VOTOS_NOMINAIS_VALIDOS: 200 }),
      candidate({ NR_TURNO: 1, CD_MUNICIPIO: 61597, NR_ZONA: 1, QT_VOTOS_NOMINAIS_VALIDOS: 700 }),
    ]), 'votacao_candidato_munzona.csv')
    ingestCsv(store, csv([candidate({ SQ_DESPESA: 'D1', VR_DESPESA_CONTRATADA: '10.000,00' })]), 'despesas_contratadas.csv')
    const municipal = selectImportedCandidates(store, query({ state: 'SP', municipality: '3550308', municipalityCode: '71072' }))[0]
    expect(municipal).toMatchObject({ votes: 300, totalVotes: 1000, expenses: 10000, estimatedExpenses: 3000 })
    expect(costPerVote(municipal)).toBe(10)
    const zone = selectImportedCandidates(store, query({ state: 'SP', municipality: '3550308', municipalityCode: '71072', zone: 2 }))[0]
    expect(zone).toMatchObject({ votes: 200, totalVotes: 1000, expenses: 10000, estimatedExpenses: 2000 })
    const unmapped = selectImportedCandidates(store, query({ state: 'SP', municipality: '3550308' }))[0]
    expect(unmapped.votes).toBeNull()
  })
  it('separa doações privadas de FEFC, fundo partidário e recursos próprios', () => {
    const store = createImportStore()
    ingestCsv(store, csv([
      candidate({ SQ_RECEITA: 'R1', VR_RECEITA: '1000,00', DS_FONTE_RECEITA: 'FEFC', DS_ORIGEM_RECEITA: 'Partidos políticos' }),
      candidate({ SQ_RECEITA: 'R2', VR_RECEITA: '1000,00', DS_FONTE_RECEITA: 'Fundo Partidário', DS_ORIGEM_RECEITA: 'Partidos políticos' }),
      candidate({ SQ_RECEITA: 'R3', VR_RECEITA: '200,00', DS_FONTE_RECEITA: 'Outros Recursos', DS_ORIGEM_RECEITA: 'Pessoas físicas' }),
      candidate({ SQ_RECEITA: 'R4', VR_RECEITA: '50,00', DS_FONTE_RECEITA: 'Outros Recursos', DS_ORIGEM_RECEITA: 'Financiamento coletivo' }),
      candidate({ SQ_RECEITA: 'R5', VR_RECEITA: '100,00', DS_FONTE_RECEITA: 'Outros Recursos', DS_ORIGEM_RECEITA: 'Recursos próprios' }),
    ]), 'receitas_candidatos.csv')
    expect(selectImportedCandidates(store, query())[0]).toMatchObject({ revenue: 2350, electoralFund: 1000, donations: 250 })
  })
})
