import type {FinancialEntry,FinancialDetails} from '../data/candidateDetails'
import {normalize} from './format'
export type AccountGroupMode='source'|'origin'|'nature'|'name'|'category'
export const ACCOUNT_GROUP_LABELS:Record<AccountGroupMode,string>={source:'Fonte do recurso',origin:'Origem do dinheiro',nature:'Dinheiro / bens e serviços',name:'Doador ou fornecedor',category:'Tipo de gasto'}
export const sumEntries=(entries:FinancialEntry[])=>entries.reduce((sum,e)=>sum+Math.round(e.amount*100),0)/100
export function groupAccounts(entries:FinancialEntry[],mode:AccountGroupMode,expenses=false){
 const map=new Map<string,{label:string;amount:number;records:FinancialEntry[]}>()
 for(const entry of entries){for(const item of expenses&&entry.items?.length?entry.items:[entry]){
  const label=String(item[mode]||entry[mode]||'Não informado')
  let group=map.get(label);if(!group){group={label,amount:0,records:[]};map.set(label,group)}
  group.amount+=Math.round(item.amount*100);if(!group.records.includes(entry))group.records.push(entry)
 }}
 return [...map.values()].map(g=>({...g,amount:g.amount/100})).sort((a,b)=>b.amount-a.amount)
}
export function expensePayments(entry:FinancialEntry,finance:FinancialDetails|null):FinancialEntry[]|null{
 if(entry.payments)return entry.payments
 if(entry.expenseId&&entry.providerId&&finance)return finance.payments.filter(p=>p.providerId===entry.providerId&&p.expenseId===entry.expenseId)
 return null
}
export function accountTotal(finance:FinancialDetails,key:'paid'|'expenses'|'revenue'):number|null{if(finance.totals)return finance.totals[key];return sumEntries(key==='paid'?finance.payments:key==='expenses'?finance.expenses:finance.receipts)}
export function expenseSettlement(entry:FinancialEntry,finance:FinancialDetails|null){
 const payments=expensePayments(entry,finance),paid=payments===null||!payments.length&&finance?.totals?.paid===null?null:sumEntries(payments)
 return {payments,paid,balance:paid===null?null:Math.max(0,Math.round((entry.amount-paid)*100)/100),percentage:paid===null||entry.amount<=0?null:paid/entry.amount*100}
}
export function matchesFunding(entry:FinancialEntry,fund:string){
 const source=normalize(entry.source),origin=normalize(entry.origin||'')
 if(fund==='electoral-party')return source.includes('fundo especial')&&origin.includes('partido')
 if(fund==='party-party')return source.includes('fundo partid')&&origin.includes('partido')
 if(fund==='politicians')return origin.includes('candidat')
 return source.includes('outros recursos')&&/pessoas? fisicas?|financiamento coletivo|doacoes pela internet/.test(origin)&&!origin.includes('proprios')
}
