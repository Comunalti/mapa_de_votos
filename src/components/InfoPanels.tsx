import type {Summary} from '../lib/metrics'
import {money} from '../lib/format'
import CalculationPanel from './CalculationPanel'
import CandidateFiche from './CandidateFiche'
import type {CalculationOptions} from '../lib/calculations'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Database, FileUp, Globe2, Layers3, LoaderCircle, MapPin, Search, Sparkles, Users, Wallet, X } from 'lucide-react'
import type { Candidate, ElectionQuery, ElectoralZone, Municipality, RegionId } from '../types'
import { REGIONS, STATES } from '../data/geography'
import { compactMoney, normalize } from '../lib/format'
import { stamp, sumKnown } from '../lib/ui'

export type Popup='sources'|'method'|'filters'|'territory'|'calculations'|null
interface Props {
  territorySummaries:Record<string,Summary>; summariesLoading:boolean;
  calculation:CalculationOptions; onCalculation:(value:CalculationOptions)=>void;
  popup:Popup; selected:Candidate|null; onClose:()=>void; query:ElectionQuery; territory:string;
  candidates:Candidate[]; demo:boolean; error:string|null; financeDate?:string; importing:boolean;
  onImport:()=>void; onDemo:()=>void; party:string; status:string; parties:string[];
  onParty:(value:string)=>void; onStatus:(value:string)=>void; onClearFilters:()=>void;
  municipalities:Municipality[]; zones:ElectoralZone[]; territoryLoading:boolean; territoryError:string;
  onRegion:(region:RegionId|null)=>void; onState:(state:string|null)=>void; onMunicipality:(id:string|null)=>void;
  onZone:(zone:number|null)=>void; onParent:()=>void; onReset:()=>void;
}
export default function InfoPanels(props:Props) {
  const {territorySummaries,summariesLoading,calculation,onCalculation,popup,selected,onClose,query,territory,candidates,demo,error,financeDate,importing,onImport,onDemo,party,status,parties,onParty,onStatus,onClearFilters,municipalities,zones,territoryLoading,territoryError,onRegion,onState,onMunicipality,onZone,onParent,onReset}=props
  const [search,setSearch]=useState('')
  const dialog=useRef<HTMLDivElement>(null)
  const level=query.municipality?'zona':query.state?'município':query.region?'estado':'região'
  const municipality=municipalities.find(item=>item.id===query.municipality)
  useEffect(()=>setSearch(''),[query.region,query.state,query.municipality,query.zone])
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null
    dialog.current?.focus()
    const handle=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||document.querySelector('.account-overlay'))return
      if(event.key==='Escape')onClose()
      if(event.key!=='Tab')return
      const elements=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input,select:not(:disabled),[tabindex="0"]')
      if(!elements?.length)return
      const first=elements[0],last=elements[elements.length-1]
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    }
    window.addEventListener('keydown',handle)
    return()=>{window.removeEventListener('keydown',handle);previous?.focus({preventScroll:true})}
  },[popup])
  const match=(name:string)=>!search||normalize(name).includes(normalize(search))
  const financialCount=candidates.filter(item=>item.expenses!=null).length
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}><div className={'modal '+(selected?'candidate-modal':'')+' '+(popup==='territory'?'territory-modal':'')} role="dialog" aria-modal="true" aria-labelledby="dialog-title" tabIndex={-1} ref={dialog}><button className="modal-close icon-button" onClick={onClose} aria-label="Fechar"><X size={19}/></button>
    {popup==='sources'?<>
      <div className="eyebrow">PROVENIÊNCIA & DISPONIBILIDADE</div><h2 id="dialog-title">Fontes & dados.</h2><p>Votos e situação eleitoral são consultados nas APIs do TSE. As finanças usam a extração oficial datada incluída na aplicação ou os arquivos que você importar. Quando não há extração disponível, tentamos o DivulgaCandContas.</p>
      <div className="source-summary"><div><small>Despesas disponíveis</small><b>{financialCount} / {candidates.length}</b></div><div><small>Data dos dados financeiros</small><b>{stamp(financeDate)}</b></div><div><small>Receitas declaradas</small><b>{compactMoney(sumKnown(candidates,'revenue'))}</b></div></div>
      <div className="source-links"><a href={'https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-'+query.year} target="_blank" rel="noreferrer"><Wallet size={17}/><span><b>Prestação de contas · {query.year}</b><small>Despesas, receitas, FEFC e doações</small></span><ArrowUpRight size={15}/></a><a href={'https://dadosabertos.tse.jus.br/dataset/resultados-'+query.year} target="_blank" rel="noreferrer"><Users size={17}/><span><b>Votação nominal · {query.year}</b><small>Candidato, município e zona eleitoral</small></span><ArrowUpRight size={15}/></a><a href="https://divulgacandcontas.tse.jus.br/divulga/" target="_blank" rel="noreferrer"><Database size={17}/><span><b>DivulgaCandContas</b><small>Consultar a declaração da candidatura</small></span><ArrowUpRight size={15}/></a></div>
      <div className="import-block"><FileUp size={22}/><h3>Adicionar ou atualizar arquivos</h3><p>Importe CSV/ZIP do TSE de receitas, despesas contratadas, candidatos e votação nominal por município/zona. O processamento acontece em segundo plano, neste navegador.</p><button className="primary-button" disabled={importing} onClick={onImport}>{importing?<LoaderCircle size={14} className="spin"/>:<FileUp size={14}/>} {importing?'Processando...':'Selecionar CSV / ZIP'}</button></div>
      {error&&<div className="source-error"><CircleHelp size={15}/><span>{error}</span></div>}<button className="demo-button" onClick={onDemo}><Sparkles size={13}/>Explorar demonstração com dados fictícios</button><p className="fine-print">As contas podem ser parciais e retificadas. Arquivo oficial é uma cópia datada; “—” significa campo sem informação disponível. Importações ficam na memória desta aba.</p>
    </>:popup==='method'?<>
      <div className="eyebrow">DADOS DECLARADOS & ESTIMATIVA</div><h2 id="dialog-title">Campanha e território.</h2><p>O orçamento da campanha permanece integral. Os votos pertencem ao território selecionado. A estimativa permite comparar a área com a escala real da candidatura.</p>
      <div className="formula"><span>TAXA DA CAMPANHA</span><b>Despesa total ÷ votos totais</b><small>Votos do Brasil para presidente; da UF para os demais cargos.</small></div><div className="formula estimated-formula"><span>ESTIMATIVA PARA A ÁREA</span><b>Votos locais × taxa da campanha</b><small>Equivale à despesa total × participação dos votos locais.</small></div>
      <div className="method-list"><p><b>Uma estimativa identificada.</b> Esse cálculo proporcional não informa onde o dinheiro foi efetivamente gasto. Não estimamos receitas locais nem redistribuímos FEFC e doações como se fossem declarações regionais.</p><p><b>Financiamento separado.</b> FEFC é o fundo eleitoral; doações privadas incluem pessoas físicas e financiamento coletivo identificados na fonte. Receitas totais também podem incluir recursos próprios e transferências.</p><p><b>Média da área.</b> Soma das despesas proporcionais estimadas ÷ soma dos votos locais das candidaturas com ambos os dados. A cobertura e as datas aparecem em Fontes & dados.</p><p><b>Mesma base de comparação.</b> O custo usa os votos totais do turno selecionado e a conta integral da campanha. Valores desconhecidos ficam sem estimativa; zero votos não produz divisão por zero.</p><p><b>Zonas eleitorais.</b> A lista de zonas vem do TSE. Quando não há limites geográficos publicados, o mapa mostra uma camada de seleção identificada, sem desenhar divisões inventadas.</p></div>
    </>:popup==='calculations'?<><CalculationPanel value={calculation} onChange={onCalculation}/><div className="modal-actions"><small>Alterações aplicadas aos indicadores.</small><button className="primary-button" onClick={onClose}>Concluir</button></div></>:popup==='filters'?<>
      <div className="eyebrow">REFINAR CANDIDATURAS</div><h2 id="dialog-title">Filtros do ranking.</h2><div className="extra-filters"><label>Partido<select value={party} aria-label="Partido" onChange={event=>onParty(event.target.value)}><option value="all">Todos os partidos</option>{parties.map(item=><option key={item}>{item}</option>)}</select></label><label>Resultado<select value={status} aria-label="Resultado" onChange={event=>onStatus(event.target.value)}><option value="all">Todas as situações</option><option value="eleito">Eleitos</option><option value="reelected">Reeleitos confirmados</option><option value="nao-eleito">Não eleitos</option><option value="segundo-turno">Segundo turno</option><option value="pendente">Em apuração</option></select></label></div><p className="fine-print">Filtros também atualizam os indicadores do mapa. Despesas da campanha e estimativas locais são ordenadas separadamente.</p><div className="modal-actions"><button className="text-link" onClick={onClearFilters}>Limpar filtros</button><button className="primary-button" onClick={onClose}><Check size={14}/>Aplicar filtros</button></div>
    </>:popup==='territory'?<>
      <div className="eyebrow">NAVEGAÇÃO GEOGRÁFICA</div><h2 id="dialog-title">Explorar {level==='zona'?'zonas eleitorais':level==='região'?'regiões':level+'s'}.</h2><div className="territory-current"><MapPin size={14}/><span>{territory}</span>{query.region&&<button onClick={onParent}><ArrowLeft size={12}/>Voltar</button>}</div>
      <div className="search-box territory-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar localidade..." aria-label="Buscar localidade"/></div>
      {territoryLoading&&<p className="territory-progress"><LoaderCircle className="spin" size={14}/>Carregando localidades oficiais...</p>}{territoryError&&<p className="source-error">{territoryError}</p>}
      <div className="territory-list">
        {!query.region&&REGIONS.filter(item=>match(item.name)).map(item=><button key={item.id} onClick={()=>onRegion(item.id)}><Globe2 size={16}/><span><b>{item.name}</b><small>{item.stateCount} unidades federativas</small></span><ChevronRight size={15}/></button>)}
        {query.region&&!query.state&&STATES.filter(item=>item.region===query.region&&match(item.name+' '+item.uf)).map(item=><button key={item.uf} onClick={()=>onState(item.uf)}><MapPin size={16}/><span><b>{item.name}</b><small>{item.uf}</small></span><ChevronRight size={15}/></button>)}
        {query.state&&!query.municipality&&municipalities.filter(item=>match(item.name+' '+item.id)).map(item=><button key={item.id} onClick={()=>onMunicipality(item.id)}><MapPin size={16}/><span><b>{item.name}</b><small>{item.id} · TSE {item.tseCode??'não disponível'} · {territorySummaries[item.id]?.costPerVote!=null?money(territorySummaries[item.id].costPerVote)+' / voto':summariesLoading?'Consultando média…':'Média não disponível'}</small></span><ChevronRight size={15}/></button>)}
        {query.municipality&&zones.filter(item=>match('Zona '+item.number)).map(item=><button className={query.zone===item.number?'active':''} key={item.number} onClick={()=>{onZone(item.number);onClose()}}><Layers3 size={16}/><span><b>Zona eleitoral {item.number}</b><small>{municipality?.name} · {query.state}</small></span><ChevronRight size={15}/></button>)}
        {query.municipality&&!zones.length&&!territoryLoading&&<p className="empty-territories">O TSE não disponibilizou zonas para esta seleção.</p>}
      </div><div className="modal-actions"><button className="text-link" onClick={()=>{onReset();setSearch('')}}>Voltar ao Brasil</button><button className="primary-button" onClick={onClose}>Ver no mapa<ArrowRight size={14}/></button></div>
    </>:selected&&<CandidateFiche key={selected.id} candidate={selected} year={query.year} round={query.round} territory={territory} demo={demo} calculation={calculation}/>}
  </div></div>
}
