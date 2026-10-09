import type { RegionId } from '../types';
export const REGION_STATES: Record<RegionId, string[]> = {
  norte: ['AC', 'AP', 'AM', 'PA', 'RO', 'RR', 'TO'],
  nordeste: ['AL', 'BA', 'CE', 'MA', 'PB', 'PE', 'PI', 'RN', 'SE'],
  'centro-oeste': ['DF', 'GO', 'MT', 'MS'],
  sudeste: ['ES', 'MG', 'RJ', 'SP'],
  sul: ['PR', 'RS', 'SC'],
};
export const ALL_STATES = Object.values(REGION_STATES).flat();
export function stateRegion(state: string): RegionId | null {
  return (Object.keys(REGION_STATES) as RegionId[]).find(region => REGION_STATES[region].includes(state)) ?? null;
}
