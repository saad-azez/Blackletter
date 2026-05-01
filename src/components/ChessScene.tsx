import {
  Clone,
  OrthographicCamera,
  PerspectiveCamera,
  useGLTF,
} from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type GUI from 'lil-gui';
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';

import battlefieldTextureUrl from '../assets/Textures/low_angle_battlefield_depth_of_field_pillars_cinema.jpeg';
import {
  chessAmbientIntensityControl,
  chessCameraAxisControls,
  chessCameraFovControl,
  chessDirectionalIntensityControl,
  chessFloorMeshTransformDefaults,
  chessFloorLightAxisControls,
  chessFloorLightColorControl,
  chessFloorLightDefaults,
  chessFloorLightEnabledControl,
  chessFloorLightIntensityControl,
  chessFloorLightOpacityControl,
  chessLightPositionAxisControls,
  chessLightsControl,
  chessFloorTransformDefaults,
  chessPerspectiveCamera,
  chessPieceDefaults,
  chessSceneLightDefaults,
  chessSpotIntensityControl,
  pieceLayoutAxisControls,
  scenePositionAxisControls,
  sceneRotationAxisControls,
  uniformScaleControl,
  type ChessAmbientLightSettings,
  type ChessFloorMeshTransform,
  type ChessHemisphereLightSettings,
  type ChessPieceTransform,
  type ChessPositionedLightSettings,
  type ChessSceneLightSettings,
  type SceneCameraPosition,
  type SceneTransform,
} from './ChessScene.config';
import { FloorTopLight } from './FloorTopLight';
import {
  clampFloorLightIntensity,
  clampFloorLightOpacity,
  defaultFloorLightColor,
  type FloorLightSettings,
} from './FloorTopLight.config';

const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const cameraModes = ['Perspective', 'Orthographic'] as const;
const DebugOrbitControls = lazy(() =>
  import('./DebugOrbitControls').then((module) => ({ default: module.DebugOrbitControls })),
);
const defaultFloorModelUrl = new URL('../assets/Floor/Floor.glb', import.meta.url).href;
const defaultChessModelUrl = new URL('../assets/Chess/chees.glb', import.meta.url).href;
const compactChessBreakpoint = 1024;
const mobileChessBreakpoint = 640;
const mobileVisiblePieceIndexes = new Set([1, 4, 5]);

useGLTF.preload(defaultFloorModelUrl, dracoDecoderPath);
useGLTF.preload(defaultChessModelUrl, dracoDecoderPath);

type CameraMode = (typeof cameraModes)[number];

export interface ChessSceneProps {
  animationEnabled?: boolean;
  backgroundImageUrl?: string;
  cameraFov?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  chessModelUrl?: string;
  fillParent?: boolean;
  floorModelUrl?: string;
  modelScale?: number;
  showGui?: boolean;
}

interface GuiState {
  animationEnabled: boolean;
  board: SceneTransform;
  cameraFov: number;
  cameraMode: CameraMode;
  orbitEnabled: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  floor: ChessFloorMeshTransform;
  floorLight: FloorLightSettings;
  lightsEnabled: boolean;
  pieces: ChessPieceTransform[];
  sceneLights: ChessSceneLightSettings;
}

interface TransformGuiControllers {
  rotationX?: ReturnType<GUI['add']>;
  rotationY?: ReturnType<GUI['add']>;
  rotationZ?: ReturnType<GUI['add']>;
  scale?: ReturnType<GUI['add']>;
  visible?: ReturnType<GUI['add']>;
  x?: ReturnType<GUI['add']>;
  y?: ReturnType<GUI['add']>;
  z?: ReturnType<GUI['add']>;
}

interface FloorLightGuiControllers {
  color?: ReturnType<GUI['addColor']>;
  enabled?: ReturnType<GUI['add']>;
  intensity?: ReturnType<GUI['add']>;
  opacity?: ReturnType<GUI['add']>;
  x?: ReturnType<GUI['add']>;
  y?: ReturnType<GUI['add']>;
  z?: ReturnType<GUI['add']>;
}

interface LightColorIntensityGuiControllers {
  color?: ReturnType<GUI['addColor']>;
  intensity?: ReturnType<GUI['add']>;
}

interface PositionedLightGuiControllers extends LightColorIntensityGuiControllers {
  x?: ReturnType<GUI['add']>;
  y?: ReturnType<GUI['add']>;
  z?: ReturnType<GUI['add']>;
}

interface HemisphereLightGuiControllers {
  groundColor?: ReturnType<GUI['addColor']>;
  intensity?: ReturnType<GUI['add']>;
  skyColor?: ReturnType<GUI['addColor']>;
  x?: ReturnType<GUI['add']>;
  y?: ReturnType<GUI['add']>;
  z?: ReturnType<GUI['add']>;
}

interface SceneLightsGuiControllers {
  ambient: LightColorIntensityGuiControllers;
  backSpot: PositionedLightGuiControllers;
  hemisphere: HemisphereLightGuiControllers;
  mainDirectional: PositionedLightGuiControllers;
  secondaryDirectional: PositionedLightGuiControllers;
  topSpot: PositionedLightGuiControllers;
}

interface GuiControllers {
  animationEnabled?: ReturnType<GUI['add']>;
  board: TransformGuiControllers;
  cameraFov?: ReturnType<GUI['add']>;
  cameraMode?: ReturnType<GUI['add']>;
  orbitEnabled?: ReturnType<GUI['add']>;
  cameraX?: ReturnType<GUI['add']>;
  cameraY?: ReturnType<GUI['add']>;
  cameraZ?: ReturnType<GUI['add']>;
  floor: TransformGuiControllers;
  floorLight: FloorLightGuiControllers;
  lightsEnabled?: ReturnType<GUI['add']>;
  pieces: TransformGuiControllers[];
  sceneLights: SceneLightsGuiControllers;
}

interface ChessBoardSceneProps {
  animationEnabled: boolean;
  chessModelUrl: string;
  floorLight: FloorLightSettings;
  floorMeshTransform: ChessFloorMeshTransform;
  floorModelUrl: string;
  floorTransform: SceneTransform;
  lightsEnabled: boolean;
  cameraFov: number;
  modelScale: number;
  pieceTransforms: ChessPieceTransform[];
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

interface ChessSceneCameraProps {
  fov: number;
  mode: CameraMode;
  position: SceneCameraPosition;
  target: SceneCameraPosition;
}

interface ChessLightingProps {
  enabled: boolean;
  floorTransform: SceneTransform;
  sceneLights: ChessSceneLightSettings;
}

interface PreparedSceneResult {
  footprintDepth: number;
  footprintWidth: number;
  layoutFootprintDepth: number;
  layoutFootprintWidth: number;
  root: THREE.Group;
}

interface SceneRenderSize {
  height: number;
  width: number;
}

function getComposedParent(element: Element | null): Element | null {
  if (!element) {
    return null;
  }

  if (element.parentElement) {
    return element.parentElement;
  }

  const root = element.getRootNode();

  return root instanceof ShadowRoot ? root.host : null;
}

function findComposedClosest(element: Element | null, selector: string) {
  let current: Element | null = element;

  while (current) {
    if (current.matches(selector)) {
      return current;
    }

    current = getComposedParent(current);
  }

  return null;
}

function getShadowHostElement(element: Element | null) {
  if (!element) {
    return null;
  }

  const root = element.getRootNode();

  return root instanceof ShadowRoot && root.host instanceof HTMLElement ? root.host : null;
}

function measureSceneRenderSize(element: HTMLElement | null): SceneRenderSize | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const width = Math.round(element.offsetWidth || element.clientWidth || rect.width);
  const height = Math.round(element.offsetHeight || element.clientHeight || rect.height);

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { height, width };
}

function measureSceneTargetSize(element: HTMLElement | null, fillParent: boolean): SceneRenderSize | null {
  if (!element) {
    return null;
  }

  const frame = fillParent ? findComposedClosest(element, '.frame') : null;

  if (frame instanceof HTMLElement) {
    const frameSize = measureSceneRenderSize(frame);

    if (frameSize) {
      return frameSize;
    }
  }

  const host = fillParent ? getShadowHostElement(element) : null;

  if (host) {
    const hostSize = measureSceneRenderSize(host);

    if (hostSize) {
      return hostSize;
    }
  }

  return measureSceneRenderSize(element);
}

function toText(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (typeof record.text === 'string') {
      return record.text;
    }

    if (typeof record.value === 'string') {
      return record.value;
    }
  }

  return '';
}

function toNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsedValue = Number(toText(value).trim());

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function clampCameraAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = chessCameraAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampCameraFov(value: number) {
  return THREE.MathUtils.clamp(value, chessCameraFovControl.min, chessCameraFovControl.max);
}

function clampScenePositionAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = scenePositionAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampFloorLightAxis(axis: 'x' | 'y' | 'z', value: number) {
  const control = chessFloorLightAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampPieceLayoutAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = pieceLayoutAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampSceneRotationAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = sceneRotationAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampUniformScale(value: number) {
  return THREE.MathUtils.clamp(value, uniformScaleControl.min, uniformScaleControl.max);
}

function normalizeFloorTransform(transform: SceneTransform): SceneTransform {
  return {
    rotationX: clampSceneRotationAxis('x', transform.rotationX),
    rotationY: clampSceneRotationAxis('y', transform.rotationY),
    rotationZ: clampSceneRotationAxis('z', transform.rotationZ),
    scale: clampUniformScale(transform.scale),
    x: clampScenePositionAxis('x', transform.x),
    y: clampScenePositionAxis('y', transform.y),
    z: clampScenePositionAxis('z', transform.z),
  };
}

function normalizeFloorMeshTransform(transform: ChessFloorMeshTransform): ChessFloorMeshTransform {
  return {
    rotationX: clampSceneRotationAxis('x', transform.rotationX),
    rotationY: clampSceneRotationAxis('y', transform.rotationY),
    rotationZ: clampSceneRotationAxis('z', transform.rotationZ),
    scale: clampUniformScale(transform.scale),
    visible: transform.visible,
    x: clampScenePositionAxis('x', transform.x),
    y: clampScenePositionAxis('y', transform.y),
    z: clampScenePositionAxis('z', transform.z),
  };
}

function normalizeFloorLightSettings(settings: FloorLightSettings): FloorLightSettings {
  const normalizedColor = toText(settings.color).trim();

  return {
    color: normalizedColor || defaultFloorLightColor,
    enabled: settings.enabled !== false,
    intensity: clampFloorLightIntensity(settings.intensity),
    opacity: clampFloorLightOpacity(settings.opacity),
    x: clampFloorLightAxis('x', settings.x),
    y: clampFloorLightAxis('y', settings.y),
    z: clampFloorLightAxis('z', settings.z),
  };
}

function normalizePieceTransform(transform: ChessPieceTransform): ChessPieceTransform {
  return {
    rotationX: clampSceneRotationAxis('x', transform.rotationX),
    rotationY: clampSceneRotationAxis('y', transform.rotationY),
    rotationZ: clampSceneRotationAxis('z', transform.rotationZ),
    scale: clampUniformScale(transform.scale),
    visible: transform.visible,
    x: clampPieceLayoutAxis('x', transform.x),
    y: clampPieceLayoutAxis('y', transform.y),
    z: clampPieceLayoutAxis('z', transform.z),
  };
}

function clonePieceTransforms(pieces: readonly ChessPieceTransform[]) {
  return pieces.map((piece) => normalizePieceTransform({ ...piece }));
}

function createSunBeamTexture() {
  if (typeof document === 'undefined') {
    const fallbackTexture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );

    fallbackTexture.needsUpdate = true;

    return fallbackTexture;
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  canvas.width = 128;
  canvas.height = 512;

  if (!context) {
    const fallbackTexture = new THREE.DataTexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      THREE.RGBAFormat,
    );

    fallbackTexture.needsUpdate = true;

    return fallbackTexture;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(255, 255, 255, 1)';
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = 'destination-in';

  const horizontalMask = context.createLinearGradient(0, 0, canvas.width, 0);

  horizontalMask.addColorStop(0, 'rgba(255,255,255,0)');
  horizontalMask.addColorStop(0.2, 'rgba(255,255,255,0.14)');
  horizontalMask.addColorStop(0.5, 'rgba(255,255,255,1)');
  horizontalMask.addColorStop(0.8, 'rgba(255,255,255,0.14)');
  horizontalMask.addColorStop(1, 'rgba(255,255,255,0)');

  context.fillStyle = horizontalMask;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = 'destination-in';

  const verticalMask = context.createLinearGradient(0, 0, 0, canvas.height);

  verticalMask.addColorStop(0, 'rgba(255,255,255,0)');
  verticalMask.addColorStop(0.08, 'rgba(255,255,255,0.65)');
  verticalMask.addColorStop(0.32, 'rgba(255,255,255,0.4)');
  verticalMask.addColorStop(0.72, 'rgba(255,255,255,0.12)');
  verticalMask.addColorStop(1, 'rgba(255,255,255,0)');

  context.fillStyle = verticalMask;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

function getOrthographicZoom(
  position: SceneCameraPosition,
  target: SceneCameraPosition,
  viewportHeight: number,
  fov: number,
) {
  const cameraVector = new THREE.Vector3(position.x, position.y, position.z);
  const targetVector = new THREE.Vector3(target.x, target.y, target.z);
  const cameraDistance = Math.max(cameraVector.distanceTo(targetVector), 0.5);
  const visibleHeight = 2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(fov / 2));

  return THREE.MathUtils.clamp(viewportHeight / Math.max(visibleHeight, 0.01), 10, 500);
}

function shapePointerAxis(value: number) {
  const clampedValue = THREE.MathUtils.clamp(value, -1, 1);

  return Math.sign(clampedValue) * Math.pow(Math.abs(clampedValue), 1.2);
}

function getViewportAtDistance(distance: number, fov: number, aspectRatio: number) {
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * distance;

  return {
    height,
    width: height * aspectRatio,
  };
}

function getCompactLayoutAmount(width: number, aspectRatio: number) {
  if (width <= 0 || width >= compactChessBreakpoint) {
    return 0;
  }

  return THREE.MathUtils.clamp((1.05 - aspectRatio) / 0.4, 0, 1);
}

function getFocusedPieceTargetHeight(
  floorFootprintWidth: number,
  floorFootprintDepth: number,
  aspectRatio: number,
  cameraFov: number,
  floorScale: number,
  compactLayoutAmount: number,
) {
  const baseHeight = Math.max(Math.min(floorFootprintWidth, floorFootprintDepth) * 0.18, 0.25);
  const viewport = getViewportAtDistance(chessPerspectiveCamera.position.z, cameraFov, aspectRatio);
  const focusHeight = (viewport.height * 0.36) / Math.max(floorScale, 0.001);

  return THREE.MathUtils.lerp(baseHeight, focusHeight, compactLayoutAmount);
}

function getWorldScaleForSceneSize(
  size: THREE.Vector3,
  aspectRatio: number,
  modelScale: number,
  fov: number,
) {
  const viewport = getViewportAtDistance(chessPerspectiveCamera.position.z, fov, aspectRatio);

  return (
    Math.min(
      viewport.width / Math.max(size.x, 0.001),
      viewport.height / Math.max(size.y, 0.001),
    ) *
    modelScale *
    0.8
  );
}

function getCompactFloorScale(compactLayoutAmount: number) {
  return THREE.MathUtils.lerp(1, 2.25, compactLayoutAmount);
}

function prepareSceneObject(scene: THREE.Object3D, castShadow: boolean, receiveShadow: boolean) {
  const root = scene.clone(true) as THREE.Group;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => {
        material.side = THREE.FrontSide;
        material.needsUpdate = true;
      });
      return;
    }

    child.material.side = THREE.FrontSide;
    child.material.needsUpdate = true;
  });

  return root;
}

function buildPreparedFloorScene(
  scene: THREE.Object3D,
  aspectRatio: number,
  modelScale: number,
  cameraFov: number,
  compactLayoutAmount: number,
): PreparedSceneResult {
  const root = prepareSceneObject(scene, false, true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const layoutWorldScale = getWorldScaleForSceneSize(
    size,
    aspectRatio,
    modelScale,
    cameraFov,
  );
  const worldScale = layoutWorldScale * getCompactFloorScale(compactLayoutAmount);
  const topY = bounds.max.y;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -topY * worldScale, -center.z * worldScale);
  root.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const scaledSize = scaledBounds.getSize(new THREE.Vector3());

  return {
    footprintDepth: scaledSize.z,
    footprintWidth: scaledSize.x,
    layoutFootprintDepth: size.z * layoutWorldScale,
    layoutFootprintWidth: size.x * layoutWorldScale,
    root,
  };
}

function buildPreparedPieceScene(
  scene: THREE.Object3D,
  targetHeight: number,
): PreparedSceneResult {
  const root = prepareSceneObject(scene, true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const worldScale = targetHeight / Math.max(size.y, 0.001);
  const baseY = bounds.min.y;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -baseY * worldScale, -center.z * worldScale);
  root.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(root);
  const scaledSize = scaledBounds.getSize(new THREE.Vector3());

  return {
    footprintDepth: scaledSize.z,
    footprintWidth: scaledSize.x,
    layoutFootprintDepth: scaledSize.z,
    layoutFootprintWidth: scaledSize.x,
    root,
  };
}

export function ChessScene({
  animationEnabled = true,
  backgroundImageUrl = '',
  cameraFov = chessPerspectiveCamera.fov,
  cameraX = chessPerspectiveCamera.position.x,
  cameraY = chessPerspectiveCamera.position.y,
  cameraZ = chessPerspectiveCamera.position.z,
  chessModelUrl = '',
  fillParent = false,
  floorModelUrl = '',
  modelScale = 1,
  showGui = false,
}: ChessSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const guiRootRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const guiStateRef = useRef<GuiState | null>(null);
  const guiControllersRef = useRef<GuiControllers>({
    board: {},
    floor: {},
    floorLight: {},
    pieces: [],
    sceneLights: {
      ambient: {},
      backSpot: {},
      hemisphere: {},
      mainDirectional: {},
      secondaryDirectional: {},
      topSpot: {},
    },
  });
  const resolvedFloorModelUrl = toText(floorModelUrl).trim() || defaultFloorModelUrl;
  const resolvedChessModelUrl = toText(chessModelUrl).trim() || defaultChessModelUrl;
  const resolvedBackgroundImageUrl = toText(backgroundImageUrl).trim() || battlefieldTextureUrl;
  const [renderSize, setRenderSize] = useState<SceneRenderSize | null>(null);
  const [cameraPosition, setCameraPosition] = useState<SceneCameraPosition>({
    x: clampCameraAxis('x', toNumber(cameraX, chessPerspectiveCamera.position.x)),
    y: clampCameraAxis('y', toNumber(cameraY, chessPerspectiveCamera.position.y)),
    z: clampCameraAxis('z', toNumber(cameraZ, chessPerspectiveCamera.position.z)),
  });
  const [cameraFovValue, setCameraFovValue] = useState(() =>
    clampCameraFov(toNumber(cameraFov, chessPerspectiveCamera.fov)),
  );
  const [cameraMode, setCameraMode] = useState<CameraMode>('Perspective');
  const [orbitEnabled, setOrbitEnabled] = useState(false);
  const [animationActive, setAnimationActive] = useState(animationEnabled);
  const [lightsEnabled, setLightsEnabled] = useState(true);
  const [floorTransform, setFloorTransform] = useState<SceneTransform>(() =>
    normalizeFloorTransform({ ...chessFloorTransformDefaults }),
  );
  const [floorMeshTransform, setFloorMeshTransform] = useState<ChessFloorMeshTransform>(() =>
    normalizeFloorMeshTransform({ ...chessFloorMeshTransformDefaults }),
  );
  const [floorLight, setFloorLight] = useState<FloorLightSettings>(() =>
    normalizeFloorLightSettings({ ...chessFloorLightDefaults }),
  );
  const [pieceTransforms, setPieceTransforms] = useState<ChessPieceTransform[]>(() =>
    clonePieceTransforms(chessPieceDefaults),
  );
  const [sceneLights, setSceneLights] = useState<ChessSceneLightSettings>(() => ({
    ambient: { ...chessSceneLightDefaults.ambient },
    backSpot: { ...chessSceneLightDefaults.backSpot },
    hemisphere: { ...chessSceneLightDefaults.hemisphere },
    mainDirectional: { ...chessSceneLightDefaults.mainDirectional },
    secondaryDirectional: { ...chessSceneLightDefaults.secondaryDirectional },
    topSpot: { ...chessSceneLightDefaults.topSpot },
  }));
  const defaultCameraTarget = useMemo<SceneCameraPosition>(
    () => ({
      x: floorTransform.x,
      y: floorTransform.y + floorTransform.scale * 0.95,
      z: floorTransform.z,
    }),
    [floorTransform],
  );
  const [cameraTarget, setCameraTarget] = useState<SceneCameraPosition>(() => ({
    x: chessPerspectiveCamera.lookAt.x,
    y: chessPerspectiveCamera.lookAt.y,
    z: chessPerspectiveCamera.lookAt.z,
  }));

  useLayoutEffect(() => {
    if (!fillParent) {
      return undefined;
    }

    const element = sectionRef.current;
    const host = getShadowHostElement(element);
    const frame = findComposedClosest(element, '.frame');

    if (!host) {
      return undefined;
    }

    const hostPreviousStyle = {
      display: host.style.display,
      height: host.style.height,
      inset: host.style.inset,
      maxHeight: host.style.maxHeight,
      maxWidth: host.style.maxWidth,
      minHeight: host.style.minHeight,
      minWidth: host.style.minWidth,
      overflow: host.style.overflow,
      position: host.style.position,
      width: host.style.width,
    };
    const frameElement = frame instanceof HTMLElement ? frame : null;
    const framePreviousStyle = frameElement
      ? {
          overflow: frameElement.style.overflow,
          position: frameElement.style.position,
        }
      : null;

    const applyHostFill = () => {
      host.style.display = 'block';
      host.style.position = 'absolute';
      host.style.inset = '0';
      host.style.width = '100%';
      host.style.height = '100%';
      host.style.minWidth = '0';
      host.style.minHeight = '0';
      host.style.maxWidth = 'none';
      host.style.maxHeight = 'none';
      host.style.overflow = 'hidden';
    };
    const applyFrameContainment = () => {
      if (!frameElement) {
        return;
      }

      const framePosition = window.getComputedStyle(frameElement).position;

      if (framePosition === 'static') {
        frameElement.style.position = 'relative';
      }

      frameElement.style.overflow = 'hidden';
    };
    const stabilizeTimers = [0, 50, 150, 350, 700, 1200, 2000].map((delay) =>
      window.setTimeout(() => {
        applyHostFill();
        applyFrameContainment();
      }, delay),
    );

    applyHostFill();
    applyFrameContainment();

    return () => {
      stabilizeTimers.forEach((timer) => window.clearTimeout(timer));
      host.style.display = hostPreviousStyle.display;
      host.style.position = hostPreviousStyle.position;
      host.style.inset = hostPreviousStyle.inset;
      host.style.width = hostPreviousStyle.width;
      host.style.height = hostPreviousStyle.height;
      host.style.minWidth = hostPreviousStyle.minWidth;
      host.style.minHeight = hostPreviousStyle.minHeight;
      host.style.maxWidth = hostPreviousStyle.maxWidth;
      host.style.maxHeight = hostPreviousStyle.maxHeight;
      host.style.overflow = hostPreviousStyle.overflow;

      if (frameElement && framePreviousStyle) {
        frameElement.style.position = framePreviousStyle.position;
        frameElement.style.overflow = framePreviousStyle.overflow;
      }
    };
  }, [fillParent]);

  useLayoutEffect(() => {
    const element = sectionRef.current;

    if (!element) {
      return undefined;
    }

    const host = getShadowHostElement(element);
    const frame = findComposedClosest(element, '.frame');
    const frameElement = frame instanceof HTMLElement ? frame : null;
    const updateRenderSize = () => {
      const nextSize = measureSceneTargetSize(element, fillParent);

      if (!nextSize) {
        return;
      }

      setRenderSize((current) =>
        current?.width === nextSize.width && current.height === nextSize.height ? current : nextSize,
      );
    };

    updateRenderSize();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateRenderSize) : null;
    const stabilizeTimers = [0, 50, 150, 350, 700, 1200, 2000].map((delay) =>
      window.setTimeout(updateRenderSize, delay),
    );

    resizeObserver?.observe(element);
    if (host) {
      resizeObserver?.observe(host);
    }
    if (frameElement) {
      resizeObserver?.observe(frameElement);
    }

    window.addEventListener('resize', updateRenderSize);
    window.addEventListener('load', updateRenderSize);

    return () => {
      stabilizeTimers.forEach((timer) => window.clearTimeout(timer));
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateRenderSize);
      window.removeEventListener('load', updateRenderSize);
    };
  }, [fillParent]);

  useEffect(() => {
    setCameraPosition({
      x: clampCameraAxis('x', toNumber(cameraX, chessPerspectiveCamera.position.x)),
      y: clampCameraAxis('y', toNumber(cameraY, chessPerspectiveCamera.position.y)),
      z: clampCameraAxis('z', toNumber(cameraZ, chessPerspectiveCamera.position.z)),
    });
  }, [cameraX, cameraY, cameraZ]);

  useEffect(() => {
    setCameraFovValue(clampCameraFov(toNumber(cameraFov, chessPerspectiveCamera.fov)));
  }, [cameraFov]);

  useEffect(() => {
    setAnimationActive(animationEnabled);
  }, [animationEnabled]);

  useEffect(() => {
    setCameraTarget(defaultCameraTarget);
  }, [defaultCameraTarget]);

  useEffect(() => {
    useGLTF.preload(resolvedFloorModelUrl, dracoDecoderPath);
    useGLTF.preload(resolvedChessModelUrl, dracoDecoderPath);
  }, [resolvedChessModelUrl, resolvedFloorModelUrl]);

  useEffect(() => {
    const element = sectionRef.current;

    if (!element) {
      return undefined;
    }

    const resetPointer = () => {
      pointerTarget.current.set(0, 0);
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();

      if (!bounds.width || !bounds.height) {
        resetPointer();
        return;
      }

      const withinBounds =
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;

      if (!withinBounds) {
        resetPointer();
        return;
      }

      const normalizedX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      const normalizedY = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;

      pointerTarget.current.set(shapePointerAxis(normalizedX), shapePointerAxis(normalizedY));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetPointer();
      }
    };

    element.addEventListener('pointermove', updatePointer, { passive: true });
    element.addEventListener('pointerleave', resetPointer);
    window.addEventListener('blur', resetPointer);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      element.removeEventListener('pointermove', updatePointer);
      element.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('blur', resetPointer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!showGui || !guiRootRef.current) {
      guiRef.current?.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = {
        board: {},
        floor: {},
        floorLight: {},
        pieces: [],
        sceneLights: { ambient: {}, backSpot: {}, hemisphere: {}, mainDirectional: {}, secondaryDirectional: {}, topSpot: {} },
      };
      return undefined;
    }

    let disposed = false;

    void import('lil-gui').then(({ default: GUI }) => {
      if (disposed || !guiRootRef.current) {
        return;
      }

      guiRootRef.current.replaceChildren();

      const gui = new GUI({ container: guiRootRef.current, title: 'Chess Scene Controls' });
    const guiState: GuiState = {
      animationEnabled: animationActive,
      board: normalizeFloorTransform({ ...floorTransform }),
      cameraFov: cameraFovValue,
      cameraMode,
      orbitEnabled,
      cameraX: cameraPosition.x,
      cameraY: cameraPosition.y,
      cameraZ: cameraPosition.z,
      floor: normalizeFloorMeshTransform({ ...floorMeshTransform }),
      floorLight: normalizeFloorLightSettings({ ...floorLight }),
      lightsEnabled,
      pieces: clonePieceTransforms(pieceTransforms),
      sceneLights: {
        ambient: { ...sceneLights.ambient },
        backSpot: { ...sceneLights.backSpot },
        hemisphere: { ...sceneLights.hemisphere },
        mainDirectional: { ...sceneLights.mainDirectional },
        secondaryDirectional: { ...sceneLights.secondaryDirectional },
        topSpot: { ...sceneLights.topSpot },
      },
    };

    guiRef.current = gui;
    guiStateRef.current = guiState;
    guiControllersRef.current = {
      board: {},
      floor: {},
      floorLight: {},
      pieces: [],
      sceneLights: { ambient: {}, backSpot: {}, hemisphere: {}, mainDirectional: {}, secondaryDirectional: {}, topSpot: {} },
    };

    const updateBoard = (partial: Partial<SceneTransform>) => {
      setFloorTransform((current) => normalizeFloorTransform({ ...current, ...partial }));
    };

    const updateFloor = (partial: Partial<ChessFloorMeshTransform>) => {
      setFloorMeshTransform((current) => normalizeFloorMeshTransform({ ...current, ...partial }));
    };

    const updateFloorLight = (partial: Partial<FloorLightSettings>) => {
      setFloorLight((current) => normalizeFloorLightSettings({ ...current, ...partial }));
    };

    const updateAmbient = (partial: Partial<ChessAmbientLightSettings>) => {
      setSceneLights((current) => ({ ...current, ambient: { ...current.ambient, ...partial } }));
    };

    const updateHemisphere = (partial: Partial<ChessHemisphereLightSettings>) => {
      setSceneLights((current) => ({ ...current, hemisphere: { ...current.hemisphere, ...partial } }));
    };

    const updateMainDirectional = (partial: Partial<ChessPositionedLightSettings>) => {
      setSceneLights((current) => ({ ...current, mainDirectional: { ...current.mainDirectional, ...partial } }));
    };

    const updateSecondaryDirectional = (partial: Partial<ChessPositionedLightSettings>) => {
      setSceneLights((current) => ({ ...current, secondaryDirectional: { ...current.secondaryDirectional, ...partial } }));
    };

    const updateBackSpot = (partial: Partial<ChessPositionedLightSettings>) => {
      setSceneLights((current) => ({ ...current, backSpot: { ...current.backSpot, ...partial } }));
    };

    const updateTopSpot = (partial: Partial<ChessPositionedLightSettings>) => {
      setSceneLights((current) => ({ ...current, topSpot: { ...current.topSpot, ...partial } }));
    };

    const updatePiece = (index: number, partial: Partial<ChessPieceTransform>) => {
      setPieceTransforms((current) =>
        current.map((piece, pieceIndex) =>
          pieceIndex === index ? normalizePieceTransform({ ...piece, ...partial }) : piece,
        ),
      );
    };

    const cameraFolder = gui.addFolder('Camera');
    const lightsFolder = gui.addFolder('Lights');
    const sceneLightsFolder = gui.addFolder('Scene Lights');
    const animationFolder = gui.addFolder('Animation');
    const boardFolder = gui.addFolder('Board');
    const floorFolder = gui.addFolder('Floor');
    const floorLightFolder = gui.addFolder('Floor Light');
    const piecesFolder = gui.addFolder('Pieces');

    guiControllersRef.current.animationEnabled = animationFolder
      .add(guiState, 'animationEnabled')
      .name('Pointer Drift')
      .onChange((value: boolean) => {
        setAnimationActive(Boolean(value));
      });

    guiControllersRef.current.cameraMode = cameraFolder
      .add(guiState, 'cameraMode', [...cameraModes])
      .name('Mode')
      .onChange((value: string) => {
        if (cameraModes.includes(value as CameraMode)) {
          setCameraMode(value as CameraMode);
        }
      });

    guiControllersRef.current.cameraFov = cameraFolder
      .add(
        guiState,
        'cameraFov',
        chessCameraFovControl.min,
        chessCameraFovControl.max,
        chessCameraFovControl.step,
      )
      .name(chessCameraFovControl.label)
      .onChange((value: number) => {
        setCameraFovValue(clampCameraFov(Number(value)));
      });

    guiControllersRef.current.orbitEnabled = cameraFolder
      .add(guiState, 'orbitEnabled')
      .name('Orbit Controls')
      .onChange((value: boolean) => {
        setOrbitEnabled(Boolean(value));
      });

    guiControllersRef.current.cameraX = cameraFolder
      .add(
        guiState,
        'cameraX',
        chessCameraAxisControls.x.min,
        chessCameraAxisControls.x.max,
        chessCameraAxisControls.x.step,
      )
      .name(chessCameraAxisControls.x.label)
      .onChange((value: number) => {
        setCameraPosition((current) => ({
          ...current,
          x: clampCameraAxis('x', Number(value)),
        }));
      });

    guiControllersRef.current.cameraY = cameraFolder
      .add(
        guiState,
        'cameraY',
        chessCameraAxisControls.y.min,
        chessCameraAxisControls.y.max,
        chessCameraAxisControls.y.step,
      )
      .name(chessCameraAxisControls.y.label)
      .onChange((value: number) => {
        setCameraPosition((current) => ({
          ...current,
          y: clampCameraAxis('y', Number(value)),
        }));
      });

    guiControllersRef.current.cameraZ = cameraFolder
      .add(
        guiState,
        'cameraZ',
        chessCameraAxisControls.z.min,
        chessCameraAxisControls.z.max,
        chessCameraAxisControls.z.step,
      )
      .name(chessCameraAxisControls.z.label)
      .onChange((value: number) => {
        setCameraPosition((current) => ({
          ...current,
          z: clampCameraAxis('z', Number(value)),
        }));
      });

    cameraFolder
      .add(
        {
          reset: () => {
            setCameraPosition({ ...chessPerspectiveCamera.position });
            setCameraFovValue(chessPerspectiveCamera.fov);
            setCameraMode('Perspective');
            setOrbitEnabled(true);
            setCameraTarget(defaultCameraTarget);
          },
        },
        'reset',
      )
      .name('Reset Camera');

    guiControllersRef.current.lightsEnabled = lightsFolder
      .add(guiState, 'lightsEnabled')
      .name(chessLightsControl.label)
      .onChange((value: boolean) => {
        setLightsEnabled(Boolean(value));
      });

    guiControllersRef.current.board.x = boardFolder
      .add(
        guiState.board,
        'x',
        scenePositionAxisControls.x.min,
        scenePositionAxisControls.x.max,
        scenePositionAxisControls.x.step,
      )
      .name(scenePositionAxisControls.x.label)
      .onChange((value: number) => {
        updateBoard({ x: clampScenePositionAxis('x', Number(value)) });
      });

    guiControllersRef.current.board.y = boardFolder
      .add(
        guiState.board,
        'y',
        scenePositionAxisControls.y.min,
        scenePositionAxisControls.y.max,
        scenePositionAxisControls.y.step,
      )
      .name(scenePositionAxisControls.y.label)
      .onChange((value: number) => {
        updateBoard({ y: clampScenePositionAxis('y', Number(value)) });
      });

    guiControllersRef.current.board.z = boardFolder
      .add(
        guiState.board,
        'z',
        scenePositionAxisControls.z.min,
        scenePositionAxisControls.z.max,
        scenePositionAxisControls.z.step,
      )
      .name(scenePositionAxisControls.z.label)
      .onChange((value: number) => {
        updateBoard({ z: clampScenePositionAxis('z', Number(value)) });
      });

    guiControllersRef.current.board.rotationX = boardFolder
      .add(
        guiState.board,
        'rotationX',
        sceneRotationAxisControls.x.min,
        sceneRotationAxisControls.x.max,
        sceneRotationAxisControls.x.step,
      )
      .name(sceneRotationAxisControls.x.label)
      .onChange((value: number) => {
        updateBoard({ rotationX: clampSceneRotationAxis('x', Number(value)) });
      });

    guiControllersRef.current.board.rotationY = boardFolder
      .add(
        guiState.board,
        'rotationY',
        sceneRotationAxisControls.y.min,
        sceneRotationAxisControls.y.max,
        sceneRotationAxisControls.y.step,
      )
      .name(sceneRotationAxisControls.y.label)
      .onChange((value: number) => {
        updateBoard({ rotationY: clampSceneRotationAxis('y', Number(value)) });
      });

    guiControllersRef.current.board.rotationZ = boardFolder
      .add(
        guiState.board,
        'rotationZ',
        sceneRotationAxisControls.z.min,
        sceneRotationAxisControls.z.max,
        sceneRotationAxisControls.z.step,
      )
      .name(sceneRotationAxisControls.z.label)
      .onChange((value: number) => {
        updateBoard({ rotationZ: clampSceneRotationAxis('z', Number(value)) });
      });

    guiControllersRef.current.board.scale = boardFolder
      .add(
        guiState.board,
        'scale',
        uniformScaleControl.min,
        uniformScaleControl.max,
        uniformScaleControl.step,
      )
      .name(uniformScaleControl.label)
      .onChange((value: number) => {
        updateBoard({ scale: clampUniformScale(Number(value)) });
      });

    boardFolder
      .add(
        {
          reset: () => {
            setFloorTransform(normalizeFloorTransform({ ...chessFloorTransformDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Board');

    guiControllersRef.current.floor.visible = floorFolder
      .add(guiState.floor, 'visible')
      .name('Visible')
      .onChange((value: boolean) => {
        updateFloor({ visible: Boolean(value) });
      });

    guiControllersRef.current.floor.x = floorFolder
      .add(
        guiState.floor,
        'x',
        scenePositionAxisControls.x.min,
        scenePositionAxisControls.x.max,
        scenePositionAxisControls.x.step,
      )
      .name(scenePositionAxisControls.x.label)
      .onChange((value: number) => {
        updateFloor({ x: clampScenePositionAxis('x', Number(value)) });
      });

    guiControllersRef.current.floor.y = floorFolder
      .add(
        guiState.floor,
        'y',
        scenePositionAxisControls.y.min,
        scenePositionAxisControls.y.max,
        scenePositionAxisControls.y.step,
      )
      .name(scenePositionAxisControls.y.label)
      .onChange((value: number) => {
        updateFloor({ y: clampScenePositionAxis('y', Number(value)) });
      });

    guiControllersRef.current.floor.z = floorFolder
      .add(
        guiState.floor,
        'z',
        scenePositionAxisControls.z.min,
        scenePositionAxisControls.z.max,
        scenePositionAxisControls.z.step,
      )
      .name(scenePositionAxisControls.z.label)
      .onChange((value: number) => {
        updateFloor({ z: clampScenePositionAxis('z', Number(value)) });
      });

    guiControllersRef.current.floor.rotationX = floorFolder
      .add(
        guiState.floor,
        'rotationX',
        sceneRotationAxisControls.x.min,
        sceneRotationAxisControls.x.max,
        sceneRotationAxisControls.x.step,
      )
      .name(sceneRotationAxisControls.x.label)
      .onChange((value: number) => {
        updateFloor({ rotationX: clampSceneRotationAxis('x', Number(value)) });
      });

    guiControllersRef.current.floor.rotationY = floorFolder
      .add(
        guiState.floor,
        'rotationY',
        sceneRotationAxisControls.y.min,
        sceneRotationAxisControls.y.max,
        sceneRotationAxisControls.y.step,
      )
      .name(sceneRotationAxisControls.y.label)
      .onChange((value: number) => {
        updateFloor({ rotationY: clampSceneRotationAxis('y', Number(value)) });
      });

    guiControllersRef.current.floor.rotationZ = floorFolder
      .add(
        guiState.floor,
        'rotationZ',
        sceneRotationAxisControls.z.min,
        sceneRotationAxisControls.z.max,
        sceneRotationAxisControls.z.step,
      )
      .name(sceneRotationAxisControls.z.label)
      .onChange((value: number) => {
        updateFloor({ rotationZ: clampSceneRotationAxis('z', Number(value)) });
      });

    guiControllersRef.current.floor.scale = floorFolder
      .add(
        guiState.floor,
        'scale',
        uniformScaleControl.min,
        uniformScaleControl.max,
        uniformScaleControl.step,
      )
      .name(uniformScaleControl.label)
      .onChange((value: number) => {
        updateFloor({ scale: clampUniformScale(Number(value)) });
      });

    floorFolder
      .add(
        {
          reset: () => {
            setFloorMeshTransform(normalizeFloorMeshTransform({ ...chessFloorMeshTransformDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Floor');

    guiControllersRef.current.floorLight.enabled = floorLightFolder
      .add(guiState.floorLight, 'enabled')
      .name(chessFloorLightEnabledControl.label)
      .onChange((value: boolean) => {
        updateFloorLight({ enabled: Boolean(value) });
      });

    guiControllersRef.current.floorLight.color = floorLightFolder
      .addColor(guiState.floorLight, 'color')
      .name(chessFloorLightColorControl.label)
      .onChange((value: string) => {
        updateFloorLight({ color: toText(value).trim() || defaultFloorLightColor });
      });

    guiControllersRef.current.floorLight.x = floorLightFolder
      .add(
        guiState.floorLight,
        'x',
        chessFloorLightAxisControls.x.min,
        chessFloorLightAxisControls.x.max,
        chessFloorLightAxisControls.x.step,
      )
      .name(chessFloorLightAxisControls.x.label)
      .onChange((value: number) => {
        updateFloorLight({ x: clampFloorLightAxis('x', Number(value)) });
      });

    guiControllersRef.current.floorLight.y = floorLightFolder
      .add(
        guiState.floorLight,
        'y',
        chessFloorLightAxisControls.y.min,
        chessFloorLightAxisControls.y.max,
        chessFloorLightAxisControls.y.step,
      )
      .name(chessFloorLightAxisControls.y.label)
      .onChange((value: number) => {
        updateFloorLight({ y: clampFloorLightAxis('y', Number(value)) });
      });

    guiControllersRef.current.floorLight.z = floorLightFolder
      .add(
        guiState.floorLight,
        'z',
        chessFloorLightAxisControls.z.min,
        chessFloorLightAxisControls.z.max,
        chessFloorLightAxisControls.z.step,
      )
      .name(chessFloorLightAxisControls.z.label)
      .onChange((value: number) => {
        updateFloorLight({ z: clampFloorLightAxis('z', Number(value)) });
      });

    guiControllersRef.current.floorLight.intensity = floorLightFolder
      .add(
        guiState.floorLight,
        'intensity',
        chessFloorLightIntensityControl.min,
        chessFloorLightIntensityControl.max,
        chessFloorLightIntensityControl.step,
      )
      .name(chessFloorLightIntensityControl.label)
      .onChange((value: number) => {
        updateFloorLight({ intensity: clampFloorLightIntensity(Number(value)) });
      });

    guiControllersRef.current.floorLight.opacity = floorLightFolder
      .add(
        guiState.floorLight,
        'opacity',
        chessFloorLightOpacityControl.min,
        chessFloorLightOpacityControl.max,
        chessFloorLightOpacityControl.step,
      )
      .name(chessFloorLightOpacityControl.label)
      .onChange((value: number) => {
        updateFloorLight({ opacity: clampFloorLightOpacity(Number(value)) });
      });

    floorLightFolder
      .add(
        {
          reset: () => {
            setFloorLight(normalizeFloorLightSettings({ ...chessFloorLightDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Light');

    // Ambient
    const ambientFolder = sceneLightsFolder.addFolder('Ambient');
    guiControllersRef.current.sceneLights.ambient.color = ambientFolder
      .addColor(guiState.sceneLights.ambient, 'color')
      .name('Color')
      .onChange((value: string) => { updateAmbient({ color: toText(value).trim() || '#fff2de' }); });
    guiControllersRef.current.sceneLights.ambient.intensity = ambientFolder
      .add(guiState.sceneLights.ambient, 'intensity', chessAmbientIntensityControl.min, chessAmbientIntensityControl.max, chessAmbientIntensityControl.step)
      .name(chessAmbientIntensityControl.label)
      .onChange((value: number) => { updateAmbient({ intensity: Number(value) }); });
    ambientFolder.close();

    // Hemisphere
    const hemisphereFolder = sceneLightsFolder.addFolder('Hemisphere');
    guiControllersRef.current.sceneLights.hemisphere.skyColor = hemisphereFolder
      .addColor(guiState.sceneLights.hemisphere, 'skyColor')
      .name('Sky Color')
      .onChange((value: string) => { updateHemisphere({ skyColor: toText(value).trim() || '#ffffff' }); });
    guiControllersRef.current.sceneLights.hemisphere.groundColor = hemisphereFolder
      .addColor(guiState.sceneLights.hemisphere, 'groundColor')
      .name('Ground Color')
      .onChange((value: string) => { updateHemisphere({ groundColor: toText(value).trim() || '#4d4034' }); });
    guiControllersRef.current.sceneLights.hemisphere.intensity = hemisphereFolder
      .add(guiState.sceneLights.hemisphere, 'intensity', chessAmbientIntensityControl.min, chessAmbientIntensityControl.max, chessAmbientIntensityControl.step)
      .name(chessAmbientIntensityControl.label)
      .onChange((value: number) => { updateHemisphere({ intensity: Number(value) }); });
    guiControllersRef.current.sceneLights.hemisphere.x = hemisphereFolder
      .add(guiState.sceneLights.hemisphere, 'x', chessLightPositionAxisControls.x.min, chessLightPositionAxisControls.x.max, chessLightPositionAxisControls.x.step)
      .name(chessLightPositionAxisControls.x.label)
      .onChange((value: number) => { updateHemisphere({ x: Number(value) }); });
    guiControllersRef.current.sceneLights.hemisphere.y = hemisphereFolder
      .add(guiState.sceneLights.hemisphere, 'y', chessLightPositionAxisControls.y.min, chessLightPositionAxisControls.y.max, chessLightPositionAxisControls.y.step)
      .name(chessLightPositionAxisControls.y.label)
      .onChange((value: number) => { updateHemisphere({ y: Number(value) }); });
    guiControllersRef.current.sceneLights.hemisphere.z = hemisphereFolder
      .add(guiState.sceneLights.hemisphere, 'z', chessLightPositionAxisControls.z.min, chessLightPositionAxisControls.z.max, chessLightPositionAxisControls.z.step)
      .name(chessLightPositionAxisControls.z.label)
      .onChange((value: number) => { updateHemisphere({ z: Number(value) }); });
    hemisphereFolder.close();

    // Main Directional
    const mainDirFolder = sceneLightsFolder.addFolder('Main Directional');
    guiControllersRef.current.sceneLights.mainDirectional.color = mainDirFolder
      .addColor(guiState.sceneLights.mainDirectional, 'color')
      .name('Color')
      .onChange((value: string) => { updateMainDirectional({ color: toText(value).trim() || '#fff4dc' }); });
    guiControllersRef.current.sceneLights.mainDirectional.intensity = mainDirFolder
      .add(guiState.sceneLights.mainDirectional, 'intensity', chessDirectionalIntensityControl.min, chessDirectionalIntensityControl.max, chessDirectionalIntensityControl.step)
      .name(chessDirectionalIntensityControl.label)
      .onChange((value: number) => { updateMainDirectional({ intensity: Number(value) }); });
    guiControllersRef.current.sceneLights.mainDirectional.x = mainDirFolder
      .add(guiState.sceneLights.mainDirectional, 'x', chessLightPositionAxisControls.x.min, chessLightPositionAxisControls.x.max, chessLightPositionAxisControls.x.step)
      .name(chessLightPositionAxisControls.x.label)
      .onChange((value: number) => { updateMainDirectional({ x: Number(value) }); });
    guiControllersRef.current.sceneLights.mainDirectional.y = mainDirFolder
      .add(guiState.sceneLights.mainDirectional, 'y', chessLightPositionAxisControls.y.min, chessLightPositionAxisControls.y.max, chessLightPositionAxisControls.y.step)
      .name(chessLightPositionAxisControls.y.label)
      .onChange((value: number) => { updateMainDirectional({ y: Number(value) }); });
    guiControllersRef.current.sceneLights.mainDirectional.z = mainDirFolder
      .add(guiState.sceneLights.mainDirectional, 'z', chessLightPositionAxisControls.z.min, chessLightPositionAxisControls.z.max, chessLightPositionAxisControls.z.step)
      .name(chessLightPositionAxisControls.z.label)
      .onChange((value: number) => { updateMainDirectional({ z: Number(value) }); });
    mainDirFolder.close();

    // Secondary Directional
    const secDirFolder = sceneLightsFolder.addFolder('Secondary Directional');
    guiControllersRef.current.sceneLights.secondaryDirectional.color = secDirFolder
      .addColor(guiState.sceneLights.secondaryDirectional, 'color')
      .name('Color')
      .onChange((value: string) => { updateSecondaryDirectional({ color: toText(value).trim() || '#dcb992' }); });
    guiControllersRef.current.sceneLights.secondaryDirectional.intensity = secDirFolder
      .add(guiState.sceneLights.secondaryDirectional, 'intensity', chessDirectionalIntensityControl.min, chessDirectionalIntensityControl.max, chessDirectionalIntensityControl.step)
      .name(chessDirectionalIntensityControl.label)
      .onChange((value: number) => { updateSecondaryDirectional({ intensity: Number(value) }); });
    guiControllersRef.current.sceneLights.secondaryDirectional.x = secDirFolder
      .add(guiState.sceneLights.secondaryDirectional, 'x', chessLightPositionAxisControls.x.min, chessLightPositionAxisControls.x.max, chessLightPositionAxisControls.x.step)
      .name(chessLightPositionAxisControls.x.label)
      .onChange((value: number) => { updateSecondaryDirectional({ x: Number(value) }); });
    guiControllersRef.current.sceneLights.secondaryDirectional.y = secDirFolder
      .add(guiState.sceneLights.secondaryDirectional, 'y', chessLightPositionAxisControls.y.min, chessLightPositionAxisControls.y.max, chessLightPositionAxisControls.y.step)
      .name(chessLightPositionAxisControls.y.label)
      .onChange((value: number) => { updateSecondaryDirectional({ y: Number(value) }); });
    guiControllersRef.current.sceneLights.secondaryDirectional.z = secDirFolder
      .add(guiState.sceneLights.secondaryDirectional, 'z', chessLightPositionAxisControls.z.min, chessLightPositionAxisControls.z.max, chessLightPositionAxisControls.z.step)
      .name(chessLightPositionAxisControls.z.label)
      .onChange((value: number) => { updateSecondaryDirectional({ z: Number(value) }); });
    secDirFolder.close();

    // Back Spotlight
    const backSpotFolder = sceneLightsFolder.addFolder('Back Spotlight');
    guiControllersRef.current.sceneLights.backSpot.color = backSpotFolder
      .addColor(guiState.sceneLights.backSpot, 'color')
      .name('Color')
      .onChange((value: string) => { updateBackSpot({ color: toText(value).trim() || '#f6ddb0' }); });
    guiControllersRef.current.sceneLights.backSpot.intensity = backSpotFolder
      .add(guiState.sceneLights.backSpot, 'intensity', chessSpotIntensityControl.min, chessSpotIntensityControl.max, chessSpotIntensityControl.step)
      .name(chessSpotIntensityControl.label)
      .onChange((value: number) => { updateBackSpot({ intensity: Number(value) }); });
    guiControllersRef.current.sceneLights.backSpot.x = backSpotFolder
      .add(guiState.sceneLights.backSpot, 'x', chessLightPositionAxisControls.x.min, chessLightPositionAxisControls.x.max, chessLightPositionAxisControls.x.step)
      .name(chessLightPositionAxisControls.x.label)
      .onChange((value: number) => { updateBackSpot({ x: Number(value) }); });
    guiControllersRef.current.sceneLights.backSpot.y = backSpotFolder
      .add(guiState.sceneLights.backSpot, 'y', chessLightPositionAxisControls.y.min, chessLightPositionAxisControls.y.max, chessLightPositionAxisControls.y.step)
      .name(chessLightPositionAxisControls.y.label)
      .onChange((value: number) => { updateBackSpot({ y: Number(value) }); });
    guiControllersRef.current.sceneLights.backSpot.z = backSpotFolder
      .add(guiState.sceneLights.backSpot, 'z', chessLightPositionAxisControls.z.min, chessLightPositionAxisControls.z.max, chessLightPositionAxisControls.z.step)
      .name(chessLightPositionAxisControls.z.label)
      .onChange((value: number) => { updateBackSpot({ z: Number(value) }); });
    backSpotFolder.close();

    // Top Spotlight
    const topSpotFolder = sceneLightsFolder.addFolder('Top Spotlight');
    guiControllersRef.current.sceneLights.topSpot.color = topSpotFolder
      .addColor(guiState.sceneLights.topSpot, 'color')
      .name('Color')
      .onChange((value: string) => { updateTopSpot({ color: toText(value).trim() || '#f6ddb0' }); });
    guiControllersRef.current.sceneLights.topSpot.intensity = topSpotFolder
      .add(guiState.sceneLights.topSpot, 'intensity', chessSpotIntensityControl.min, chessSpotIntensityControl.max, chessSpotIntensityControl.step)
      .name(chessSpotIntensityControl.label)
      .onChange((value: number) => { updateTopSpot({ intensity: Number(value) }); });
    guiControllersRef.current.sceneLights.topSpot.x = topSpotFolder
      .add(guiState.sceneLights.topSpot, 'x', chessLightPositionAxisControls.x.min, chessLightPositionAxisControls.x.max, chessLightPositionAxisControls.x.step)
      .name(chessLightPositionAxisControls.x.label)
      .onChange((value: number) => { updateTopSpot({ x: Number(value) }); });
    guiControllersRef.current.sceneLights.topSpot.y = topSpotFolder
      .add(guiState.sceneLights.topSpot, 'y', chessLightPositionAxisControls.y.min, chessLightPositionAxisControls.y.max, chessLightPositionAxisControls.y.step)
      .name(chessLightPositionAxisControls.y.label)
      .onChange((value: number) => { updateTopSpot({ y: Number(value) }); });
    guiControllersRef.current.sceneLights.topSpot.z = topSpotFolder
      .add(guiState.sceneLights.topSpot, 'z', chessLightPositionAxisControls.z.min, chessLightPositionAxisControls.z.max, chessLightPositionAxisControls.z.step)
      .name(chessLightPositionAxisControls.z.label)
      .onChange((value: number) => { updateTopSpot({ z: Number(value) }); });
    topSpotFolder.close();

    sceneLightsFolder
      .add(
        {
          reset: () => {
            setSceneLights({
              ambient: { ...chessSceneLightDefaults.ambient },
              backSpot: { ...chessSceneLightDefaults.backSpot },
              hemisphere: { ...chessSceneLightDefaults.hemisphere },
              mainDirectional: { ...chessSceneLightDefaults.mainDirectional },
              secondaryDirectional: { ...chessSceneLightDefaults.secondaryDirectional },
              topSpot: { ...chessSceneLightDefaults.topSpot },
            });
          },
        },
        'reset',
      )
      .name('Reset All Lights');

    piecesFolder
      .add(
        {
          reset: () => {
            setPieceTransforms(clonePieceTransforms(chessPieceDefaults));
          },
        },
        'reset',
      )
      .name('Reset Pieces');

    guiState.pieces.forEach((pieceState, index) => {
      const pieceFolder = piecesFolder.addFolder(`Piece ${index + 1}`);

      guiControllersRef.current.pieces[index] = {
        visible: pieceFolder
          .add(pieceState, 'visible')
          .name('Visible')
          .onChange((value: boolean) => {
            updatePiece(index, { visible: Boolean(value) });
          }),
        x: pieceFolder
          .add(
            pieceState,
            'x',
            pieceLayoutAxisControls.x.min,
            pieceLayoutAxisControls.x.max,
            pieceLayoutAxisControls.x.step,
          )
          .name(pieceLayoutAxisControls.x.label)
          .onChange((value: number) => {
            updatePiece(index, { x: clampPieceLayoutAxis('x', Number(value)) });
          }),
        y: pieceFolder
          .add(
            pieceState,
            'y',
            pieceLayoutAxisControls.y.min,
            pieceLayoutAxisControls.y.max,
            pieceLayoutAxisControls.y.step,
          )
          .name(pieceLayoutAxisControls.y.label)
          .onChange((value: number) => {
            updatePiece(index, { y: clampPieceLayoutAxis('y', Number(value)) });
          }),
        z: pieceFolder
          .add(
            pieceState,
            'z',
            pieceLayoutAxisControls.z.min,
            pieceLayoutAxisControls.z.max,
            pieceLayoutAxisControls.z.step,
          )
          .name(pieceLayoutAxisControls.z.label)
          .onChange((value: number) => {
            updatePiece(index, { z: clampPieceLayoutAxis('z', Number(value)) });
          }),
        rotationX: pieceFolder
          .add(
            pieceState,
            'rotationX',
            sceneRotationAxisControls.x.min,
            sceneRotationAxisControls.x.max,
            sceneRotationAxisControls.x.step,
          )
          .name(sceneRotationAxisControls.x.label)
          .onChange((value: number) => {
            updatePiece(index, { rotationX: clampSceneRotationAxis('x', Number(value)) });
          }),
        rotationY: pieceFolder
          .add(
            pieceState,
            'rotationY',
            sceneRotationAxisControls.y.min,
            sceneRotationAxisControls.y.max,
            sceneRotationAxisControls.y.step,
          )
          .name(sceneRotationAxisControls.y.label)
          .onChange((value: number) => {
            updatePiece(index, { rotationY: clampSceneRotationAxis('y', Number(value)) });
          }),
        rotationZ: pieceFolder
          .add(
            pieceState,
            'rotationZ',
            sceneRotationAxisControls.z.min,
            sceneRotationAxisControls.z.max,
            sceneRotationAxisControls.z.step,
          )
          .name(sceneRotationAxisControls.z.label)
          .onChange((value: number) => {
            updatePiece(index, { rotationZ: clampSceneRotationAxis('z', Number(value)) });
          }),
        scale: pieceFolder
          .add(
            pieceState,
            'scale',
            uniformScaleControl.min,
            uniformScaleControl.max,
            uniformScaleControl.step,
          )
          .name(uniformScaleControl.label)
          .onChange((value: number) => {
            updatePiece(index, { scale: clampUniformScale(Number(value)) });
          }),
      };

      pieceFolder.close();
    });

    cameraFolder.close();
    lightsFolder.close();
    sceneLightsFolder.close();
    animationFolder.close();
    boardFolder.close();
    floorFolder.close();
    floorLightFolder.close();
    piecesFolder.close();

    if (disposed) {
      gui.destroy();
      return;
    }
    });

    return () => {
      disposed = true;
      guiRef.current?.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = {
        board: {},
        floor: {},
        floorLight: {},
        pieces: [],
        sceneLights: { ambient: {}, backSpot: {}, hemisphere: {}, mainDirectional: {}, secondaryDirectional: {}, topSpot: {} },
      };
    };
    // We only recreate lil-gui when it is toggled.
    // Live values are synced in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showGui]);

  useEffect(() => {
    const guiState = guiStateRef.current;

    if (!guiState) {
      return;
    }

    guiState.animationEnabled = animationActive;
    Object.assign(guiState.board, normalizeFloorTransform(floorTransform));
    guiState.cameraFov = cameraFovValue;
    guiState.cameraMode = cameraMode;
    guiState.orbitEnabled = orbitEnabled;
    guiState.cameraX = cameraPosition.x;
    guiState.cameraY = cameraPosition.y;
    guiState.cameraZ = cameraPosition.z;
    Object.assign(guiState.floor, normalizeFloorMeshTransform(floorMeshTransform));
    Object.assign(guiState.floorLight, normalizeFloorLightSettings(floorLight));
    guiState.lightsEnabled = lightsEnabled;
    Object.assign(guiState.sceneLights.ambient, sceneLights.ambient);
    Object.assign(guiState.sceneLights.hemisphere, sceneLights.hemisphere);
    Object.assign(guiState.sceneLights.mainDirectional, sceneLights.mainDirectional);
    Object.assign(guiState.sceneLights.secondaryDirectional, sceneLights.secondaryDirectional);
    Object.assign(guiState.sceneLights.backSpot, sceneLights.backSpot);
    Object.assign(guiState.sceneLights.topSpot, sceneLights.topSpot);
    pieceTransforms.forEach((piece, index) => {
      const guiPiece = guiState.pieces[index];

      if (!guiPiece) {
        return;
      }

      Object.assign(guiPiece, normalizePieceTransform(piece));
    });

    guiControllersRef.current.animationEnabled?.updateDisplay();
    guiControllersRef.current.cameraFov?.updateDisplay();
    guiControllersRef.current.cameraMode?.updateDisplay();
    guiControllersRef.current.orbitEnabled?.updateDisplay();
    guiControllersRef.current.cameraX?.updateDisplay();
    guiControllersRef.current.cameraY?.updateDisplay();
    guiControllersRef.current.cameraZ?.updateDisplay();
    guiControllersRef.current.board.x?.updateDisplay();
    guiControllersRef.current.board.y?.updateDisplay();
    guiControllersRef.current.board.z?.updateDisplay();
    guiControllersRef.current.board.rotationX?.updateDisplay();
    guiControllersRef.current.board.rotationY?.updateDisplay();
    guiControllersRef.current.board.rotationZ?.updateDisplay();
    guiControllersRef.current.board.scale?.updateDisplay();
    guiControllersRef.current.lightsEnabled?.updateDisplay();
    guiControllersRef.current.floor.visible?.updateDisplay();
    guiControllersRef.current.floor.x?.updateDisplay();
    guiControllersRef.current.floor.y?.updateDisplay();
    guiControllersRef.current.floor.z?.updateDisplay();
    guiControllersRef.current.floor.rotationX?.updateDisplay();
    guiControllersRef.current.floor.rotationY?.updateDisplay();
    guiControllersRef.current.floor.rotationZ?.updateDisplay();
    guiControllersRef.current.floor.scale?.updateDisplay();
    guiControllersRef.current.floorLight.enabled?.updateDisplay();
    guiControllersRef.current.floorLight.color?.updateDisplay();
    guiControllersRef.current.floorLight.x?.updateDisplay();
    guiControllersRef.current.floorLight.y?.updateDisplay();
    guiControllersRef.current.floorLight.z?.updateDisplay();
    guiControllersRef.current.floorLight.intensity?.updateDisplay();
    guiControllersRef.current.floorLight.opacity?.updateDisplay();

    guiControllersRef.current.sceneLights.ambient.color?.updateDisplay();
    guiControllersRef.current.sceneLights.ambient.intensity?.updateDisplay();
    guiControllersRef.current.sceneLights.hemisphere.skyColor?.updateDisplay();
    guiControllersRef.current.sceneLights.hemisphere.groundColor?.updateDisplay();
    guiControllersRef.current.sceneLights.hemisphere.intensity?.updateDisplay();
    guiControllersRef.current.sceneLights.hemisphere.x?.updateDisplay();
    guiControllersRef.current.sceneLights.hemisphere.y?.updateDisplay();
    guiControllersRef.current.sceneLights.hemisphere.z?.updateDisplay();
    guiControllersRef.current.sceneLights.mainDirectional.color?.updateDisplay();
    guiControllersRef.current.sceneLights.mainDirectional.intensity?.updateDisplay();
    guiControllersRef.current.sceneLights.mainDirectional.x?.updateDisplay();
    guiControllersRef.current.sceneLights.mainDirectional.y?.updateDisplay();
    guiControllersRef.current.sceneLights.mainDirectional.z?.updateDisplay();
    guiControllersRef.current.sceneLights.secondaryDirectional.color?.updateDisplay();
    guiControllersRef.current.sceneLights.secondaryDirectional.intensity?.updateDisplay();
    guiControllersRef.current.sceneLights.secondaryDirectional.x?.updateDisplay();
    guiControllersRef.current.sceneLights.secondaryDirectional.y?.updateDisplay();
    guiControllersRef.current.sceneLights.secondaryDirectional.z?.updateDisplay();
    guiControllersRef.current.sceneLights.backSpot.color?.updateDisplay();
    guiControllersRef.current.sceneLights.backSpot.intensity?.updateDisplay();
    guiControllersRef.current.sceneLights.backSpot.x?.updateDisplay();
    guiControllersRef.current.sceneLights.backSpot.y?.updateDisplay();
    guiControllersRef.current.sceneLights.backSpot.z?.updateDisplay();
    guiControllersRef.current.sceneLights.topSpot.color?.updateDisplay();
    guiControllersRef.current.sceneLights.topSpot.intensity?.updateDisplay();
    guiControllersRef.current.sceneLights.topSpot.x?.updateDisplay();
    guiControllersRef.current.sceneLights.topSpot.y?.updateDisplay();
    guiControllersRef.current.sceneLights.topSpot.z?.updateDisplay();

    guiControllersRef.current.pieces.forEach((controllers) => {
      controllers.visible?.updateDisplay();
      controllers.x?.updateDisplay();
      controllers.y?.updateDisplay();
      controllers.z?.updateDisplay();
      controllers.rotationX?.updateDisplay();
      controllers.rotationY?.updateDisplay();
      controllers.rotationZ?.updateDisplay();
      controllers.scale?.updateDisplay();
    });
  }, [
    animationActive,
    cameraFovValue,
    cameraMode,
    cameraPosition,
    floorLight,
    floorMeshTransform,
    floorTransform,
    lightsEnabled,
    orbitEnabled,
    pieceTransforms,
    sceneLights,
  ]);

  return (
    <section
      className="chess-scene-viewport"
      ref={sectionRef}
      style={{
        backgroundImage: `radial-gradient(circle at 50% 25%, rgba(255, 246, 230, 0.26), transparent 44%), linear-gradient(180deg, rgba(31, 24, 21, 0.58) 0%, rgba(13, 11, 10, 0.82) 100%), url(${resolvedBackgroundImageUrl})`,
        backgroundPosition: 'center, center, center',
        backgroundRepeat: 'no-repeat, no-repeat, no-repeat',
        backgroundSize: 'auto, auto, cover',
        alignSelf: 'stretch',
        boxSizing: 'border-box',
        flex: '1 1 auto',
        height: fillParent ? '100%' : undefined,
        inset: fillParent ? 0 : undefined,
        isolation: 'isolate',
        justifySelf: 'stretch',
        maxWidth: 'none',
        minHeight: fillParent ? 0 : undefined,
        overflow: 'hidden',
        position: fillParent ? 'absolute' : 'relative',
        contain: 'paint',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          width: renderSize ? `${renderSize.width}px` : '100%',
          height: renderSize ? `${renderSize.height}px` : '100%',
          overflow: 'hidden',
        }}
      >
        <Canvas
          dpr={[1, 1.25]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.shadowMap.enabled = true;
            gl.shadowMap.type = THREE.PCFShadowMap;
            gl.toneMappingExposure = 1.12;
            gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
          }}
          shadows
          style={{
            display: 'block',
            width: renderSize ? `${renderSize.width}px` : '100%',
            height: renderSize ? `${renderSize.height}px` : '100%',
          }}
        >
          <ChessSceneCamera
            fov={cameraFovValue}
            mode={cameraMode}
            position={cameraPosition}
            target={cameraTarget}
          />
          {showGui ? (
            <Suspense fallback={null}>
              <DebugOrbitControls
                enabled={orbitEnabled}
                key={cameraMode}
                onChangeEnd={({ position, target }) => {
                  setCameraPosition({
                    x: clampCameraAxis('x', position.x),
                    y: clampCameraAxis('y', position.y),
                    z: clampCameraAxis('z', position.z),
                  });
                  setCameraTarget(target);
                }}
                position={cameraPosition}
                target={cameraTarget}
              />
            </Suspense>
          ) : null}
          <ChessLighting enabled={lightsEnabled} floorTransform={floorTransform} sceneLights={sceneLights} />
          <ChessBoardScene
            animationEnabled={animationActive}
            chessModelUrl={resolvedChessModelUrl}
            floorLight={floorLight}
            floorMeshTransform={floorMeshTransform}
            floorModelUrl={resolvedFloorModelUrl}
            floorTransform={floorTransform}
            lightsEnabled={lightsEnabled}
            cameraFov={cameraFovValue}
            modelScale={modelScale}
            pieceTransforms={pieceTransforms}
            pointerTarget={pointerTarget}
          />
        </Canvas>
      </div>
      {showGui ? (
        <div
          ref={guiRootRef}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 5,
            pointerEvents: 'auto',
          }}
        />
      ) : null}
    </section>
  );
}

function ChessLighting({ enabled, floorTransform, sceneLights }: ChessLightingProps) {
  const backLightRef = useRef<THREE.SpotLight>(null);
  const lightTargetRef = useRef<THREE.Object3D>(null);
  const backSpotPosition: [number, number, number] = [
    sceneLights.backSpot.x,
    sceneLights.backSpot.y,
    sceneLights.backSpot.z,
  ];

  useLayoutEffect(() => {
    if (!enabled || !backLightRef.current || !lightTargetRef.current) {
      return;
    }

    backLightRef.current.target = lightTargetRef.current;
    backLightRef.current.shadow.bias = -0.00015;
    backLightRef.current.shadow.normalBias = 0.018;
    backLightRef.current.shadow.radius = 5;
    lightTargetRef.current.updateMatrixWorld();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    backLightRef.current?.target.updateMatrixWorld();
  }, [enabled, floorTransform.x, floorTransform.y, floorTransform.z]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      <object3D
        ref={lightTargetRef}
        position={[floorTransform.x, floorTransform.y + 0.2, floorTransform.z + 0.2]}
      />
      <ambientLight color={sceneLights.ambient.color} intensity={sceneLights.ambient.intensity} />
      <hemisphereLight
        args={[sceneLights.hemisphere.skyColor, sceneLights.hemisphere.groundColor, sceneLights.hemisphere.intensity]}
        position={[sceneLights.hemisphere.x, sceneLights.hemisphere.y, sceneLights.hemisphere.z]}
      />
      <directionalLight
        castShadow
        color={sceneLights.mainDirectional.color}
        intensity={sceneLights.mainDirectional.intensity}
        position={[sceneLights.mainDirectional.x, sceneLights.mainDirectional.y, sceneLights.mainDirectional.z]}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <directionalLight
        color={sceneLights.secondaryDirectional.color}
        intensity={sceneLights.secondaryDirectional.intensity}
        position={[sceneLights.secondaryDirectional.x, sceneLights.secondaryDirectional.y, sceneLights.secondaryDirectional.z]}
      />
      <spotLight
        ref={backLightRef}
        angle={0.5}
        castShadow
        color={sceneLights.backSpot.color}
        distance={18}
        intensity={sceneLights.backSpot.intensity}
        penumbra={1}
        position={backSpotPosition}
        shadow-camera-far={28}
        shadow-camera-near={0.5}
        shadow-mapSize-height={2048}
        shadow-mapSize-width={2048}
      />
      <spotLight
        angle={0.45}
        color={sceneLights.topSpot.color}
        intensity={sceneLights.topSpot.intensity}
        penumbra={1}
        position={[sceneLights.topSpot.x, sceneLights.topSpot.y, sceneLights.topSpot.z]}
      />
      <SunRayBeams backSpotPosition={sceneLights.backSpot} floorTransform={floorTransform} />
    </>
  );
}

function SunRayBeams({ backSpotPosition, floorTransform }: { backSpotPosition: { color: string; x: number; y: number; z: number }; floorTransform: SceneTransform }) {
  const beamTexture = useMemo(() => createSunBeamTexture(), []);
  const beamDescriptors = useMemo(() => {
    const origin = new THREE.Vector3(backSpotPosition.x, backSpotPosition.y, backSpotPosition.z);
    const up = new THREE.Vector3(0, 1, 0);

    const beams = [
      {
        end: new THREE.Vector3(floorTransform.x - 4.9, floorTransform.y + 0.18, floorTransform.z + 2.95),
        opacity: 0.012,
        width: 2.45,
      },
      {
        end: new THREE.Vector3(floorTransform.x - 1.95, floorTransform.y + 0.12, floorTransform.z + 2.2),
        opacity: 0.017,
        width: 2.85,
      },
      {
        end: new THREE.Vector3(floorTransform.x + 1.45, floorTransform.y + 0.1, floorTransform.z + 2.1),
        opacity: 0.018,
        width: 2.95,
      },
      {
        end: new THREE.Vector3(floorTransform.x + 4.95, floorTransform.y + 0.18, floorTransform.z + 3.05),
        opacity: 0.012,
        width: 2.55,
      },
    ];

    return beams.map((beam) => {
      const direction = beam.end.clone().sub(origin);
      const length = direction.length();
      const midpoint = origin.clone().addScaledVector(direction, 0.5);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        up,
        direction.clone().normalize(),
      );

      return {
        length,
        opacity: beam.opacity,
        position: [midpoint.x, midpoint.y, midpoint.z] as [number, number, number],
        quaternion: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] as [number, number, number, number],
        width: beam.width,
      };
    });
  }, [backSpotPosition.x, backSpotPosition.y, backSpotPosition.z, floorTransform.x, floorTransform.y, floorTransform.z]);

  useEffect(() => {
    return () => {
      beamTexture.dispose();
    };
  }, [beamTexture]);

  return (
    <group renderOrder={-1}>
      {beamDescriptors.map((beam, index) => (
        <group
          key={`sun-ray-${index + 1}`}
          position={beam.position}
          quaternion={beam.quaternion}
        >
          <mesh>
            <planeGeometry args={[beam.width, beam.length]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color={backSpotPosition.color}
              depthWrite={false}
              map={beamTexture}
              opacity={beam.opacity}
              side={THREE.DoubleSide}
              toneMapped={false}
              transparent
            />
          </mesh>
          <mesh rotation={[0, Math.PI / 3, 0]}>
            <planeGeometry args={[beam.width * 0.88, beam.length]} />
            <meshBasicMaterial
              blending={THREE.AdditiveBlending}
              color={backSpotPosition.color}
              depthWrite={false}
              map={beamTexture}
              opacity={beam.opacity * 0.72}
              side={THREE.DoubleSide}
              toneMapped={false}
              transparent
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function ChessBoardScene({
  animationEnabled,
  cameraFov,
  chessModelUrl,
  floorLight,
  floorMeshTransform,
  floorModelUrl,
  floorTransform,
  lightsEnabled,
  modelScale,
  pieceTransforms,
  pointerTarget,
}: ChessBoardSceneProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { size } = useThree();
  const floorGltf = useGLTF(floorModelUrl, dracoDecoderPath);
  const chessGltf = useGLTF(chessModelUrl, dracoDecoderPath);
  const aspectRatio = size.height > 0 ? size.width / size.height : 1;
  const compactLayoutAmount = getCompactLayoutAmount(size.width, aspectRatio);
  const isMobileLayout = size.width > 0 && size.width < mobileChessBreakpoint;
  const displayFloorTransform = useMemo(
    () => ({
      ...floorTransform,
      y: floorTransform.y - compactLayoutAmount * 0.42,
      z: floorTransform.z + compactLayoutAmount * 1.75,
    }),
    [compactLayoutAmount, floorTransform],
  );

  const preparedFloor = useMemo(
    () =>
      buildPreparedFloorScene(
        floorGltf.scene,
        aspectRatio,
        modelScale,
        cameraFov,
        compactLayoutAmount,
      ),
    [aspectRatio, cameraFov, compactLayoutAmount, floorGltf.scene, modelScale],
  );
  const pieceTargetHeight = useMemo(
    () =>
      getFocusedPieceTargetHeight(
        preparedFloor.footprintWidth,
        preparedFloor.footprintDepth,
        aspectRatio,
        cameraFov,
        displayFloorTransform.scale,
        0,
      ),
    [
      aspectRatio,
      cameraFov,
      displayFloorTransform.scale,
      preparedFloor.footprintDepth,
      preparedFloor.footprintWidth,
    ],
  );
  const preparedPiece = useMemo(
    () =>
      buildPreparedPieceScene(
        chessGltf.scene,
        pieceTargetHeight,
      ),
    [chessGltf.scene, pieceTargetHeight],
  );
  const piecePositions = useMemo(
    () => {
      const visiblePieces = pieceTransforms
        .map((piece, index) => ({ index, piece }))
        .filter(({ index, piece }) => piece.visible && (!isMobileLayout || mobileVisiblePieceIndexes.has(index)));

      return visiblePieces.map(({ index, piece }) => ({
        ...piece,
        x: piece.x * preparedFloor.footprintWidth * 0.5,
        z: (isMobileLayout && index === 1 ? 0.1 : piece.z) * preparedFloor.footprintDepth * 0.5,
      }));
    },
    [
      isMobileLayout,
      pieceTransforms,
      preparedFloor.footprintDepth,
      preparedFloor.footprintWidth,
    ],
  );
  const floorLightSize = useMemo(
    () => ({
      depth: Math.max(preparedFloor.footprintDepth * 0.58, 0.6),
      width: Math.max(preparedFloor.footprintWidth * 0.58, 0.6),
    }),
    [preparedFloor.footprintDepth, preparedFloor.footprintWidth],
  );
  const resolvedFloorTransform = useMemo(
    () => ({
      rotationX: displayFloorTransform.rotationX + floorMeshTransform.rotationX,
      rotationY: displayFloorTransform.rotationY + floorMeshTransform.rotationY,
      rotationZ: displayFloorTransform.rotationZ + floorMeshTransform.rotationZ,
      scale: displayFloorTransform.scale * floorMeshTransform.scale,
      visible: floorMeshTransform.visible,
      x: displayFloorTransform.x + floorMeshTransform.x,
      y: displayFloorTransform.y + floorMeshTransform.y,
      z: displayFloorTransform.z + floorMeshTransform.z,
    }),
    [
      displayFloorTransform.rotationX,
      displayFloorTransform.rotationY,
      displayFloorTransform.rotationZ,
      displayFloorTransform.scale,
      displayFloorTransform.x,
      displayFloorTransform.y,
      displayFloorTransform.z,
      floorMeshTransform.rotationX,
      floorMeshTransform.rotationY,
      floorMeshTransform.rotationZ,
      floorMeshTransform.scale,
      floorMeshTransform.visible,
      floorMeshTransform.x,
      floorMeshTransform.y,
      floorMeshTransform.z,
    ],
  );

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.set(0, 0, 0);
    groupRef.current.rotation.set(0, 0, 0);
  }, [preparedFloor.root, preparedPiece.root]);

  useFrame((_, delta) => {
    if (!groupRef.current) {
      return;
    }

    if (!animationEnabled) {
      groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, 0, 3.2, delta);
      groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, 0, 3.2, delta);
      groupRef.current.position.z = THREE.MathUtils.damp(groupRef.current.position.z, 0, 3, delta);
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, 0, 3.4, delta);
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, 0, 3.4, delta);
      groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, 0, 3.2, delta);
      return;
    }

    const { x, y } = pointerTarget.current;

    groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, x * 0.14, 3.2, delta);
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, y * 0.08, 3.2, delta);
    groupRef.current.position.z = THREE.MathUtils.damp(
      groupRef.current.position.z,
      -Math.abs(x) * 0.05 - Math.abs(y) * 0.04,
      3,
      delta,
    );
    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, -y * 0.05, 3.4, delta);
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, x * 0.08, 3.4, delta);
    groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, x * y * -0.025, 3.2, delta);
  });

  return (
    <group ref={groupRef}>
      {resolvedFloorTransform.visible ? (
        <group
          position={[resolvedFloorTransform.x, resolvedFloorTransform.y, resolvedFloorTransform.z]}
          rotation={[
            THREE.MathUtils.degToRad(resolvedFloorTransform.rotationX),
            THREE.MathUtils.degToRad(resolvedFloorTransform.rotationY),
            THREE.MathUtils.degToRad(resolvedFloorTransform.rotationZ),
          ]}
          scale={[resolvedFloorTransform.scale, resolvedFloorTransform.scale, resolvedFloorTransform.scale]}
        >
          <primitive object={preparedFloor.root} />
          {lightsEnabled ? (
            <FloorTopLight
              depth={floorLightSize.depth}
              settings={floorLight}
              width={floorLightSize.width}
            />
          ) : null}
        </group>
      ) : null}
      <group
        position={[displayFloorTransform.x, displayFloorTransform.y, displayFloorTransform.z]}
        rotation={[
          THREE.MathUtils.degToRad(displayFloorTransform.rotationX),
          THREE.MathUtils.degToRad(displayFloorTransform.rotationY),
          THREE.MathUtils.degToRad(displayFloorTransform.rotationZ),
        ]}
        scale={[displayFloorTransform.scale, displayFloorTransform.scale, displayFloorTransform.scale]}
      >
        {piecePositions.map((piece, index) => (
          <group
            key={`piece-${index + 1}`}
            position={[piece.x, piece.y, piece.z]}
            rotation={[
              THREE.MathUtils.degToRad(piece.rotationX),
              THREE.MathUtils.degToRad(piece.rotationY),
              THREE.MathUtils.degToRad(piece.rotationZ),
            ]}
            scale={[piece.scale, piece.scale, piece.scale]}
          >
            {index === 0 ? (
              <primitive object={preparedPiece.root} />
            ) : (
              <Clone object={preparedPiece.root} />
            )}
          </group>
        ))}
      </group>
    </group>
  );
}

function ChessSceneCamera({ fov, mode, position, target }: ChessSceneCameraProps) {
  const { size } = useThree();
  const orthographicZoom = getOrthographicZoom(position, target, size.height, fov);
  const cameraPosition: [number, number, number] = [position.x, position.y, position.z];
  const orthographicCameraRef = useRef<THREE.OrthographicCamera>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera>(null);

  useLayoutEffect(() => {
    const camera = mode === 'Orthographic' ? orthographicCameraRef.current : perspectiveCameraRef.current;

    if (!camera) {
      return;
    }

    camera.position.set(position.x, position.y, position.z);
    camera.lookAt(target.x, target.y, target.z);
    camera.updateMatrixWorld();

    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (camera instanceof THREE.OrthographicCamera) {
      camera.zoom = orthographicZoom;
      camera.updateProjectionMatrix();
    }
  }, [fov, mode, orthographicZoom, position.x, position.y, position.z, target.x, target.y, target.z]);

  if (mode === 'Orthographic') {
    return (
      <OrthographicCamera
        ref={orthographicCameraRef}
        far={1000}
        makeDefault
        near={0.1}
        position={cameraPosition}
        zoom={orthographicZoom}
      />
    );
  }

  return (
    <PerspectiveCamera
      ref={perspectiveCameraRef}
      far={1000}
      fov={fov}
      makeDefault
      near={0.1}
      position={cameraPosition}
    />
  );
}

export default ChessScene;
