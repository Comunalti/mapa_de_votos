import { importElectionFilesInWorker } from './importer';
import type { ImportStore } from './importer';

self.onmessage = async (event: MessageEvent<{ store: ImportStore; files: File[] }>) => {
  try {
    const { store, files } = event.data;
    const count = await importElectionFilesInWorker(store, files, message => self.postMessage({ type: 'progress', message }));
    self.postMessage({ type: 'complete', count, store });
  } catch (reason) {
    self.postMessage({ type: 'error', message: reason instanceof Error ? reason.message : 'Não foi possível processar os arquivos.' });
  }
};
