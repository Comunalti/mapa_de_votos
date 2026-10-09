import type {Candidate} from '../types'
import {comparisonRate} from './calculations'
import type {CalculationOptions} from './calculations'
export interface AtlasFilters {minVotes:string;maxCost:string;coverage:'all'|'known'|'missing';publicOnly:boolean}
export const DEFAULT_ATLAS_FILTERS:AtlasFilters={minVotes:'',maxCost:'',coverage:'all',publicOnly:false}
export function matchesAtlasFilters(c:Candidate,f:AtlasFilters,calculation:CalculationOptions){
 const min=f.minVotes.trim()===''?null:Number(f.minVotes),max=f.maxCost.trim()===''?null:Number(f.maxCost)
 if(min!=null&&Number.isFinite(min)&&(c.votes==null||c.votes<min))return false
 if(max!=null&&Number.isFinite(max)){const rate=comparisonRate(c,calculation);if(rate==null||rate>max)return false}
 if(f.coverage==='known'&&c.expenses==null)return false
 if(f.coverage==='missing'&&c.expenses!=null)return false
 if(f.publicOnly&&!((c.electoralFund??0)>0||(c.partyFund??0)>0))return false
 return true
}
