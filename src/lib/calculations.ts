import type { Candidate } from '../types'
import { campaignVotes, summarize } from './metrics'
export interface CalculationOptions { basis:'contracted'|'paid'|'public-funds'|'revenue'; deductTransfers:boolean; allocation:'proportional'|'whole'; average:'weighted'|'simple' }
export const DEFAULT_CALCULATION:CalculationOptions={basis:'contracted',deductTransfers:false,allocation:'proportional',average:'weighted'}
export const BASIS_LABELS={contracted:'Despesas contratadas',paid:'Despesas pagas','public-funds':'FEFC + Fundo Partidário',revenue:'Receitas arrecadadas'}
export function calculationBase(c:Candidate,o:CalculationOptions):number|null {
 let value=o.basis==='contracted'?c.expenses:o.basis==='paid'?c.paidExpenses??null:o.basis==='revenue'?c.revenue:c.electoralFund!=null&&c.partyFund!=null?c.electoralFund+c.partyFund:null
 if(o.deductTransfers&&(o.basis==='contracted'||o.basis==='paid')){
  const transfers=o.basis==='paid'?c.paidOutgoingTransfers:c.outgoingTransfers
  if(value==null||transfers==null||Math.round(transfers*100)>Math.round(value*100))return null
  value=(Math.round(value*100)-Math.round(transfers*100))/100
 }
 return value
}
export function comparisonAmount(c:Candidate,o:CalculationOptions):number|null {
 const base=calculationBase(c,o),total=campaignVotes(c)
 if(o.allocation==='whole')return base
 if(base==null||c.votes==null||total==null||total<=0||c.votes>total)return null
 return base*c.votes/total
}
export function comparisonRate(c:Candidate,o:CalculationOptions):number|null {
 const denominator=o.allocation==='whole'?c.votes:campaignVotes(c),base=calculationBase(c,o)
 return base!=null&&denominator!=null&&denominator>0?base/denominator:null
}
export function summarizeConfigured(items:Candidate[],o:CalculationOptions){
 const transformed=items.map(c=>({...c,expenses:calculationBase(c,o),estimatedExpenses:comparisonAmount(c,o)}))
 const result=summarize(transformed)
 if(o.average==='simple'){
  const rates=items.map(c=>comparisonRate(c,o)).filter((x):x is number=>x!=null)
  result.costPerVote=rates.length?rates.reduce((sum,n)=>sum+n,0)/rates.length:null
  result.votesPerReal=result.costPerVote!=null&&result.costPerVote>0?1/result.costPerVote:null
 }
 result.estimated=o.allocation==='proportional'&&items.some(c=>c.totalVotes!=null&&c.votes!==c.totalVotes)
 return result
}
