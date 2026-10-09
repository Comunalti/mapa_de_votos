import {useEffect,useState} from 'react'
import type {Candidate,ElectionQuery,Municipality} from '../types'
import type {CalculationOptions} from '../lib/calculations'
import {calculationBase,summarizeConfigured} from '../lib/calculations'
import type {Summary} from '../lib/metrics'
import {campaignVotes} from '../lib/metrics'
import {loadMunicipalityVoteCandidates} from '../data/tse'
export function useMunicipalitySummaries(query:ElectionQuery,municipalities:Municipality[],baseline:Candidate[],calculation:CalculationOptions,source:string,importedQuery:(query:ElectionQuery)=>Candidate[]){
 const [summaries,setSummaries]=useState<Record<string,Summary>>({}),[loading,setLoading]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('')
 const signature=baseline.map(c=>c.id+':'+campaignVotes(c)+':'+calculationBase(c,calculation)).sort().join('|')
 const geography=municipalities.map(m=>m.id+':'+m.tseCode).join('|'),options=JSON.stringify(calculation)
 useEffect(()=>{
 setSummaries({});setError('')
 if(!query.state||!municipalities.length||!baseline.length){setLoading(false);setProgress('');return}
 const controller=new AbortController();let next=0,done=0,failed=0,stop=false
 const result:Record<string,Summary>={};setLoading(true);setProgress('Consultando médias por município…')
 const baseById=new Map(baseline.map(c=>[c.id,c]))
 async function worker(){
 while(next<municipalities.length&&!controller.signal.aborted&&!stop){
 const municipality=municipalities[next++]
 try{
 let items:Candidate[]
 if(source==='demo')items=baseline.map(c=>({...c,votes:Math.round((campaignVotes(c)??0)*(Number(municipality.id)%11+1)/5000)}))
 else if(source==='import'){
 const rows=importedQuery({...query,municipality:municipality.id,municipalityCode:municipality.tseCode,zone:null})
 items=rows.filter(c=>baseById.has(c.id)).map(c=>({...baseById.get(c.id)!,votes:c.votes,totalVotes:campaignVotes(baseById.get(c.id)!)}))
 }else if(municipality.tseCode)items=await loadMunicipalityVoteCandidates(query,municipality.tseCode,baseline,controller.signal)
 else items=[]
 result[municipality.id]=summarizeConfigured(items,calculation)
 }catch{if(controller.signal.aborted)return;failed++;if(failed>=3&&Object.keys(result).length===0)stop=true}
 done++
 if(done%8===0||done===municipalities.length||stop){setSummaries({...result});setProgress(done+' / '+municipalities.length+' municípios consultados'+(failed?' · '+failed+' indisponíveis':''))}
 }
 }
 void Promise.all(Array.from({length:source==='tse'?3:1},worker)).then(()=>{
 if(controller.signal.aborted)return
 setSummaries({...result});setLoading(false)
 if(failed)setError('Parte das médias municipais não respondeu nesta conexão. Selecione um município para consultar seus votos.')
 })
 return()=>controller.abort()
 },[query.year,query.round,query.office,query.state,signature,geography,options,source])
 return{summaries,loading,progress,error}
}
