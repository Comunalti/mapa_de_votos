import Papa from 'papaparse';
import { Unzip, UnzipInflate, unzipSync } from 'fflate';
import type { Candidate, ElectionQuery } from '../types';
import { applyGeographicEstimate, normalizedText, normalizeStatus, officeFromCode, parseNumber } from './normalize';
import { ALL_STATES, REGION_STATES } from './regions';

type Row = Record<string, string>;
type VoteLevel = 'state' | 'municipality' | 'zone' | 'section';
interface StoredCandidate {
  candidate: Candidate;
  rounds: Set<number>;
  statuses: Map<number, Candidate['status']>;
  votes: Map<string, Map<VoteLevel, Map<string, number>>>;
  expenses: Map<string, number>;
  receipts: Map<string, { amount: number; fefc: boolean | null; donation: boolean | null; fp?:boolean|null;party?:boolean|null;politician?:boolean|null }>;
  outgoing?:Map<string,number|null>;
}
export interface ImportStore {
  records: Map<string, StoredCandidate>;
  fingerprints: Set<string>;
  files: string[];
}
export function createImportStore(): ImportStore {
  return { records: new Map(), fingerprints: new Set(), files: [] };
}
function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return `${text.length}:${hash >>> 0}`;
}
function usable(value: string | undefined): string {
  return value && !value.startsWith('#') && value !== '-1' && value !== '-3' ? value : '';
}
function value(row: Row, ...keys: string[]): string {
  return keys.map(key => usable(row[key])).find(Boolean) ?? '';
}
function candidateRecord(store: ImportStore, row: Row): StoredCandidate | null {
  const id = value(row, 'SQ_CANDIDATO');
  const year = parseNumber(row.ANO_ELEICAO ?? row.AA_ELEICAO ?? row.ANO);
  const office = officeFromCode(value(row, 'CD_CARGO', 'DS_CARGO'));
  if (!id || !year || !office) return null;
  const key = `${year}:${id}:${office}`;
  let stored = store.records.get(key);
  const round = parseNumber(row.NR_TURNO);
  const state = office === 'presidente' ? 'BR' : value(row, 'SG_UF', 'SG_UF_CANDIDATO', 'SG_UE');
  if (!stored) {
    stored = {
      candidate: { id, name: value(row, 'NM_URNA_CANDIDATO', 'NM_CANDIDATO'), number: value(row, 'NR_CANDIDATO'),
        party: value(row, 'SG_PARTIDO'), state, office, year, votes: null, expenses: null,
        revenue: null, electoralFund: null, status: 'pendente', financeScope: office === 'presidente' ? 'national' : 'state',
        sourceUrl: `https://dadosabertos.tse.jus.br/dataset/candidatos-${year}` },
      rounds: new Set(), statuses: new Map(), votes: new Map(), expenses: new Map(), receipts: new Map(),
    };
    store.records.set(key, stored);
  }
  if (round) stored.rounds.add(round);
  if (!stored.candidate.name) stored.candidate.name = value(row, 'NM_URNA_CANDIDATO', 'NM_CANDIDATO');
  if (!stored.candidate.party) stored.candidate.party = value(row, 'SG_PARTIDO');
  if (!stored.candidate.number) stored.candidate.number = value(row, 'NR_CANDIDATO');
  if (!stored.candidate.state) stored.candidate.state = state;
  if(row.ST_REELEICAO==='S')stored.candidate.reelection=true;else if(row.ST_REELEICAO==='N')stored.candidate.reelection=false;
  const status = value(row, 'DS_SIT_TOT_TURNO', 'DS_SITUACAO_TOTALIZACAO');
  if (round && status) stored.statuses.set(round, normalizeStatus(status));
  return stored;
}
function sum(values: Iterable<number>): number {
  let total = 0;
  for (const amount of values) total += amount;
  return total;
}
function ingestRow(store: ImportStore, row: Row, name: string, lineKey: string): boolean {
  const stored = candidateRecord(store, row);
  if (!stored) return false;
  const votes = parseNumber(row.QT_VOTOS_NOMINAIS_VALIDOS ?? row.QT_VOTOS_NOMINAIS ?? row.QT_VOTOS);
  if (votes !== null) {
    const round = parseNumber(row.NR_TURNO);
    const state = value(row, 'SG_UF') || stored.candidate.state;
    if (round === 1 || round === 2) {
      const municipality = value(row, 'CD_MUNICIPIO');
      const zone = value(row, 'NR_ZONA');
      const section = value(row, 'NR_SECAO');
      const level: VoteLevel = section ? 'section' : zone ? 'zone' : municipality ? 'municipality' : 'state';
      const slotKey = `${round}:${state}`;
      const levels = stored.votes.get(slotKey) ?? new Map<VoteLevel, Map<string, number>>();
      const rows = levels.get(level) ?? new Map<string, number>();
      rows.set([municipality, zone, section].join(':'), votes);
      levels.set(level, rows);
      stored.votes.set(slotKey, levels);
    }
  }
  // Contracted and paid expenses are different tables. Only contracted expenses enter the cost metric.
  const contracted = row.VR_DESPESA_CONTRATADA ?? (/contratad/i.test(name) ? row.VR_DESPESA : undefined);
  const expense = parseNumber(contracted);
  if (expense !== null) {
    const key = lineKey;
    stored.expenses.set(key, expense);
    const purpose=normalizedText(value(row,'DS_ORIGEM_DESPESA','DS_DESPESA'));
    stored.outgoing??=new Map();stored.outgoing.set(key,purpose?(/DOACOES|TRANSFERENCIAS/.test(purpose)&&/CANDIDAT|PARTID/.test(purpose)?expense:0):null);
  }
  // Original-donor detail repeats receipts and cannot be summed alongside the receipts table.
  const receipt = /doador_originario|doador_origin/i.test(name) ? null : parseNumber(row.VR_RECEITA);
  if (receipt !== null) {
    const source = normalizedText(value(row, 'DS_FONTE_RECEITA', 'DS_ORIGEM_RECEITA'));
    const fefc = source ? source.includes('FUNDO ESPECIAL') || source.includes('FEFC') || source.includes('FUNDO ELEITORAL') : null;
    const key = value(row, 'SQ_RECEITA', 'SQ_RECEITA_CANDIDATO') || fingerprint(JSON.stringify(row));
    const origin = normalizedText(value(row, 'DS_ORIGEM_RECEITA'));
    const donation = source && !source.includes('OUTROS RECURSOS') ? false
      : source && origin ? /PESSOAS? FISICAS?|FINANCIAMENTO COLETIVO/.test(origin) && !origin.includes('PROPRIOS') : null;
    stored.receipts.set(key, { amount: receipt, fefc, donation,fp:source?source.includes('FUNDO PARTIDARIO'):null,party:origin?/PARTIDO/.test(origin)&&!/CANDIDAT/.test(origin):null,politician:origin?origin.includes('OUTROS CANDIDATOS'):null });
  }
  return true;
}

/** Parse official semicolon-separated CSV, retaining identities and quantities without rounding. */
export function ingestCsv(store: ImportStore, text: string, name = 'arquivo.csv'): number {
  const digest = fingerprint(text);
  if (store.fingerprints.has(digest)) return 0;
  let count = 0;
  const occurrences = new Map<string,number>();
  let recognized = false;
  let parseError: string | null = null;
  Papa.parse<Row>(text.replace(/^\uFEFF/, ''), {
    header: true, delimiter: ';', skipEmptyLines: 'greedy',
    transformHeader: header => normalizedText(header),
    step: result => {
      if (!recognized) {
        const row = result.data;
        recognized = 'SQ_CANDIDATO' in row && ('ANO_ELEICAO' in row || 'AA_ELEICAO' in row || 'ANO' in row) && ('CD_CARGO' in row || 'DS_CARGO' in row);
        if (!recognized) { parseError = 'Formato não reconhecido. Use os CSV oficiais de candidaturas, votação nominal ou contas de candidatos do TSE.'; return; }
      }
      if (result.errors.some(error => error.code === 'MissingQuotes')) { parseError = 'O arquivo CSV contém aspas incompletas.'; return; }
      const identity = fingerprint(JSON.stringify(Object.entries(result.data).filter(([key])=>!['DT_GERACAO','HH_GERACAO'].includes(key)).sort(([a],[b])=>a.localeCompare(b))));
      const occurrence = (occurrences.get(identity) ?? 0) + 1; occurrences.set(identity, occurrence);
      if (ingestRow(store, result.data, name, identity + ':' + occurrence)) count++;
    },
  });
  if (!recognized || parseError) throw new Error(parseError ?? 'O arquivo está vazio ou não contém candidatos identificáveis.');
  store.fingerprints.add(digest);
  store.files.push(name);
  return count;
}
function voteTotal(levels: Map<VoteLevel, Map<string, number>>, query?: ElectionQuery): number | null {
  const local = Boolean(query?.municipalityCode || query?.municipality || query?.zone);
  const desiredMunicipality = query?.municipalityCode?.padStart(5, '0');
  // IBGE and TSE municipality IDs are distinct; missing mapping must remain unknown.
  if (query?.municipality && !desiredMunicipality) return null;
  for (const level of ['state', 'municipality', 'zone', 'section'] as VoteLevel[]) {
    if (local && level === 'state' || query?.zone && level === 'municipality') continue;
    const rows = levels.get(level);
    if (!rows?.size) continue;
    if (!local) return sum(rows.values());
    const matching = [...rows.entries()].filter(([key]) => {
      const [municipality, zone] = key.split(':');
      return (!desiredMunicipality || municipality.padStart(5, '0') === desiredMunicipality) && (!query?.zone || Number(zone) === query.zone);
    });
    return matching.length ? sum(matching.map(([, votes]) => votes)) : null;
  }
  return null;
}
function presidencyTotals(stored: StoredCandidate, round: number): { total: number | null; byState: Record<string, number | null> } {
  const byState: Record<string, number | null> = {};
  for (const state of [...ALL_STATES, 'ZZ']) {
    const levels = stored.votes.get(`${round}:${state}`);
    byState[state] = levels ? voteTotal(levels) : null;
  }
  const national = stored.votes.get(`${round}:BR`);
  if (national) return { total: voteTotal(national), byState };
  const complete = (['state', 'municipality', 'zone', 'section'] as VoteLevel[]).some(level => [...ALL_STATES, 'ZZ'].every(state => stored.votes.get(`${round}:${state}`)?.has(level)));
  return { total: complete ? sum(Object.values(byState).filter((amount): amount is number => amount !== null)) : null, byState };
}
function selectedVotes(stored: StoredCandidate, query: ElectionQuery): number | null {
  if (stored.candidate.office !== 'presidente') {
    const levels = stored.votes.get(`${query.round}:${stored.candidate.state}`);
    return levels ? voteTotal(levels, query) : null;
  }
  const states = query.state ? [query.state] : query.region ? REGION_STATES[query.region] : null;
  if (!states && !query.municipality && !query.zone) {
    const nationwide = presidencyTotals(stored, query.round);
    if (nationwide.total !== null) return nationwide.total;
    const available = Object.values(nationwide.byState).filter((amount): amount is number => amount !== null);
    return available.length ? sum(available) : null;
  }
  const totals = (states ?? ALL_STATES).map(state => {
    const levels = stored.votes.get(`${query.round}:${state}`);
    return levels ? voteTotal(levels, query) : null;
  });
  return totals.every((amount): amount is number => amount !== null) ? sum(totals) : null;
}
export function selectImportedCandidates(store: ImportStore, query: ElectionQuery): Candidate[] {
  const states = query.state ? [query.state] : query.region ? REGION_STATES[query.region] : null;
  return [...store.records.values()].filter(stored => {
    const candidate = stored.candidate;
    if (candidate.year !== query.year || candidate.office !== query.office) return false;
    if (candidate.office !== 'presidente' && states && !states.includes(candidate.state)) return false;
    if (query.round === 2 && query.office !== 'presidente') return false;
    if (query.round === 2 && !stored.rounds.has(2) && stored.statuses.get(1) !== 'segundo-turno') return false;
    return true;
  }).map(stored => {
    const candidate = stored.candidate;
    const receipts = [...stored.receipts.values()];
    const categorized=(classify:(r:typeof receipts[number])=>boolean|null|undefined)=>{
      const flags=receipts.map(r=>classify(r));
      if(!receipts.length||flags.some((flag,i)=>flag==null&&receipts[i].amount>0))return null;
      return receipts.reduce((total,r,i)=>total+(flags[i]?r.amount:0),0);
    };
    const outgoing=[...(stored.outgoing?.values()??[])];

    const nationwide = candidate.office === 'presidente' ? presidencyTotals(stored, query.round) : null;
    const stateLevels = stored.votes.get(`${query.round}:${candidate.state}`);
    const totalVotes = nationwide ? nationwide.total : stateLevels ? voteTotal(stateLevels) : null;
    const votes = selectedVotes(stored, query);
    const sourceUrl = `https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-${query.year}`;
    return applyGeographicEstimate({ ...candidate, round: query.round, votes, totalVotes,
      votesByState: nationwide?.byState, voteCoverage: votes === null ? 'unknown' : totalVotes === null ? 'partial' : 'complete',
      expenses: stored.expenses.size ? sum(stored.expenses.values()) : null,
      revenue: receipts.length ? sum(receipts.map(receipt => receipt.amount)) : null,
      electoralFund: !receipts.length || receipts.some(receipt => receipt.fefc === null) ? null : sum(receipts.filter(receipt => receipt.fefc).map(receipt => receipt.amount)),
      donations: !receipts.length || receipts.some(receipt => receipt.donation === null) ? null : sum(receipts.filter(receipt => receipt.donation).map(receipt => receipt.amount)),
      partyFund:categorized(r=>r.fp),
      electoralFundParty:categorized(r=>r.fefc===false?false:r.fefc===true?r.party:null),
      partyFundParty:categorized(r=>r.fp===false?false:r.fp===true?r.party:null),
      receivedPoliticians:categorized(r=>r.politician),
      outgoingTransfers:outgoing.length&&outgoing.every((n):n is number=>n!=null)?sum(outgoing):null,
      financeSource: stored.expenses.size || receipts.length ? sourceUrl : undefined,
      financeSnapshot: false, status: stored.statuses.get(query.round) ?? 'pendente',
    });
  });
}const MAX_COMPRESSED_BYTES = 768 * 1024 * 1024;
const MAX_CSV_BYTES = 384 * 1024 * 1024;
function decodeCsv(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('windows-1252').decode(bytes); }
}
function relevantCsv(name: string): boolean {
  return /\.csv$/i.test(name) && !/doador_origin|despesas_pagas|bens_|bem_candidato|extrato_bancario|rede_social|consulta_coligacao|consulta_vagas/i.test(name);
}
/** This function runs in our dedicated import worker, keeping decompression and CSV parsing off the UI thread. */
export async function importElectionFilesInWorker(store: ImportStore, files: File[], onProgress: (message: string) => void): Promise<number> {
  let count = 0;
  for (const file of files) {
    if (file.size > MAX_COMPRESSED_BYTES) throw new Error(`${file.name} excede 768 MB. Importe os CSV da UF de interesse extraídos do arquivo oficial.`);
    onProgress(`Lendo ${file.name}…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const zipped = /\.zip$/i.test(file.name) || bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (!zipped) {
      if (!relevantCsv(file.name)) throw new Error('Selecione um CSV de candidatura, votação nominal ou prestação de contas contratadas do TSE.');
      if (bytes.length > MAX_CSV_BYTES) throw new Error('Este CSV excede 384 MB. Use os arquivos oficiais separados por UF.');
      count += ingestCsv(store, decodeCsv(bytes), file.name);
      continue;
    }
    const names: string[] = [];
    unzipSync(bytes, { filter: entry => { names.push(entry.name); return false; } });
    const supported = names.filter(relevantCsv);
    const selected = new Set(supported.filter(name => {
      if (!/_BRASIL\.csv$/i.test(name)) return true;
      const prefix = name.replace(/_BRASIL\.csv$/i, '').toLowerCase();
      return !supported.some(other => other.toLowerCase().startsWith(`${prefix}_`) && /_[A-Z]{2}\.csv$/i.test(other));
    }));
    if (!selected.size) throw new Error(`${file.name} não contém CSV de candidaturas, votação nominal ou contas contratadas compatíveis.`);
    let failure: Error | null = null;
    const stream = new Unzip(entry => {
      if (!selected.has(entry.name)) return;
      if (entry.originalSize !== undefined && entry.originalSize > MAX_CSV_BYTES) {
        failure = new Error(`${entry.name} excede 384 MB descompactado. Use os CSV das UFs em vez da tabela nacional.`);
        return;
      }
      onProgress(`Processando ${entry.name}…`);
      const chunks: Uint8Array[] = [];
      let length = 0;
      entry.ondata = (error, chunk, final) => {
        if (failure) return;
        if (error) { failure = error; return; }
        length += chunk.length;
        if (length > MAX_CSV_BYTES) { failure = new Error(`${entry.name} excede o limite de memória para uma tabela. Importe os CSV por UF.`); entry.terminate(); return; }
        chunks.push(chunk);
        if (final) {
          const data = new Uint8Array(length);
          let offset = 0;
          for (const part of chunks) { data.set(part, offset); offset += part.length; }
          chunks.length = 0;
          try { count += ingestCsv(store, decodeCsv(data), entry.name); }
          catch (reason) { failure = reason instanceof Error ? reason : new Error('CSV inválido.'); }
        }
      };
      entry.start();
    });
    stream.register(UnzipInflate);
    for (let offset = 0; offset < bytes.length; offset += 256 * 1024) {
      stream.push(bytes.subarray(offset, Math.min(bytes.length, offset + 256 * 1024)), offset + 256 * 1024 >= bytes.length);
      if (failure) throw failure;
    }
  }
  return count;
}

export async function importElectionFiles(store: ImportStore, files: File[], onProgress: (message: string) => void, signal?: AbortSignal): Promise<number> {
  if (typeof Worker === 'undefined') return importElectionFilesInWorker(store, files, onProgress);
  return new Promise<number>((resolve, reject) => {
    const worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort); };
    const abort = () => { cleanup(); reject(new DOMException('Importação cancelada', 'AbortError')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => { cleanup(); reject(new Error('Falha ao processar arquivos. Tente CSV separados por UF.')); };
    worker.onmessage = (event: MessageEvent<{ type: string; message?: string; count?: number; store?: ImportStore }>) => {
      const message = event.data;
      if (message.type === 'progress') { onProgress(message.message ?? 'Processando…'); return; }
      cleanup();
      if (message.type === 'error' || !message.store) { reject(new Error(message.message ?? 'Arquivo inválido.')); return; }
      store.records = message.store.records; store.fingerprints = message.store.fingerprints; store.files = message.store.files;
      resolve(message.count ?? 0);
    };
    worker.postMessage({ store, files });
  });
}