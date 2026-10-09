import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
describe('extratos oficiais consultados sob demanda',()=>{
 const snapshot=JSON.parse(readFileSync('public/data/finance-2026.json','utf8'))
 const candidate=snapshot.candidates.find((c:{outgoingTransfers:number;state:string;officeCode:number})=>c.outgoingTransfers>0&&c.state==='SP'&&c.officeCode===6)
 const file='public/data/details-2026/'+String(Number(candidate.id.slice(-2))).padStart(2,'0')+'.json.gz'
 const shard=JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')),details=shard.candidates[candidate.id]
 it('mantém receitas e despesas nos mesmos totais do resumo oficial',()=>{
 expect(details.receipts.reduce((sum:number,r:{amount:number})=>sum+r.amount,0)).toBeCloseTo(candidate.revenue,2)
 expect(details.expenses.reduce((sum:number,r:{amount:number})=>sum+r.amount,0)).toBeCloseTo(candidate.expenses,2)
 })
 it('relaciona pagamentos pelo identificador da despesa',()=>{expect(details.payments.reduce((sum:number,r:{amount:number})=>sum+r.amount,0)).toBeCloseTo(candidate.paidExpenses,2);expect(details.payments.length).toBeGreaterThan(0)})
 it('separa repasses e preserva a proveniência do arquivo',()=>{expect(details.transfers.length).toBeGreaterThan(0);expect(shard.sourceUrl).toContain('cdn.tse.jus.br');expect(shard.updatedAt).toBeTruthy()})
 it('não publica campos estruturados de CPF ou contas bancárias nas listas',()=>{for(const list of [details.receipts,details.expenses,details.payments])for(const row of list){expect(Object.keys(row).some(k=>/cpf|cnpj|contaBancaria/i.test(k))).toBe(false)}})
})
