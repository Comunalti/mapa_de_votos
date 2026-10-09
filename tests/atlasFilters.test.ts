import {describe,it,expect} from 'vitest'
import {DEFAULT_ATLAS_FILTERS,matchesAtlasFilters} from '../src/lib/atlasFilters'
import {DEFAULT_CALCULATION} from '../src/lib/calculations'
import type {Candidate} from '../src/types'
const c:Candidate={id:'1',name:'Teste',party:'T',state:'SP',office:'deputado-federal',number:'1',votes:100,totalVotes:1000,expenses:2000,revenue:3000,electoralFund:0,status:'eleito'}
describe('filtros comuns do mapa e ranking',()=>{
 it('aplica votos locais e custo calculado com votos integrais',()=>{expect(matchesAtlasFilters(c,{...DEFAULT_ATLAS_FILTERS,minVotes:'100',maxCost:'2'},DEFAULT_CALCULATION)).toBe(true);expect(matchesAtlasFilters(c,{...DEFAULT_ATLAS_FILTERS,minVotes:'101'},DEFAULT_CALCULATION)).toBe(false);expect(matchesAtlasFilters(c,{...DEFAULT_ATLAS_FILTERS,maxCost:'1.99'},DEFAULT_CALCULATION)).toBe(false)})
 it('não apresenta valores ausentes como zero em filtros numéricos',()=>{expect(matchesAtlasFilters({...c,votes:null},{...DEFAULT_ATLAS_FILTERS,minVotes:'0'},DEFAULT_CALCULATION)).toBe(false);expect(matchesAtlasFilters({...c,expenses:null},{...DEFAULT_ATLAS_FILTERS,maxCost:'100'},DEFAULT_CALCULATION)).toBe(false)})
 it('distingue cobertura financeira e fundos públicos',()=>{expect(matchesAtlasFilters({...c,expenses:null},{...DEFAULT_ATLAS_FILTERS,coverage:'missing'},DEFAULT_CALCULATION)).toBe(true);expect(matchesAtlasFilters(c,{...DEFAULT_ATLAS_FILTERS,publicOnly:true},DEFAULT_CALCULATION)).toBe(false);expect(matchesAtlasFilters({...c,partyFund:100},{...DEFAULT_ATLAS_FILTERS,publicOnly:true},DEFAULT_CALCULATION)).toBe(true)})
})
