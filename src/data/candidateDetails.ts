export interface DeclaredAsset {id:string;type:string;description:string;amount:number;updatedAt?:string}
export interface ElectionHistory {year:number;round:number;office:string;state:string;party:string;partyName:string;number:string;result:string;registration:string}
import type { Candidate } from '../types'
export interface CandidateProfile { id:string;name:string;fullName:string;party:string;state:string;officeCode:number;reelection:boolean|null;registration:string;coalition:string;occupation:string;education:string;wealth:number|null;assets?:DeclaredAsset[];history?:ElectionHistory[] }
export interface FinancialEntry { id:string;amount:number;date:string;name:string;description:string;source:string;origin?:string;kind:string;counterpartyId?:string;transfer?:boolean;category?:string;categoryCode?:string;nature?:string;expenseId?:string;providerId?:string;receiptId?:string;parcelId?:string;expenseKey?:string|null;linked?:boolean;documentType?:string;documentNumber?:string;statementDate?:string;statementType?:string;items?:FinancialEntry[];payments?:FinancialEntry[];categories?:string[] }
export interface FinancialDetails {totals?:{paid:number|null;expenses:number|null;revenue:number|null};receipts:FinancialEntry[];expenses:FinancialEntry[];payments:FinancialEntry[];transfers:FinancialEntry[];transferSource:string;sourceUrl?:string;updatedAt?:string}
type Profiles={updatedAt:string;sourceUrl:string;profiles:Record<string,CandidateProfile>}
const profilesCache=new Map<number,Profiles>(),detailCache=new Map<string,FinancialDetails>()
export async function loadProfiles(year:number,signal:AbortSignal):Promise<Profiles|null>{
 if(profilesCache.has(year))return profilesCache.get(year)!
 const r=await fetch(import.meta.env.BASE_URL+'data/profiles-'+year+'.json',{signal})
 if(r.status===404)return null
 if(!r.ok)throw Error('Cadastro público indisponível (HTTP '+r.status+').')
 const data=await r.json() as Profiles;profilesCache.set(year,data);return data
}
export async function enrichProfiles(items:Candidate[],year:number,signal:AbortSignal){
 try{const data=await loadProfiles(year,signal);if(!data)return;for(const c of items){const p=data.profiles[c.id];if(p)c.reelection=p.reelection}}catch(e){if(signal.aborted)throw e}
}
export async function loadFinancialDetails(year:number,id:string,signal:AbortSignal):Promise<FinancialDetails|null>{
 const key=year+':'+id;if(detailCache.has(key))return detailCache.get(key)!
 if(!/^\d+$/.test(id))return null
 const shard=String(Number(id.slice(-2))).padStart(2,'0')
 const r=await fetch(import.meta.env.BASE_URL+'data/details-'+year+'/'+shard+'.json.gz',{signal})
 if(r.status===404)return null
 if(!r.ok)throw Error('Não foi possível consultar o extrato financeiro (HTTP '+r.status+').')
 const bytes=await r.arrayBuffer()
 const result=await new Promise<FinancialDetails|null>((resolve,reject)=>{
  const worker=new Worker(new URL('./details.worker.ts',import.meta.url),{type:'module'})
  const abort=()=>{worker.terminate();reject(new DOMException('Consulta cancelada','AbortError'))}
  signal.addEventListener('abort',abort,{once:true})
  const finish=()=>{signal.removeEventListener('abort',abort);worker.terminate()}
  worker.onmessage=event=>{finish();if(event.data.error)reject(Error(event.data.error));else resolve(event.data.result)}
  worker.onerror=()=>{finish();reject(Error('Falha ao processar o extrato financeiro.'))}
  if(signal.aborted){abort();return}
  worker.postMessage({bytes,id},[bytes])
 })
 if(result){if(detailCache.size>25)detailCache.clear();detailCache.set(key,result)}return result
}

export function clearCandidateDetailsCache(){profilesCache.clear();detailCache.clear()}
