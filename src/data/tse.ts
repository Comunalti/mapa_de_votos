import { enrichProfiles, clearCandidateDetailsCache } from './candidateDetails';
import type { Candidate, ElectionDataResult, ElectionQuery } from '../types';
import { ALL_STATES, REGION_STATES } from './regions';
import { applyGeographicEstimate, normalizeStatus, normalizedText, parseNumber } from './normalize';
import { applyFinanceSnapshot, clearFinanceSnapshotCache, loadOfficialFinanceSnapshot } from './finance';
import { createImportStore, importElectionFiles, selectImportedCandidates } from './importer';

export const TSE_URLS = {
  results: 'https://resultados.tse.jus.br',
  candidacies: 'https://divulgacandcontas.tse.jus.br/divulga/rest/v1',
  portal: 'https://dadosabertos.tse.jus.br',
};
const CACHE_MS = 5 * 60 * 1000;
const jsonCache = new Map<string, { value: unknown; expires: number }>();
const candidacyArchives = new Map<number, ReturnType<typeof createImportStore>>();
class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(status: number, url: string) { super(`TSE respondeu HTTP ${status}.`); this.status = status; this.url = url; }
}
function aborted(signal: AbortSignal) { if (signal.aborted) throw new DOMException('Consulta cancelada', 'AbortError'); }
async function request(url: string, signal: AbortSignal, kind: 'json' | 'blob' = 'json'): Promise<unknown> {
  aborted(signal);
  const cached = jsonCache.get(url);
  if (kind === 'json' && cached && cached.expires > Date.now()) return cached.value;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 18000);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', mode: 'cors', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new HttpError(response.status, url);
      const data: unknown = kind === 'json' ? await response.json() : await response.blob();
      if (kind === 'json') jsonCache.set(url, { value: data, expires: Date.now() + CACHE_MS });
      return data;
    } catch (error) {
      aborted(signal);
      // A browser CORS/network block cannot be fixed by repeated requests. Retry only transient HTTP errors.
      if (attempt === 0 && error instanceof HttpError && [429, 500, 502, 503, 504].includes(error.status)) {
        await new Promise<void>(resolve => setTimeout(resolve, 750));
        continue;
      }
      throw error;
    } finally { clearTimeout(timeout); signal.removeEventListener('abort', abort); }
  }
  throw new Error('Falha ao consultar o TSE.');
}
type Json = Record<string, unknown>;
function record(value: unknown): Json { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
function array(value: unknown): Json[] { return Array.isArray(value) ? value.map(record) : []; }
function path(value: unknown, keys: string[]): unknown {
  let current: unknown = value;
  for (const key of keys) current = record(current)[key];
  return current;
}
function firstNumber(value: unknown, paths: string[][]): number | null {
  for (const keys of paths) { const parsed = parseNumber(path(value, keys)); if (parsed !== null) return parsed; }
  return null;
}
const officeCode = { presidente: 1, senador: 5, 'deputado-federal': 6, 'deputado-estadual': 7 } as const;
export interface ResolvedElection { cycle: string; id: string; financeId: string | null; }
/** Discover IDs from the same official configuration consumed by the TSE web application. */
export function resolveElection(config: unknown, query: ElectionQuery, code = officeCode[query.office]): ResolvedElection | null {
  const root = record(config);
  for (const pleito of array(root.pl)) {
    const cycle = String(pleito.c ?? root.c ?? '');
    if (cycle !== `ele${query.year}`) continue;
    for (const election of array(pleito.e)) {
      if (normalizedText(election.nm).includes('SUPLEMENTAR')) continue;
      if (String(election.t) !== String(query.round)) continue;
      const hasOffice = array(election.abr).some(scope => array(scope.cp).some(office => Number(office.cd) === code));
      if (hasOffice && /^\d+$/.test(String(election.cd))) {
        return { cycle, id: String(election.cd), financeId: /^\d+$/.test(String(election.sqele)) ? String(election.sqele) : null };
      }
    }
  }
  return null;
}
export function normalizeResultCandidates(payload: unknown, query: ElectionQuery, state: string, sourceUrl: string): Candidate[] {
  const root = record(payload);
  const rows: Array<{ candidate: Json; party: string }> = [];
  for (const cargo of array(root.carg)) for (const group of array(cargo.agr)) for (const party of array(group.par)) {
    for (const candidate of array(party.cand)) rows.push({ candidate, party: String(party.sg ?? '') });
  }
  // Older result files used a flat cand array and the -v.json suffix.
  for (const candidate of array(root.cand)) rows.push({ candidate, party: String(candidate.cc ?? '') });
  return rows.filter(row => /^\d+$/.test(String(row.candidate.sqcand))).map(({ candidate, party }) => ({
    id: String(candidate.sqcand), name: String(candidate.nmu ?? candidate.nm ?? ''), number: String(candidate.n ?? ''),
    party, state: query.office === 'presidente' ? 'BR' : state, office: query.office, year: query.year, round: query.round,
    votes: parseNumber(candidate.vap), expenses: null, revenue: null, electoralFund: null,
    status: normalizeStatus(candidate.st), financeScope: query.office === 'presidente' ? 'national' : 'state', sourceUrl,
  }));
}
/** Explicit TSE finance totals; funds and private donations are independent classifications. */
export function normalizeFinance(payload: unknown): Pick<Candidate, 'expenses' | 'revenue' | 'electoralFund' | 'donations'> {
  const expenses = firstNumber(payload, [['totalDespesasContratadas'], ['despesas', 'totalDespesasContratadas'], ['despesas', 'totalContratadas'], ['despesas', 'valorTotalDespesaContratada'], ['dadosConsolidados', 'totalDespesasContratadas']]);
  const revenue = firstNumber(payload, [['totalReceitas'], ['receitas', 'totalReceitas'], ['receitas', 'total'], ['receitas', 'valorTotalReceita'], ['dadosConsolidados', 'totalReceitas']]);
  let electoralFund = firstNumber(payload, [['totalFEFC'], ['totalFundoEspecial'], ['receitas', 'totalFEFC'], ['receitas', 'recursosFundoEspecial']]);
  const graph = record(record(payload).receitas);
  const fefcFinance = parseNumber(graph.graphVrReceitaFinFefc);
  const fefcEstimated = parseNumber(graph.graphVrReceitaEstFefc);
  if (electoralFund === null && fefcFinance !== null && fefcEstimated !== null) electoralFund = fefcFinance + fefcEstimated;
  const sources = [...array(record(payload).resumoReceitas), ...array(graph.fontes)];
  if (electoralFund === null) {
    const fefc = sources.filter(source => /FEFC|FUNDO ESPECIAL|FUNDO ELEITORAL/.test(normalizedText(source.descricao ?? source.nome ?? source.fonte)));
    const amounts = fefc.map(source => parseNumber(source.valor ?? source.total)).filter((amount): amount is number => amount !== null);
    if (amounts.length === fefc.length && amounts.length) electoralFund = amounts.reduce((total, amount) => total + amount, 0);
  }
  let donations = firstNumber(payload, [['receitas', 'totalDoacoesPessoasFisicas'], ['totalDoacoesPessoasFisicas']]);
  const privateSources = sources.filter(source => /PESSOAS? FISICAS?|FINANCIAMENTO COLETIVO/.test(normalizedText(source.descricao ?? source.nome ?? source.fonte)));
  if (donations === null && privateSources.length) {
    const amounts = privateSources.map(source => parseNumber(source.valor ?? source.total));
    if (amounts.every((amount): amount is number => amount !== null)) donations = amounts.reduce((total, amount) => total + amount, 0);
  }
  return { expenses, revenue, electoralFund, donations };
}async function mapConcurrent<T, R>(items: T[], worker: (item: T) => Promise<R>, concurrency: number, signal: AbortSignal): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      aborted(signal);
      const index = next++;
      try { results[index] = { status: 'fulfilled', value: await worker(items[index]) }; }
      catch (reason) { aborted(signal); results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
export function officialDownloadLinks(year: number) {
  const cdn = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
  return {
    candidates: `${cdn}/consulta_cand/consulta_cand_${year}.zip`,
    votes: `${cdn}/votacao_candidato_munzona/votacao_candidato_munzona_${year}.zip`,
    accounts: `${cdn}/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_${year}.zip`,
    candidatePage: `${TSE_URLS.portal}/dataset/candidatos-${year}`,
    resultsPage: `${TSE_URLS.portal}/dataset/resultados-${year}`,
    accountsPage: `${TSE_URLS.portal}/dataset/prestacao-de-contas-eleitorais-${year}`,
  };
}
export function clearElectionCache() { jsonCache.clear(); candidacyArchives.clear(); clearFinanceSnapshotCache(); clearCandidateDetailsCache(); }
function completedResult(payload: unknown): boolean {
  const root = record(payload);
  return normalizedText(root.tf) === 'S' || parseNumber(root.psct) === 100;
}
function mergeScopedVotes(base: Candidate[], scoped: Candidate[], complete: boolean): Candidate[] {
  const byId = new Map(scoped.map(candidate => [candidate.id, candidate]));
  return base.map(candidate => {
    const area = byId.get(candidate.id);
    return { ...candidate, totalVotes: candidate.votes, votes: area?.votes ?? (complete ? 0 : null), voteCoverage: complete ? 'complete' : 'partial' };
  });
}
async function attachFinancing(candidates: Candidate[], query: ElectionQuery, election: ResolvedElection | null, signal: AbortSignal, onProgress: (message: string) => void): Promise<string | null> {
  onProgress('Carregando totais oficiais de financiamento…');
  try {
    const snapshot = await loadOfficialFinanceSnapshot(query.year, signal);
    if (snapshot) {
      applyFinanceSnapshot(candidates, snapshot);
      const unknown = candidates.filter(candidate => candidate.expenses === null).length;
      return unknown ? `${unknown} candidaturas não têm despesas disponíveis na extração oficial. Os totais financeiros representam a campanha inteira.` : null;
    }
  } catch { aborted(signal); }
  if (!election?.financeId || !candidates.length) return 'A extração de financiamento não está disponível para esta eleição. Importe a prestação de contas oficial para completar os valores.';
  const financeUrl = (candidate: Candidate) => `${TSE_URLS.candidacies}/prestador/consulta/${query.year}/${election.financeId}/${candidate.id}`;
  try {
    const finances = normalizeFinance(await request(financeUrl(candidates[0]), signal));
    Object.assign(candidates[0], finances, { financeSource: financeUrl(candidates[0]), financeUpdatedAt: new Date().toISOString(), financeSnapshot: false });
    let done = 1;
    const results = await mapConcurrent(candidates.slice(1), async candidate => {
      Object.assign(candidate, normalizeFinance(await request(financeUrl(candidate), signal)), { financeSource: financeUrl(candidate), financeUpdatedAt: new Date().toISOString(), financeSnapshot: false });
      onProgress(`Contas: ${++done} de ${candidates.length} candidaturas…`);
    }, 4, signal);
    return results.some(result => result.status === 'rejected') || candidates.some(candidate => candidate.expenses === null) ? 'Algumas prestações de contas ainda não estão disponíveis. Importe o arquivo oficial para completar a cobertura.' : null;
  } catch { aborted(signal); return 'Não foi possível consultar as contas desta eleição. Importe o CSV/ZIP oficial de prestação de contas.'; }
}

export async function loadElection(query: ElectionQuery, signal: AbortSignal, onProgress: (message: string) => void): Promise<ElectionDataResult> {
  if (query.round === 2 && query.office !== 'presidente') return { candidates: [], updatedAt: null, warning: 'Este cargo é definido no 1º turno. Selecione o 1º turno para ver seus resultados.' };
  if (query.municipality && !query.municipalityCode) throw new Error('O município selecionado ainda não tem código eleitoral do TSE. Aguarde a identificação oficial do município.');
  if ((query.municipalityCode || query.zone) && !query.state) throw new Error('Selecione o estado antes do município ou da zona eleitoral.');
  onProgress('Localizando a eleição no TSE…');
  let election: ResolvedElection | null = null;
  let configError: unknown = null;
  try { election = resolveElection(await request(`${TSE_URLS.results}/oficial/comum/config/ele-c.json`, signal), query); }
  catch (error) { aborted(signal); configError = error; }
  if (!election) {
    try {
      onProgress('Consultando o arquivo oficial de candidaturas…');
      let store = candidacyArchives.get(query.year);
      if (!store) {
        const blob = await request(officialDownloadLinks(query.year).candidates, signal, 'blob') as Blob;
        aborted(signal); store = createImportStore();
        await importElectionFiles(store, [new File([blob], `consulta_cand_${query.year}.zip`)], onProgress, signal);
        candidacyArchives.set(query.year, store);
      }
      aborted(signal);
      const candidates = selectImportedCandidates(store, query);
      if (candidates.length) {
        const financialWarning = await attachFinancing(candidates, query, null, signal, onProgress);
        return { candidates: candidates.map(applyGeographicEstimate), updatedAt: new Date().toISOString(), warning: ['Candidaturas oficiais carregadas. Resultados indisponíveis nesta conexão; importe a votação nominal para completar os votos.', financialWarning].filter(Boolean).join(' ') };
      }
    } catch { aborted(signal); }
    throw new Error(configError ? 'O navegador não conseguiu acessar os resultados do TSE. Importe os arquivos oficiais CSV/ZIP para continuar.' : `Os resultados de ${query.year}, ${query.round}º turno não estão publicados nesta conexão. Importe os arquivos oficiais para consultar o histórico.`);
  }
  const resolved = election;
  let done = 0;
  async function resultFor(state: string, scoped: boolean): Promise<{ candidates: Candidate[]; complete: boolean }> {
    const code = query.office === 'deputado-estadual' && state === 'DF' ? 8 : officeCode[query.office];
    const uf = state.toLowerCase();
    const municipality = scoped && query.municipalityCode ? query.municipalityCode.padStart(5, '0') : '';
    const zone = scoped && query.zone ? `-z${String(query.zone).padStart(4, '0')}` : '';
    const base = `${TSE_URLS.results}/oficial/${resolved.cycle}/${resolved.id}/dados/${uf}/${uf}${municipality}${zone}-c${String(code).padStart(4, '0')}-e${resolved.id.padStart(6, '0')}`;
    let payload: unknown;
    try { payload = await request(`${base}-u.json`, signal); }
    catch (error) { if (!(error instanceof HttpError && error.status === 404)) throw error; payload = await request(`${base}-v.json`, signal); }
    done++; onProgress(`Resultados: ${done} circunscrições consultadas…`);
    return { candidates: normalizeResultCandidates(payload, query, state, `${base}-u.json`), complete: completedResult(payload) };
  }
  const warnings: string[] = [];
  let candidates: Candidate[] = [];
  const selectedStates = query.state ? [query.state] : query.region ? REGION_STATES[query.region] : ALL_STATES;
  if (query.office === 'presidente') {
    // Country-wide campaign totals and election status always come from BR, never from a local ranking.
    const national = await resultFor('BR', false);
    candidates = national.candidates.map(candidate => ({ ...candidate, totalVotes: candidate.votes, voteCoverage: national.complete ? 'complete' : 'partial' }));
    const loads = await mapConcurrent(selectedStates, state => resultFor(state, Boolean(query.municipalityCode || query.zone)), 4, signal);
    const countryOverview = !query.state && !query.region && !query.municipalityCode && !query.zone;
    for (const candidate of candidates) {
      const byState: Record<string, number | null> = {};
      let areaTotal = 0;
      let areaKnown = true;
      for (let index = 0; index < selectedStates.length; index++) {
        const result = loads[index];
        if (result.status === 'rejected') { byState[selectedStates[index]] = null; areaKnown = false; continue; }
        const local = result.value.candidates.find(item => item.id === candidate.id);
        const votes = local?.votes ?? (result.value.complete ? 0 : null);
        byState[selectedStates[index]] = votes;
        if (votes === null) areaKnown = false; else areaTotal += votes;
      }
      candidate.votesByState = byState;
      if (!countryOverview) candidate.votes = areaKnown ? areaTotal : null;
      if (!areaKnown) candidate.voteCoverage = 'partial';
    }
    if (loads.some(result => result.status === 'rejected')) warnings.push('Algumas circunscrições não responderam. Recortes incompletos ficam sem estimativa financeira.');
  } else {
    const loads = await mapConcurrent(selectedStates, async state => {
      const base = await resultFor(state, false);
      if (query.municipalityCode || query.zone) {
        const area = await resultFor(state, true);
        return mergeScopedVotes(base.candidates, area.candidates, area.complete);
      }
      return base.candidates.map(candidate => ({ ...candidate, totalVotes: candidate.votes, voteCoverage: base.complete ? 'complete' as const : 'partial' as const }));
    }, 4, signal);
    const successful = loads.filter((result): result is PromiseFulfilledResult<Candidate[]> => result.status === 'fulfilled');
    if (!successful.length) throw new Error('Os resultados do TSE estão indisponíveis para esta seleção. Tente novamente ou importe a votação nominal oficial.');
    candidates = successful.flatMap(result => result.value);
    if (successful.length < selectedStates.length) warnings.push(`Cobertura parcial: ${successful.length} de ${selectedStates.length} UFs responderam.`);
  }
  onProgress('Carregando cadastro público das candidaturas…');
  await enrichProfiles(candidates, query.year, signal);
  const financeWarning = await attachFinancing(candidates, query, election, signal, onProgress);
  if (financeWarning) warnings.push(financeWarning);
  return { candidates: candidates.map(applyGeographicEstimate), updatedAt: new Date().toISOString(), warning: warnings.join(' ') || null };
}
export async function loadMunicipalityVoteCandidates(query:ElectionQuery,municipalityCode:string,baseline:Candidate[],signal:AbortSignal):Promise<Candidate[]> {
 if(!query.state||!/^\d{1,5}$/.test(municipalityCode))return []
 const election=resolveElection(await request(TSE_URLS.results+'/oficial/comum/config/ele-c.json',signal),query)
 if(!election)throw Error('Configuração eleitoral indisponível.')
 const uf=query.state.toLowerCase(),code=query.office==='deputado-estadual'&&query.state==='DF'?8:officeCode[query.office]
 const path=TSE_URLS.results+'/oficial/'+election.cycle+'/'+election.id+'/dados/'+uf+'/'+uf+municipalityCode.padStart(5,'0')+'-c'+String(code).padStart(4,'0')+'-e'+election.id.padStart(6,'0')+'-u.json'
 const payload=await request(path,signal),area=normalizeResultCandidates(payload,query,query.state,path),byId=new Map(area.map(c=>[c.id,c]))
 const complete=completedResult(payload)
 return baseline.map(c=>({...c,votes:byId.get(c.id)?.votes??(complete?0:null),totalVotes:c.totalVotes===undefined?c.votes:c.totalVotes}))
}
