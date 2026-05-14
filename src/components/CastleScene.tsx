import {
  Clone,
  OrthographicCamera,
  PerspectiveCamera,
  useGLTF,
} from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type GUI from 'lil-gui';
import gsap from 'gsap';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';


import rocksMobileTextureUrl from '../assets/Textures/rocks-mobile.png';
import rocksTextureUrl from '../assets/Textures/rocks.png';
import {
  castleCameraAxisControls,
  castleFloorTransformDefaults,
  castleFloorLightAxisControls,
  castleFloorLightColorControl,
  castleFloorLightDefaults,
  castleFloorLightEnabledControl,
  castleFloorLightIntensityControl,
  castleFloorLightOpacityControl,
  castleLightsControl,
  castlePerspectiveCamera,
  castleTowerDefaults,
  castleTransformDefaults,
  uniformScaleControl,
  towerPositionAxisControls,
  towerRotationAxisControls,
  type CastleFloorTransform,
  type CastleTransform,
  type SceneCameraPosition,
  type TowerTransform,
} from './CastleScene.config';
import { FloorTopLight } from './FloorTopLight';
import {
  clampFloorLightIntensity,
  clampFloorLightOpacity,
  defaultFloorLightColor,
  type FloorLightSettings,
} from './FloorTopLight.config';

const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const cameraModes = ['Perspective', 'Orthographic'] as const;
const defaultCastleModelUrl = new URL('../assets/Castle/Castle-Building/castle-building.glb', import.meta.url).href;
const defaultTowerModelUrl = new URL('../assets/Castle/Tower/Tower.glb', import.meta.url).href;
const defaultSkyTextureUrl = new URL('../assets/Textures/vortex.jpeg', import.meta.url).href;
const DebugOrbitControls = lazy(() =>
  import('./DebugOrbitControls').then((module) => ({ default: module.DebugOrbitControls })),
);

useGLTF.preload(defaultCastleModelUrl, dracoDecoderPath);
useGLTF.preload(defaultTowerModelUrl, dracoDecoderPath);

type CameraMode = (typeof cameraModes)[number];

export interface CastleSceneProps {
  castleModelUrl?: string;
  floorModelUrl?: string;
  modelScale?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  animationEnabled?: boolean;
  modelUrl?: string;
  rocksImageUrl?: string;
  showGui?: boolean;
  skyTextureUrl?: string;
  towerModelUrl?: string;
}

interface GuiState {
  animationEnabled: boolean;
  cameraMode: CameraMode;
  cameraLocked: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  castle: CastleTransform;
  floor: CastleFloorTransform;
  floorLight: FloorLightSettings;
  lightsEnabled: boolean;
  towers: TowerTransform[];
}

interface CastleGuiControllers {
  rotationX?: ReturnType<GUI['add']>;
  rotationY?: ReturnType<GUI['add']>;
  rotationZ?: ReturnType<GUI['add']>;
  scale?: ReturnType<GUI['add']>;
  x?: ReturnType<GUI['add']>;
  y?: ReturnType<GUI['add']>;
  z?: ReturnType<GUI['add']>;
}

interface TowerGuiControllers {
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

interface GuiControllers {
  animationEnabled?: ReturnType<GUI['add']>;
  cameraMode?: ReturnType<GUI['add']>;
  cameraLocked?: ReturnType<GUI['add']>;
  cameraX?: ReturnType<GUI['add']>;
  cameraY?: ReturnType<GUI['add']>;
  cameraZ?: ReturnType<GUI['add']>;
  castle: CastleGuiControllers;
  floor: TowerGuiControllers;
  floorLight: FloorLightGuiControllers;
  lightsEnabled?: ReturnType<GUI['add']>;
  towers: TowerGuiControllers[];
}

interface CastleModelProps {
  animationEnabled: boolean;
  castleTransform: CastleTransform;
  floorTransform: CastleFloorTransform;
  floorLight: FloorLightSettings;
  floorModelUrl?: string;
  lightsEnabled: boolean;
  modelScale: number;
  modelUrl: string;
  onFloorScreenRectChange: (screenRect: FloorScreenRect | null) => void;
  pointerLastMoved: MutableRefObject<number>;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  towerModelUrl: string;
  towerTransforms: TowerTransform[];
}

interface FloorSceneProps {
  floorModelUrl: string;
  floorTransform: CastleFloorTransform;
  floorLight: FloorLightSettings;
  layoutPositionScale: number;
  lightsEnabled: boolean;
  onFloorScreenRectChange: (screenRect: FloorScreenRect | null) => void;
  preparedCastle: PreparedSceneResult;
  responsiveCastleTransform: CastleTransform;
}

interface CastleSceneCameraProps {
  mode: CameraMode;
  position: SceneCameraPosition;
  target: SceneCameraPosition;
}

interface PreparedSceneResult {
  baseY: number;
  root: THREE.Group;
  worldScale: number;
}

interface FloorScreenRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface FloorSurfaceFootprint {
  points: THREE.Vector3[];
  size: THREE.Vector3;
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
  const control = castleCameraAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampTowerPositionAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = towerPositionAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampFloorLightAxis(axis: 'x' | 'y' | 'z', value: number) {
  const control = castleFloorLightAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampTowerRotationAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = towerRotationAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampUniformScale(value: number) {
  const control = uniformScaleControl;

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function normalizeCastleTransform(transform: CastleTransform): CastleTransform {
  return {
    rotationX: clampTowerRotationAxis('x', transform.rotationX),
    rotationY: clampTowerRotationAxis('y', transform.rotationY),
    rotationZ: clampTowerRotationAxis('z', transform.rotationZ),
    scale: clampUniformScale(transform.scale),
    x: clampTowerPositionAxis('x', transform.x),
    y: clampTowerPositionAxis('y', transform.y),
    z: clampTowerPositionAxis('z', transform.z),
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

function normalizeFloorTransform(transform: CastleFloorTransform): CastleFloorTransform {
  return {
    rotationX: clampTowerRotationAxis('x', transform.rotationX),
    rotationY: clampTowerRotationAxis('y', transform.rotationY),
    rotationZ: clampTowerRotationAxis('z', transform.rotationZ),
    scale: clampUniformScale(transform.scale),
    visible: transform.visible,
    x: clampTowerPositionAxis('x', transform.x),
    y: clampTowerPositionAxis('y', transform.y),
    z: clampTowerPositionAxis('z', transform.z),
  };
}

function normalizeTowerTransform(tower: TowerTransform): TowerTransform {
  return {
    rotationX: clampTowerRotationAxis('x', tower.rotationX),
    rotationY: clampTowerRotationAxis('y', tower.rotationY),
    rotationZ: clampTowerRotationAxis('z', tower.rotationZ),
    scale: clampUniformScale(tower.scale),
    visible: tower.visible,
    x: clampTowerPositionAxis('x', tower.x),
    y: clampTowerPositionAxis('y', tower.y),
    z: clampTowerPositionAxis('z', tower.z),
  };
}

function cloneTowerTransforms(towers: readonly TowerTransform[]) {
  return towers.map((tower) => normalizeTowerTransform({ ...tower }));
}

function getOrthographicZoom(position: SceneCameraPosition, target: SceneCameraPosition, viewportHeight: number) {
  const cameraVector = new THREE.Vector3(position.x, position.y, position.z);
  const targetVector = new THREE.Vector3(target.x, target.y, target.z);
  const cameraDistance = Math.max(cameraVector.distanceTo(targetVector), 0.5);
  const visibleHeight =
    2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(castlePerspectiveCamera.fov / 2));

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

function getWorldScaleForSceneSize(
  size: THREE.Vector3,
  camera: THREE.Camera,
  aspectRatio: number,
  modelScale: number,
) {
  const fov =
    camera instanceof THREE.PerspectiveCamera ? camera.fov : castlePerspectiveCamera.fov;
  const viewport = getViewportAtDistance(castlePerspectiveCamera.position.z, fov, aspectRatio);

  return (
    Math.min(
      viewport.width / Math.max(size.x, 0.001),
      viewport.height / Math.max(size.y, 0.001),
    ) *
    modelScale *
    0.92
  );
}

function scaleScenePosition<T extends SceneCameraPosition>(position: T, factor: number): T {
  return {
    ...position,
    x: position.x * factor,
    y: position.y * factor,
    z: position.z * factor,
  };
}

function getProjectedScreenRectFromPoints(
  points: readonly THREE.Vector3[],
  camera: THREE.Camera,
  viewportWidth: number,
  viewportHeight: number,
  transformMatrix?: THREE.Matrix4,
): FloorScreenRect | null {
  if (!points.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  points.forEach((point) => {
    const projected = point.clone();

    if (transformMatrix) {
      projected.applyMatrix4(transformMatrix);
    }

    projected.project(camera);

    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minY = Math.min(minY, projected.y);
    maxY = Math.max(maxY, projected.y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return null;
  }

  const left = ((minX + 1) / 2) * viewportWidth;
  const right = ((maxX + 1) / 2) * viewportWidth;
  const top = ((1 - maxY) / 2) * viewportHeight;
  const bottom = ((1 - minY) / 2) * viewportHeight;

  return {
    height: Math.max(bottom - top, 0),
    left,
    top,
    width: Math.max(right - left, 0),
  };
}

function getFloorSurfaceFootprint(object: THREE.Object3D): FloorSurfaceFootprint {
  object.updateMatrixWorld(true);

  const objectBounds = new THREE.Box3().setFromObject(object);
  const objectSize = objectBounds.getSize(new THREE.Vector3());
  const topY = objectBounds.max.y;
  const threshold = Math.max(objectSize.y * 0.18, 0.002);
  const points: THREE.Vector3[] = [];
  const vertex = new THREE.Vector3();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    const positionAttribute = child.geometry?.getAttribute('position');

    if (!positionAttribute) {
      return;
    }

    for (let index = 0; index < positionAttribute.count; index += 1) {
      vertex.fromBufferAttribute(positionAttribute, index).applyMatrix4(child.matrixWorld);

      if (vertex.y >= topY - threshold) {
        points.push(vertex.clone());
      }
    }
  });

  if (!points.length) {
    points.push(
      new THREE.Vector3(objectBounds.min.x, topY, objectBounds.min.z),
      new THREE.Vector3(objectBounds.min.x, topY, objectBounds.max.z),
      new THREE.Vector3(objectBounds.max.x, topY, objectBounds.min.z),
      new THREE.Vector3(objectBounds.max.x, topY, objectBounds.max.z),
    );
  }

  const footprintBounds = new THREE.Box3().setFromPoints(points);

  return {
    points,
    size: footprintBounds.getSize(new THREE.Vector3()),
  };
}


function prepareSceneMaterial(material: THREE.Material) {
  const clonedMaterial = material.clone();

  if (
    clonedMaterial instanceof THREE.MeshBasicMaterial ||
    clonedMaterial instanceof THREE.MeshPhongMaterial ||
    clonedMaterial instanceof THREE.MeshPhysicalMaterial ||
    clonedMaterial instanceof THREE.MeshStandardMaterial
  ) {
    clonedMaterial.side = THREE.FrontSide;
    clonedMaterial.needsUpdate = true;
  }

  return clonedMaterial;
}

function prepareSceneMaterials(scene: THREE.Object3D) {
  const root = scene.clone(true) as THREE.Group;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => prepareSceneMaterial(material));
      return;
    }

    child.material = prepareSceneMaterial(child.material);
  });

  return root;
}

function buildPreparedCastleScene(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  aspectRatio: number,
  modelScale: number,
): PreparedSceneResult {
  const root = prepareSceneMaterials(scene);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const worldScale = getWorldScaleForSceneSize(size, camera, aspectRatio, modelScale);
  const baseY = (bounds.min.y - center.y) * worldScale;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -center.y * worldScale, -center.z * worldScale);

  return { baseY, root, worldScale };
}

function buildPreparedTowerScene(scene: THREE.Object3D, worldScale: number) {
  const root = prepareSceneMaterials(scene);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const baseY = bounds.min.y;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -baseY * worldScale, -center.z * worldScale);

  return root;
}

function buildPreparedFloorScene(scene: THREE.Object3D, worldScale: number) {
  const root = prepareSceneMaterials(scene);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const topY = bounds.max.y;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -topY * worldScale, -center.z * worldScale);

  return root;
}

export function CastleScene({
  castleModelUrl = '',
  floorModelUrl = '',
  modelUrl = '',
  modelScale = 1,
  cameraX = castlePerspectiveCamera.position.x,
  cameraY = castlePerspectiveCamera.position.y,
  cameraZ = castlePerspectiveCamera.position.z,
  animationEnabled = true,
  rocksImageUrl = '',
  showGui = false,
  skyTextureUrl = '',
  towerModelUrl = '',
}: CastleSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const skyImageRef = useRef<HTMLImageElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const pointerLastMoved = useRef(Date.now());
  const guiRootRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const guiStateRef = useRef<GuiState | null>(null);
  const guiControllersRef = useRef<GuiControllers>({
    castle: {},
    floor: {},
    floorLight: {},
    towers: [],
  });

  const resolvedCastleModelUrl =
    toText(castleModelUrl).trim() || toText(modelUrl).trim() || defaultCastleModelUrl;
  const resolvedTowerModelUrl = toText(towerModelUrl).trim() || defaultTowerModelUrl;
  const resolvedFloorModelUrl = toText(floorModelUrl).trim();
  const resolvedRocksImageUrl = toText(rocksImageUrl).trim();
  const resolvedSkyTextureUrl = toText(skyTextureUrl).trim() || defaultSkyTextureUrl;
  const [cameraPosition, setCameraPosition] = useState<SceneCameraPosition>({
    x: clampCameraAxis('x', toNumber(cameraX, castlePerspectiveCamera.position.x)),
    y: clampCameraAxis('y', toNumber(cameraY, castlePerspectiveCamera.position.y)),
    z: clampCameraAxis('z', toNumber(cameraZ, castlePerspectiveCamera.position.z)),
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('Perspective');
  const [cameraTarget, setCameraTarget] = useState<SceneCameraPosition>(() => ({
    ...castlePerspectiveCamera.lookAt,
  }));
  const [cameraLocked, setCameraLocked] = useState(false);
  const [animationActive, setAnimationActive] = useState(animationEnabled);
  const [lightsEnabled, setLightsEnabled] = useState(true);
  const [castleTransform, setCastleTransform] = useState<CastleTransform>(() =>
    normalizeCastleTransform({ ...castleTransformDefaults }),
  );
  const [floorTransform, setFloorTransform] = useState<CastleFloorTransform>(() =>
    normalizeFloorTransform({ ...castleFloorTransformDefaults }),
  );
  const [floorLight, setFloorLight] = useState<FloorLightSettings>(() =>
    normalizeFloorLightSettings({ ...castleFloorLightDefaults }),
  );
  const [, setFloorScreenRect] = useState<FloorScreenRect | null>(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 767 : false,
  );
  const [towerTransforms, setTowerTransforms] = useState<TowerTransform[]>(() =>
    cloneTowerTransforms(castleTowerDefaults),
  );

  useEffect(() => {
    setCameraPosition({
      x: clampCameraAxis('x', toNumber(cameraX, castlePerspectiveCamera.position.x)),
      y: clampCameraAxis('y', toNumber(cameraY, castlePerspectiveCamera.position.y)),
      z: clampCameraAxis('z', toNumber(cameraZ, castlePerspectiveCamera.position.z)),
    });
  }, [cameraX, cameraY, cameraZ]);

  useEffect(() => {
    setAnimationActive(animationEnabled);
  }, [animationEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const updateViewportMode = () => {
      setIsMobileViewport(window.innerWidth <= 767);
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);

    return () => {
      window.removeEventListener('resize', updateViewportMode);
    };
  }, []);

  const rocksBackgroundImage =
    resolvedRocksImageUrl || (isMobileViewport ? rocksMobileTextureUrl : rocksTextureUrl);

  useEffect(() => {
    useGLTF.preload(resolvedCastleModelUrl, dracoDecoderPath);
    useGLTF.preload(resolvedTowerModelUrl, dracoDecoderPath);
    if (resolvedFloorModelUrl) {
      useGLTF.preload(resolvedFloorModelUrl, dracoDecoderPath);
    }
  }, [resolvedCastleModelUrl, resolvedFloorModelUrl, resolvedTowerModelUrl]);

  useEffect(() => {
    if (document.body.classList.contains('experience-started')) {
      gsap.set(skyImageRef.current, { opacity: 1 });
      return undefined;
    }

    const observer = new MutationObserver(() => {
      if (!document.body.classList.contains('experience-started')) {
        return;
      }

      observer.disconnect();

      gsap.to(skyImageRef.current, {
        opacity: 1,
        duration: 1.5,
        ease: 'power2.inOut',
      });
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
    };
  }, []);

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
      // In Webflow embeds the section reports height:0 even though it fills the viewport,
      // so fall back to window dimensions when that happens.
      const width = bounds.width || window.innerWidth;
      const height = bounds.height || window.innerHeight;
      const left = bounds.left;
      const top = bounds.height ? bounds.top : 0;

      if (!width || !height) {
        resetPointer();
        return;
      }

      const normalizedX = ((event.clientX - left) / width) * 2 - 1;
      const normalizedY = 1 - ((event.clientY - top) / height) * 2;

      pointerTarget.current.set(shapePointerAxis(normalizedX), shapePointerAxis(normalizedY));
      pointerLastMoved.current = Date.now();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        resetPointer();
      }
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.gamma === null || e.beta === null) return;
      const gx = THREE.MathUtils.clamp(e.gamma / 25, -1, 1);
      const gy = THREE.MathUtils.clamp((e.beta - 25) / 25, -1, 1);
      pointerTarget.current.set(shapePointerAxis(gx), shapePointerAxis(-gy));
      pointerLastMoved.current = Date.now();
    };

    element.addEventListener('pointermove', updatePointer, { passive: true });
    element.addEventListener('pointerleave', resetPointer);
    window.addEventListener('blur', resetPointer);
    window.addEventListener('deviceorientation', handleOrientation, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      element.removeEventListener('pointermove', updatePointer);
      element.removeEventListener('pointerleave', resetPointer);
      window.removeEventListener('blur', resetPointer);
      window.removeEventListener('deviceorientation', handleOrientation);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!showGui || !guiRootRef.current) {
      guiRef.current?.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = { castle: {}, floor: {}, floorLight: {}, towers: [] };
      return undefined;
    }

    let disposed = false;

    void import('lil-gui').then(({ default: GUI }) => {
      if (disposed || !guiRootRef.current) {
        return;
      }

    guiRootRef.current.replaceChildren();

    const guiState: GuiState = {
      animationEnabled: animationActive,
      cameraMode,
      cameraLocked,
      cameraX: cameraPosition.x,
      cameraY: cameraPosition.y,
      cameraZ: cameraPosition.z,
      castle: normalizeCastleTransform({ ...castleTransform }),
      floor: normalizeFloorTransform({ ...floorTransform }),
      floorLight: normalizeFloorLightSettings({ ...floorLight }),
      lightsEnabled,
      towers: cloneTowerTransforms(towerTransforms),
    };

    const gui = new GUI({ autoPlace: false, title: 'Castle GUI', width: 320 });
    const cameraFolder = gui.addFolder('Camera');
    const lightsFolder = gui.addFolder('Lights');
    const animationFolder = gui.addFolder('Animation');
    const castleFolder = gui.addFolder('Castle');
    const floorFolder = gui.addFolder('Floor');
    const floorLightFolder = gui.addFolder('Floor Light');

    guiRootRef.current.appendChild(gui.domElement);
    guiRef.current = gui;
    guiStateRef.current = guiState;

    guiControllersRef.current = {
      animationEnabled: animationFolder
        .add(guiState, 'animationEnabled')
        .name('Enable Motion')
        .onChange((value: boolean) => {
          setAnimationActive(Boolean(value));
        }),
      cameraMode: cameraFolder
        .add(guiState, 'cameraMode', cameraModes)
        .name('Camera Type')
        .onChange((value: string) => {
          setCameraMode(value === 'Orthographic' ? 'Orthographic' : 'Perspective');
        }),
      cameraLocked: cameraFolder
        .add(guiState, 'cameraLocked')
        .name('Orbit Controls')
        .onChange((value: boolean) => {
          setCameraLocked(Boolean(value));
        }),
      cameraX: cameraFolder
        .add(
          guiState,
          'cameraX',
          castleCameraAxisControls.x.min,
          castleCameraAxisControls.x.max,
          castleCameraAxisControls.x.step,
        )
        .name(castleCameraAxisControls.x.label)
        .onChange((value: number) => {
          setCameraPosition((currentValue) => ({
            ...currentValue,
            x: clampCameraAxis('x', Number(value)),
          }));
        }),
      cameraY: cameraFolder
        .add(
          guiState,
          'cameraY',
          castleCameraAxisControls.y.min,
          castleCameraAxisControls.y.max,
          castleCameraAxisControls.y.step,
        )
        .name(castleCameraAxisControls.y.label)
        .onChange((value: number) => {
          setCameraPosition((currentValue) => ({
            ...currentValue,
            y: clampCameraAxis('y', Number(value)),
          }));
        }),
      cameraZ: cameraFolder
        .add(
          guiState,
          'cameraZ',
          castleCameraAxisControls.z.min,
          castleCameraAxisControls.z.max,
          castleCameraAxisControls.z.step,
        )
        .name(castleCameraAxisControls.z.label)
        .onChange((value: number) => {
          setCameraPosition((currentValue) => ({
            ...currentValue,
            z: clampCameraAxis('z', Number(value)),
          }));
        }),
      floor: {},
      castle: {
        x: castleFolder
          .add(
            guiState.castle,
            'x',
            towerPositionAxisControls.x.min,
            towerPositionAxisControls.x.max,
            towerPositionAxisControls.x.step,
          )
          .name(towerPositionAxisControls.x.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                x: Number(value),
              }),
            );
          }),
        y: castleFolder
          .add(
            guiState.castle,
            'y',
            towerPositionAxisControls.y.min,
            towerPositionAxisControls.y.max,
            towerPositionAxisControls.y.step,
          )
          .name(towerPositionAxisControls.y.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                y: Number(value),
              }),
            );
          }),
        z: castleFolder
          .add(
            guiState.castle,
            'z',
            towerPositionAxisControls.z.min,
            towerPositionAxisControls.z.max,
            towerPositionAxisControls.z.step,
          )
          .name(towerPositionAxisControls.z.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                z: Number(value),
              }),
            );
          }),
        rotationX: castleFolder
          .add(
            guiState.castle,
            'rotationX',
            towerRotationAxisControls.x.min,
            towerRotationAxisControls.x.max,
            towerRotationAxisControls.x.step,
          )
          .name(towerRotationAxisControls.x.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                rotationX: Number(value),
              }),
            );
          }),
        rotationY: castleFolder
          .add(
            guiState.castle,
            'rotationY',
            towerRotationAxisControls.y.min,
            towerRotationAxisControls.y.max,
            towerRotationAxisControls.y.step,
          )
          .name(towerRotationAxisControls.y.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                rotationY: Number(value),
              }),
            );
          }),
        rotationZ: castleFolder
          .add(
            guiState.castle,
            'rotationZ',
            towerRotationAxisControls.z.min,
            towerRotationAxisControls.z.max,
            towerRotationAxisControls.z.step,
          )
          .name(towerRotationAxisControls.z.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                rotationZ: Number(value),
              }),
            );
          }),
        scale: castleFolder
          .add(
            guiState.castle,
            'scale',
            uniformScaleControl.min,
            uniformScaleControl.max,
            uniformScaleControl.step,
          )
          .name(uniformScaleControl.label)
          .onChange((value: number) => {
            setCastleTransform((currentValue) =>
              normalizeCastleTransform({
                ...currentValue,
                scale: Number(value),
              }),
            );
          }),
      },
      floorLight: {},
      lightsEnabled: lightsFolder
        .add(guiState, 'lightsEnabled')
        .name(castleLightsControl.label)
        .onChange((value: boolean) => {
          setLightsEnabled(Boolean(value));
        }),
      towers: [],
    };

    const updateFloorLight = (partial: Partial<FloorLightSettings>) => {
      setFloorLight((currentValue) =>
        normalizeFloorLightSettings({
          ...currentValue,
          ...partial,
        }),
      );
    };

    const updateFloor = (partial: Partial<CastleFloorTransform>) => {
      setFloorTransform((currentValue) =>
        normalizeFloorTransform({
          ...currentValue,
          ...partial,
        }),
      );
    };

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
        towerPositionAxisControls.x.min,
        towerPositionAxisControls.x.max,
        towerPositionAxisControls.x.step,
      )
      .name(towerPositionAxisControls.x.label)
      .onChange((value: number) => {
        updateFloor({ x: clampTowerPositionAxis('x', Number(value)) });
      });

    guiControllersRef.current.floor.y = floorFolder
      .add(
        guiState.floor,
        'y',
        towerPositionAxisControls.y.min,
        towerPositionAxisControls.y.max,
        towerPositionAxisControls.y.step,
      )
      .name(towerPositionAxisControls.y.label)
      .onChange((value: number) => {
        updateFloor({ y: clampTowerPositionAxis('y', Number(value)) });
      });

    guiControllersRef.current.floor.z = floorFolder
      .add(
        guiState.floor,
        'z',
        towerPositionAxisControls.z.min,
        towerPositionAxisControls.z.max,
        towerPositionAxisControls.z.step,
      )
      .name(towerPositionAxisControls.z.label)
      .onChange((value: number) => {
        updateFloor({ z: clampTowerPositionAxis('z', Number(value)) });
      });

    guiControllersRef.current.floor.rotationX = floorFolder
      .add(
        guiState.floor,
        'rotationX',
        towerRotationAxisControls.x.min,
        towerRotationAxisControls.x.max,
        towerRotationAxisControls.x.step,
      )
      .name(towerRotationAxisControls.x.label)
      .onChange((value: number) => {
        updateFloor({ rotationX: clampTowerRotationAxis('x', Number(value)) });
      });

    guiControllersRef.current.floor.rotationY = floorFolder
      .add(
        guiState.floor,
        'rotationY',
        towerRotationAxisControls.y.min,
        towerRotationAxisControls.y.max,
        towerRotationAxisControls.y.step,
      )
      .name(towerRotationAxisControls.y.label)
      .onChange((value: number) => {
        updateFloor({ rotationY: clampTowerRotationAxis('y', Number(value)) });
      });

    guiControllersRef.current.floor.rotationZ = floorFolder
      .add(
        guiState.floor,
        'rotationZ',
        towerRotationAxisControls.z.min,
        towerRotationAxisControls.z.max,
        towerRotationAxisControls.z.step,
      )
      .name(towerRotationAxisControls.z.label)
      .onChange((value: number) => {
        updateFloor({ rotationZ: clampTowerRotationAxis('z', Number(value)) });
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
            setFloorTransform(normalizeFloorTransform({ ...castleFloorTransformDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Floor');

    guiControllersRef.current.floorLight.enabled = floorLightFolder
      .add(guiState.floorLight, 'enabled')
      .name(castleFloorLightEnabledControl.label)
      .onChange((value: boolean) => {
        updateFloorLight({ enabled: Boolean(value) });
      });

    guiControllersRef.current.floorLight.color = floorLightFolder
      .addColor(guiState.floorLight, 'color')
      .name(castleFloorLightColorControl.label)
      .onChange((value: string) => {
        updateFloorLight({ color: toText(value).trim() || defaultFloorLightColor });
      });

    guiControllersRef.current.floorLight.x = floorLightFolder
      .add(
        guiState.floorLight,
        'x',
        castleFloorLightAxisControls.x.min,
        castleFloorLightAxisControls.x.max,
        castleFloorLightAxisControls.x.step,
      )
      .name(castleFloorLightAxisControls.x.label)
      .onChange((value: number) => {
        updateFloorLight({ x: clampFloorLightAxis('x', Number(value)) });
      });

    guiControllersRef.current.floorLight.y = floorLightFolder
      .add(
        guiState.floorLight,
        'y',
        castleFloorLightAxisControls.y.min,
        castleFloorLightAxisControls.y.max,
        castleFloorLightAxisControls.y.step,
      )
      .name(castleFloorLightAxisControls.y.label)
      .onChange((value: number) => {
        updateFloorLight({ y: clampFloorLightAxis('y', Number(value)) });
      });

    guiControllersRef.current.floorLight.z = floorLightFolder
      .add(
        guiState.floorLight,
        'z',
        castleFloorLightAxisControls.z.min,
        castleFloorLightAxisControls.z.max,
        castleFloorLightAxisControls.z.step,
      )
      .name(castleFloorLightAxisControls.z.label)
      .onChange((value: number) => {
        updateFloorLight({ z: clampFloorLightAxis('z', Number(value)) });
      });

    guiControllersRef.current.floorLight.intensity = floorLightFolder
      .add(
        guiState.floorLight,
        'intensity',
        castleFloorLightIntensityControl.min,
        castleFloorLightIntensityControl.max,
        castleFloorLightIntensityControl.step,
      )
      .name(castleFloorLightIntensityControl.label)
      .onChange((value: number) => {
        updateFloorLight({ intensity: clampFloorLightIntensity(Number(value)) });
      });

    guiControllersRef.current.floorLight.opacity = floorLightFolder
      .add(
        guiState.floorLight,
        'opacity',
        castleFloorLightOpacityControl.min,
        castleFloorLightOpacityControl.max,
        castleFloorLightOpacityControl.step,
      )
      .name(castleFloorLightOpacityControl.label)
      .onChange((value: number) => {
        updateFloorLight({ opacity: clampFloorLightOpacity(Number(value)) });
      });

    floorLightFolder
      .add(
        {
          reset: () => {
            setFloorLight(normalizeFloorLightSettings({ ...castleFloorLightDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Light');

    towerTransforms.forEach((_, index) => {
      const towerFolder = gui.addFolder(`Tower ${index + 1}`);
      const towerState = guiState.towers[index];

      const updateTower = (nextValues: Partial<TowerTransform>) => {
        setTowerTransforms((currentValue) =>
          currentValue.map((tower, towerIndex) =>
            towerIndex === index
              ? normalizeTowerTransform({
                  ...tower,
                  ...nextValues,
                })
              : tower,
          ),
        );
      };

      guiControllersRef.current.towers[index] = {
        visible:
          index > 0
            ? towerFolder
                .add(towerState, 'visible')
                .name('Visible')
                .onChange((value: boolean) => {
                  updateTower({ visible: Boolean(value) });
                })
            : undefined,
        x: towerFolder
          .add(
            towerState,
            'x',
            towerPositionAxisControls.x.min,
            towerPositionAxisControls.x.max,
            towerPositionAxisControls.x.step,
          )
          .name(towerPositionAxisControls.x.label)
          .onChange((value: number) => {
            updateTower({ x: clampTowerPositionAxis('x', Number(value)) });
          }),
        y: towerFolder
          .add(
            towerState,
            'y',
            towerPositionAxisControls.y.min,
            towerPositionAxisControls.y.max,
            towerPositionAxisControls.y.step,
          )
          .name(towerPositionAxisControls.y.label)
          .onChange((value: number) => {
            updateTower({ y: clampTowerPositionAxis('y', Number(value)) });
          }),
        z: towerFolder
          .add(
            towerState,
            'z',
            towerPositionAxisControls.z.min,
            towerPositionAxisControls.z.max,
            towerPositionAxisControls.z.step,
          )
          .name(towerPositionAxisControls.z.label)
          .onChange((value: number) => {
            updateTower({ z: clampTowerPositionAxis('z', Number(value)) });
          }),
        rotationX: towerFolder
          .add(
            towerState,
            'rotationX',
            towerRotationAxisControls.x.min,
            towerRotationAxisControls.x.max,
            towerRotationAxisControls.x.step,
          )
          .name(towerRotationAxisControls.x.label)
          .onChange((value: number) => {
            updateTower({ rotationX: clampTowerRotationAxis('x', Number(value)) });
          }),
        rotationY: towerFolder
          .add(
            towerState,
            'rotationY',
            towerRotationAxisControls.y.min,
            towerRotationAxisControls.y.max,
            towerRotationAxisControls.y.step,
          )
          .name(towerRotationAxisControls.y.label)
          .onChange((value: number) => {
            updateTower({ rotationY: clampTowerRotationAxis('y', Number(value)) });
          }),
        rotationZ: towerFolder
          .add(
            towerState,
            'rotationZ',
            towerRotationAxisControls.z.min,
            towerRotationAxisControls.z.max,
            towerRotationAxisControls.z.step,
          )
          .name(towerRotationAxisControls.z.label)
          .onChange((value: number) => {
            updateTower({ rotationZ: clampTowerRotationAxis('z', Number(value)) });
          }),
        scale: towerFolder
          .add(
            towerState,
            'scale',
            uniformScaleControl.min,
            uniformScaleControl.max,
            uniformScaleControl.step,
          )
          .name(uniformScaleControl.label)
          .onChange((value: number) => {
            updateTower({ scale: clampUniformScale(Number(value)) });
          }),
      };

      towerFolder
        .add(
          {
            reset: () => {
              updateTower({ ...castleTowerDefaults[index] });
            },
          },
          'reset',
        )
        .name('Reset Tower');

      towerFolder.close();
    });

    cameraFolder
      .add(
        {
          reset: () => {
            setCameraPosition({ ...castlePerspectiveCamera.position });
            setCameraTarget({ ...castlePerspectiveCamera.lookAt });
            setCameraLocked(true);
          },
        },
        'reset',
      )
      .name('Reset Camera');

    cameraFolder.close();
    lightsFolder.close();
    animationFolder.close();
    castleFolder.close();
    floorFolder.close();
    floorLightFolder.close();

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
      guiControllersRef.current = { castle: {}, floor: {}, floorLight: {}, towers: [] };
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
    guiState.cameraMode = cameraMode;
    guiState.cameraLocked = cameraLocked;
    guiState.cameraX = cameraPosition.x;
    guiState.cameraY = cameraPosition.y;
    guiState.cameraZ = cameraPosition.z;
    Object.assign(guiState.castle, normalizeCastleTransform(castleTransform));
    Object.assign(guiState.floor, normalizeFloorTransform(floorTransform));
    Object.assign(guiState.floorLight, normalizeFloorLightSettings(floorLight));
    guiState.lightsEnabled = lightsEnabled;
    towerTransforms.forEach((tower, index) => {
      const guiTower = guiState.towers[index];

      if (!guiTower) {
        return;
      }

      Object.assign(guiTower, normalizeTowerTransform(tower));
    });

    guiControllersRef.current.animationEnabled?.updateDisplay();
    guiControllersRef.current.cameraMode?.updateDisplay();
    guiControllersRef.current.cameraLocked?.updateDisplay();
    guiControllersRef.current.cameraX?.updateDisplay();
    guiControllersRef.current.cameraY?.updateDisplay();
    guiControllersRef.current.cameraZ?.updateDisplay();
    guiControllersRef.current.castle.rotationX?.updateDisplay();
    guiControllersRef.current.castle.rotationY?.updateDisplay();
    guiControllersRef.current.castle.rotationZ?.updateDisplay();
    guiControllersRef.current.castle.scale?.updateDisplay();
    guiControllersRef.current.castle.x?.updateDisplay();
    guiControllersRef.current.castle.y?.updateDisplay();
    guiControllersRef.current.castle.z?.updateDisplay();
    guiControllersRef.current.floor.visible?.updateDisplay();
    guiControllersRef.current.floor.rotationX?.updateDisplay();
    guiControllersRef.current.floor.rotationY?.updateDisplay();
    guiControllersRef.current.floor.rotationZ?.updateDisplay();
    guiControllersRef.current.floor.scale?.updateDisplay();
    guiControllersRef.current.floor.x?.updateDisplay();
    guiControllersRef.current.floor.y?.updateDisplay();
    guiControllersRef.current.floor.z?.updateDisplay();
    guiControllersRef.current.floorLight.enabled?.updateDisplay();
    guiControllersRef.current.floorLight.color?.updateDisplay();
    guiControllersRef.current.floorLight.x?.updateDisplay();
    guiControllersRef.current.floorLight.y?.updateDisplay();
    guiControllersRef.current.floorLight.z?.updateDisplay();
    guiControllersRef.current.floorLight.intensity?.updateDisplay();
    guiControllersRef.current.floorLight.opacity?.updateDisplay();
    guiControllersRef.current.lightsEnabled?.updateDisplay();

    guiControllersRef.current.towers.forEach((controllers) => {
      controllers.x?.updateDisplay();
      controllers.y?.updateDisplay();
      controllers.z?.updateDisplay();
      controllers.rotationX?.updateDisplay();
      controllers.rotationY?.updateDisplay();
      controllers.rotationZ?.updateDisplay();
      controllers.scale?.updateDisplay();
      controllers.visible?.updateDisplay();
    });
  }, [animationActive, cameraLocked, cameraMode, cameraPosition, castleTransform, floorLight, floorTransform, lightsEnabled, towerTransforms]);

  return (
    <section className="castle-scene-shell" ref={sectionRef}>
      <img
        ref={skyImageRef}
        aria-hidden="true"
        alt=""
        src={resolvedSkyTextureUrl}
        decoding="async"
        loading="eager"
        style={{
          height: '100%',
          inset: 0,
          objectFit: 'cover',
          objectPosition: 'center top',
          opacity: 0,
          pointerEvents: 'none',
          position: 'absolute',
          userSelect: 'none',
          width: '100%',
          zIndex: 0,
        }}
      />
      <div
        className="castle-scene-viewport"
        style={{
          zIndex: 2,
        }}
      >
        <Canvas
          dpr={[1, 1.25]}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
          }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <CastleSceneCamera
            mode={cameraMode}
            position={cameraPosition}
            target={cameraTarget}
          />
          {showGui ? (
            <Suspense fallback={null}>
              <DebugOrbitControls
                enabled={cameraLocked}
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
          <CastleLighting enabled={lightsEnabled} />
          <CastleModel
            animationEnabled={animationActive}
            castleTransform={castleTransform}
            floorTransform={floorTransform}
            floorLight={floorLight}
            floorModelUrl={resolvedFloorModelUrl}
            key={[resolvedCastleModelUrl, resolvedTowerModelUrl, resolvedFloorModelUrl].join('::')}
            lightsEnabled={lightsEnabled}
            modelScale={modelScale}
            modelUrl={resolvedCastleModelUrl}
            onFloorScreenRectChange={setFloorScreenRect}
            pointerLastMoved={pointerLastMoved}
            pointerTarget={pointerTarget}
            towerModelUrl={resolvedTowerModelUrl}
            towerTransforms={towerTransforms}
          />
        </Canvas>
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
      </div>
      <img
        aria-hidden="true"
        alt=""
        src={rocksBackgroundImage}
        decoding="async"
        loading="lazy"
        style={{
          bottom: 0,
          height: '85vh',
          left: 0,
          objectFit: 'cover',
          objectPosition: 'center bottom',
          pointerEvents: 'none',
          position: 'absolute',
          right: 0,
          userSelect: 'none',
          width: '100%',
          zIndex: 4,
        }}
      />
    </section>
  );
}

function CastleLighting({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return null;
  }

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight intensity={1.15} position={[5, 6, 4]} />
      <directionalLight intensity={0.35} position={[-4, 2, -5]} />
    </>
  );
}

function CastleModel({
  animationEnabled,
  castleTransform,
  floorTransform,
  floorLight,
  floorModelUrl,
  lightsEnabled,
  modelScale,
  modelUrl,
  onFloorScreenRectChange,
  pointerLastMoved,
  pointerTarget,
  towerModelUrl,
  towerTransforms,
}: CastleModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const entranceRef = useRef({ y: -3.0, scale: 0.85 });
  const entranceActiveRef = useRef(true);
  const smoothRef = useRef({ px: 0, py: -3.0, pz: 0, rx: 0, ry: 0, rz: 0 });
  const { camera, size } = useThree();
  const gltf = useGLTF(modelUrl, dracoDecoderPath);
  const towerGltf = useGLTF(towerModelUrl, dracoDecoderPath);

  const preparedCastle = useMemo(
    () =>
      buildPreparedCastleScene(
        gltf.scene,
        camera,
        size.height > 0 ? size.width / size.height : 1,
        modelScale,
      ),
    [camera, gltf.scene, modelScale, size.height, size.width],
  );

  const preparedTower = useMemo(
    () => buildPreparedTowerScene(towerGltf.scene, preparedCastle.worldScale),
    [preparedCastle.worldScale, towerGltf.scene],
  );
  const referenceWorldScale = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const sceneSize = bounds.getSize(new THREE.Vector3());

    return getWorldScaleForSceneSize(sceneSize, camera, 16 / 9, modelScale);
  }, [camera, gltf.scene, modelScale]);
  const layoutPositionScale = useMemo(() => {
    if (!Number.isFinite(referenceWorldScale) || referenceWorldScale <= 0) {
      return 1;
    }

    return preparedCastle.worldScale / referenceWorldScale;
  }, [preparedCastle.worldScale, referenceWorldScale]);
  const responsiveCastleTransform = useMemo(
    () => ({
      ...castleTransform,
      ...scaleScenePosition(castleTransform, layoutPositionScale),
    }),
    [castleTransform, layoutPositionScale],
  );
  const towerModelHeight = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(preparedTower);
    return Math.max(bounds.getSize(new THREE.Vector3()).y, 0.001);
  }, [preparedTower]);

  const responsiveTowerTransforms = useMemo(() => {
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(castlePerspectiveCamera.fov / 2));

    return towerTransforms.map((tower) => {
      const scaledPos = scaleScenePosition(tower, layoutPositionScale);
      const baseScale = tower.scale * layoutPositionScale;
      const depth = Math.max(castlePerspectiveCamera.position.z - scaledPos.z, 0.1);
      const frustumHeight = 2 * tanHalfFov * depth;
      const maxScale = (frustumHeight * 0.9) / towerModelHeight;

      return {
        ...tower,
        ...scaledPos,
        scale: Math.min(baseScale, maxScale),
      };
    });
  }, [layoutPositionScale, towerModelHeight, towerTransforms]);
  const attachedTower = responsiveTowerTransforms[0];
  const detachedTowers = responsiveTowerTransforms.slice(1);

  useEffect(() => {
    const s = smoothRef.current;
    s.px = 0; s.py = entranceRef.current.y; s.pz = 0;
    s.rx = 0; s.ry = 0; s.rz = 0;
  }, [animationEnabled, preparedCastle.root, preparedTower]);

  useEffect(() => {
    entranceActiveRef.current = true;
    entranceRef.current.y = -3.5;
    entranceRef.current.scale = 0.82;
    smoothRef.current.py = -3.5;

    const tween = gsap.to(entranceRef.current, {
      y: 0,
      scale: 1,
      duration: 2.0,
      ease: 'power4.out',
      onComplete: () => {
        entranceActiveRef.current = false;
      },
    });

    return () => {
      tween.kill();
    };
  }, []);

  useFrame((state, delta) => {
    if (!groupRef.current) {
      return;
    }

    const dt = Math.min(delta, 1 / 20);
    const alpha = Math.min(1, 6 * dt);

    const entranceY = entranceActiveRef.current ? entranceRef.current.y : 0;
    const entranceScale = entranceActiveRef.current ? entranceRef.current.scale : 1;
    const time = state.clock.getElapsedTime();

    const idleStrength = THREE.MathUtils.clamp(
      ((Date.now() - pointerLastMoved.current) / 1000 - 1.5) / 2.5,
      0, 1,
    );
    const idle = Math.sin(time * 0.55) * 0.038 * idleStrength;
    const idleRot = Math.sin(time * 0.4) * 0.014 * idleStrength;

    const { x, y } = pointerTarget.current;
    const tpx = animationEnabled ? x * 0.16 : 0;
    const tpy = animationEnabled ? y * 0.08 + entranceY + idle : entranceY + idle;
    const tpz = animationEnabled ? -Math.abs(x) * 0.05 - Math.abs(y) * 0.03 : 0;
    const trx = animationEnabled ? -y * 0.08 : 0;
    const tRY = animationEnabled ? x * 0.16 + idleRot : idleRot;
    const trz = animationEnabled ? x * y * -0.035 : 0;

    const s = smoothRef.current;
    s.px += (tpx - s.px) * alpha;
    s.py += (tpy - s.py) * alpha;
    s.pz += (tpz - s.pz) * alpha;
    s.rx += (trx - s.rx) * alpha;
    s.ry += (tRY - s.ry) * alpha;
    s.rz += (trz - s.rz) * alpha;

    groupRef.current.position.set(s.px, s.py, s.pz);
    groupRef.current.rotation.set(s.rx, s.ry, s.rz);
    groupRef.current.scale.setScalar(entranceScale);
  });

  return (
    <group ref={groupRef}>
        {floorModelUrl ? (
          <FloorScene
            floorLight={floorLight}
            floorModelUrl={floorModelUrl}
            floorTransform={floorTransform}
            layoutPositionScale={layoutPositionScale}
            lightsEnabled={lightsEnabled}
            onFloorScreenRectChange={onFloorScreenRectChange}
            preparedCastle={preparedCastle}
            responsiveCastleTransform={responsiveCastleTransform}
          />
        ) : null}
        <group
          position={[responsiveCastleTransform.x, responsiveCastleTransform.y, responsiveCastleTransform.z]}
          rotation={[
            THREE.MathUtils.degToRad(responsiveCastleTransform.rotationX),
            THREE.MathUtils.degToRad(responsiveCastleTransform.rotationY),
            THREE.MathUtils.degToRad(responsiveCastleTransform.rotationZ),
          ]}
          scale={[responsiveCastleTransform.scale, responsiveCastleTransform.scale, responsiveCastleTransform.scale]}
        >
          <primitive object={preparedCastle.root} />
          {attachedTower?.visible ? (
            <group
              key="tower-1"
              position={[attachedTower.x, attachedTower.y, attachedTower.z]}
              rotation={[
                THREE.MathUtils.degToRad(attachedTower.rotationX),
                THREE.MathUtils.degToRad(attachedTower.rotationY),
                THREE.MathUtils.degToRad(attachedTower.rotationZ),
              ]}
              scale={[attachedTower.scale, attachedTower.scale, attachedTower.scale]}
            >
              <Clone object={preparedTower} />
            </group>
          ) : null}
        </group>
        {detachedTowers.map((tower, index) =>
          tower.visible ? (
          <group
            key={`tower-${index + 2}`}
            position={[tower.x, tower.y, tower.z]}
            rotation={[
              THREE.MathUtils.degToRad(tower.rotationX),
              THREE.MathUtils.degToRad(tower.rotationY),
              THREE.MathUtils.degToRad(tower.rotationZ),
            ]}
            scale={[tower.scale, tower.scale, tower.scale]}
          >
            <Clone object={preparedTower} />
          </group>
          ) : null,
        )}
    </group>
  );
}

function FloorScene({
  floorModelUrl,
  floorTransform,
  floorLight,
  layoutPositionScale,
  lightsEnabled,
  onFloorScreenRectChange,
  preparedCastle,
  responsiveCastleTransform,
}: FloorSceneProps) {
  const { camera, size } = useThree();
  const floorGltf = useGLTF(floorModelUrl, dracoDecoderPath);

  const preparedFloor = useMemo(
    () => buildPreparedFloorScene(floorGltf.scene, preparedCastle.worldScale),
    [floorGltf.scene, preparedCastle.worldScale],
  );
  const preparedFloorSurface = useMemo(
    () => getFloorSurfaceFootprint(preparedFloor),
    [preparedFloor],
  );
  const responsiveFloorTransform = useMemo(
    () => ({
      ...floorTransform,
      ...scaleScenePosition(floorTransform, layoutPositionScale),
    }),
    [floorTransform, layoutPositionScale],
  );
  const floorAnchorBounds = useMemo(() => {
    const castleRoot = new THREE.Group();

    castleRoot.position.set(
      responsiveCastleTransform.x,
      responsiveCastleTransform.y,
      responsiveCastleTransform.z,
    );
    castleRoot.rotation.set(
      THREE.MathUtils.degToRad(responsiveCastleTransform.rotationX),
      THREE.MathUtils.degToRad(responsiveCastleTransform.rotationY),
      THREE.MathUtils.degToRad(responsiveCastleTransform.rotationZ),
    );
    castleRoot.scale.setScalar(responsiveCastleTransform.scale);
    castleRoot.add(preparedCastle.root.clone(true));
    castleRoot.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(castleRoot);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());

    return {
      baseY: bounds.min.y,
      center,
      size,
    };
  }, [preparedCastle.root, responsiveCastleTransform]);
  const floorPosition = useMemo(
    () => new THREE.Vector3(floorAnchorBounds.center.x, floorAnchorBounds.baseY - 0.02, floorAnchorBounds.center.z),
    [floorAnchorBounds.baseY, floorAnchorBounds.center.x, floorAnchorBounds.center.z],
  );
  const finalFloorPosition = useMemo(
    () =>
      new THREE.Vector3(
        floorPosition.x + responsiveFloorTransform.x,
        floorPosition.y + responsiveFloorTransform.y,
        floorPosition.z + responsiveFloorTransform.z,
      ),
    [floorPosition.x, floorPosition.y, floorPosition.z, responsiveFloorTransform.x, responsiveFloorTransform.y, responsiveFloorTransform.z],
  );
  const floorQuaternion = useMemo(
    () =>
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          THREE.MathUtils.degToRad(responsiveFloorTransform.rotationX),
          THREE.MathUtils.degToRad(responsiveFloorTransform.rotationY),
          THREE.MathUtils.degToRad(responsiveFloorTransform.rotationZ),
        ),
      ),
    [
      responsiveFloorTransform.rotationX,
      responsiveFloorTransform.rotationY,
      responsiveFloorTransform.rotationZ,
    ],
  );
  const compositionFloorScale = useMemo(() => {
    const paddedWidth = floorAnchorBounds.size.x * 1.18;
    const paddedDepth = floorAnchorBounds.size.z * 1.18;

    return Math.max(
      paddedWidth / Math.max(preparedFloorSurface.size.x, 0.001),
      paddedDepth / Math.max(preparedFloorSurface.size.z, 0.001),
      1,
    );
  }, [
    floorAnchorBounds.size.x,
    floorAnchorBounds.size.z,
    preparedFloorSurface.size.x,
    preparedFloorSurface.size.z,
  ]);
  const preparedFloorFrontEdgePoints = useMemo(() => {
    if (!preparedFloorSurface.points.length) {
      return preparedFloorSurface.points;
    }

    const dominantAxis =
      Math.abs(camera.position.z - floorPosition.z) >= Math.abs(camera.position.x - floorPosition.x)
        ? 'z'
        : 'x';
    const frontAxisValue = preparedFloorSurface.points.reduce((result, point) => {
      const axisValue = dominantAxis === 'z' ? point.z : point.x;

      if (dominantAxis === 'z') {
        return camera.position.z >= floorPosition.z ? Math.max(result, axisValue) : Math.min(result, axisValue);
      }

      return camera.position.x >= floorPosition.x ? Math.max(result, axisValue) : Math.min(result, axisValue);
    }, dominantAxis === 'z'
      ? camera.position.z >= floorPosition.z
        ? Number.NEGATIVE_INFINITY
        : Number.POSITIVE_INFINITY
      : camera.position.x >= floorPosition.x
        ? Number.NEGATIVE_INFINITY
        : Number.POSITIVE_INFINITY);
    const axisRange =
      dominantAxis === 'z' ? preparedFloorSurface.size.z : preparedFloorSurface.size.x;
    const threshold = Math.max(axisRange * 0.08, 0.02);
    const edgePoints = preparedFloorSurface.points.filter((point) => {
      const axisValue = dominantAxis === 'z' ? point.z : point.x;

      if (dominantAxis === 'z') {
        return camera.position.z >= floorPosition.z
          ? axisValue >= frontAxisValue - threshold
          : axisValue <= frontAxisValue + threshold;
      }

      return camera.position.x >= floorPosition.x
        ? axisValue >= frontAxisValue - threshold
        : axisValue <= frontAxisValue + threshold;
    });

    return edgePoints.length ? edgePoints : preparedFloorSurface.points;
  }, [camera.position.x, camera.position.z, floorPosition.x, floorPosition.z, preparedFloorSurface.points, preparedFloorSurface.size.x, preparedFloorSurface.size.z]);
  const compositionFloorMatrix = useMemo(
    () =>
      new THREE.Matrix4().compose(
        floorPosition.clone(),
        new THREE.Quaternion(),
        new THREE.Vector3(compositionFloorScale, 1, compositionFloorScale),
      ),
    [compositionFloorScale, floorPosition],
  );
  const compositionFloorScreenRect = useMemo(() => {
    if (!size.width || !size.height) {
      return null;
    }

    return getProjectedScreenRectFromPoints(
      preparedFloorFrontEdgePoints,
      camera,
      size.width,
      size.height,
      compositionFloorMatrix,
    );
  }, [
    camera,
    compositionFloorMatrix,
    preparedFloorFrontEdgePoints,
    size.height,
    size.width,
  ]);
  const widthFillMultiplier = useMemo(
    () =>
      compositionFloorScreenRect?.width
        ? (size.width * 1.04) / Math.max(compositionFloorScreenRect.width, 1)
        : 1,
    [compositionFloorScreenRect, size.width],
  );
  const floorScale = useMemo(() => {
    return {
      x: compositionFloorScale * Math.max(widthFillMultiplier, 1) * responsiveFloorTransform.scale,
      y: responsiveFloorTransform.scale,
      z: compositionFloorScale * responsiveFloorTransform.scale,
    };
  }, [compositionFloorScale, responsiveFloorTransform.scale, widthFillMultiplier]);
  const floorLightSize = useMemo(() => {
    return {
      depth: Math.max(preparedFloorSurface.size.z * 0.54, 0.8),
      width: Math.max(preparedFloorSurface.size.x * 0.54, 0.8),
    };
  }, [preparedFloorSurface.size.x, preparedFloorSurface.size.z]);
  const floorMatrix = useMemo(
    () =>
      new THREE.Matrix4().compose(
        finalFloorPosition.clone(),
        floorQuaternion.clone(),
        new THREE.Vector3(floorScale.x, floorScale.y, floorScale.z),
      ),
    [finalFloorPosition, floorQuaternion, floorScale.x, floorScale.y, floorScale.z],
  );
  const floorScreenRect = useMemo(() => {
    if (!responsiveFloorTransform.visible || !size.width || !size.height) {
      return null;
    }

    return getProjectedScreenRectFromPoints(
      preparedFloorSurface.points,
      camera,
      size.width,
      size.height,
      floorMatrix,
    );
  }, [
    camera,
    floorMatrix,
    preparedFloorSurface.points,
    size.height,
    size.width,
    responsiveFloorTransform.visible,
  ]);

  useEffect(() => {
    onFloorScreenRectChange(floorScreenRect);
  }, [floorScreenRect, onFloorScreenRectChange]);

  return (
    <group
      position={[finalFloorPosition.x, finalFloorPosition.y, finalFloorPosition.z]}
      rotation={[
        THREE.MathUtils.degToRad(responsiveFloorTransform.rotationX),
        THREE.MathUtils.degToRad(responsiveFloorTransform.rotationY),
        THREE.MathUtils.degToRad(responsiveFloorTransform.rotationZ),
      ]}
      scale={[floorScale.x, floorScale.y, floorScale.z]}
    >
      {responsiveFloorTransform.visible ? <primitive object={preparedFloor} /> : null}
      {responsiveFloorTransform.visible && lightsEnabled ? (
        <FloorTopLight
          depth={floorLightSize.depth}
          settings={floorLight}
          width={floorLightSize.width}
        />
      ) : null}
    </group>
  );
}

function CastleSceneCamera({ mode, position, target }: CastleSceneCameraProps) {
  const { size } = useThree();
  const orthographicZoom = getOrthographicZoom(position, target, size.height);
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

    if (camera instanceof THREE.OrthographicCamera || camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
  }, [mode, orthographicZoom, position.x, position.y, position.z, target.x, target.y, target.z]);

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
      fov={castlePerspectiveCamera.fov}
      makeDefault
      near={0.1}
      position={cameraPosition}
    />
  );
}

export default CastleScene;
