import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyFinanceSnapshot, type FinanceSnapshot } from '../src/data/finance';
import { applyGeographicEstimate, costPerVote, estimateExpenses } from '../src/data/normalize';
import type { Candidate } from '../src/types';

const snapshot = JSON.parse(readFileSync(new URL('../public/data/finance-2026.json', import.meta.url), 'utf8')) as FinanceSnapshot & { sourceSha256: string; tables: Array<{ name: string; acceptedRows: number; duplicateTransactions: number }> };
function candidate(): Candidate {
  return { id: snapshot.candidates.find(item => item.expenses !== null && item.expenses > 0)!.id, name: 'Teste', number: '1', party: 'TESTE', state: 'SP', office: 'deputado-federal', status: 'pendente',
    votes: 100, totalVotes: 1000, expenses: null, revenue: null, electoralFund: null };
}
describe('financiamento oficial compacto pronto para navegador', () => {
  it('tem proveniência verificável e cobertura consistente com a extração oficial', () => {
    expect(snapshot.year).toBe(2026);
    expect(snapshot.sourceUrl).toBe('https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2026.zip');
    expect(snapshot.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.extractionTimes.length).toBeGreaterThan(0);
    expect(snapshot.candidates.length).toBeGreaterThan(10000);
    expect(snapshot.counts.candidates).toBe(snapshot.candidates.length);
    expect(new Set(snapshot.candidates.map(item => item.id)).size).toBe(snapshot.candidates.length);
    expect(snapshot.counts.expenses).toBe(snapshot.candidates.filter(item => item.expenses !== null).length);
    expect(snapshot.tables.every(table => !/BRASIL|doador_originario/.test(table.name))).toBe(true);
    expect(snapshot.tables.reduce((total, table) => total + table.duplicateTransactions, 0)).toBe(0);
  });
  it('mantém fundos públicos e doações privadas separados das receitas totais', () => {
    for (const item of snapshot.candidates) {
      if (item.revenue !== null && item.electoralFund !== null && item.donations !== null) {
        expect(item.electoralFund).toBeGreaterThanOrEqual(0);
        expect(item.donations).toBeGreaterThanOrEqual(0);
        expect(item.electoralFund + item.donations).toBeLessThanOrEqual(item.revenue + 0.02);
      }
    }
  });
  it('relaciona SQ_CANDIDATO sem alterar os votos locais ou totais da campanha', () => {
    const item = candidate();
    const priorVotes = item.votes;
    applyFinanceSnapshot([item], snapshot);
    expect(item.votes).toBe(priorVotes);
    expect(item.totalVotes).toBe(1000);
    expect(item.expenses).toBe(snapshot.candidates.find(finance => finance.id === item.id)!.expenses);
    expect(item.financeSource).toBe(snapshot.sourcePage);
    expect(item.financeSnapshot).toBe(true);
  });
  it('preserva uma prestação de contas importada explicitamente pelo usuário', () => {
    const item = { ...candidate(), expenses: 999, revenue: 1500 };
    applyFinanceSnapshot([item], snapshot, true);
    expect(item.expenses).toBe(999);
    expect(item.revenue).toBe(1500);
  });
  it('mantém candidaturas sem declaração identificada como desconhecidas', () => {
    const item = { ...candidate(), id: 'not-in-official-source' };
    applyFinanceSnapshot([item], snapshot);
    expect(item.expenses).toBeNull();
    expect(item.electoralFund).toBeNull();
  });
});
describe('estimativa territorial transparente', () => {
  it('rateia o gasto por votos locais e mantém o custo por voto comparável', () => {
    const item = { ...candidate(), expenses: 10000 };
    const scoped = applyGeographicEstimate(item);
    expect(scoped.expenses).toBe(10000);
    expect(scoped.estimatedExpenses).toBe(1000);
    expect(costPerVote(scoped)).toBe(10);
  });
  it('não estima quando faltam votos totais nem quando a área excede o total', () => {
    expect(estimateExpenses(10000, 100, null)).toBeNull();
    expect(estimateExpenses(10000, 101, 100)).toBeNull();
    expect(estimateExpenses(10000, 0, 100)).toBe(0);
    expect(estimateExpenses(10000, 0, 0)).toBeNull();
  });
});
