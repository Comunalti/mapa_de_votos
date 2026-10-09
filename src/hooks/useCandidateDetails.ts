import {useEffect,useState} from 'react'
import type {Candidate} from '../types'
import {loadProfiles,loadFinancialDetails} from '../data/candidateDetails'
import type {CandidateProfile,FinancialDetails} from '../data/candidateDetails'
export function useCandidateDetails(candidate:Candidate,year:number,demo:boolean){
 const [profile,setProfile]=useState<CandidateProfile|null>(null),[finance,setFinance]=useState<FinancialDetails|null>(null)
 const [profileLoading,setProfileLoading]=useState(true),[financeLoading,setFinanceLoading]=useState(true)
 const [error,setError]=useState(''),[revision,setRevision]=useState(0)
 useEffect(()=>{
 const controller=new AbortController();setProfile(null);setFinance(null);setError('');setProfileLoading(true);setFinanceLoading(true)
 if(demo){setProfile({id:candidate.id,name:candidate.name,fullName:candidate.name,party:candidate.party,state:candidate.state,officeCode:6,reelection:candidate.reelection??false,registration:'Demonstração fictícia',coalition:'DEMO',occupation:'Dados fictícios',education:'Demonstração',wealth:null});setFinance({
 receipts:[{id:'demo-r1',amount:candidate.electoralFundParty??0,date:'01/10/'+year,name:'PARTIDO DEMONSTRATIVO',description:'Repasse fictício de FEFC',source:'FUNDO ESPECIAL',origin:'Recursos de partido político',kind:'receipt'},{id:'demo-r2',amount:candidate.partyFundParty??0,date:'01/10/'+year,name:'PARTIDO DEMONSTRATIVO',description:'Repasse fictício de Fundo Partidário',source:'FUNDO PARTIDARIO',origin:'Recursos de partido político',kind:'receipt'},{id:'demo-r3',amount:candidate.donations??0,date:'01/10/'+year,name:'DOADORES DEMONSTRATIVOS',description:'Doações fictícias',source:'OUTROS RECURSOS',origin:'Pessoas físicas',kind:'receipt'},{id:'demo-r4',amount:candidate.receivedPoliticians??0,date:'01/10/'+year,name:'CANDIDATURA DEMONSTRATIVA',description:'Repasses fictícios',source:'Fontes demonstrativas',origin:'Recursos de outros candidatos',kind:'receipt'}],
 expenses:[{id:'demo-e1',amount:(candidate.expenses??0)-(candidate.outgoingTransfers??0),date:'02/10/'+year,name:'FORNECEDOR DEMONSTRATIVO',description:'Serviços fictícios de campanha',source:'Demonstração',kind:'expense'},{id:'demo-e2',amount:candidate.outgoingTransfers??0,date:'02/10/'+year,name:'CANDIDATURA DEMONSTRATIVA',description:'Doações fictícias a outra candidatura',source:'Demonstração',kind:'expense',transfer:true}],
 payments:[{id:'demo-p1',amount:candidate.paidExpenses??0,date:'03/10/'+year,name:'PAGAMENTOS DEMONSTRATIVOS',description:'Pagamento fictício',source:'Demonstração',kind:'paid'}],
 transfers:[{id:'demo-t1',amount:candidate.outgoingTransfers??0,date:'02/10/'+year,name:'CANDIDATURA DEMONSTRATIVA',description:'Repasse fictício',source:'Demonstração',kind:'transfer'}],transferSource:'declared-expenses'
 });setProfileLoading(false);setFinanceLoading(false);return()=>controller.abort()}
 loadProfiles(year,controller.signal).then(data=>{if(!controller.signal.aborted)setProfile(data?.profiles[candidate.id]??null)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setProfileLoading(false)})
 loadFinancialDetails(year,candidate.id,controller.signal).then(data=>{if(!controller.signal.aborted)setFinance(data)}).catch(e=>{if(!controller.signal.aborted)setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setFinanceLoading(false)})
 return()=>controller.abort()
 },[candidate.id,year,demo,revision])
 return{profile,finance,profileLoading,financeLoading,error,retry:()=>setRevision(r=>r+1)}
}
