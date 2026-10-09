import type { Candidate } from '../types';
import { parseNumber } from './normalize';

export interface FinanceSnapshot {
  schemaVersion: number;
  year: number;
  generatedAt: string;
  sourceUrl: string;
  sourcePage: string;
  sourceLastModified: string | null;
  extractionTimes: string[];
  counts: { candidates: number; expenses: number; revenue: number };
  candidates: Array<{ id: string; expenses: number | null; revenue: number | null; electoralFund: number | null; donations: number | null; paidExpenses?:number|null;partyFund?:number|null;electoralFundParty?:number|null;partyFundParty?:number|null;receivedPoliticians?:number|null;outgoingTransfers?:number|null;paidOutgoingTransfers?:number|null }>;
}
const snapshots = new Map<number, FinanceSnapshot>();
export function clearFinanceSnapshotCache() { snapshots.clear(); }

/** Same-origin compact summaries of actual official TSE declarations, rebuilt with scripts/sync-tse-finance.mjs. */
export async function loadOfficialFinanceSnapshot(year: number, signal: AbortSignal): Promise<FinanceSnapshot | null> {
  if (snapshots.has(year)) return snapshots.get(year)!;
  const response = await fetch(`${import.meta.env.BASE_URL}data/finance-${year}.json`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Não foi possível carregar os totais oficiais de financiamento (HTTP ${response.status}).`);
  const snapshot = await response.json() as FinanceSnapshot;
  if (snapshot.schemaVersion !== 1 || snapshot.year !== year || !Array.isArray(snapshot.candidates)) throw new Error('O arquivo de financiamento oficial tem formato incompatível.');
  snapshots.set(year, snapshot);
  return snapshot;
}
export function applyFinanceSnapshot(candidates: Candidate[], snapshot: FinanceSnapshot, preserveExisting = false): void {
  const totals = new Map(snapshot.candidates.map(candidate => [candidate.id, candidate]));
  for (const candidate of candidates) {
    const finance = totals.get(candidate.id);
    if (!finance) continue;
    if (preserveExisting && (candidate.expenses !== null || candidate.revenue !== null)) continue;
    candidate.expenses = parseNumber(finance.expenses);
    candidate.revenue = parseNumber(finance.revenue);
    candidate.electoralFund = parseNumber(finance.electoralFund);
    candidate.donations = parseNumber(finance.donations);
    for (const field of ['paidExpenses','partyFund','electoralFundParty','partyFundParty','receivedPoliticians','outgoingTransfers','paidOutgoingTransfers'] as const) candidate[field]=parseNumber(finance[field]);
    candidate.financeSource = snapshot.sourcePage;
    candidate.financeUpdatedAt = snapshot.sourceLastModified ?? snapshot.generatedAt;
    candidate.financeSnapshot = true;
  }
}
