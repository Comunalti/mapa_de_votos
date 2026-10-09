import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,ArrowRight,BookOpen,Coins,Globe2,Layers3,Settings2,Wallet,X} from 'lucide-react'
const pages=[
 {icon:Globe2,kicker:'SEU ATLAS ELEITORAL',title:'Do Brasil à sua zona eleitoral.',text:'Passe o mouse para conhecer uma área. Clique para entrar em uma região, depois em um estado, município e zona. Os atalhos no topo permitem voltar um nível.',note:'Nos municípios, a prévia destaca a área sem mover a câmera. O foco acontece após o clique.'},
 {icon:Settings2,kicker:'ESCOLHA COMO COMPARAR',title:'Uma lista que se adapta à sua pergunta.',text:'Busque candidaturas e filtre o resultado. Em Cálculo, escolha despesas contratadas, despesas pagas, recursos públicos ou receitas. Você também pode comparar a média ponderada ou a média simples.',note:'Os indicadores de carregamento mostram quando uma informação ainda está sendo consultada. Campo vazio não é automaticamente zero.'},
 {icon:Coins,kicker:'FUNDO ELEITORAL · FEFC',title:'Dinheiro público para a campanha.',text:'O Fundo Especial de Financiamento de Campanha é distribuído aos partidos para financiar campanhas eleitorais. O partido repassa recursos às candidaturas conforme as regras aplicáveis.',note:'O valor recebido por um candidato não é o total que o partido recebeu. Aqui você vê o que foi declarado na conta da candidatura.'},
 {icon:Wallet,kicker:'FUNDO PARTIDÁRIO · FP',title:'Outro fundo, outra finalidade.',text:'O Fundo Partidário ajuda a manter as atividades dos partidos e também pode financiar campanhas. Ele é diferente do Fundo Eleitoral. As receitas de cada fonte aparecem separadas na ficha.',note:'Uma campanha também pode receber doações individuais, financiamento coletivo, recursos próprios e repasses de outras candidaturas.'},
 {icon:Layers3,kicker:'ACOMPANHE OS REPASSES',title:'Quem enviou e de onde veio?',text:'Um candidato pode transferir recursos a outro. O remetente é quem enviou; a fonte pode continuar sendo FEFC, Fundo Partidário ou dinheiro privado. As listas de receitas, gastos e envios ajudam a acompanhar esse caminho.',note:'Origem e remetente são duas formas de olhar o mesmo recurso. Somar as duas categorias pode contar o mesmo dinheiro duas vezes.'},
 {icon:BookOpen,kicker:'ENTENDA A ESTIMATIVA',title:'Custo por voto, com contexto.',text:'Se uma campanha declara R$ 10 mil e recebe mil votos, a taxa é R$ 10 por voto. Uma área com 200 votos teria R$ 2 mil no modelo proporcional. Isso é uma estimativa, não um gasto local declarado.',note:'O resultado eleitoral vem do TSE. Reeleição só é indicada quando confirmada na fonte. Valores e declarações podem ser atualizados.'},
]
export default function Tutorial({onClose}:{onClose:()=>void}){
 const[step,setStep]=useState(0),[remember,setRemember]=useState(false)
 const dialog=useRef<HTMLDivElement>(null),touchX=useRef<number|null>(null)
 const close=()=>{if(remember){try{localStorage.setItem('voto-atlas:hide-tutorial','1')}catch{}}onClose()}
 const current=pages[step],Icon=current.icon
 useEffect(()=>{dialog.current?.focus()},[])
 return <div className="tutorial-backdrop"><div className="tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-title" ref={dialog} tabIndex={-1}
 onKeyDown={e=>{if(e.key==='Escape')close();if(e.key==='ArrowRight')setStep(s=>Math.min(s+1,pages.length-1));if(e.key==='ArrowLeft')setStep(s=>Math.max(0,s-1));if(e.key==='Tab'){const n=dialog.current?.querySelectorAll<HTMLElement>('button,input,a[href]');if(!n?.length)return;if(e.shiftKey&&(document.activeElement===n[0]||document.activeElement===dialog.current)){e.preventDefault();n[n.length-1].focus()}else if(!e.shiftKey&&document.activeElement===n[n.length-1]){e.preventDefault();n[0].focus()}}}}>
 <button className="modal-close icon-button" aria-label="Fechar tutorial" onClick={close}><X size={18}/></button>
 <div className="tutorial-slide" onTouchStart={e=>{touchX.current=e.touches[0].clientX}} onTouchEnd={e=>{if(touchX.current==null)return;const dx=e.changedTouches[0].clientX-touchX.current;if(Math.abs(dx)>45)setStep(s=>Math.max(0,Math.min(pages.length-1,s+(dx<0?1:-1))));touchX.current=null}}>
 <span className="tutorial-icon"><Icon size={30}/></span><div className="eyebrow">{current.kicker}</div><h2 id="tutorial-title">{current.title}</h2><p>{current.text}</p><div className="tutorial-note">{current.note}</div>
 </div>
 <div className="tutorial-dots">{pages.map((_,i)=><button key={i} className={step===i?'active':''} aria-label={'Ir para página '+(i+1)} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}/>)}</div>
 <div className="tutorial-actions"><button className="text-link" onClick={()=>step?setStep(s=>s-1):close()}>{step?<><ArrowLeft size={14}/>Anterior</>:'Pular tutorial'}</button><button className="primary-button" onClick={()=>step===pages.length-1?close():setStep(s=>s+1)}>{step===pages.length-1?'Explorar atlas':'Próximo'}<ArrowRight size={14}/></button></div>
 <label className="tutorial-remember"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>Não mostrar nas próximas visitas</label>
 <a className="tutorial-source" href="https://www.tse.jus.br/comunicacao/noticias/2021/Novembro/fundo-eleitoral-x-fundo-partidario-entenda-a-diferenca" target="_blank" rel="noreferrer">Saiba mais nos materiais do TSE</a>
 </div></div>
}
