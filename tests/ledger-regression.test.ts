import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createImportStore,ingestCsv,selectImportedCandidates} from '../src/data/importer'
describe('regressão de itens múltiplos de despesas oficiais',()=>{
 const id='250002546642'
 const snapshot=JSON.parse(readFileSync('public/data/finance-2026.json','utf8'))
 const candidate=snapshot.candidates.find((c:{id:string})=>c.id===id)
 const ledger=JSON.parse(gunzipSync(readFileSync('public/data/details-2026/42.json.gz')).toString()).candidates[id]
 it('reconcilia os três totais auditados de Kim em 2026',()=>{expect(candidate.expenses).toBe(470347.01);expect(candidate.paidExpenses).toBe(465347.01);expect(candidate.revenue).toBe(506582.55)})
 it('preserva todos os 139 itens em 115 documentos, incluindo repetições legítimas',()=>{expect(ledger.expenses.length).toBe(115);expect(ledger.expenses.flatMap((e:any)=>e.items).length).toBe(139);expect(ledger.expenses.flatMap((e:any)=>e.items).reduce((s:number,e:any)=>s+Math.round(e.amount*100),0)).toBe(47034701)})
 it('vincula os pagamentos ao documento do mesmo prestador sem repeti-los por item',()=>{for(const e of ledger.expenses)for(const p of e.payments){expect(p.expenseId).toBe(e.expenseId);expect(p.providerId).toBe(e.providerId)}expect(ledger.expenses.flatMap((e:any)=>e.payments).reduce((s:number,p:any)=>s+Math.round(p.amount*100),0)).toBe(46534701)})
 it('entrega bens individualizados e histórico partidário oficial',()=>{const p=JSON.parse(readFileSync('public/data/profiles-2026.json','utf8')).profiles[id];expect(p.assets.length).toBe(7);expect(p.assets.reduce((s:number,a:any)=>s+Math.round(a.amount*100),0)).toBe(110970279);expect(p.history.map((h:any)=>h.party)).toEqual(expect.arrayContaining(['MISSÃO','UNIÃO','DEM']))})
 it('importa itens distintos e idênticos com o mesmo identificador sem descartar linhas',()=>{const store=createImportStore();const csv='AA_ELEICAO;CD_CARGO;SQ_CANDIDATO;SG_UF;SQ_DESPESA;VR_DESPESA_CONTRATADA;DS_DESPESA\n2026;6;123;SP;1;100,00;Item A\n2026;6;123;SP;1;200,00;Item B\n2026;6;123;SP;1;200,00;Item B';ingestCsv(store,csv,'despesas_contratadas.csv');expect(selectImportedCandidates(store,{year:2026,round:1,office:'deputado-federal',state:'SP'} as any)[0].expenses).toBe(500)})
})
