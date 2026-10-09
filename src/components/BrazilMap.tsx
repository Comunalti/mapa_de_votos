import { Component, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RegionId } from '../types';
import { REGIONS, REGION_BY_ID, STATES, STATE_BY_ID, STATE_BY_UF, featurePolygons, project } from '../data/geography';
import type { BrazilGeoJSON, Coordinate, GeoFeature, StateGeography } from '../data/geography';
import './map.css';

interface Summary {
  costPerVote: number | null; votesPerReal: number | null; votes: number; expenses: number; count: number;
  expenseCount?: number; voteCount?: number; estimated?: boolean;
}
interface MapMunicipality { id: string; name: string; state: string; tseCode?: string | null; center?: Coordinate }
interface MapZone { number: number; municipalityId?: string; name?: string; center?: Coordinate }
export interface BrazilMapProps {
  region: RegionId | null; state: string | null; municipality?: string | null; zone?: number | null;
  municipalities?: readonly MapMunicipality[]; zones?: readonly MapZone[];
  onRegionChange: (id: RegionId | null) => void; onStateChange: (uf: string | null) => void;
  onMunicipalityChange?: (id: string | null) => void; onZoneChange?: (zone: number | null) => void;
  summaries: Partial<Record<RegionId, Summary>>; territorySummaries?: Record<string, Summary>;
  financialLabel?:string; summariesLoading?:boolean; metric: 'cost' | 'efficiency' | 'spending' | 'votes'; resetKey: number;
  viewportInsetRight?: number; viewportInsetBottom?: number;
}
interface Bounds { x: number; y: number; width: number; height: number; span: number }
interface Preview { region: RegionId | null; state: string | null; municipality: string | null; zone: number | null }
interface ProjectedLabel { key: string; center: Coordinate; height: number }
const EMPTY_PREVIEW: Preview = { region: null, state: null, municipality: null, zone: null };
const municipalityCache = new Map<string, BrazilGeoJSON>();
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const compactMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const compactVotes = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const BASE_COLOR = '#c7cecc';

function summaryText(summary: Summary | undefined, metric: BrazilMapProps['metric'],financialLabel='Despesas declaradas') {
  if (!summary) return { value: '—', caption: 'sem dados no recorte' };
  if (metric === 'votes') return (summary.voteCount ?? summary.count) > 0 ? { value: compactVotes.format(summary.votes), caption: 'votos no recorte' } : { value: '—', caption: 'sem votos no recorte' };
  if (metric === 'spending') return (summary.expenseCount ?? summary.count) > 0 ? { value: compactMoney.format(summary.expenses), caption: summary.estimated ? financialLabel+' · estimativa' : financialLabel } : { value: '—', caption: 'sem despesas no recorte' };
  if (!summary.count) return { value: '—', caption: 'sem dados no recorte' };
  if (metric === 'efficiency') return { value: summary.votesPerReal === null ? '—' : decimal.format(summary.votesPerReal), caption: summary.estimated ? 'votos / real · estimativa' : 'votos por real' };
  return { value: summary.costPerVote === null ? '—' : money.format(summary.costPerVote), caption: summary.estimated ? 'por voto · estimativa' : 'por voto · média' };
}
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(preference.matches);
    sync(); preference.addEventListener('change', sync);
    return () => preference.removeEventListener('change', sync);
  }, []);
  return reduced;
}
function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas'), context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext(); return true;
  } catch { return false; }
}
function featureCode(feature: GeoFeature) { return String(feature.properties.codarea); }
function boundsOf(features: GeoFeature[]): Bounds {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const feature of features) for (const polygon of featurePolygons(feature)) for (const point of polygon[0]) {
    const [x, y] = project(point); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 11.2, height: 11.2, span: 11.2 };
  const width = Math.max(maxX - minX, 0.0002), height = Math.max(maxY - minY, 0.0002);
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width, height, span: Math.max(width, height) };
}
function geographicCenter(bounds: Bounds): Coordinate { return [bounds.x / (0.29 * Math.cos(14 * Math.PI / 180)) - 54, bounds.y / 0.29 - 14.4]; }
function makeShapes(feature: GeoFeature, anchor: Coordinate) {
  return featurePolygons(feature).filter(polygon => polygon[0].length > 3).map(polygon => {
    const projected = polygon.map(ring => ring.map(coordinate => { const point = project(coordinate); return new THREE.Vector2(point[0] - anchor[0], point[1] - anchor[1]); }));
    const shape = new THREE.Shape(projected[0]);
    for (const hole of projected.slice(1)) shape.holes.push(new THREE.Path(hole));
    return shape;
  });
}

function StateMesh({ feature, region, state, municipality, preview, scopeSpan, municipalReady, reduced, pickingCamera, onHover, onLeave, onSelect }: {
  feature: GeoFeature; region: RegionId | null; state: string | null; municipality: string | null; preview: Preview;
  scopeSpan: number; municipalReady: boolean; reduced: boolean; pickingCamera: THREE.OrthographicCamera;
  onHover: (next: Preview) => void; onLeave: () => void; onSelect: (geography: StateGeography) => void;
}) {
  const geography = STATE_BY_ID[featureCode(feature)], [x, y] = project(geography.center);
  const group = useRef<THREE.Group>(null), mesh = useRef<THREE.Mesh>(null), lines = useRef<THREE.LineSegments>(null);
  const top = useRef<THREE.MeshStandardMaterial>(null), side = useRef<THREE.MeshStandardMaterial>(null), outline = useRef<THREE.LineBasicMaterial>(null);
  const geometry = useMemo(() => new THREE.ExtrudeGeometry(makeShapes(feature, [x, y]), {
    depth: 1, bevelEnabled: true, bevelThickness: 0.075, bevelSize: Math.min(boundsOf([feature]).span * 0.0025, 0.016), bevelSegments: 2, steps: 1,
  }), [feature, x, y]);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry, 25), [geometry]);
  const hitGeometry = useMemo(() => new THREE.ShapeGeometry(makeShapes(feature, [x, y])), [feature, x, y]);
  const stableRaycast = useStableRaycast(pickingCamera);
  useEffect(() => () => { geometry.dispose(); edges.dispose(); hitGeometry.dispose(); }, [geometry, edges, hitGeometry]);
  const focusedRegion = region ?? preview.region, focusedState = state ?? preview.state;
  const belongs = focusedState ? geography.uf === focusedState : focusedRegion ? geography.region === focusedRegion : true;
  const hidden = !!focusedRegion && geography.region !== focusedRegion;
  const opacity = municipality ? 0.035 : state ? geography.uf === state ? municipalReady ? 0.16 : 1 : 0.025 : focusedState ? belongs ? 1 : 0.15 : focusedRegion ? belongs ? 1 : region ? 0.04 : 0.24 : 1;
  const shade = focusedState && belongs ? '#adc7bd' : focusedRegion && belongs ? '#bbcec6' : BASE_COLOR;
  const targetColor = useRef(new THREE.Color());
  useFrame((_, delta) => {
    const factor = reduced ? 1 : 1 - Math.exp(-6 * delta), depth = scopeSpan * 0.011;
    const rise = belongs && !state && focusedState ? depth * 0.8 : belongs && !state && focusedRegion ? depth * 0.25 : 0;
    if (group.current) group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, rise, factor);
    if (mesh.current) mesh.current.scale.z = THREE.MathUtils.lerp(mesh.current.scale.z, depth, factor);
    if (lines.current) lines.current.scale.z = mesh.current?.scale.z ?? depth;
    targetColor.current.set(shade);
    for (const [index, material] of [top.current, side.current].entries()) if (material) {
      material.opacity = THREE.MathUtils.lerp(material.opacity, opacity, factor);
      material.color.lerp(index ? targetColor.current.clone().multiplyScalar(0.75) : targetColor.current, factor); material.depthWrite = material.opacity > 0.5;
    }
    if (outline.current) outline.current.opacity = THREE.MathUtils.lerp(outline.current.opacity, hidden || municipality || state && geography.uf !== state ? 0.10 : belongs && focusedState ? 0.95 : belongs ? 0.82 : 0.26, factor);
  });
  const allowed = !state && (!region || geography.region === region);
  return <>
    {allowed && <mesh geometry={hitGeometry} position={[x, scopeSpan * 0.009, -y]} rotation={[-Math.PI / 2, 0, 0]} raycast={stableRaycast}
      onPointerOver={event => { event.stopPropagation(); onHover(!region ? { ...EMPTY_PREVIEW, region: geography.region } : { ...EMPTY_PREVIEW, state: geography.uf }); }}
      onPointerMove={event => { event.stopPropagation(); onHover(!region ? { ...EMPTY_PREVIEW, region: geography.region } : { ...EMPTY_PREVIEW, state: geography.uf }); }}
      onPointerOut={onLeave}
      onClick={event => { event.stopPropagation(); onSelect(geography); }}>
      <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} side={THREE.DoubleSide}/>
    </mesh>}
    <group ref={group} position={[x, 0, -y]}>
    <mesh ref={mesh} geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.12]} castShadow={belongs && !municipality} receiveShadow raycast={() => {}}>
      <meshStandardMaterial attach="material-0" ref={top} color={BASE_COLOR} roughness={0.88} metalness={0.07} transparent />
      <meshStandardMaterial attach="material-1" ref={side} color="#8b9a94" roughness={0.9} transparent />
    </mesh>
    <lineSegments ref={lines} geometry={edges} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1, 0.12]} raycast={() => {}}>
      <lineBasicMaterial ref={outline} color="#40574f" opacity={0.90} transparent depthWrite={false} />
    </lineSegments>
  </group></>;
}

function useStableRaycast(camera: THREE.OrthographicCamera) {
  const { pointer } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  return function(this: THREE.Mesh, _: THREE.Raycaster, intersections: THREE.Intersection[]) {
    raycaster.setFromCamera(pointer, camera);
    THREE.Mesh.prototype.raycast.call(this, raycaster, intersections);
  };
}

interface MunicipalityRange { code: string; start: number; end: number }
function MunicipalMesh({ data, selected, hovered, scopeSpan, reduced, pickingCamera, onHover, onLeave, onSelect }: {
  data: BrazilGeoJSON; selected: string | null; hovered: string | null; scopeSpan: number; reduced: boolean; pickingCamera: THREE.OrthographicCamera;
  onHover: (id: string) => void; onLeave: () => void; onSelect: (id: string) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null), lines = useRef<THREE.LineSegments>(null);
  const stableRaycast = useStableRaycast(pickingCamera);
  const layout = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = [], ranges: MunicipalityRange[] = []; let offset = 0;
    for (const feature of data.features) {
      const geometry = new THREE.ExtrudeGeometry(makeShapes(feature, [0, 0]), { depth: 1, bevelEnabled: false, steps: 1 });
      const count = geometry.attributes.position.count;
      ranges.push({ code: featureCode(feature), start: offset, end: offset + count }); offset += count; geometries.push(geometry);
    }
    const geometry = mergeGeometries(geometries, false)!;
    geometries.forEach(item => item.dispose());
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 4), 4));
    const original = new Float32Array(geometry.attributes.position.array as ArrayLike<number>);
    const hitGeometry = geometry.clone();
    const hitPositions = hitGeometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < hitPositions.count; index++) hitPositions.setZ(index, 0);
    hitPositions.needsUpdate = true; hitGeometry.computeBoundingBox(); hitGeometry.computeBoundingSphere();
    return { geometry, ranges, original, edges: new THREE.EdgesGeometry(geometry, 16), hitGeometry };
  }, [data]);
  useEffect(() => () => { layout.geometry.dispose(); layout.edges.dispose(); layout.hitGeometry.dispose(); }, [layout]);
  const lifts = useRef<Record<string, number>>({});
  useEffect(() => {
    const attribute = layout.geometry.attributes.color as THREE.BufferAttribute, color = new THREE.Color();
    for (const range of layout.ranges) {
      color.set(selected === range.code ? '#429b83' : hovered === range.code ? '#a8c9bc' : BASE_COLOR);
      const alpha = selected && selected !== range.code ? 0.055 : 1;
      for (let index = range.start; index < range.end; index++) attribute.setXYZW(index, color.r, color.g, color.b, alpha);
    }
    attribute.needsUpdate = true;
  }, [layout, selected, hovered]);
  useFrame((_, delta) => {
    const factor = reduced ? 1 : 1 - Math.exp(-7 * delta), depth = scopeSpan * 0.009;
    if (mesh.current) { mesh.current.position.y = THREE.MathUtils.lerp(mesh.current.position.y, scopeSpan * 0.013, factor); mesh.current.scale.z = THREE.MathUtils.lerp(mesh.current.scale.z, depth, factor); }
    if (lines.current && mesh.current) { lines.current.position.y = mesh.current.position.y; lines.current.scale.z = mesh.current.scale.z; }
    const attribute = layout.geometry.attributes.position as THREE.BufferAttribute;
    let changed = false;
    for (const range of layout.ranges) {
      const previous = lifts.current[range.code] ?? 0, target = selected === range.code ? 3.2 : 0;
      const next = THREE.MathUtils.lerp(previous, target, factor);
      if (Math.abs(next - previous) < 0.0001) continue;
      lifts.current[range.code] = next; changed = true;
      for (let index = range.start; index < range.end; index++) attribute.setZ(index, layout.original[index * 3 + 2] * (1 + next));
    }
    if (changed) { attribute.needsUpdate = true; layout.geometry.computeBoundingSphere(); }
  });
  function codeAt(event: ThreeEvent<PointerEvent> | ThreeEvent<MouseEvent>) {
    if (event.faceIndex == null) return null;
    const vertex = event.faceIndex * 3;
    return layout.ranges.find(range => vertex >= range.start && vertex < range.end)?.code ?? null;
  }
  return <>
    <mesh geometry={layout.hitGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, scopeSpan * 0.013, 0]} raycast={stableRaycast}
      onPointerMove={!selected ? event => { const code = codeAt(event); if (code) { event.stopPropagation(); onHover(code); } } : undefined}
      onPointerOut={!selected ? onLeave : undefined}
      onClick={!selected ? event => { const code = codeAt(event); if (code) { event.stopPropagation(); onSelect(code); } } : undefined}>
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} side={THREE.DoubleSide}/>
    </mesh>
    <mesh ref={mesh} geometry={layout.geometry} rotation={[-Math.PI / 2,0,0]} scale={[1, 1, scopeSpan * 0.009]} position={[0, scopeSpan * 0.013, 0]} raycast={() => {}}><meshStandardMaterial vertexColors color="#ffffff" roughness={0.85} metalness={0.03} transparent depthWrite={!selected}/></mesh>
    {data.features.filter(f=>featureCode(f)===(selected??hovered)).map(feature=><MunicipalityOutline key={featureCode(feature)} feature={feature} height={scopeSpan*(0.013+0.009*(selected?4.2:1)+0.001)}/>)}
    <lineSegments ref={lines} geometry={layout.edges} rotation={[-Math.PI / 2, 0, 0]} position={[0, scopeSpan * 0.013, 0]} scale={[1, 1, scopeSpan * 0.009]} raycast={() => {}}>
      <lineBasicMaterial color="#40574f" opacity={selected ? 0.3 : 0.88} transparent depthWrite={false} />
    </lineSegments>
  </>;
}

function MunicipalityOutline({feature,height}:{feature:GeoFeature;height:number}) {
 const group = useRef<THREE.Group>(null);
 const geometries=useMemo(()=>featurePolygons(feature).flatMap(polygon=>polygon.map(ring=>new THREE.BufferGeometry().setFromPoints(ring.map(point=>{const [x,y]=project(point);return new THREE.Vector3(x,0,-y)})))),[feature]);
 useFrame((_,delta)=>{if(group.current)group.current.position.y=THREE.MathUtils.lerp(group.current.position.y,height,1-Math.exp(-7*delta))});
 useEffect(()=>()=>geometries.forEach(g=>g.dispose()),[geometries]);
 return <group ref={group} position={[0,height,0]}>{geometries.map((geometry,index)=><lineLoop key={index} geometry={geometry} raycast={()=>{}} renderOrder={4}><lineBasicMaterial color="#216b55" depthTest={false}/></lineLoop>)}</group>;
}
function CameraRig({ bounds, parentBounds, zoom, angle, reduced, reserveForZones, viewportInsetRight, viewportInsetBottom, pickingCamera }: {
  bounds: Bounds; parentBounds: Bounds; zoom: number; angle: number; reduced: boolean; reserveForZones: boolean;
  viewportInsetRight: number; viewportInsetBottom: number; pickingCamera: THREE.OrthographicCamera;
}) {
  const { camera, size } = useThree();
  const visualFrame = useRef(bounds), pickFrame = useRef(parentBounds);
  const motion = useRef({ zoom, angle, right: viewportInsetRight, bottom: viewportInsetBottom });
  const focus = useMemo(() => new THREE.Vector3(), []), offset = useMemo(() => new THREE.Vector3(), []);
  const direction = useMemo(() => new THREE.Vector3(), []), right = useMemo(() => new THREE.Vector3(), []);
  function interpolate(frame: Bounds, target: Bounds, factor: number): Bounds {
    return { x: THREE.MathUtils.lerp(frame.x,target.x,factor), y: THREE.MathUtils.lerp(frame.y,target.y,factor), width: THREE.MathUtils.lerp(frame.width,target.width,factor), height: THREE.MathUtils.lerp(frame.height,target.height,factor), span: THREE.MathUtils.lerp(frame.span,target.span,factor) };
  }
  function positionCamera(targetCamera: THREE.Camera, frame: Bounds, tilt: number, scale: number) {
    const orthographic = targetCamera as THREE.OrthographicCamera;
    focus.set(frame.x,0,-frame.y);
    offset.set(Math.sin(tilt)*13.5,15.5,Math.cos(tilt)*13.5);
    orthographic.position.copy(focus).add(offset); orthographic.lookAt(focus);
    const inset = Math.min(Math.max(0,motion.current.right),size.width*0.46);
    const usableWidth = Math.max(180,size.width-inset);
    const topInset = Math.min(size.width < 700 ? 216 : 215, size.height * .28);
    const bottomInset = Math.min(Math.max(size.width < 700 ? 174 : 145,motion.current.bottom) + (reserveForZones ? 108 : 0),size.height*.43);
    const reserve = topInset + bottomInset;
    const usableHeight = Math.max(160,size.height-reserve);
    const horizontal = Math.max(.08,frame.width+frame.height*Math.abs(Math.sin(tilt))*.65);
    const vertical = Math.max(.08,frame.height*.76*1.42+frame.width*Math.abs(Math.sin(tilt))*.2);
    orthographic.zoom = Math.min(usableWidth/(horizontal*1.26),usableHeight/vertical)*scale;
    right.set(1,0,0).applyQuaternion(orthographic.quaternion).multiplyScalar(inset/(2*orthographic.zoom));
    direction.set(0,1,0).applyQuaternion(orthographic.quaternion).multiplyScalar((topInset-bottomInset)/(2*orthographic.zoom));
    direction.add(right);
    orthographic.position.add(direction); focus.add(direction); orthographic.lookAt(focus);
    orthographic.updateProjectionMatrix(); orthographic.updateMatrixWorld();
  }
  useFrame((_, delta) => {
    const factor = reduced ? 1 : 1-Math.exp(-5*delta);
    visualFrame.current = interpolate(visualFrame.current,bounds,factor);
    pickFrame.current = interpolate(pickFrame.current,parentBounds,factor);
    motion.current.zoom=THREE.MathUtils.lerp(motion.current.zoom,zoom,factor);
    motion.current.angle=THREE.MathUtils.lerp(motion.current.angle,angle,factor);
    motion.current.right=THREE.MathUtils.lerp(motion.current.right,viewportInsetRight,factor);
    motion.current.bottom=THREE.MathUtils.lerp(motion.current.bottom,viewportInsetBottom,factor);
    const tilt=motion.current.angle*Math.PI/180;
    pickingCamera.left=-size.width/2;pickingCamera.right=size.width/2;pickingCamera.top=size.height/2;pickingCamera.bottom=-size.height/2;
    positionCamera(camera,visualFrame.current,tilt,motion.current.zoom);
    positionCamera(pickingCamera,pickFrame.current,tilt,motion.current.zoom);
  });
  return null;
}
function LabelProjector({ refs, labels, camera }: { refs: { current: Record<string, HTMLDivElement | null> }; labels: ProjectedLabel[]; camera: THREE.OrthographicCamera }) {
  const { size } = useThree(), position = useRef(new THREE.Vector3());
  useFrame(() => {
    camera.updateMatrixWorld();
    for (const label of labels) {
      const element = refs.current[label.key]; if (!element) continue;
      const [x, y] = project(label.center); position.current.set(x, label.height, -y).project(camera);
      element.style.transform = `translate3d(${position.current.x * size.width / 2 + size.width / 2}px,${-position.current.y * size.height / 2 + size.height / 2}px,0) translate(-50%,-50%)`;
      element.style.visibility = position.current.z > -1 && position.current.z < 1 ? 'visible' : 'hidden';
    }
  });
  return null;
}
function SurveyGrid() {
  const grid = useMemo(() => { const object = new THREE.GridHelper(25, 30, '#b8c2b5', '#c7cec3'); const material = object.material as THREE.LineBasicMaterial; material.transparent = true; material.opacity = 0.25; material.depthWrite = false; return object; }, []);
  useEffect(() => () => { grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); }, [grid]);
  return <group position={[0, -0.31, 0]}><primitive object={grid} /><mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow><planeGeometry args={[100, 100]} /><shadowMaterial color="#66735d" transparent opacity={0.13} /></mesh>{[7.3, 8.3].map(radius => <mesh key={radius} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[radius, radius + 0.012, 96]} /><meshBasicMaterial color="#b8c2b5" transparent opacity={0.24} side={THREE.DoubleSide} depthWrite={false} /></mesh>)}</group>;
}
class MapBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onFail: () => void }, { failed: boolean }> {
  state = { failed: false }; static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function svgPath(feature: GeoFeature) { return featurePolygons(feature).map(polygon => polygon.map(ring => ring.map((point, index) => { const [x, y] = project(point); return `${index ? 'L' : 'M'}${x},${-y}`; }).join(' ') + ' Z').join(' ')).join(' '); }

export default function BrazilMap(props: BrazilMapProps) {
  const { region, state, municipality = null, zone = null, municipalities = [], zones = [], onRegionChange, onStateChange, onMunicipalityChange = () => {}, onZoneChange = () => {}, summaries, territorySummaries = {}, metric, resetKey } = props;
  const [data, setData] = useState<BrazilGeoJSON | null>(null);
  const [municipalSnapshot, setMunicipalSnapshot] = useState<{ state: string; data: BrazilGeoJSON } | null>(null);
  const municipalData = municipalSnapshot?.state === state ? municipalSnapshot.data : null;
  const [loadError, setLoadError] = useState(false), [municipalLoading, setMunicipalLoading] = useState(false), [municipalError, setMunicipalError] = useState(false);
  const [available, setAvailable] = useState(supportsWebGL), [preview, setPreview] = useState<Preview>(EMPTY_PREVIEW), [zoom, setZoom] = useState(1), [angle, setAngle] = useState(-6);
  const pickingCamera = useMemo(() => new THREE.OrthographicCamera(-1,1,1,-1,.1,100), []);
  const viewportInsetRight = props.viewportInsetRight ?? 0;
  const viewportInsetBottom = props.viewportInsetBottom ?? 145;
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null), labelRefs = useRef<Record<string, HTMLDivElement | null>>({}), reduced = useReducedMotion();
  const level = zone ? 'zone' : municipality ? 'municipality' : state ? 'state' : region ? 'region' : 'country';
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}brazil-states.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then((geo: BrazilGeoJSON) => { if (geo.features?.length !== 27) throw new Error(); setData(geo); }).catch(error => { if (error.name !== 'AbortError') setLoadError(true); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    setMunicipalSnapshot(null); setMunicipalError(false);
    if (!state) { setMunicipalLoading(false); return; }
    if (municipalityCache.has(state)) { setMunicipalSnapshot({ state, data: municipalityCache.get(state)! }); setMunicipalLoading(false); return; }
    const controller = new AbortController(); setMunicipalLoading(true);
    fetch(`${import.meta.env.BASE_URL}data/municipalities/${state.toLowerCase()}.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then((geo: BrazilGeoJSON) => {
      if (controller.signal.aborted) return;
      if (!geo.features?.length) throw new Error(); municipalityCache.set(state, geo); setMunicipalSnapshot({ state, data: geo }); setMunicipalLoading(false);
    }).catch(error => { if (error.name !== 'AbortError') { setMunicipalError(true); setMunicipalLoading(false); } });
    return () => controller.abort();
  }, [state]);
  useEffect(() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setPreview(EMPTY_PREVIEW); setZoom(1); }, [region, state, municipality, zone]);
  useEffect(() => { setPreview(EMPTY_PREVIEW); setZoom(1); setAngle(-6); }, [resetKey]);
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);
  const stateFeatures = useMemo(() => Object.fromEntries((data?.features ?? []).map(feature => [STATE_BY_ID[featureCode(feature)].uf, feature])), [data]);
  const municipalFeatures = useMemo(() => Object.fromEntries((municipalData?.features ?? []).map(feature => [featureCode(feature), feature])), [municipalData]);
  const municipalRecords = useMemo(() => Object.fromEntries(municipalities.map(item => [item.id, item])), [municipalities]);
  const parentBounds = useMemo(() => municipality && municipalFeatures[municipality] ? boundsOf([municipalFeatures[municipality]]) : state && stateFeatures[state] ? boundsOf([stateFeatures[state]]) : region ? boundsOf((data?.features ?? []).filter(feature => STATE_BY_ID[featureCode(feature)].region === region)) : boundsOf(data?.features ?? []), [municipality, municipalFeatures, state, stateFeatures, region, data]);
  const viewBounds = useMemo(() => {
    let child: Bounds | null = null;
    if (!region && preview.region) child = boundsOf((data?.features ?? []).filter(feature => STATE_BY_ID[featureCode(feature)].region === preview.region));
    if (region && !state && preview.state && stateFeatures[preview.state]) child = boundsOf([stateFeatures[preview.state]]);
    if (state && !municipality && preview.municipality && municipalFeatures[preview.municipality]) child = boundsOf([municipalFeatures[preview.municipality]]);
    if (!child) return parentBounds;
    if (state) return parentBounds;
    const blend = 0.28;
    return { x: THREE.MathUtils.lerp(parentBounds.x, child.x, blend), y: THREE.MathUtils.lerp(parentBounds.y, child.y, blend), width: THREE.MathUtils.lerp(parentBounds.width, child.width, blend), height: THREE.MathUtils.lerp(parentBounds.height, child.height, blend), span: THREE.MathUtils.lerp(parentBounds.span, child.span, blend) };
  }, [region, state, municipality, preview, data, stateFeatures, municipalFeatures, parentBounds]);
  const missingMunicipality = !!municipality && !!municipalData && !municipalFeatures[municipality];
  const focusedMunicipality = municipality ?? preview.municipality, focusedRecord = focusedMunicipality ? municipalRecords[focusedMunicipality] : null;
  const labels = useMemo<ProjectedLabel[]>(() => {
    if (!region) return REGIONS.map(item => ({ key: 'region:' + item.id, center: item.center, height: parentBounds.span * 0.037 }));
    if (!state) return STATES.filter(item => item.region === region).map(item => ({ key: 'state:' + item.uf, center: item.center, height: parentBounds.span * 0.037 }));
    if (focusedMunicipality && municipalFeatures[focusedMunicipality]) return [{ key: 'municipality:' + focusedMunicipality, center: geographicCenter(boundsOf([municipalFeatures[focusedMunicipality]])), height: parentBounds.span * (municipality ? 0.059 : 0.025) }];
    return [];
  }, [region, state, focusedMunicipality, municipalFeatures, municipality, parentBounds.span]);
  function hover(next: Preview) { if (hoverTimer.current) clearTimeout(hoverTimer.current); setPreview(previous => previous.region === next.region && previous.state === next.state && previous.municipality === next.municipality && previous.zone === next.zone ? previous : next); }
  function leave() { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setPreview(EMPTY_PREVIEW), 120); }
  function selectState(geography: StateGeography) { setPreview(EMPTY_PREVIEW); if (!region) onRegionChange(geography.region); else if (!state && geography.region === region) onStateChange(geography.uf); }
  function reset() { setPreview(EMPTY_PREVIEW); onRegionChange(null); setZoom(1); setAngle(-6); }
  const zoneRecords = zones.filter(item => !item.municipalityId || item.municipalityId === municipality);
  const previewName = preview.zone ? `Zona eleitoral ${preview.zone}` : preview.municipality ? municipalRecords[preview.municipality]?.name ?? 'Município' : preview.state ? STATE_BY_UF[preview.state]?.name : preview.region ? REGION_BY_ID[preview.region].name : null;
  const previewSummary = preview.zone ? territorySummaries[`zone:${preview.zone}`] ?? territorySummaries[String(preview.zone)] : preview.municipality ? territorySummaries[preview.municipality] : preview.state ? territorySummaries[preview.state] : preview.region ? summaries[preview.region] : undefined;
  const content = summaryText(previewSummary, metric,props.financialLabel);
  const fallback = data && <div className="map-svg-fallback"><svg viewBox={`${viewBounds.x - viewBounds.width * .65 / zoom} ${-viewBounds.y - viewBounds.height * .65 / zoom} ${viewBounds.width * 1.3 / zoom} ${viewBounds.height * 1.3 / zoom}`} role="img" aria-label="Mapa dos limites oficiais do território selecionado">
    {(state && municipalData ? municipalData.features : data.features).map(feature => {
      const code = featureCode(feature), geography = state && municipalData ? null : STATE_BY_ID[code];
      const selected = geography ? state === geography.uf : municipality === code;
      return <path key={code} d={svgPath(feature)} fill={selected ? '#429b83' : BASE_COLOR} stroke="#40574f" strokeWidth={viewBounds.span * 0.002} fillRule="evenodd" opacity={geography && region && geography.region !== region || !geography && municipality && municipality !== code ? .07 : 1}
        onMouseLeave={leave} onMouseEnter={() => geography ? !state && hover(!region ? { ...EMPTY_PREVIEW, region: geography.region } : { ...EMPTY_PREVIEW, state: geography.uf }) : !municipality && hover({ ...EMPTY_PREVIEW, municipality: code })}
        onClick={() => geography ? selectState(geography) : !municipality && onMunicipalityChange(code)}><title>{geography?.name ?? municipalRecords[code]?.name ?? code}</title></path>;
    })}
  </svg>{!region && <div className="map-fallback-regions">{REGIONS.map(item => <button key={item.id} onClick={() => onRegionChange(item.id)}>{item.name}</button>)}</div>}</div>;

  return <div className={`brazil-map${previewName ? ' is-hovered' : ''}`} style={{'--map-sidebar-inset':viewportInsetRight+'px'} as CSSProperties} data-level={level} data-preview={previewName ?? ''} onPointerEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }} onPointerLeave={leave}>
    {data ? available ? <MapBoundary fallback={fallback} onFail={() => setAvailable(false)}><Canvas orthographic camera={{ position: [-1.4, 15.5, 13.5], zoom: 35, near: .1, far: 100 }} dpr={[1, 1.5]} shadows gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onPointerMissed={() => setPreview(EMPTY_PREVIEW)} onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); setAvailable(false); }); gl.setClearColor('#eceee9', 0); }}>
      <ambientLight intensity={1.35} /><hemisphereLight args={['#fafbf9', '#bec9c5', 1.35]} /><directionalLight position={[-5, 12, 8]} intensity={3} castShadow shadow-mapSize={[1024, 1024]} shadow-camera-left={-9} shadow-camera-right={9} shadow-camera-top={9} shadow-camera-bottom={-9} shadow-normalBias={.02} shadow-bias={-.0002} /><directionalLight position={[7, 3, -5]} intensity={1.4} color="#e9eeed" />
      <CameraRig bounds={viewBounds} parentBounds={parentBounds} zoom={zoom} angle={angle} reduced={reduced} reserveForZones={!!municipality} viewportInsetRight={viewportInsetRight} viewportInsetBottom={viewportInsetBottom} pickingCamera={pickingCamera} /><SurveyGrid />
      {data.features.map(feature => { const item = STATE_BY_ID[featureCode(feature)]; return <StateMesh key={item.uf} feature={feature} region={region} state={state} municipality={missingMunicipality ? null : municipality} preview={preview} scopeSpan={parentBounds.span} pickingCamera={pickingCamera} municipalReady={!!municipalData} reduced={reduced} onHover={hover} onLeave={leave} onSelect={selectState} />; })}
      {state && municipalData && <MunicipalMesh data={municipalData} selected={missingMunicipality ? null : municipality} hovered={preview.municipality} scopeSpan={parentBounds.span} pickingCamera={pickingCamera} reduced={reduced} onHover={id => { if (!municipality) hover({ ...EMPTY_PREVIEW, municipality: id }); }} onLeave={leave} onSelect={id => { if (!municipality) { setPreview(EMPTY_PREVIEW); onMunicipalityChange(id); } }} />}
      {!state && <ContactShadows position={[0, -.3, 0]} scale={20} blur={2.5} opacity={region ? .015 : preview.region ? .06 : .26} far={2.5} resolution={256} frames={reduced ? 1 : Infinity} color="#72826b" />}
      <LabelProjector refs={labelRefs} labels={labels} camera={pickingCamera} />
    </Canvas></MapBoundary> : fallback : <div className="map-loading"><span className="map-loading-orbit" /><p>{loadError ? 'Não foi possível carregar o mapa.' : 'Preparando o território…'}</p></div>}

    {data && available && <div className="map-label-layer">{labels.map(label => <div key={label.key} className="map-projected-label" ref={element => { labelRefs.current[label.key] = element; }}>
      {label.key.startsWith('region:') ? (() => { const id = label.key.slice(7) as RegionId, item = REGION_BY_ID[id], value = summaryText(summaries[id], metric,props.financialLabel); return <button className={`map-region-pin${preview.region === id ? ' is-active' : ''}`} onMouseLeave={leave} onMouseEnter={() => hover({ ...EMPTY_PREVIEW, region: id })} onClick={() => { setPreview(EMPTY_PREVIEW); onRegionChange(id); }} aria-label={`Explorar região ${item.name}, ${value.value} ${value.caption}`}><span className="map-region-pin-name"><i />{item.shortName}<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg></span><strong>{value.value}</strong><small>{value.caption}</small></button>; })()
      : label.key.startsWith('state:') ? (() => { const uf = label.key.slice(6), item = STATE_BY_UF[uf]; return <button className={`map-state-label${preview.state === uf ? ' is-preview' : ''}`} onMouseLeave={leave} onMouseEnter={() => hover({ ...EMPTY_PREVIEW, state: uf })} onClick={() => { setPreview(EMPTY_PREVIEW); onStateChange(uf); }} title={item.name} aria-label={`Selecionar ${item.name}`}>{uf}<small className="map-state-metric">{summaryText(territorySummaries[uf],metric,props.financialLabel).value}</small></button>; })()
      : <button onMouseEnter={() => { if(hoverTimer.current)clearTimeout(hoverTimer.current); }} onMouseLeave={() => !municipality && leave()} className={`map-municipality-label${municipality ? ' is-selected' : ''}`} onClick={() => !municipality && focusedMunicipality && onMunicipalityChange(focusedMunicipality)} aria-label={`${municipality ? 'Município selecionado' : 'Selecionar município'} ${focusedRecord?.name ?? focusedMunicipality}`} aria-pressed={!!municipality}><i />{focusedRecord?.name ?? focusedMunicipality}{!municipality && <span>Selecionar ↗</span>}</button>}
    </div>)}</div>}

    {municipality && <div className="map-zone-layer"><div className="map-zone-heading"><span>Zonas eleitorais</span><small>Seleção analítica · sem limites geográficos</small></div><div className="map-zone-cards">{zoneRecords.length ? zoneRecords.map(item => { const value = summaryText(territorySummaries[`zone:${item.number}`] ?? territorySummaries[String(item.number)], metric,props.financialLabel); return <button key={item.number} className={zone === item.number ? 'is-selected' : preview.zone === item.number ? 'is-preview' : ''} aria-label={`Selecionar zona eleitoral ${item.number}`} aria-pressed={zone === item.number} onMouseEnter={() => hover({ ...EMPTY_PREVIEW, zone: item.number })} onMouseLeave={() => hover(EMPTY_PREVIEW)} onClick={() => { setPreview(EMPTY_PREVIEW); onZoneChange(zone === item.number ? null : item.number); }}><span>Zona {String(item.number).padStart(3, '0')}</span><strong>{value.value}</strong></button>; }) : <p>As zonas deste município aparecerão após a consulta oficial.</p>}</div></div>}
    {previewName && !municipality && <div className="map-preview-card"><span>Prévia · passe o mouse para explorar</span><strong>{previewName}</strong><small>{preview.municipality&&props.summariesLoading&&!previewSummary?'Consultando média municipal…':content.value+' · '+content.caption}</small><em>Clique para selecionar</em></div>}
    {state && (municipalLoading || municipalError || missingMunicipality) && <div className="map-geometry-status" role="status">{municipalLoading ? 'Carregando limites dos municípios…' : missingMunicipality ? 'A malha oficial ainda não inclui este município. Exibindo a UF.' : 'Limites municipais indisponíveis. Selecione o município nos filtros.'}</div>}
    {!state && region && <div className="map-state-picker" aria-label={`Estados da região ${REGION_BY_ID[region].name}`}><div>{STATES.filter(item => item.region === region).map(item => <button key={item.uf} title={item.name} aria-label={`Selecionar ${item.name}`} onMouseLeave={leave} onMouseEnter={() => hover({ ...EMPTY_PREVIEW, state: item.uf })} onClick={() => onStateChange(item.uf)}>{item.uf}</button>)}</div></div>}
    <div className="map-compass" aria-hidden="true"><span>N</span><svg viewBox="0 0 24 34" width="18" height="25"><path d="m12 2 7 24-7-5-7 5z" fill="#6d7968" /><path d="m12 2 0 19 7 5z" fill="#acb7a5" /></svg></div>
    <div className="map-controls" aria-label="Controles do mapa"><button title="Aproximar" aria-label="Aproximar mapa" onClick={() => setZoom(value => Math.min(value * 1.16, 2))}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg></button><button title="Afastar" aria-label="Afastar mapa" onClick={() => setZoom(value => Math.max(value / 1.16, .65))}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12" /></svg></button><i /><button title="Girar perspectiva" aria-label="Girar perspectiva do mapa" disabled={!available} onClick={() => setAngle(value => value >= 24 ? -24 : value + 12)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 8a6 6 0 1 0-1 7M16 3v5h-5" /></svg></button><button title="Visão completa do Brasil" aria-label="Restaurar visão completa do Brasil" onClick={reset}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8V4h4M12 4h4v4M16 12v4h-4M8 16H4v-4" /></svg></button></div>
    <div className="map-announcer" aria-live="polite">{zone ? `Zona eleitoral ${zone} selecionada.` : municipality ? `${focusedRecord?.name ?? 'Município'} selecionado. Escolha uma zona eleitoral.` : state ? `${STATE_BY_UF[state]?.name} selecionado. Escolha um município.` : region ? `Região ${REGION_BY_ID[region].name} selecionada. Escolha um estado.` : 'Brasil completo. Selecione uma região.'}</div>
  </div>;
}
