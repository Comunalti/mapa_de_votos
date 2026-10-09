export type RegionId = 'norte' | 'nordeste' | 'centro-oeste' | 'sudeste' | 'sul';
export type Office = 'presidente' | 'senador' | 'deputado-federal' | 'deputado-estadual';
export interface Candidate {
  id: string;
  name: string;
  number: string;
  party: string;
  state: string;
  office: Office;
  votes: number | null;
  expenses: number | null;
  revenue: number | null;
  electoralFund: number | null;
  /** Votes in the complete campaign constituency, used as the denominator for geographic estimates. */
  totalVotes?: number | null;
  donations?: number | null;
  paidExpenses?: number | null;
  partyFund?: number | null;
  electoralFundParty?: number | null;
  partyFundParty?: number | null;
  receivedPoliticians?: number | null;
  outgoingTransfers?: number | null;
  paidOutgoingTransfers?: number | null;
  reelection?: boolean | null;
  /** An explicitly estimated geographic allocation, never a reported local expense. */
  estimatedExpenses?: number | null;
  votesByState?: Record<string, number | null>;
  voteCoverage?: 'complete' | 'partial' | 'unknown';
  financeSource?: string;
  financeUpdatedAt?: string;
  financeSnapshot?: boolean;
  status: 'eleito' | 'nao-eleito' | 'segundo-turno' | 'pendente';
  photoUrl?: string;
  sourceUrl?: string;
  /** Financial totals cover the campaign, even when votes are scoped geographically. */
  financeScope?: 'national' | 'state';
  year?: number;
  round?: 1 | 2;
}
export interface ElectionQuery {
  year: number;
  round: 1 | 2;
  office: Office;
  region: RegionId | null;
  state: string | null;
  municipality?: string | null;
  municipalityCode?: string | null;
  zone?: number | null;
}
export type DataSource = 'tse' | 'import' | 'demo';
export interface ElectionDataResult {
  candidates: Candidate[];
  updatedAt: string | null;
  warning: string | null;
}

export interface Municipality {
  id: string;
  name: string;
  state: string;
  tseCode: string | null;
  center?: [number, number];
}
export interface ElectoralZone {
  number: number;
  municipalityId: string;
  municipalityName?: string;
  locations?: Array<{ latitude: number; longitude: number; name?: string }>;
}