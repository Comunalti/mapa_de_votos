import type { Candidate, ElectionQuery } from '../types';
import { ALL_STATES, REGION_STATES } from './regions';
import { applyGeographicEstimate } from './normalize';

/** Fictitious data is opt-in and never substitutes for a failed official request. */
export function createDemoCandidates(query: ElectionQuery): Candidate[] {
  if (query.round === 2 && query.office !== 'presidente') return [];
  const firstNames = ['Aurora', 'Caio', 'Lia', 'Bento', 'Iara', 'Davi', 'Cora', 'Tomás', 'Nina', 'Artur', 'Luna', 'Otávio'];
  const surnames = ['do Vale', 'Monteiro', 'Luz', 'Campos', 'Rios', 'Serra', 'Costa', 'Almeida'];
  const selectedStates = query.state ? [query.state] : query.region ? REGION_STATES[query.region] : ALL_STATES;
  const states = query.office === 'presidente' ? ['BR'] : selectedStates;
  const candidates: Candidate[] = [];
  for (const state of states) {
    const stateIndex = state === 'BR' ? 28 : ALL_STATES.indexOf(state) + 1;
    const count = query.office === 'presidente' ? query.round === 2 ? 2 : 8 : 12;
    for (let index = 0; index < count; index++) {
      const seed = (stateIndex * 97 + (index + 1) * 173 + query.year) % 997;
      const national = query.office === 'presidente';
      const scope = national && (query.region || query.state);
      const scale = national ? 270 : query.office === 'senador' ? 20 : 1;
      const totalVotes = Math.round((6200 + seed * 250) * scale);
      const localScale = query.zone ? 0.004 : query.municipalityCode || query.municipality ? 0.065 : 1;
      const votes = Math.round(totalVotes * (scope ? selectedStates.length / ALL_STATES.length : 1) * localScale);
      const expenses = Math.round((210000 + seed * 1720) * (national ? 23 : 1));
      candidates.push({
        id: `demo-${query.year}-${query.office}-${state}-${index}`, name: `${firstNames[index % firstNames.length]} ${surnames[(stateIndex + index) % surnames.length]}`,
        number: String(10 + index) + (query.office.includes('deputado') ? String(100 + stateIndex) : ''),
        party: `DEMO ${String.fromCharCode(65 + index % 6)}`, state, office: query.office, year: query.year, round: query.round,
        votes, totalVotes, expenses, revenue: Math.round(expenses * 1.07), electoralFund: Math.round(expenses * (0.4 + index % 4 * 0.13)), donations: Math.round(expenses * 0.14),
        votesByState: national ? Object.fromEntries(ALL_STATES.map(state => [state, Math.round(totalVotes / ALL_STATES.length)])) : undefined,
        paidExpenses:Math.round(expenses*0.86),partyFund:Math.round(expenses*0.12),electoralFundParty:Math.round(expenses*(0.4+index%4*0.13)*0.8),partyFundParty:Math.round(expenses*0.1),receivedPoliticians:Math.round(expenses*1.07)-Math.round(expenses*(0.4+index%4*0.13)*0.8)-Math.round(expenses*0.1)-Math.round(expenses*0.14),outgoingTransfers:Math.round(expenses*0.1),paidOutgoingTransfers:Math.round(expenses*0.07),reelection:index===0,
        voteCoverage: 'complete',
        status: national ? query.round === 1 ? index < 2 ? 'segundo-turno' : 'nao-eleito' : index === 0 ? 'eleito' : 'nao-eleito'
          : index < 3 ? 'eleito' : 'nao-eleito', financeScope: national ? 'national' : 'state',
      });
    }
  }
  return candidates.map(applyGeographicEstimate);
}
