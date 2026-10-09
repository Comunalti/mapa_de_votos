import { useCallback, useEffect, useRef, useState } from 'react';
import type { Candidate, DataSource, ElectionQuery } from '../types';
import { clearElectionCache, loadElection } from '../data/tse';
import { createImportStore, importElectionFiles, selectImportedCandidates } from '../data/importer';
import { createDemoCandidates } from '../data/demo';
import { applyFinanceSnapshot, loadOfficialFinanceSnapshot } from '../data/finance';
import { applyGeographicEstimate } from '../data/normalize';

export function useElectionData(query: ElectionQuery) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState('Preparando consulta…');
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource>('tse');
  const [revision, setRevision] = useState(0);
  const imported = useRef(createImportStore());
  const controller = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const [importing, setImporting] = useState(false);
  const importError = useRef<string | null>(null);

  useEffect(() => () => { controller.current?.abort(); operation.current++; }, []);

  useEffect(() => {
    if (importing) return;
    if (importError.current) { setError(importError.current); importError.current = null; setLoading(false); return; }
    const requestId = ++operation.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setCandidates([]);
    setError(null);
    if (source === 'demo') {
      setCandidates(createDemoCandidates(query));
      setLoading(false); setProgress('Demonstração · dados fictícios'); setUpdatedAt(null);
      return () => abort.abort();
    }
    if (source === 'import') {
      const selected = selectImportedCandidates(imported.current, query);
      setLoading(true);
      const enrich = async () => {
        if (selected.length && selected.some(candidate => candidate.totalVotes == null)) {
          try {
            const live = await loadElection(query, abort.signal, message => {
              if (requestId === operation.current && !abort.signal.aborted) setProgress(message);
            });
            const byId = new Map(live.candidates.map(candidate => [candidate.id, candidate]));
            for (let index = 0; index < selected.length; index++) {
              const importedCandidate = selected[index];
              const official = byId.get(importedCandidate.id);
              if (!official) continue;
              selected[index] = { ...official, ...importedCandidate,
                votes: importedCandidate.votes ?? official.votes,
                totalVotes: importedCandidate.totalVotes ?? official.totalVotes,
                expenses: importedCandidate.expenses ?? official.expenses,
                revenue: importedCandidate.revenue ?? official.revenue,
                electoralFund: importedCandidate.electoralFund ?? official.electoralFund,
                donations: importedCandidate.donations ?? official.donations,
                votesByState: official.votesByState ?? importedCandidate.votesByState,
                financeSource: importedCandidate.financeSource ?? official.financeSource,
                financeUpdatedAt: importedCandidate.financeUpdatedAt ?? official.financeUpdatedAt,
                financeSnapshot: importedCandidate.expenses !== null || importedCandidate.revenue !== null ? false : official.financeSnapshot,
              };
            }
          } catch { if (abort.signal.aborted) return; }
        }
        try {
          const snapshot = await loadOfficialFinanceSnapshot(query.year, abort.signal);
          if (snapshot) applyFinanceSnapshot(selected, snapshot, true);
        } catch { if (abort.signal.aborted) return; }
        if (requestId !== operation.current || abort.signal.aborted) return;
        setCandidates(selected.map(applyGeographicEstimate)); setLoading(false);
        setProgress(`${imported.current.files.length} arquivos processados no navegador`);
        if (!selected.length) setError('Os arquivos importados não têm candidatos para esta eleição, turno e seleção. Importe os arquivos correspondentes ou ajuste os filtros.');
      };
      void enrich();      return () => abort.abort();
    }    setLoading(true); setUpdatedAt(null);
    loadElection(query, abort.signal, message => {
      if (requestId === operation.current && !abort.signal.aborted) setProgress(message);
    }).then(result => {
      if (requestId !== operation.current || abort.signal.aborted) return;
      setCandidates(result.candidates); setUpdatedAt(result.updatedAt); setError(result.warning);
      setProgress(result.warning ? 'Consulta concluída com cobertura limitada' : 'Consulta oficial concluída');
    }).catch(reason => {
      if (requestId !== operation.current || abort.signal.aborted) return;
      setCandidates([]); setError(reason instanceof Error ? reason.message : 'Não foi possível consultar o TSE.');
      setProgress('Fonte oficial indisponível');
    }).finally(() => { if (requestId === operation.current && !abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [query.year, query.round, query.office, query.region, query.state, query.municipality, query.municipalityCode, query.zone, source, revision, importing]);

  const reload = useCallback(() => {
    clearElectionCache();
    controller.current?.abort(); operation.current++;
    importError.current = null; setImporting(false);
    setSource('tse'); setRevision(current => current + 1);
  }, []);
  const useDemo = useCallback(() => {
    controller.current?.abort(); operation.current++;
    importError.current = null; setImporting(false);
    setSource('demo'); setRevision(current => current + 1);
  }, []);
  const importFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    controller.current?.abort();
    const requestId = ++operation.current;
    setImporting(true); setLoading(true); setError(null); importError.current = null;
    const abort = new AbortController(); controller.current = abort;
    // Commit the entire batch atomically. A broken second file cannot replace the previous successful import.
    const next = typeof Worker === 'undefined' ? structuredClone(imported.current) : { ...imported.current };
    // The worker clones Maps/Sets; its result commits only on success.
    try {
      await importElectionFiles(next, files, message => { if (operation.current === requestId) setProgress(message); }, abort.signal);
      if (operation.current !== requestId) return;
      imported.current = next;
      setSource('import'); setUpdatedAt(new Date().toISOString()); setRevision(current => current + 1);
    } catch (reason) {
      if (operation.current === requestId) {
        importError.current = reason instanceof Error ? reason.message : 'Não foi possível importar o arquivo.';
        setError(importError.current);
      }
      throw reason;
    } finally {
      if (operation.current === requestId) { setImporting(false); setLoading(false); }
    }
  }, []);

  const getImportedCandidatesFor=useCallback((nextQuery:ElectionQuery)=>selectImportedCandidates(imported.current,nextQuery),[]);
  return { candidates, loading, progress, error, updatedAt, source, reload, importFiles, useDemo, getImportedCandidatesFor };
}
