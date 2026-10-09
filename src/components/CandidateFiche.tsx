import {useState} from 'react'
import {BarChart3,ChevronRight,CircleHelp,Database,LoaderCircle,MapPin,RefreshCw,Wallet} from 'lucide-react'
import {AccountDetails,PaymentProgress} from './AccountDetails'
import type {AccountPage} from './AccountDetails'
import CandidateAvatar from './CandidateAvatar'
import type {Candidate} from '../types'
import {useCandidateDetails} from '../hooks/useCandidateDetails'
import {integer,money} from '../lib/format'
import {campaignVotes} from '../lib/metrics'
import {comparisonAmount,comparisonRate,BASIS_LABELS} from '../lib/calculations'
import type {CalculationOptions} from '../lib/calculations'
import {stamp,statusLabel} from '../lib/ui'
export default function CandidateFiche({candidate,year,round,territory,demo,calculation}:{candidate:Candidate;year:number;round:number;territory:string;demo:boolean;calculation:CalculationOptions}){
 const detail=useCandidateDetails(candidate,year,demo),total=campaignVotes(candidate),local=candidate.votes
 const [stack,setStack]=useState<AccountPage[]>([])
 const open=(page:AccountPage)=>setStack([page])
 const percent=local!=null&&total!=null&&total>0?local/total*100:null
 const reelection=detail.profile?.reelection??candidate.reelection,enriched={...candidate,reelection}
 const difference=candidate.expenses!=null&&candidate.paidExpenses!=null?Math.round((candidate.expenses-candidate.paidExpenses)*100)/100:null
 const funding=[{label:'Fundo Eleitoral do partido',amount:candidate.electoralFundParty,fund:'electoral-party'},{label:'Fundo Partidário do partido',amount:candidate.partyFundParty,fund:'party-party'},{label:'De outras candidaturas',amount:candidate.receivedPoliticians,fund:'politicians'},{label:'Doações individuais e coletivas',amount:candidate.donations,fund:'individual'}]
 return <div className="candidate-fiche">
 <header className="fiche-hero"><CandidateAvatar candidate={candidate} year={year} size="lg"/><div className="fiche-identity"><div className="eyebrow">{candidate.party} · {candidate.state} · Nº {candidate.number} · {year}</div><h2 id="dialog-title">{candidate.name}</h2><span className={'status-badge '+candidate.status}>{statusLabel(enriched)}</span></div><button className="fiche-chart-button" onClick={()=>open({type:'charts'})}><BarChart3 size={18}/><span>Ver gráficos</span></button></header>
 <div className="fiche-layout"><section className="fiche-main"><div className="fiche-section-title"><span>CAMPANHA INTEGRAL</span><b>{candidate.financeScope==='national'?'Brasil':candidate.state} · {round}º turno</b></div>
 <div className="fiche-totals"><button onClick={()=>open({type:'receipts'})}><small>Receitas declaradas</small><strong>{money(candidate.revenue)}</strong><span>Explorar recursos recebidos <ChevronRight size={12}/></span></button><button onClick={()=>open({type:'expenses'})}><small>Despesas contratadas</small><strong>{money(candidate.expenses)}</strong><span>Documentos e seus itens <ChevronRight size={12}/></span></button><button onClick={()=>open({type:'payments'})}><small>Despesas pagas</small><strong>{money(candidate.paidExpenses)}</strong><span>Datas, valores e parcelas <ChevronRight size={12}/></span></button></div>
 <button className="fiche-balance" onClick={()=>open({type:'balance'})}><div><small>Diferença contratado × pago</small><strong>{money(difference)}</strong><span>Ver documentos com saldo a conciliar<ChevronRight size={13}/></span></div><PaymentProgress paid={candidate.paidExpenses??null} contracted={candidate.expenses} label="Pago / contratado"/></button><p className="fiche-small-note">A diferença pode incluir despesas estimáveis e registros sem vínculo. Abra os documentos para conciliar o que ainda não tem pagamento registrado.</p>
 <div className="fiche-section-title"><span><MapPin size={12}/> NO TERRITÓRIO</span><b>{territory}</b></div><div className="fiche-local"><div><small>Votos nesta área</small><strong>{integer(local)}</strong><span>{percent==null?'Participação ainda não disponível':percent.toLocaleString('pt-BR',{maximumFractionDigits:2})+'% dos '+integer(total)+' votos totais'}</span>{percent!=null&&<div className="account-progress-track" role="progressbar" aria-label="Participação dos votos da área" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100,percent)}><i style={{width:Math.min(100,percent)+'%'}}/></div>}</div><div className="fiche-estimate"><small>{calculation.allocation==='proportional'?'Custo estimado nesta área':'Base integral da comparação'}<em>{calculation.allocation==='proportional'?'ESTIMATIVA':'SEM RATEIO'}</em></small><strong>{money(comparisonAmount(candidate,calculation))}</strong><span>{money(comparisonRate(candidate,calculation))} / voto · {BASIS_LABELS[calculation.basis]}</span></div></div>
 </section><aside className="fiche-funding"><div className="fiche-section-title"><span><Wallet size={12}/> QUEM FINANCIOU?</span></div>{funding.map(row=><button key={row.fund} onClick={()=>open({type:'receipts',fund:row.fund,label:row.label,declaredTotal:row.amount??null})}><span>{row.label}</span><b>{money(row.amount)}</b><ChevronRight size={13}/></button>)}<div className="fiche-fefc"><small>FEFC · todas as origens</small><strong>{money(candidate.electoralFund)}</strong></div><p>Os recursos públicos recebidos de outras candidaturas podem estar no total de FEFC. As linhas são recortes diferentes: não devem ser somadas novamente.</p></aside></div>
 {detail.error&&<div className="source-error"><CircleHelp size={14}/><span>{detail.error}</span><button onClick={detail.retry}><RefreshCw size={13}/>Tentar novamente</button></div>}
 <div className="fiche-explore-heading"><h3>Explore os dados da candidatura</h3><span>{(detail.profileLoading||detail.financeLoading)?<><LoaderCircle className="spin" size={13}/>Consultando fontes oficiais…</>:'Clique em um cartão para abrir uma janela'}</span></div>
 <AccountDetails profile={detail.profile} finance={detail.finance?{...detail.finance,totals:{paid:candidate.paidExpenses??null,expenses:candidate.expenses,revenue:candidate.revenue}}:null} year={year} party={candidate.party} candidateName={candidate.name} profileLoading={detail.profileLoading} financeLoading={detail.financeLoading} stack={stack} onStack={setStack}/>
 <footer className="fiche-footer"><div className="detail-provenance"><Database size={12}/><span>{demo?'Demonstração fictícia':'Arquivo oficial TSE'} · {stamp(detail.finance?.updatedAt??candidate.financeUpdatedAt)}</span></div>{!demo&&<a href="https://divulgacandcontas.tse.jus.br/divulga/" target="_blank" rel="noreferrer">Consultar no TSE<ChevronRight size={13}/></a>}</footer>
 <p className="fiche-small-note">O cálculo territorial usa as opções de Cálculo. A estimativa proporcional não é um gasto local declarado.</p>
 </div>
}
