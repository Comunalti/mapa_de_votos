import fs from 'node:fs/promises'
import {unzipSync} from 'fflate'
import Papa from 'papaparse'
const year=Number(process.argv[2]??2026),base='https://cdn.tse.jus.br/estatistica/sead/odsele'
const profiles={},sourceUrls=[]
const clean=v=>!v||String(v).startsWith('#')?'':v
async function rows(prefix,onRow){
 const url=base+'/'+prefix+'/'+prefix+'_'+year+'.zip'
 const r=await fetch(url);if(!r.ok)throw Error(prefix+' HTTP '+r.status)
 sourceUrls.push(url)
 const files=unzipSync(new Uint8Array(await r.arrayBuffer()),{filter:e=>e.name.startsWith(prefix+'_'+year+'_')&&e.name.endsWith('.csv')&&!e.name.includes('_BRASIL.csv')})
 for(const[name,bytes]of Object.entries(files)){
 Papa.parse(new TextDecoder('windows-1252').decode(bytes),{header:true,delimiter:';',skipEmptyLines:true,step:({data})=>onRow(data)})
 console.log(prefix,name)
 }
 return r.headers.get('last-modified')??new Date().toISOString()
}
const updatedAt=await rows('consulta_cand',r=>{
 const id=r.SQ_CANDIDATO
 if(!id||![1,5,6,7,8].includes(Number(r.CD_CARGO)))return
 profiles[id]={id,name:clean(r.NM_URNA_CANDIDATO),fullName:clean(r.NM_CANDIDATO),number:clean(r.NR_CANDIDATO),party:clean(r.SG_PARTIDO),state:clean(r.SG_UF),officeCode:Number(r.CD_CARGO),reelection:null,registration:clean(r.DS_SITUACAO_CANDIDATURA),coalition:clean(r.NM_COLIGACAO),occupation:clean(r.DS_OCUPACAO),education:clean(r.DS_GRAU_INSTRUCAO),wealth:null,assets:[],history:[]}
})
const flags=new Set()
try{await rows('consulta_cand_complementar',r=>{
 const p=profiles[r.SQ_CANDIDATO];if(!p)return
 flags.add(r.ST_REELEICAO)
 p.reelection=r.ST_REELEICAO==='S'?true:r.ST_REELEICAO==='N'?false:null
 p.registration=clean(r.DS_SITUACAO_CANDIDATO_TOT)||p.registration
});console.log('Reelection flags:',[...flags])}catch(e){console.log('Complementary profile:',e.message)}
const seen=new Set()
try{await rows('bem_candidato',r=>{
 const p=profiles[r.SQ_CANDIDATO];if(!p)return
 const key=p.id+':'+r.NR_ORDEM_BEM_CANDIDATO
 const amount=Number(String(r.VR_BEM_CANDIDATO??'').replaceAll('.','').replace(',','.'))
 if(Number.isFinite(amount)&&amount>=0&&!seen.has(key)){seen.add(key);p.wealth=(p.wealth??0)+amount;
 const type=clean(r.DS_TIPO_BEM_CANDIDATO);
 let description=clean(r.DS_BEM_CANDIDATO).replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,'[identificador omitido]');
 if(/RUA|AVENIDA|ALAMEDA|RODOVIA|ENDERE[CÇ]O|LOGRADOURO|CEP|RESIDENTE/i.test(description))description='Descrição com dados de endereço omitidos';
 description=description.replace(/(?:AG[EÊ]NCIA|CONTA|C\/C)[\s\w.\/-]*\d[\s\w.\/-]*/gi,'[identificação financeira omitida]');
 p.assets.push({id:String(r.NR_ORDEM_BEM_CANDIDATO),type,description,amount,updatedAt:clean(r.DT_ULT_ATUAL_BEM_CANDIDATO)});
}
})}catch(e){console.log('Patrimônio:',e.message)}
try{await rows('historico_candidatura',r=>{
 const p=profiles[r.SQ_CANDIDATO_ATUAL];if(!p)return;
 p.history.push({year:Number(r.ANO_ELEICAO),round:Number(r.NR_TURNO),office:clean(r.DS_CARGO),officeCode:Number(r.CD_CARGO),state:clean(r.SG_UF),territory:clean(r.NM_UE),party:clean(r.SG_PARTIDO),partyName:clean(r.NM_PARTIDO),number:clean(r.NR_CANDIDATO),candidateId:clean(r.SQ_CANDIDATO),result:clean(r.DS_SIT_TOT_TURNO),registration:clean(r.DS_SITUACAO_CANDIDATURA),votes:null});
 })}catch(e){console.log('Histórico:',e.message)}
 for(const p of Object.values(profiles)){p.wealth=p.wealth==null?null:Math.round(p.wealth*100)/100;p.history.sort((a,b)=>b.year-a.year||b.round-a.round)}
await fs.mkdir('public/data',{recursive:true})
await fs.writeFile('public/data/profiles-'+year+'.json',JSON.stringify({year,sourceUrl:sourceUrls[0],sourceUrls,updatedAt,profiles}))
console.log('COMPLETE',Object.keys(profiles).length,'reelection:true',Object.values(profiles).filter(p=>p.reelection===true).length)
