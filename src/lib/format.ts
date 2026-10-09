export const integer = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value)
export const money = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value)
export const compact = (value: number | null | undefined) => value == null ? '—' : new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
export const compactMoney = (value: number | null | undefined) => value == null ? '—' : 'R$ ' + compact(value)
export const ratio = (expenses: number | null, votes: number | null) => expenses != null && votes != null && votes > 0 ? expenses / votes : null
export const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
