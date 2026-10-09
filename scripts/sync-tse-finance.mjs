import {Unzip,UnzipInflate} from 'fflate'
import Papa from 'papaparse'
import {mkdir,writeFile} from 'node:fs/promises'
import {gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {setImmediate as tick} from 'node:timers/promises'
const year=Number(process.argv[2]??2026)
if(![2022,2026].includes(year))throw Error('Ano não suportado.')
const sourceUrl='https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_'+year+'.zip'
const candidates=new Map(),ledgers=new Map(),providers=new Map(),payments=[],businesses=new Map(),tables=[],pending=[],extractionTimes=new Set()
const clean=v=>!v||String(v).startsWith('#')?'':String(v)
const normalized=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase()
const cents=v=>{const text=clean(v).trim();if(!text)return null;const n=Number(text.includes(',')?text.replaceAll('.','').replace(',','.'):text);return Number.isFinite(n)&&n>=0?Math.round(n*100):null}
const safeDescription=v=>clean(v).replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[identificador omitido]')
function ledger(id){let d=ledgers.get(id);if(!d){d={expenses:new Map(),receipts:[],payments:[],transfers:[]};ledgers.set(id,d)}return d}
function candidate(row){
 const id=clean(row.SQ_CANDIDATO)
 if(!/^\d+$/.test(id)||Number(row.AA_ELEICAO??row.ANO_ELEICAO)!==year||![1,5,6,7,8].includes(Number(row.CD_CARGO)))return null
 let c=candidates.get(id)
 if(!c){c={id,state:row.SG_UF,party:clean(row.SG_PARTIDO),partyNumber:Number(row.NR_PARTIDO),officeCode:Number(row.CD_CARGO),expenses:null,revenue:null,electoralFund:null,donations:null,paidExpenses:null,partyFund:null,electoralFundParty:null,partyFundParty:null,receivedPoliticians:null,outgoingTransfers:null,paidOutgoingTransfers:null,financialRevenue:null,estimatedRevenue:null};candidates.set(id,c)}
 if(clean(row.SQ_PRESTADOR_CONTAS))providers.set(clean(row.SQ_PRESTADOR_CONTAS),id)
 const biz=clean(row.NR_CNPJ_PRESTADOR_CONTA).replace(/\D/g,'');if(biz.length===14)businesses.set(biz,id)
 extractionTimes.add(clean(row.DT_GERACAO)+' '+clean(row.HH_GERACAO))
 return c
}
function add(c,key,value){c[key]=(c[key]??0)+value}
const stream=new Unzip(file=>{
 const kind=/despesas_contratadas_candidatos_\d{4}_[A-Z]{2}\.csv$/.test(file.name)?'expense':/despesas_pagas_candidatos_\d{4}_[A-Z]{2}\.csv$/.test(file.name)?'paid':/receitas_candidatos_\d{4}_[A-Z]{2}\.csv$/.test(file.name)?'receipt':null
 if(!kind)return
 const stat={name:file.name,rows:0,acceptedRows:0,duplicateTransactions:0,unrecognizedValues:0,method:'Source rows preserved; a repeated SQ_DESPESA can contain multiple legitimate line items.'}
 tables.push(stat)
 let finish;pending.push(new Promise(r=>finish=r))
 const parser=Papa.parse(Papa.NODE_STREAM_INPUT,{header:true,delimiter:';',skipEmptyLines:true,transformHeader:h=>h.replace(/^\uFEFF/,'').trim()})
 parser.on('error',e=>{throw e});parser.on('end',()=>{finish();console.log(file.name+': '+stat.acceptedRows+' linhas')})
 const decoder=new TextDecoder('windows-1252')
 parser.on('data',row=>{
 stat.rows++
 const value=cents(kind==='expense'?row.VR_DESPESA_CONTRATADA:kind==='paid'?row.VR_PAGTO_DESPESA:row.VR_RECEITA)
 if(value==null){stat.unrecognizedValues++;return}
 const provider=clean(row.SQ_PRESTADOR_CONTAS),expenseId=clean(row.SQ_DESPESA)
 const recordId=file.name+':'+stat.rows
 const date=clean(kind==='expense'?row.DT_DESPESA:kind==='paid'?row.DT_PAGTO_DESPESA:row.DT_RECEITA)
 const category=clean(row.DS_ORIGEM_DESPESA??row.DS_ORIGEM_RECEITA)||'Tipo não informado'
 const description=safeDescription(row.DS_DESPESA??row.DS_RECEITA)
 const documentType=clean(row.DS_TIPO_DOCUMENTO),documentNumber=clean(row.NR_DOCUMENTO??row.NR_DOCUMENTO_DOACAO)
 const transfer=/DOACOES|TRANSFERENCIAS/.test(normalized(category))&&/CANDIDAT|PARTID/.test(normalized(category))
 const base={id:recordId,amount:value/100,date,description,category,categoryCode:clean(row.CD_ORIGEM_DESPESA??row.CD_ORIGEM_RECEITA),documentType,documentNumber,providerId:provider,expenseId,nature:clean(row.DS_NATUREZA_RECEITA??row.DS_NATUREZA_DESPESA),statementDate:clean(row.DT_PRESTACAO_CONTAS),statementType:clean(row.TP_PRESTACAO_CONTAS),kind,transfer}
 if(kind==='paid'){
 payments.push({...base,name:'',source:clean(row.DS_FONTE_DESPESA),parcelId:clean(row.SQ_PARCELAMENTO_DESPESA),amountCents:value,table:stat});return
 }
 const c=candidate(row);if(!c)return
 stat.acceptedRows++
 const d=ledger(c.id)
 if(kind==='expense'){
 add(c,'expenses',value);add(c,'outgoingTransfers',transfer?value:0)
 const expenseKey=provider+':'+(expenseId||recordId)
 let expense=d.expenses.get(expenseKey)
 if(!expense){expense={...base,id:expenseKey,name:clean(row.NM_FORNECEDOR),source:'',amount:0,description:'',items:[],payments:[],categories:[]};d.expenses.set(expenseKey,expense)}
 expense.amount=Math.round((expense.amount*100+value))/100
 expense.items.push({...base,name:clean(row.NM_FORNECEDOR),source:''})
 if(!expense.categories.includes(category))expense.categories.push(category)
 expense.category=expense.categories.length===1?expense.categories[0]:'Itens de diferentes tipos'
 expense.description=expense.items.length===1?description:expense.items.length+' itens declarados (ver descrições)'
 expense.transfer=expense.items.some(i=>i.transfer)
 }else{
 add(c,'revenue',value)
 const source=normalized(row.DS_FONTE_RECEITA),origin=normalized(row.DS_ORIGEM_RECEITA)
 const fefc=/FUNDO ESPECIAL|FEFC|FUNDO ELEITORAL/.test(source),fp=/FUNDO PARTIDARIO/.test(source),party=/PARTIDO/.test(origin)&&!/CANDIDAT/.test(origin),other=/OUTROS CANDIDATOS/.test(origin),individual=/OUTROS RECURSOS/.test(source)&&/PESSOAS? FISICAS?|FINANCIAMENTO COLETIVO/.test(origin)&&!/PROPRIOS/.test(origin)
 for(const[key,yes]of Object.entries({electoralFund:fefc,partyFund:fp,electoralFundParty:fefc&&party,partyFundParty:fp&&party,receivedPoliticians:other,donations:individual}))add(c,key,yes?value:0)
 const nature=normalized(row.DS_NATUREZA_RECEITA)
 if(nature.includes('ESTIM'))add(c,'estimatedRevenue',value);else if(nature.includes('FINANC'))add(c,'financialRevenue',value)
 d.receipts.push({...base,receiptId:clean(row.SQ_RECEITA),name:clean(row.NM_DOADOR),source:clean(row.DS_FONTE_RECEITA),origin:clean(row.DS_ORIGEM_RECEITA),donorId:other?clean(row.SQ_CANDIDATO_DOADOR):undefined,donorBusiness:other?clean(row.NR_CPF_CNPJ_DOADOR).replace(/\D/g,''):undefined})
 }
 })
 file.ondata=(error,chunk,final)=>{if(error)throw error;parser.write(decoder.decode(chunk,{stream:!final}));if(final)parser.end()}
 file.start()
})
stream.register(UnzipInflate)
const response=await fetch(sourceUrl);if(!response.ok)throw Error('TSE HTTP '+response.status)
const hash=createHash('sha256');let downloaded=0,last=0
for await(const chunk of response.body){hash.update(chunk);stream.push(chunk,false);downloaded+=chunk.length;if(Date.now()-last>5000){last=Date.now();console.log((downloaded/1048576).toFixed(1)+' MB, '+candidates.size+' candidaturas')}await tick()}
stream.push(new Uint8Array(),true);await Promise.all(pending)
let unmatchedPayments=0
for(const payment of payments){
 const id=providers.get(payment.providerId);if(!id){unmatchedPayments++;continue}
 const c=candidates.get(id),d=ledger(id),expense=d.expenses.get(payment.providerId+':'+payment.expenseId)
 add(c,'paidExpenses',payment.amountCents);add(c,'paidOutgoingTransfers',payment.transfer?payment.amountCents:0)
 payment.name=expense?.name??'Fornecedor não identificado nesta tabela'
 const {amountCents,table,...entry}=payment
 entry.expenseKey=expense?.id??null;entry.linked=!!expense
 d.payments.push(entry);if(expense)expense.payments.push(entry)
 table.acceptedRows++
}
const profileFile=JSON.parse(await(await import('node:fs/promises')).readFile('public/data/profiles-'+year+'.json','utf8').catch(()=>'{"profiles":{}}'))
for(const[recipient,d]of ledgers)for(const receipt of d.receipts){
 const sender=receipt.donorId&&candidates.has(receipt.donorId)?receipt.donorId:businesses.get(receipt.donorBusiness)
 if(sender)ledger(sender).transfers.push({...receipt,name:profileFile.profiles?.[recipient]?.name??'Candidatura '+recipient,counterpartyId:recipient,kind:'transfer'})
 delete receipt.donorId;delete receipt.donorBusiness
}
const list=[...candidates.values()].map(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,typeof v==='number'&&!['officeCode','partyNumber'].includes(k)?v/100:v]))).sort((a,b)=>a.id.localeCompare(b.id))
const now=new Date().toISOString(),updatedAt=response.headers.get('last-modified')??now,shards=new Map()
for(const[id,d]of ledgers){
 const shard=String(Number(id.slice(-2))).padStart(2,'0')
 let bucket=shards.get(shard);if(!bucket){bucket={schemaVersion:2,year,sourceUrl,updatedAt,candidates:{}};shards.set(shard,bucket)}
 const expenseList=[...d.expenses.values()]
 const reported=expenseList.flatMap(e=>e.items.filter(i=>i.transfer).map(i=>({...i,expenseKey:e.id,kind:'transfer'})))
 bucket.candidates[id]={receipts:d.receipts,expenses:expenseList,payments:d.payments,transfers:reported.length?reported:d.transfers,transferSource:reported.length?'declared-expenses':'recipient-receipts'}
}
await mkdir('public/data/details-'+year,{recursive:true})
for(const[shard,bucket]of shards)await writeFile('public/data/details-'+year+'/'+shard+'.json.gz',gzipSync(JSON.stringify(bucket),{level:6}))
const snapshot={schemaVersion:1,detailSchemaVersion:2,year,generatedAt:now,sourceUrl,sourcePage:'https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-'+year,sourceLastModified:updatedAt,sourceSha256:hash.digest('hex'),extractionTimes:[...extractionTimes],counts:{candidates:list.length,expenses:list.filter(c=>c.expenses!==null).length,revenue:list.filter(c=>c.revenue!==null).length},tables,unmatchedPayments,methodology:{expenses:'SUM of every contracted-expense source line, grouped by SQ_PRESTADOR_CONTAS + SQ_DESPESA with all line items retained. Repeated identifiers do not imply duplicate items.',revenue:'Every source receipt line retained; national BRASIL mirror files excluded.',paidExpenses:'Every payment source line retained and attributed through SQ_PRESTADOR_CONTAS, then linked to its expense identifier. Unlinked payments remain visible.',donations:'Explicit private-source people/crowdfunding only.',unknown:'Missing fields stay unknown. Contracted and paid amounts are independent measures.'},candidates:list}
await writeFile('public/data/finance-'+year+'.json',JSON.stringify(snapshot)+'\n')
console.log(JSON.stringify({candidates:list.length,shards:shards.size,unmatchedPayments,kim:list.find(c=>c.id==='250002546642')}))
