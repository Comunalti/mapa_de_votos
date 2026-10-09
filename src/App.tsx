import MapFilters from './components/MapFilters'
import CandidateAvatar from './components/CandidateAvatar'
import {DEFAULT_ATLAS_FILTERS,matchesAtlasFilters} from './lib/atlasFilters'
import type {ReactNode,CSSProperties} from 'react'
import {useMunicipalitySummaries} from './hooks/useMunicipalitySummaries'
import Tutorial from './components/Tutorial'
import {DEFAULT_CALCULATION,BASIS_LABELS,calculationBase,comparisonAmount,comparisonRate,summarizeConfigured} from './lib/calculations'
import type {CalculationOptions} from './lib/calculations'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowDownUp, ArrowLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, CircleHelp, Coins, Database, Download, Globe2, Layers3, LoaderCircle, MapPin, RefreshCw, Search, SlidersHorizontal, Sparkles, Users, Wallet, X, Settings2, BookOpen, Minus, PanelRightOpen, PanelRightClose, Maximize2 } from 'lucide-react'
import type { Candidate, ElectionQuery, ElectoralZone, Municipality, Office, RegionId } from './types'
import { useElectionData } from './hooks/useElectionData'
import { STATES, REGIONS } from './data/geography'
import { loadMunicipalities, loadZones } from './data/territories'
import { compact, compactMoney, integer, money, normalize } from './lib/format'
import { campaignVotes } from './lib/metrics'
import type { Summary } from './lib/metrics'
import InfoPanels from './components/InfoPanels'
import type { Popup } from './components/InfoPanels'
import { stamp, statusNames, statusLabel, sumKnown } from './lib/ui'

const BrazilMap = lazy(() => import('./components/BrazilMap'))
const offices: {id:Office;name:string;short:string}[] = [
  {id:'presidente',name:'Presidente',short:'Presidente'}, {id:'senador',name:'Senador',short:'Senador'},
  {id:'deputado-federal',name:'Deputado federal',short:'Dep. federal'}, {id:'deputado-estadual',name:'Deputado estadual',short:'Dep. estadual'},
]
type Sort='votes'|'expenses'|'cost'|'fund'|'donations'|'estimate'|'name'
function exportCsv(candidates:Candidate[],query:ElectionQuery,source:string,calculation:CalculationOptions) {
  const rows=[
    ['Base do cálculo','Rateio','Média','Ano','Turno','Fonte votos','Municipio IBGE','Municipio TSE','Zona','Candidato','Número','Partido','UF','Cargo','Votos no recorte','Votos totais campanha','Despesas totais declaradas BRL','Receitas totais BRL','FEFC BRL','Doações privadas BRL','Taxa da campanha BRL/voto','Estimativa no recorte BRL','Fonte financeira','Data financeira','Situação'],
    ...candidates.map(c=>[BASIS_LABELS[calculation.basis],calculation.allocation,calculation.average,query.year,query.round,source,query.municipality??'',query.municipalityCode??'',query.zone??'',c.name,c.number,c.party,c.state,c.office,c.votes??'',campaignVotes(c)??'',c.expenses??'',c.revenue??'',c.electoralFund??'',c.donations??'',comparisonRate(c,calculation)??'',comparisonAmount(c,calculation)??'',c.financeSource??'',c.financeUpdatedAt??'',statusNames[c.status]]),
  ]
  const safe=(value:unknown)=>{const raw=String(value);return '"'+(/^[=+\-@]/.test(raw)?"'"+raw:raw).replaceAll('"','""')+'"'}
  const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(safe).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}))
  const link=document.createElement('a');link.href=url;link.download='voto-atlas-'+query.year+'-'+query.office+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function StatValue({loading,children}:{loading:boolean;children:ReactNode}){return <strong>{loading?<span className="stat-loading"><LoaderCircle className="spin" size={12}/>Consultando…</span>:children}</strong>}

export default function App() {
  const [query,setQuery]=useState<ElectionQuery>({year:2026,round:1,office:'deputado-federal',region:null,state:null,municipality:null,municipalityCode:null,zone:null})
  const data=useElectionData(query)
  const [calculation,setCalculation]=useState<CalculationOptions>(()=>{try{const saved=JSON.parse(localStorage.getItem('voto-atlas:calculation')??'null');if(saved&&['contracted','paid','public-funds','revenue'].includes(saved.basis)&&['proportional','whole'].includes(saved.allocation)&&['weighted','simple'].includes(saved.average))return{...DEFAULT_CALCULATION,...saved}}catch{}return DEFAULT_CALCULATION})
  const [tutorialOpen,setTutorialOpen]=useState(()=>{try{return localStorage.getItem('voto-atlas:hide-tutorial')!=='1'}catch{return true}})
  useEffect(()=>{try{localStorage.setItem('voto-atlas:calculation',JSON.stringify(calculation))}catch{}},[calculation])

  const [atlasFilters,setAtlasFilters]=useState(DEFAULT_ATLAS_FILTERS)
  const [rankingMinimized,setRankingMinimized]=useState(false),[statsMinimized,setStatsMinimized]=useState(false),[controlsMinimized,setControlsMinimized]=useState(false)
  const [smallScreen,setSmallScreen]=useState(()=>window.innerWidth<=740)
  useEffect(()=>{const media=window.matchMedia('(max-width:740px)');const change=()=>setSmallScreen(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
  const [search,setSearch]=useState(''),[party,setParty]=useState('all'),[status,setStatus]=useState('all')
  const [sort,setSort]=useState<Sort>('votes'),[ascending,setAscending]=useState(false),[visibleLimit,setVisibleLimit]=useState(60)
  const [metric,setMetric]=useState<'cost'|'efficiency'|'spending'|'votes'>('cost'),[resetKey,setResetKey]=useState(0)
  const [popup,setPopup]=useState<Popup>(null),[selected,setSelected]=useState<Candidate|null>(null)
  const [notice,setNotice]=useState(''),[importing,setImporting]=useState(false),[mobilePane,setMobilePane]=useState<'map'|'list'>('map')
  const [municipalities,setMunicipalities]=useState<Municipality[]>([]),[zones,setZones]=useState<ElectoralZone[]>([])
  const [territoryLoading,setTerritoryLoading]=useState(false),[territoryError,setTerritoryError]=useState('')
  const mapToolbar=useRef<HTMLDivElement>(null),[dockHeight,setDockHeight]=useState(180)
  useEffect(()=>{const el=mapToolbar.current;if(!el)return;const measure=()=>{const rect=el.getBoundingClientRect();if(rect.height>0)setDockHeight(Math.max(90,Math.round(window.innerHeight-rect.top+12)))};const observer=new ResizeObserver(measure);observer.observe(el);window.addEventListener('resize',measure);measure();return()=>{observer.disconnect();window.removeEventListener('resize',measure)}},[controlsMinimized,smallScreen])
  const fileInput=useRef<HTMLInputElement>(null)
  const source=String(data.source),demo=source==='demo',imported=source==='import'
  const scoped=Boolean(query.municipality||query.zone||(query.office==='presidente'&&(query.region||query.state)))
  const regionName=REGIONS.find(r=>r.id===query.region)?.name
  const municipality=municipalities.find(m=>m.id===query.municipality)
  const territory=query.zone?(municipality?.name??'Município')+' · Zona '+query.zone:municipality?.name??STATES.find(s=>s.uf===query.state)?.name??regionName??'Brasil'
  const level=query.municipality?'zona':query.state?'município':query.region?'estado':'região'
  const candidates=data.candidates

  useEffect(()=>{setSearch('');setParty('all');setStatus('all');setSelected(null)},[query.year,query.round,query.office,query.region,query.state,query.municipality,query.zone])
  useEffect(()=>{
    setMunicipalities([]);setZones([]);setTerritoryError('')
    if(!query.state)return
    const controller=new AbortController();setTerritoryLoading(true)
    loadMunicipalities(query.state,controller.signal).then(setMunicipalities).catch(error=>{if(!controller.signal.aborted)setTerritoryError(error instanceof Error?error.message:'Municípios indisponíveis.')}).finally(()=>{if(!controller.signal.aborted)setTerritoryLoading(false)})
    return()=>controller.abort()
  },[query.state])
  useEffect(()=>{
    setZones([])
    if(!query.state||!query.municipalityCode)return
    const controller=new AbortController();setTerritoryLoading(true)
    loadZones(query.year,query.state,query.municipalityCode,controller.signal).then(setZones).catch(error=>{if(!controller.signal.aborted)setTerritoryError(error instanceof Error?error.message:'Zonas indisponíveis.')}).finally(()=>{if(!controller.signal.aborted)setTerritoryLoading(false)})
    return()=>controller.abort()
  },[query.year,query.state,query.municipalityCode])
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),6000);return()=>clearTimeout(timer)},[notice])
  const closeModal=()=>{setPopup(null);setSelected(null)}
  const parties=useMemo(()=>[...new Set(candidates.map(c=>c.party))].sort(),[candidates])
  const filtered=useMemo(()=>{
    const items=candidates.filter(c=>matchesAtlasFilters(c,atlasFilters,calculation)&&(!search||normalize(c.name+' '+c.party+' '+c.number).includes(normalize(search)))&&(party==='all'||party===c.party)&&(status==='all'||(status==='reelected'?c.status==='eleito'&&c.reelection===true:status===c.status)))
    const value=(c:Candidate)=>sort==='votes'?c.votes:sort==='expenses'?c.expenses:sort==='fund'?c.electoralFund:sort==='donations'?c.donations:sort==='estimate'?comparisonAmount(c,calculation):comparisonRate(c,calculation)
    return items.sort((a,b)=>{
      if(sort==='name')return(ascending?1:-1)*a.name.localeCompare(b.name,'pt-BR')
      const first=value(a),second=value(b)
      if(first==null)return second==null?a.name.localeCompare(b.name):1
      if(second==null)return -1
      return(ascending?1:-1)*(first-second)||a.name.localeCompare(b.name)
    })
  },[candidates,search,party,status,sort,ascending,calculation,atlasFilters])
  useEffect(()=>{setVisibleLimit(60)},[filtered])
  const total=summarizeConfigured(filtered,calculation),financialCount=filtered.filter(c=>c.expenses!=null).length
  const financeDate=filtered.find(c=>c.financeUpdatedAt)?.financeUpdatedAt
  const snapshots=filtered.some(c=>c.financeSnapshot)
  const activeFilterCount=(party==='all'?0:1)+(status==='all'?0:1)+(atlasFilters.minVotes?1:0)+(atlasFilters.maxCost?1:0)+(atlasFilters.coverage!=='all'?1:0)+(atlasFilters.publicOnly?1:0)
  const summaries=useMemo(()=>Object.fromEntries(REGIONS.map(region=>{
    const states=STATES.filter(s=>s.region===region.id).map(s=>s.uf)
    const items=query.office==='presidente'?filtered.map(c=>{
      const values=states.map(uf=>c.votesByState?.[uf])
      const votes=values.every(v=>v!=null)?values.reduce<number>((sum,v)=>sum+(v??0),0):null
      const full=campaignVotes(c)
      return{...c,votes,estimatedExpenses:c.expenses!=null&&votes!=null&&full!=null&&full>0?c.expenses*votes/full:null}
    }):filtered.filter(c=>states.includes(c.state))
    return[region.id,summarizeConfigured(items,calculation)]
  })) as Record<RegionId,Summary>,[filtered,query.office,calculation])

  function regionChange(region:RegionId|null){setQuery(q=>({...q,region,state:null,municipality:null,municipalityCode:null,zone:null}))}
  function stateChange(uf:string|null){setQuery(q=>({...q,state:uf,region:uf?STATES.find(s=>s.uf===uf)?.region??q.region:q.region,municipality:null,municipalityCode:null,zone:null}))}
  function municipalityChange(id:string|null){
    const item=municipalities.find(m=>m.id===id)
    setQuery(q=>({...q,municipality:id,municipalityCode:item?.tseCode??null,zone:null}))
    if(id&&!item?.tseCode)setNotice('O TSE não disponibilizou código eleitoral para este município. A malha permanece explorável.')
  }
  function zoneChange(zone:number|null){setQuery(q=>({...q,zone}))}
  const municipalityMetrics=useMunicipalitySummaries(query,municipalities,filtered,calculation,source,data.getImportedCandidatesFor)
  const stateSummaries=useMemo(()=>Object.fromEntries(STATES.map(state=>{
    const rows=query.office==='presidente'?filtered.map(c=>({...c,votes:c.votesByState?.[state.uf]??null})):filtered.filter(c=>c.state===state.uf).map(c=>({...c,votes:campaignVotes(c)}))
    return[state.uf,summarizeConfigured(rows,calculation)]
  })),[filtered,query.office,calculation])
  const currentScope:Record<string,Summary>=query.zone?{['zone:'+query.zone]:total}:query.municipality?{[query.municipality]:total}:{}
  const territorySummaries:Record<string,Summary>={...stateSummaries,...municipalityMetrics.summaries,...currentScope}

  const reset=()=>{setQuery(q=>({...q,region:null,state:null,municipality:null,municipalityCode:null,zone:null}));setResetKey(k=>k+1)}
  const parent=()=>{if(query.zone)zoneChange(null);else if(query.municipality)municipalityChange(null);else if(query.state)stateChange(null);else regionChange(null)}
  async function importFiles(files:FileList|null){
    if(!files?.length)return
    setImporting(true)
    try{await data.importFiles(Array.from(files));setPopup(null);setNotice('Dados importados. O recorte e os totais da campanha aparecem separadamente.')}
    catch(error){setNotice(error instanceof Error?error.message:'Arquivo não processado.')}
    finally{setImporting(false);if(fileInput.current)fileInput.current.value=''}
  }

  return <div style={{'--map-dock-height':dockHeight+'px'} as CSSProperties} className={'app-shell immersive-atlas mobile-'+mobilePane+(rankingMinimized?' ranking-minimized':'')+(statsMinimized?' stats-minimized':'')+(controlsMinimized?' controls-minimized':'')}>
    {tutorialOpen&&<Tutorial onClose={()=>setTutorialOpen(false)}/>}
    <header className="topbar">
      <a href="#" className="brand" aria-label="Voto Atlas início" onClick={event=>{event.preventDefault();reset()}}><span className="brand-mark"><span/><span/><span/></span><span>voto<span className="brand-atlas">atlas</span><i/></span></a>
      <div className="header-title"><span>ELEIÇÕES {query.year}</span><h1>O dinheiro por trás do voto.</h1></div>
      <div className="header-actions"><button className="help-button panel-toggle" aria-label={rankingMinimized?"Mostrar candidatos":"Minimizar candidatos"} onClick={()=>setRankingMinimized(v=>!v)}>{rankingMinimized?<PanelRightOpen size={17}/>:<PanelRightClose size={17}/>}<span>Candidatos</span></button><button className="help-button" onClick={()=>setTutorialOpen(true)} aria-label="Ver tutorial" title="Tutorial"><BookOpen size={17}/></button><button className="help-button" onClick={()=>setPopup('method')} aria-label="Como calculamos" title="Como calculamos"><CircleHelp size={17}/><span>Metodologia</span></button><button className="source-button" onClick={()=>setPopup('sources')}><Database size={15}/><span>Fontes & dados</span><ArrowUpRight size={13}/></button></div>
    </header>
    <main>
      <section className="filter-bar" aria-label="Filtros eleitorais">
        <div className="office-tabs" role="group" aria-label="Cargo">{offices.map(office=><button key={office.id} className={query.office===office.id?'active':''} aria-pressed={query.office===office.id} onClick={()=>setQuery(q=>({...q,office:office.id,round:1}))}>{office.short}</button>)}</div>
        <div className="election-selects"><label className="select-wrap"><span>Ano</span><select value={query.year} aria-label="Ano da eleição" onChange={event=>setQuery(q=>({...q,year:Number(event.target.value)}))}><option value={2026}>2026</option><option value={2022}>2022</option></select><ChevronDown size={12}/></label><label className="select-wrap"><select value={query.round} disabled={query.office!=='presidente'} aria-label="Turno" onChange={event=>setQuery(q=>({...q,round:Number(event.target.value) as 1|2}))}><option value={1}>1º turno</option><option value={2}>2º turno</option></select><ChevronDown size={12}/></label><button className="territory-button" onClick={()=>setPopup('territory')}><MapPin size={14}/><span>{territory}</span><ChevronDown size={12}/></button></div>
      </section>
      <section className={'data-banner '+(demo?'demo-banner':'')} aria-live="polite">
        <span className={'connection-dot '+(data.loading?'loading-dot':'')}/><b>{demo?'Modo demonstração · dados fictícios':imported?'Arquivos oficiais importados':data.loading?'Consultando o TSE':candidates.length?data.error?'TSE · cobertura parcial':'Dados oficiais · TSE':'Conexão com o TSE indisponível'}</b>
        <button className="finance-coverage" onClick={()=>setPopup('sources')}>{demo?'Interface demonstrativa':data.loading?data.progress:financialCount?financialCount+' campanhas com despesas'+(financeDate?' · '+stamp(financeDate):''):'Contas não disponíveis neste recorte'}{snapshots&&<span>ARQUIVO OFICIAL</span>}</button>
        <button className="refresh-button" disabled={data.loading||importing} onClick={()=>data.reload()} title="Atualizar votos e reler o arquivo financeiro incluído"><RefreshCw size={12} className={data.loading?'spin':''}/><span>Atualizar TSE</span></button>
      </section>
      <div className="workspace">
        <section className="atlas-panel" aria-label="Atlas do Brasil">
          <div className="atlas-heading"><div className="breadcrumb"><button onClick={reset} aria-label="Voltar ao Brasil"><Globe2 size={13}/><span>Brasil</span></button>{query.region&&<><ChevronRight size={11}/><button onClick={()=>regionChange(query.region)}>{regionName}</button></>}{query.state&&<><ChevronRight size={11}/><button onClick={()=>stateChange(query.state)}>{query.state}</button></>}{query.municipality&&<><ChevronRight size={11}/><button onClick={()=>municipalityChange(query.municipality??null)}>{municipality?.name??query.municipality}</button></>}{query.zone&&<><ChevronRight size={11}/><span>Zona {query.zone}</span></>}</div><button className="panel-minimize" aria-label={statsMinimized?"Mostrar indicadores":"Minimizar indicadores"} onClick={()=>setStatsMinimized(v=>!v)}>{statsMinimized?<Maximize2 size={13}/>:<Minus size={13}/>}<span>{statsMinimized?"Mostrar indicadores":"Indicadores"}</span></button><button className="map-mode" onClick={()=>setPopup('territory')}><Layers3 size={12}/><span>{query.zone?'ZONA ELEITORAL':'EXPLORAR '+level.toUpperCase()}</span></button></div>
          <div className="stats-grid">
            <button className="stat" onClick={()=>setPopup('method')}><span><Users size={12}/>{scoped?'Votos na área':'Votos registrados'}</span><StatValue loading={data.loading}>{data.loading?<span className="stat-loading"><LoaderCircle className="spin" size={12}/>Consultando…</span>:compact(sumKnown(filtered,'votes'))}</StatValue><small>{total.voteCount} candidaturas com votos</small></button>
            <button className="stat" onClick={()=>setPopup('method')}><span><Wallet size={12}/>{scoped?(calculation.allocation==='proportional'?'Base estimada na área':'Base integral'):BASIS_LABELS[calculation.basis]}</span><StatValue loading={data.loading}>{compactMoney(filtered.some(c=>calculationBase(c,calculation)!=null)?(scoped?total.expenses:filtered.reduce((sum,c)=>sum+(calculationBase(c,calculation)??0),0)):null)}</StatValue><small>{scoped?'Campanhas: '+compactMoney(sumKnown(filtered,'expenses')):financialCount+' campanhas com despesas'}</small></button>
            <button className="stat featured-stat" onClick={()=>setPopup('method')}><span><ArrowDownUp size={12}/>{calculation.basis==='revenue'||calculation.basis==='public-funds'?'Recursos por voto':'Custo por voto'}</span><StatValue loading={data.loading}>{data.loading?<span className="stat-loading"><LoaderCircle className="spin" size={12}/>Consultando…</span>:money(total.costPerVote)}</StatValue><small>{scoped?(calculation.allocation==='proportional'?'Rateio local · ':'Base integral · ')+(calculation.average==='weighted'?'ponderado':'média simples'):total.count+' candidaturas comparadas'}</small></button>
            <button className="stat" onClick={()=>setPopup('sources')}><span><Database size={12}/>Fundo eleitoral</span><StatValue loading={data.loading}>{compactMoney(sumKnown(filtered,'electoralFund'))}</StatValue><small>FEFC · totais das campanhas</small></button>
            <button className="stat" onClick={()=>setPopup('sources')}><span><Coins size={12}/>Doações recebidas</span><StatValue loading={data.loading}>{compactMoney(sumKnown(filtered,'donations'))}</StatValue><small>Pessoas físicas e financiamento coletivo</small></button>
          </div>
          <div className="map-stage">
            <div className="map-corner"><span>{territory.toUpperCase()}</span><small>{query.zone?'Zona selecionada. Volte um nível para explorar.':'Passe o mouse para prévia. Clique para selecionar '+(level==='região'?'uma região':level==='estado'?'um estado':level==='município'?'um município':'uma zona')+'.'}</small></div>
            {query.state&&<div className="map-data-progress" role="status">{municipalityMetrics.loading?<><LoaderCircle className="spin" size={12}/>{municipalityMetrics.progress}</>:municipalityMetrics.error?<><CircleHelp size={12}/>{municipalityMetrics.error}</>:<>{Object.keys(municipalityMetrics.summaries).length} médias municipais calculadas</>}</div>}
            <Suspense fallback={<div className="map-loading"><LoaderCircle className="spin" size={22}/><span>Preparando o atlas...</span></div>}><BrazilMap region={query.region} state={query.state} municipality={query.municipality??null} zone={query.zone??null} municipalities={municipalities} zones={zones} onRegionChange={regionChange} onStateChange={stateChange} onMunicipalityChange={municipalityChange} onZoneChange={zoneChange} financialLabel={BASIS_LABELS[calculation.basis]} summaries={summaries} territorySummaries={territorySummaries} summariesLoading={data.loading||municipalityMetrics.loading} metric={metric} viewportInsetRight={!smallScreen&&!rankingMinimized?360:0} viewportInsetBottom={dockHeight} resetKey={resetKey}/></Suspense>
            <div className="map-bottom"><div className="map-legend"><span/><small>Territórios</small><i/><span className="dark"/><small>Área selecionada</small></div><div className="map-navigation">{query.region&&<button onClick={parent}><ArrowLeft size={12}/>Voltar um nível</button>}<button onClick={reset}><Globe2 size={12}/>Brasil</button></div></div>
          </div>
          <div ref={mapToolbar} className="map-toolbar"><div className="map-toolbar-top"><div className="metric-tabs" role="group" aria-label="Métrica do mapa"><span>EXIBIR</span><button className={metric==='votes'?'active':''} aria-pressed={metric==='votes'} onClick={()=>setMetric('votes')}>Votos</button><button className={metric==='cost'?'active':''} aria-pressed={metric==='cost'} onClick={()=>setMetric('cost')}>R$ / voto</button><button className={metric==='efficiency'?'active':''} aria-pressed={metric==='efficiency'} onClick={()=>setMetric('efficiency')}>Votos / R$</button><button className={metric==='spending'?'active':''} aria-pressed={metric==='spending'} onClick={()=>setMetric('spending')}>Base financeira</button></div><button className="scope-note" onClick={()=>setPopup('method')}><CircleHelp size={12}/><span>{BASIS_LABELS[calculation.basis]+' · '+(calculation.average==='weighted'?'média ponderada':'média simples')}</span></button><button className="panel-minimize" aria-label={controlsMinimized?'Mostrar filtros do mapa':'Minimizar filtros do mapa'} onClick={()=>setControlsMinimized(v=>!v)}>{controlsMinimized?<Maximize2 size={13}/>:<Minus size={13}/>}</button></div><MapFilters value={atlasFilters} onChange={setAtlasFilters} party={party} onParty={setParty} parties={parties} status={status} onStatus={setStatus}/></div>
          {!query.region&&<div className="region-strip" aria-label="Selecionar região">{REGIONS.map((region,index)=><button key={region.id} onClick={()=>regionChange(region.id)}><span>0{index+1}</span><b>{region.name}</b><small>{metric==='votes'?compact(summaries[region.id].votes):metric==='cost'?money(summaries[region.id].costPerVote):metric==='efficiency'?summaries[region.id].votesPerReal==null?'—':summaries[region.id].votesPerReal!.toFixed(2)+' v/R$':summaries[region.id].expenseCount?compactMoney(summaries[region.id].expenses):'—'}</small><ArrowUpRight size={11}/></button>)}</div>}
        </section>
        {rankingMinimized&&<button className="ranking-restore" onClick={()=>setRankingMinimized(false)}><Users size={16}/>Candidatos <b>{filtered.length}</b><PanelRightOpen size={15}/></button>}
        <aside className="ranking-panel" aria-label="Candidatos e ranking">
          <div className="ranking-title"><div><div className="eyebrow">{territory}</div><h2>Candidatos<span>{filtered.length}</span></h2></div><button className="icon-button" aria-label="Minimizar painel de candidatos" onClick={()=>{setRankingMinimized(true);if(smallScreen)setMobilePane('map')}}><Minus size={16}/></button><button className="icon-button" aria-label="Exportar candidatos em CSV" title="Exportar candidatos em CSV" disabled={!filtered.length} onClick={()=>exportCsv(filtered,query,source,calculation)}><Download size={16}/></button></div>
          <div className="search-box"><Search size={15}/><input placeholder="Nome, partido ou número..." aria-label="Buscar candidatos" value={search} onChange={event=>setSearch(event.target.value)}/>{search&&<button aria-label="Limpar busca" onClick={()=>setSearch('')}><X size={13}/></button>}</div>
          <div className="ranking-options"><label><ArrowDownUp size={12}/><select aria-label="Ordenar candidatos" value={sort} onChange={event=>{setSort(event.target.value as Sort);setAscending(event.target.value==='cost'||event.target.value==='name')}}><option value="votes">Mais votos na área</option><option value="expenses">Despesa total da campanha</option><option value="estimate">Estimativa de despesa na área</option><option value="cost">Custo da campanha / voto</option><option value="fund">Fundo eleitoral (FEFC)</option><option value="donations">Doações privadas</option><option value="name">Nome</option></select><ChevronDown size={11}/></label><button aria-label="Inverter ordem" title="Inverter ordem" onClick={()=>setAscending(value=>!value)}><ArrowDown size={13} style={{transform:ascending?'rotate(180deg)':''}}/></button><button className="calculation-toggle" aria-label="Configurar cálculo" title="Configurar cálculo" onClick={()=>setPopup('calculations')}><Settings2 size={14}/></button><button className={'filter-toggle '+(activeFilterCount?'active':'')} onClick={()=>setPopup('filters')}><SlidersHorizontal size={13}/>Filtros{activeFilterCount>0&&<b>{activeFilterCount}</b>}</button></div>
          <button className="calculation-summary" onClick={()=>setPopup('calculations')}>{BASIS_LABELS[calculation.basis]} · {calculation.average==='weighted'?'média ponderada':'média simples'}{calculation.deductTransfers?' · sem repasses':''}</button><div className="candidate-list" aria-busy={data.loading}>
            {data.loading&&!candidates.length?<div className="loading-state"><LoaderCircle className="spin" size={24}/><h3>Buscando fontes oficiais</h3><p>{data.progress}</p><div className="skeleton"/><div className="skeleton"/></div>:filtered.length?<>
              {filtered.slice(0,visibleLimit).map((candidate,index)=><button className="candidate-card" key={candidate.id} onClick={()=>setSelected(candidate)}>
                <div className="candidate-top"><span className="rank-index">{String(index+1).padStart(2,'0')}</span><CandidateAvatar candidate={candidate} year={query.year} size="sm"/><span className="candidate-identity"><b>{candidate.name}</b><small>{candidate.party}<span>·</span>{candidate.state}<span>·</span>{candidate.number}</small></span><ChevronRight size={13}/></div>
                <div className="candidate-metrics"><span><small>{scoped?'VOTOS LOCAIS':'VOTOS'}</small><b>{integer(candidate.votes)}</b></span><span><small>{candidate.financeScope==='national'?'DESPESA NACIONAL':'DESPESA CAMPANHA'}</small><b>{compactMoney(candidate.expenses)}</b></span><span className="candidate-cost"><small>TAXA R$ / VOTO</small><b>{money(comparisonRate(candidate,calculation))}</b></span></div>
                <div className="candidate-bottom"><span className={'status-badge '+candidate.status}>{candidate.status==='eleito'?<Check size={10}/>:<i/>}{statusLabel(candidate)}</span><span>{scoped?'Estimativa local '+compactMoney(comparisonAmount(candidate,calculation)):'FEFC '+compactMoney(candidate.electoralFund)}</span></div>
              </button>)}{filtered.length>visibleLimit&&<button className="load-more" onClick={()=>setVisibleLimit(value=>value+60)}>Mostrar mais candidatos<ChevronDown size={12}/></button>}
            </>:<div className="empty-state"><span className="empty-icon"><Database size={23}/></span><h3>{candidates.length?'Nenhum resultado':'Explore os dados eleitorais.'}</h3><p>{candidates.length?status==='reelected'&&candidates.every(c=>c.reelection==null)?'A fonte consultada não informa reeleição. Não atribuímos esse resultado sem confirmação.':'Ajuste a busca e os filtros.':query.zone?'Não há votação disponível para esta zona e seleção.':'Consulte o TSE ou importe os arquivos oficiais.'}</p>{candidates.length?<button className="primary-button" onClick={()=>{setSearch('');setParty('all');setStatus('all');setAtlasFilters(DEFAULT_ATLAS_FILTERS)}}>Limpar filtros</button>:<><button className="primary-button" onClick={()=>setPopup('sources')}>Fontes & importação</button><button className="demo-button" onClick={()=>data.useDemo()}><Sparkles size={12}/>Explorar demonstração</button></>}</div>}
          </div>
          <div className="ranking-footer"><span className="connection-dot"/><span>{scoped?'Votos locais · orçamento integral da campanha':demo?'Demonstração · sem dados reais':'Contas declaradas ao TSE'}</span><button onClick={()=>setPopup('method')} aria-label="Entender os indicadores"><CircleHelp size={13}/></button></div>
        </aside>
      </div>
      <footer className="footer"><span>Brasil → região → estado → município → zona eleitoral</span><span>Informação pública. Perspectivas abertas.</span></footer>
      <div className="mobile-switch" role="group" aria-label="Painel principal"><button className={mobilePane==='map'?'active':''} onClick={()=>setMobilePane('map')}><Globe2 size={14}/>Atlas</button><button className={mobilePane==='list'?'active':''} onClick={()=>{setMobilePane('list');setRankingMinimized(false)}}><Users size={14}/>Candidatos<span>{filtered.length}</span></button></div>
    </main>
    <input ref={fileInput} type="file" accept=".csv,.zip" multiple hidden onChange={event=>void importFiles(event.target.files)}/>
    {notice&&<div className="toast" role="status"><CircleHelp size={15}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Fechar aviso"><X size={14}/></button></div>}
    {(popup||selected)&&<InfoPanels calculation={calculation} onCalculation={setCalculation} popup={popup} selected={selected} onClose={closeModal} query={query} territory={territory} candidates={filtered} demo={demo} error={data.error} financeDate={financeDate} importing={importing} onImport={()=>fileInput.current?.click()} onDemo={()=>{data.useDemo();closeModal()}} party={party} status={status} parties={parties} onParty={setParty} onStatus={setStatus} onClearFilters={()=>{setParty('all');setStatus('all');setSearch('');setAtlasFilters(DEFAULT_ATLAS_FILTERS)}} municipalities={municipalities} zones={zones} territoryLoading={territoryLoading} territoryError={territoryError} territorySummaries={territorySummaries} summariesLoading={municipalityMetrics.loading} onRegion={regionChange} onState={stateChange} onMunicipality={municipalityChange} onZone={zoneChange} onParent={parent} onReset={reset}/>}
  </div>
}
