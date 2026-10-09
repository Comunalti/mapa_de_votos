import type {CalculationOptions} from '../lib/calculations'
import {DEFAULT_CALCULATION} from '../lib/calculations'
export default function CalculationPanel({value,onChange}:{value:CalculationOptions;onChange:(next:CalculationOptions)=>void}){
 return <>
 <div className="eyebrow">CRITÉRIOS DE COMPARAÇÃO</div><h2 id="dialog-title">Configurar cálculo.</h2><p>Estas escolhas alteram o ranking, as médias e as estimativas. As declarações originais continuam intactas na ficha do candidato.</p>
 <div className="calculation-fields">
 <label>Base financeira<select aria-label="Base financeira do cálculo" value={value.basis} onChange={e=>onChange({...value,basis:e.target.value as CalculationOptions['basis']})}><option value="contracted">Despesas contratadas</option><option value="paid">Despesas efetivamente pagas</option><option value="public-funds">Recursos públicos: FEFC + Fundo Partidário</option><option value="revenue">Receitas arrecadadas</option></select><small>Receitas e recursos públicos medem financiamento por voto; não são gastos de campanha.</small></label>
 <label>Comparação territorial<select aria-label="Comparação territorial" value={value.allocation} onChange={e=>onChange({...value,allocation:e.target.value as CalculationOptions['allocation']})}><option value="proportional">Rateio proporcional aos votos locais</option><option value="whole">Base integral dividida pelos votos locais</option></select><small>O rateio estima a participação da área. O modo integral compara toda a campanha aos votos locais, sem estimar gasto local.</small></label>
 <label>Média entre candidaturas<select aria-label="Método da média" value={value.average} onChange={e=>onChange({...value,average:e.target.value as CalculationOptions['average']})}><option value="weighted">Ponderada: soma dos valores ÷ soma dos votos</option><option value="simple">Simples: média das taxas individuais</option></select><small>A média simples dá o mesmo peso a candidatos com poucos e muitos votos.</small></label>
 <label className="checkbox-setting"><input type="checkbox" checked={value.deductTransfers} disabled={value.basis!=='contracted'&&value.basis!=='paid'} onChange={e=>onChange({...value,deductTransfers:e.target.checked})}/><span>Excluir repasses identificados a outras candidaturas ou partidos<small>Evita incluir essas transferências na base de despesas. Uma dedução incompatível ou desconhecida fica sem cálculo.</small></span></label>
 </div><button className="text-link" onClick={()=>onChange(DEFAULT_CALCULATION)}>Restaurar cálculo padrão</button>
 </>
}
