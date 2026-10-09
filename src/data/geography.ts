import type { RegionId } from '../types';

export interface StateGeography {
  id: string;
  uf: string;
  name: string;
  region: RegionId;
  center: [number, number];
}
export interface RegionGeography {
  id: RegionId;
  name: string;
  shortName: string;
  stateCount: number;
  center: [number, number];
  focusZoom: number;
}

/** IBGE geographic regions. Centers are label anchors in longitude/latitude. */
export const REGIONS: RegionGeography[] = [
  { id: 'norte', name: 'Norte', shortName: 'NORTE', stateCount: 7, center: [-60.2, -4.1], focusZoom: 1.35 },
  { id: 'nordeste', name: 'Nordeste', shortName: 'NORDESTE', stateCount: 9, center: [-40.9, -8.2], focusZoom: 1.8 },
  { id: 'centro-oeste', name: 'Centro-Oeste', shortName: 'CENTRO-OESTE', stateCount: 4, center: [-54.3, -16.2], focusZoom: 1.75 },
  { id: 'sudeste', name: 'Sudeste', shortName: 'SUDESTE', stateCount: 4, center: [-44.5, -20.1], focusZoom: 2.25 },
  { id: 'sul', name: 'Sul', shortName: 'SUL', stateCount: 3, center: [-52.0, -27.8], focusZoom: 2.35 },
];

export const STATES: StateGeography[] = [
  { id: '11', uf: 'RO', name: 'Rondônia', region: 'norte', center: [-63.1, -10.8] },
  { id: '12', uf: 'AC', name: 'Acre', region: 'norte', center: [-70.3, -9.2] },
  { id: '13', uf: 'AM', name: 'Amazonas', region: 'norte', center: [-64.4, -4.2] },
  { id: '14', uf: 'RR', name: 'Roraima', region: 'norte', center: [-61.3, 1.7] },
  { id: '15', uf: 'PA', name: 'Pará', region: 'norte', center: [-53.6, -4.2] },
  { id: '16', uf: 'AP', name: 'Amapá', region: 'norte', center: [-51.7, 1.7] },
  { id: '17', uf: 'TO', name: 'Tocantins', region: 'norte', center: [-48.3, -9.6] },
  { id: '21', uf: 'MA', name: 'Maranhão', region: 'nordeste', center: [-45.3, -5.0] },
  { id: '22', uf: 'PI', name: 'Piauí', region: 'nordeste', center: [-42.7, -7.2] },
  { id: '23', uf: 'CE', name: 'Ceará', region: 'nordeste', center: [-39.5, -5.3] },
  { id: '24', uf: 'RN', name: 'Rio Grande do Norte', region: 'nordeste', center: [-36.6, -5.9] },
  { id: '25', uf: 'PB', name: 'Paraíba', region: 'nordeste', center: [-36.9, -7.25] },
  { id: '26', uf: 'PE', name: 'Pernambuco', region: 'nordeste', center: [-37.7, -8.65] },
  { id: '27', uf: 'AL', name: 'Alagoas', region: 'nordeste', center: [-36.7, -9.6] },
  { id: '28', uf: 'SE', name: 'Sergipe', region: 'nordeste', center: [-37.4, -10.7] },
  { id: '29', uf: 'BA', name: 'Bahia', region: 'nordeste', center: [-41.5, -12.4] },
  { id: '31', uf: 'MG', name: 'Minas Gerais', region: 'sudeste', center: [-44.6, -18.9] },
  { id: '32', uf: 'ES', name: 'Espírito Santo', region: 'sudeste', center: [-40.7, -19.5] },
  { id: '33', uf: 'RJ', name: 'Rio de Janeiro', region: 'sudeste', center: [-42.9, -22.5] },
  { id: '35', uf: 'SP', name: 'São Paulo', region: 'sudeste', center: [-48.4, -22.4] },
  { id: '41', uf: 'PR', name: 'Paraná', region: 'sul', center: [-51.4, -24.8] },
  { id: '42', uf: 'SC', name: 'Santa Catarina', region: 'sul', center: [-50.5, -27.2] },
  { id: '43', uf: 'RS', name: 'Rio Grande do Sul', region: 'sul', center: [-53.3, -30.4] },
  { id: '50', uf: 'MS', name: 'Mato Grosso do Sul', region: 'centro-oeste', center: [-54.8, -20.9] },
  { id: '51', uf: 'MT', name: 'Mato Grosso', region: 'centro-oeste', center: [-55.7, -13.0] },
  { id: '52', uf: 'GO', name: 'Goiás', region: 'centro-oeste', center: [-49.4, -16.0] },
  { id: '53', uf: 'DF', name: 'Distrito Federal', region: 'centro-oeste', center: [-47.8, -15.8] },
];

export const STATE_BY_UF = Object.fromEntries(STATES.map(item => [item.uf, item])) as Record<string, StateGeography>;
export const STATE_BY_ID = Object.fromEntries(STATES.map(item => [item.id, item])) as Record<string, StateGeography>;
export const REGION_BY_ID = Object.fromEntries(REGIONS.map(item => [item.id, item])) as Record<RegionId, RegionGeography>;

export type Coordinate = [number, number];
export interface GeoFeature {
  type: 'Feature';
  properties: { codarea: string };
  geometry: { type: 'Polygon'; coordinates: Coordinate[][] } | { type: 'MultiPolygon'; coordinates: Coordinate[][][] };
}
export interface BrazilGeoJSON { type: 'FeatureCollection'; features: GeoFeature[] }

/** Small equirectangular projection, corrected for Brazil's central latitude. */
export function project([longitude, latitude]: Coordinate): Coordinate {
  return [(longitude + 54) * 0.29 * Math.cos(14 * Math.PI / 180), (latitude + 14.4) * 0.29];
}

export function featurePolygons(feature: GeoFeature): Coordinate[][][] {
  return feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
}
