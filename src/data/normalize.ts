import type { Candidate, Office } from '../types';

export function normalizedText(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

/** TSE sentinel values and missing fields stay unknown; zero is a real value. */
export function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value ?? '').trim();
  if (!text || /^#|^(NULL|N\/A|NAN)$/i.test(text)) return null;
  const clean = text.replace(/R\$|\s/g, '');
  if (!clean) return null;
  const number = Number(clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function officeFromCode(code: unknown): Office | null {
  const value = normalizedText(code);
  if (value === '1' || value === 'PRESIDENTE') return 'presidente';
  if (value === '5' || value === 'SENADOR') return 'senador';
  if (value === '6' || value === 'DEPUTADO FEDERAL') return 'deputado-federal';
  if (value === '7' || value === '8' || value === 'DEPUTADO ESTADUAL' || value === 'DEPUTADO DISTRITAL') return 'deputado-estadual';
  return null;
}

export function normalizeStatus(value: unknown): Candidate['status'] {
  const status = normalizedText(value);
  if (status.includes('2') && status.includes('TURNO') || status.includes('SEGUNDO TURNO')) return 'segundo-turno';
  if (status.includes('NAO ELEITO') || status.includes('SUPLENTE')) return 'nao-eleito';
  if (status === 'ELEITO' || status.startsWith('ELEITO POR')) return 'eleito';
  return 'pendente';
}

/** Full-campaign expense / full-constituency votes remains comparable at every geographic level. */
export function costPerVote(candidate: Pick<Candidate, 'votes' | 'expenses'> & Pick<Partial<Candidate>, 'estimatedExpenses' | 'totalVotes'>): number | null {
  const totalVotes = candidate.totalVotes === undefined ? candidate.votes : candidate.totalVotes;
  return candidate.expenses !== null && totalVotes !== null && totalVotes !== undefined && totalVotes > 0
    ? candidate.expenses / totalVotes : null;
}
export function estimateExpenses(expenses: number | null, areaVotes: number | null, totalVotes: number | null): number | null {
  if (expenses === null || areaVotes === null || totalVotes === null || totalVotes <= 0 || areaVotes > totalVotes) return null;
  return expenses * areaVotes / totalVotes;
}
export function applyGeographicEstimate(candidate: Candidate): Candidate {
  return { ...candidate, estimatedExpenses: estimateExpenses(candidate.expenses, candidate.votes, candidate.totalVotes ?? null) };
}