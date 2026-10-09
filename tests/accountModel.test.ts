import {describe,expect,it} from 'vitest'
import {expenseSettlement,groupAccounts,sumEntries} from '../src/lib/accountModel'
import type {FinancialEntry,FinancialDetails} from '../src/data/candidateDetails'
const entry=(fields:Partial<FinancialEntry>={}):FinancialEntry=>({id:'p:10',amount:100,date:'01/10/2026',name:'Fornecedor',description:'Serviço declarado',source:'Outros recursos',kind:'expense',...fields})
const finance=(payments:FinancialEntry[]=[]):FinancialDetails=>({expenses:[],receipts:[],payments,transfers:[],transferSource:'declared-expenses'})
describe('Conciliação por documento',()=>{
 it('calcula pagamentos vinculados em centavos e saldo positivo',()=>{const doc=entry({amount:100,payments:[entry({amount:33.33}),entry({amount:33.34})]});expect(expenseSettlement(doc,null)).toMatchObject({paid:66.67,balance:33.33,percentage:66.67})})
 it('mantém pagamento excedente visível sem criar saldo negativo',()=>{const result=expenseSettlement(entry({payments:[entry({amount:120})]}),null);expect(result).toMatchObject({paid:120,balance:0,percentage:120})})
 it('não converte ausência de vínculo em pagamento zero ou dívida',()=>{expect(expenseSettlement(entry(),finance([entry({kind:'paid',amount:75})]))).toMatchObject({paid:null,balance:null,percentage:null,payments:null})})
 it('vincula pela dupla prestador e despesa, nunca só pelo id da despesa',()=>{const doc=entry({providerId:'A',expenseId:'10'}),payments=[entry({providerId:'A',expenseId:'10',amount:40,kind:'paid'}),entry({providerId:'B',expenseId:'10',amount:90,kind:'paid'}),entry({amount:12,kind:'paid',linked:false})];expect(expenseSettlement(doc,finance(payments))).toMatchObject({paid:40,balance:60});expect(sumEntries(payments)).toBe(142)})
 it('preserva saldo aritmético de item estimável sem classificá-lo como dívida',()=>{const result=expenseSettlement(entry({nature:'ESTIMÁVEL',amount:5000,payments:[]}),null);expect(result).toMatchObject({paid:0,balance:5000});expect(result).not.toHaveProperty('debt')})
 it('não divide por zero ao mostrar percentuais',()=>{expect(expenseSettlement(entry({amount:0,payments:[]}),null).percentage).toBeNull()})
})
describe('Agrupamento de itens oficiais',()=>{
 it('preserva itens repetidos e mostra o documento uma vez por tipo',()=>{const doc=entry({amount:25,items:[entry({amount:10,category:'Impressos'}),entry({amount:10,category:'Impressos'}),entry({amount:5,category:'Serviços'})]});const groups=groupAccounts([doc],'category',true);expect(groups.map(g=>[g.label,g.amount,g.records.length])).toEqual([['Impressos',20,1],['Serviços',5,1]]);expect(groups.reduce((sum,g)=>sum+g.amount,0)).toBe(25)})
 it('mantém centavos corretos nas somas de registros',()=>{expect(sumEntries([entry({amount:.1}),entry({amount:.2})])).toBe(.3)})
})

describe('Disponibilidade de pagamentos',()=>{
 it('mantém desconhecido um documento sem pagamentos quando o total não foi divulgado',()=>{const data=finance();data.totals={paid:null,expenses:47389,revenue:null};expect(expenseSettlement(entry({amount:47389,payments:[]}),data)).toMatchObject({paid:null,balance:null,percentage:null})})
 it('aceita zero somente quando a fonte publicou o total zero',()=>{const data=finance();data.totals={paid:0,expenses:100,revenue:0};expect(expenseSettlement(entry({payments:[]}),data)).toMatchObject({paid:0,balance:100,percentage:0})})
 it('mostra pagamentos individuais disponíveis mesmo com total ainda não divulgado',()=>{const data=finance();data.totals={paid:null,expenses:100,revenue:null};expect(expenseSettlement(entry({payments:[entry({amount:25})]}),data)).toMatchObject({paid:25,balance:75,percentage:25})})
})
