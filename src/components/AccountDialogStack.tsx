import {useEffect,useId,useLayoutEffect,useRef} from 'react'
import {createPortal} from 'react-dom'
import {ArrowLeft,ChevronRight,Layers3,X} from 'lucide-react'
import type {ReactNode} from 'react'
interface Props {titles:string[];candidateName:string;onBack:()=>void;onClose:()=>void;onNavigate:(index:number)=>void;children:ReactNode}
export default function AccountDialogStack({titles,candidateName,onBack,onClose,onNavigate,children}:Props){
 const contentRef=useRef<HTMLDivElement>(null),scrollPositions=useRef(new Map<string,number>())
 const ref=useRef<HTMLDivElement>(null),label=useId(),firstOpener=useRef<HTMLElement|null>(document.activeElement as HTMLElement|null),current=titles.join('|')
 useEffect(()=>{const parent=document.querySelector<HTMLElement>('.candidate-modal');if(parent){parent.inert=true;parent.setAttribute('aria-hidden','true')}return()=>{if(parent){parent.inert=false;parent.removeAttribute('aria-hidden')}if(firstOpener.current?.isConnected)firstOpener.current.focus({preventScroll:true})}},[])
 useLayoutEffect(()=>{ref.current?.focus({preventScroll:true});if(contentRef.current)contentRef.current.scrollTop=scrollPositions.current.get(current)??0},[current])
 useEffect(()=>{const keyboard=(event:KeyboardEvent)=>{
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onBack();return}
  if(event.key!=='Tab')return
  const nodes=[...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[])].filter(n=>n.getClientRects().length)
  if(!nodes.length){event.preventDefault();return}const first=nodes[0],last=nodes[nodes.length-1]
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){event.preventDefault();first.focus()}
 };window.addEventListener('keydown',keyboard,true);return()=>window.removeEventListener('keydown',keyboard,true)},[onBack])
 return createPortal(<div className="account-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onBack()}}>
 <div className="account-stack-shell" style={{'--stack-depth':Math.min(titles.length,3)} as React.CSSProperties}>
 {titles.length>1&&<div className="account-stack-shadow" aria-hidden="true"/>}
 <div className="account-window" role="dialog" aria-modal="true" aria-labelledby={label} tabIndex={-1} ref={ref}>
 <header className="account-window-header"><button className="account-icon" onClick={onBack} aria-label="Voltar uma janela"><ArrowLeft size={18}/></button><div><small><Layers3 size={12}/> EXPLORAR CONTAS · {titles.length} {titles.length===1?'JANELA':'JANELAS'}</small><h2 id={label}>{titles[titles.length-1]}</h2></div><button className="account-icon" aria-label="Fechar todas as janelas e voltar à candidatura" onClick={onClose}><X size={20}/></button></header>
 <nav className="account-breadcrumb" aria-label="Caminho dos detalhes"><button onClick={onClose}>{candidateName}</button>{titles.map((title,index)=><span key={index}><ChevronRight size={12}/>{index===titles.length-1?<b aria-current="page">{title}</b>:<button onClick={()=>onNavigate(index)}>{title}</button>}</span>)}</nav>
 <div className="account-window-content" key={current} ref={contentRef} onScroll={event=>scrollPositions.current.set(current,event.currentTarget.scrollTop)}>{children}</div>
 </div></div></div>,document.body)
}
