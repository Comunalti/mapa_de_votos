import {describe,it,expect} from 'vitest'
import type {Candidate} from '../src/types'
import {calculationBase,comparisonAmount,comparisonRate,summarizeConfigured,DEFAULT_CALCULATION} from '../src/lib/calculations'
import {statusLabel} from '../src/lib/ui'
const c:Candidate={id:'1',name:'Teste',number:'1',party:'TESTE',state:'SP',office:'deputado-federal',votes:20,totalVotes:100,expenses:100,paidExpenses:60,partyFund:20,electoralFund:30,revenue:150,outgoingTransfers:10,paidOutgoingTransfers:5,status:'eleito'}
describe('configurações auditáveis de cálculo',()=>{
 it('preserva taxa da campanha no rateio proporcional',()=>{expect(comparisonRate(c,DEFAULT_CALCULATION)).toBe(1);expect(comparisonAmount(c,DEFAULT_CALCULATION)).toBe(20)})
 it('compara a base inteira aos votos locais somente quando escolhido',()=>{const o={...DEFAULT_CALCULATION,allocation:'whole' as const};expect(comparisonAmount(c,o)).toBe(100);expect(comparisonRate(c,o)).toBe(5)})
 it('deduz repasses contratados do contratado, e pagos do pago',()=>{expect(calculationBase(c,{...DEFAULT_CALCULATION,deductTransfers:true})).toBe(90);expect(calculationBase(c,{...DEFAULT_CALCULATION,basis:'paid',deductTransfers:true})).toBe(55)})
 it('mantém dedução desconhecida ou incompatível sem valor',()=>{expect(calculationBase({...c,outgoingTransfers:null},{...DEFAULT_CALCULATION,deductTransfers:true})).toBeNull();expect(calculationBase({...c,outgoingTransfers:101},{...DEFAULT_CALCULATION,deductTransfers:true})).toBeNull()})
 it('separa financiamento público, arrecadação e gastos',()=>{expect(calculationBase(c,{...DEFAULT_CALCULATION,basis:'public-funds'})).toBe(50);expect(calculationBase(c,{...DEFAULT_CALCULATION,basis:'revenue'})).toBe(150);expect(c.expenses).toBe(100)})
 it('não trata um fundo desconhecido como zero',()=>{expect(calculationBase({...c,partyFund:null},{...DEFAULT_CALCULATION,basis:'public-funds'})).toBeNull()})
 it('distingue média simples de ponderada',()=>{const rows=[{...c,votes:100,totalVotes:100},{...c,id:'2',votes:10,totalVotes:10,expenses:90}];expect(summarizeConfigured(rows,DEFAULT_CALCULATION).costPerVote).toBeCloseTo(190/110);expect(summarizeConfigured(rows,{...DEFAULT_CALCULATION,average:'simple'}).costPerVote).toBe(5)})
 it('só afirma reeleição confirmada de quem foi eleito',()=>{expect(statusLabel({...c,reelection:true})).toBe('Reeleito');expect(statusLabel({...c,reelection:null})).toBe('Eleito');expect(statusLabel({...c,status:'nao-eleito',reelection:true})).toBe('Não eleito')})
})
