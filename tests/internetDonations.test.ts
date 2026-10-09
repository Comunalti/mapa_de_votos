import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {describe,it,expect} from 'vitest'
import {matchesFunding,sumEntries} from '../src/lib/accountModel'
import {createImportStore,ingestCsv,selectImportedCandidates} from '../src/data/importer'
import type {FinancialEntry} from '../src/data/candidateDetails'
describe('Doações pela Internet',()=>{
 const data=JSON.parse(gunzipSync(readFileSync('public/data/details-2026/26.json.gz')).toString()).candidates['130002542026']
 const snapshot=JSON.parse(readFileSync('public/data/finance-2026.json','utf8')).candidates.find((c:{id:string})=>c.id==='130002542026')
 it('reconcilia as três categorias de receita de Nikolas na extração oficial',()=>{
  const entries=data.receipts as FinancialEntry[]
  expect(sumEntries(entries.filter(e=>e.origin==='Recursos de pessoas físicas'))).toBe(1820055.01)
  expect(sumEntries(entries.filter(e=>e.origin==='Recursos de Financiamento Coletivo'))).toBe(116658.22)
  expect(sumEntries(entries.filter(e=>e.origin==='Doações pela Internet'))).toBe(270755)
  expect(snapshot.revenue).toBe(2207468.23)
  expect(snapshot.donations).toBe(2207468.23)
  expect(sumEntries(entries.filter(e=>matchesFunding(e,'individual')))).toBe(snapshot.donations)
 })
 it('não classifica recursos próprios ou públicos como doação privada',()=>{
  const base:FinancialEntry={id:'1',amount:10,date:'',name:'',description:'',source:'OUTROS RECURSOS',kind:'receipt'}
  expect(matchesFunding({...base,origin:'Doações pela Internet'},'individual')).toBe(true)
  expect(matchesFunding({...base,source:'FUNDO ESPECIAL',origin:'Recursos de pessoas físicas'},'individual')).toBe(false)
  expect(matchesFunding({...base,origin:'Recursos próprios'},'individual')).toBe(false)
 })
 it('inclui Internet também nas contas importadas pelo navegador',()=>{
  const store=createImportStore()
  const csv='AA_ELEICAO;CD_CARGO;SQ_CANDIDATO;SG_UF;SQ_RECEITA;VR_RECEITA;DS_FONTE_RECEITA;DS_ORIGEM_RECEITA\n2026;6;123;SP;1;100,00;OUTROS RECURSOS;Recursos de pessoas físicas\n2026;6;123;SP;2;50,00;OUTROS RECURSOS;Recursos de Financiamento Coletivo\n2026;6;123;SP;3;25,00;OUTROS RECURSOS;Doações pela Internet\n2026;6;123;SP;4;20,00;OUTROS RECURSOS;Recursos próprios\n2026;6;123;SP;5;200,00;FUNDO ESPECIAL DE FINANCIAMENTO DE CAMPANHA;Recursos de partidos políticos'
  ingestCsv(store,csv,'receitas.csv')
  expect(selectImportedCandidates(store,{year:2026,round:1,office:'deputado-federal',region:null,state:null})[0]).toMatchObject({revenue:395,donations:175,electoralFund:200})
 })
})
