import fs from 'node:fs/promises'
import Papa from 'papaparse'
const year=Number(process.argv[2]??2026)
const sourceUrl='https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_orgaos_partidarios_'+year+'.zip'
let source
try { source=JSON.parse(await fs.readFile('.artifacts/party-ledger-source-'+year+'.json','utf8')) }
catch {
 const response=await fetch(sourceUrl);if(!response.ok)throw Error('TSE HTTP '+response.status)
 const {unzipSync}=await import('fflate')
 const files=unzipSync(new Uint8Array(await response.arrayBuffer()))
 await fs.mkdir('.artifacts/party-csv',{recursive:true})
 const fileNames=Object.keys(files).filter(n=>/_[A-Z]{2}\.csv$/.test(n))
 for(const name of fileNames)await fs.writeFile('.artifacts/party-csv/'+name,files[name])
 source={sourceUrl,updatedAt:response.headers.get('last-modified')??new Date().toISOString(),fileNames}
 await fs.writeFile('.artifacts/party-ledger-source-'+year+'.json',JSON.stringify(source))
}
const orgs=new Map(),payments=[]
const clean=v=>!v||String(v).startsWith('#')?'':String(v)
const n=v=>{const t=clean(v);return t?Math.round(Number(t.replaceAll('.','').replace(',','.'))*100):null}
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
function org(r){
 const id=clean(r.SQ_PRESTADOR_CONTAS);if(!id)return null
 let d=orgs.get(id);if(!d){d={id,party:clean(r.SG_PARTIDO),partyName:clean(r.NM_PARTIDO),partyNumber:Number(r.NR_PARTIDO),scope:clean(r.DS_ESFERA_PARTIDARIA),scopeCode:clean(r.CD_ESFERA_PARTIDARIA),state:clean(r.SG_UF),municipality:clean(r.NM_MUNICIPIO??r.NM_UE),receipts:null,expenses:null,paid:null,electoralFund:null,partyFund:null,individualDonations:null};orgs.set(id,d)}return d
}
function add(o,k,v){o[k]=(o[k]??0)+v}
for(const name of source.fileNames){
 if(!/_\d{4}_[A-Z]{2}\.csv$/.test(name))continue
 const kind=name.startsWith('despesas_pagas')?'paid':name.startsWith('despesas_contratadas')?'expense':name.startsWith('receitas')?'receipt':null
 if(!kind)continue
 Papa.parse(new TextDecoder('windows-1252').decode(await fs.readFile('.artifacts/party-csv/'+name)),{header:true,delimiter:';',skipEmptyLines:true,step:({data:r})=>{
 const amount=n(kind==='paid'?r.VR_PAGTO_DESPESA:kind==='expense'?r.VR_DESPESA_CONTRATADA:r.VR_RECEITA);if(amount==null||!Number.isFinite(amount))return
 if(kind==='paid'){payments.push({id:clean(r.SQ_PRESTADOR_CONTAS),amount});return}
 const d=org(r);if(!d)return
 if(kind==='expense')add(d,'expenses',amount)
 else{add(d,'receipts',amount);const s=norm(r.DS_FONTE_RECEITA),origin=norm(r.DS_ORIGEM_RECEITA);add(d,'electoralFund',/FUNDO ESPECIAL|FEFC/.test(s)?amount:0);add(d,'partyFund',s.includes('FUNDO PARTIDARIO')?amount:0);add(d,'individualDonations',s.includes('OUTROS RECURSOS')&&/PESSOAS? FISICAS?|COLETIVO/.test(origin)?amount:0)}
 }})
}
for(const p of payments){const d=orgs.get(p.id);if(d)add(d,'paid',p.amount)}
const moneyFields=['receipts','expenses','paid','electoralFund','partyFund','individualDonations']
const parties={}
for(const d of orgs.values()){for(const key of moneyFields)if(d[key]!=null)d[key]/=100;(parties[d.party]??={name:d.partyName,number:d.partyNumber,directories:[]}).directories.push(d)}
await fs.writeFile('public/data/parties-'+year+'.json',JSON.stringify({year,sourceUrl:source.sourceUrl,updatedAt:source.updatedAt,parties}))
console.log(JSON.stringify({parties:Object.keys(parties).length,directories:orgs.size,mission:parties['MISSÃO']?.directories.length}))
