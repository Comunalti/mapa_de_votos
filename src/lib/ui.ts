import type { Candidate } from '../types'
export const statusNames={eleito:'Eleito','nao-eleito':'Não eleito','segundo-turno':'2º turno',pendente:'Em apuração'}
export const stamp=(value:string|null|undefined)=>!value?'—':Number.isNaN(new Date(value).getTime())?value:new Date(value).toLocaleDateString('pt-BR')
export const sumKnown=(items:Candidate[],field:'votes'|'expenses'|'revenue'|'electoralFund'|'donations')=>items.some(c=>c[field]!=null)?items.reduce((sum,c)=>sum+(c[field]??0),0):null

export const statusLabel=(candidate:Candidate)=>candidate.status==='eleito'&&candidate.reelection===true?'Reeleito':statusNames[candidate.status]
