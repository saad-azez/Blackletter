import {
  Clone,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
  useGLTF,
  useTexture,
} from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import GUI from 'lil-gui';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import rocksTextureUrl from '../assets/Textures/rocks.png';
import vortexTextureUrl from '../assets/Textures/vortex.jpeg';
import {
  castleCameraAxisControls,
  castlePerspectiveCamera,
  castleTowerDefaults,
  castleTransformDefaults,
  overlayOffsetControls,
  rocksOverlayDefaults,
  skyTransformDefaults,
  uniformScaleControl,
  towerPositionAxisControls,
  towerRotationAxisControls,
  type CastleTransform,
  type RocksOverlayTransform,
  type SceneCameraPosition,
  type SkyTransform,
  type TowerTransform,
} from './CastleScene.config';

const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const defaultModelUrl = '/assets/Castle-Building/castle-building.glb';
const defaultTowerModelUrl = '/assets/Castle/Tower/Tower.glb';
const cameraModes = ['Perspective', 'Orthographic'] as const;

useGLTF.preload(defaultModelUrl, dracoDecoderPath);
useGLTF.preload(defaultTowerModelUrl, dracoDecoderPath);
useTexture.preload(vortexTextureUrl);

type CameraMode = (typeof cameraModes)[number];

export interface CastleSceneProps {
  modelUrl?: string;
  modelScale?: number;
  cameraIntensity?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  showGui?: boolean;
  animationEnabled?: boolean;
}

interface GuiState {
  animationEnabled: boolean;
  cameraMode: CameraMode;
  cameraLocked: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  castle: CastleTransform;
  rocks: RocksOverlayTransform;
  sky: SkyTransform;
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

interface RocksGuiControllers {
  rotationX?: ReturnType<GUI['add']>;
  rotationY?: ReturnType<GUI['add']>;
  rotationZ?: ReturnType<GUI['add']>;
  scale?: ReturnType<GUI['add']>;
  x?: ReturnType<GUI['add']>;
  y?: ReturnType<GUI['add']>;
}

interface SkyGuiControllers {
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

interface GuiControllers {
  animationEnabled?: ReturnType<GUI['add']>;
  cameraMode?: ReturnType<GUI['add']>;
  cameraLocked?: ReturnType<GUI['add']>;
  cameraX?: ReturnType<GUI['add']>;
  cameraY?: ReturnType<GUI['add']>;
  cameraZ?: ReturnType<GUI['add']>;
  castle: CastleGuiControllers;
  rocks: RocksGuiControllers;
  sky: SkyGuiControllers;
  towers: TowerGuiControllers[];
}

interface CastleModelProps {
  animationEnabled: boolean;
  castleTransform: CastleTransform;
  loadSessionId: number;
  modelScale: number;
  modelUrl: string;
  onSceneReady: (loadSessionId: number, modelUrl: string) => void;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  skyTransform: SkyTransform;
  towerTransforms: TowerTransform[];
}

interface CastleOrbitControlsProps {
  basePosition: SceneCameraPosition;
  intensity: number;
  locked: boolean;
  onCameraSnapshotChange: (snapshot: CameraSnapshot) => void;
  target: SceneCameraPosition;
}

interface CastleSceneCameraProps {
  mode: CameraMode;
  position: SceneCameraPosition;
  target: SceneCameraPosition;
}

interface PreparedSceneResult {
  root: THREE.Group;
  worldScale: number;
}

interface CameraSnapshot {
  position: SceneCameraPosition;
  target: SceneCameraPosition;
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

function clampTowerRotationAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = towerRotationAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampUniformScale(value: number) {
  const control = uniformScaleControl;

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampOverlayOffset(axis: 'x' | 'y', value: number) {
  const control = overlayOffsetControls[axis];

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

function normalizeSkyTransform(transform: SkyTransform): SkyTransform {
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

function normalizeRocksOverlayTransform(transform: RocksOverlayTransform): RocksOverlayTransform {
  return {
    rotationX: clampTowerRotationAxis('x', transform.rotationX),
    rotationY: clampTowerRotationAxis('y', transform.rotationY),
    rotationZ: clampTowerRotationAxis('z', transform.rotationZ),
    scale: clampUniformScale(transform.scale),
    x: clampOverlayOffset('x', transform.x),
    y: clampOverlayOffset('y', transform.y),
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

function prepareSkyTexture(texture: THREE.Texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
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
  const fov =
    camera instanceof THREE.PerspectiveCamera ? camera.fov : castlePerspectiveCamera.fov;
  const viewport = getViewportAtDistance(castlePerspectiveCamera.position.z, fov, aspectRatio);
  const worldScale =
    Math.min(
      viewport.width / Math.max(size.x, 0.001),
      viewport.height / Math.max(size.y, 0.001),
    ) *
    modelScale *
    0.92;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -center.y * worldScale, -center.z * worldScale);

  return { root, worldScale };
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

export function CastleScene({
  modelUrl = '',
  modelScale = 1,
  cameraIntensity = 0.35,
  cameraX = castlePerspectiveCamera.position.x,
  cameraY = castlePerspectiveCamera.position.y,
  cameraZ = castlePerspectiveCamera.position.z,
  showGui = true,
  animationEnabled = true,
}: CastleSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const guiRootRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const guiStateRef = useRef<GuiState | null>(null);
  const guiControllersRef = useRef<GuiControllers>({ castle: {}, rocks: {}, sky: {}, towers: [] });
  const loadSessionRef = useRef(0);
  const loadStartTimeRef = useRef(0);
  const completedLoadSessionRef = useRef(0);
  const cameraSnapshotRef = useRef<CameraSnapshot>({
    position: { ...castlePerspectiveCamera.position },
    target: { ...castlePerspectiveCamera.lookAt },
  });

  const resolvedModelUrl = toText(modelUrl).trim() || defaultModelUrl;
  const [cameraPosition, setCameraPosition] = useState<SceneCameraPosition>({
    x: clampCameraAxis('x', toNumber(cameraX, castlePerspectiveCamera.position.x)),
    y: clampCameraAxis('y', toNumber(cameraY, castlePerspectiveCamera.position.y)),
    z: clampCameraAxis('z', toNumber(cameraZ, castlePerspectiveCamera.position.z)),
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('Perspective');
  const [cameraTarget, setCameraTarget] = useState<SceneCameraPosition>({
    ...castlePerspectiveCamera.lookAt,
  });
  const [cameraLocked, setCameraLocked] = useState(false);
  const [animationActive, setAnimationActive] = useState(animationEnabled);
  const [castleTransform, setCastleTransform] = useState<CastleTransform>(() =>
    normalizeCastleTransform({ ...castleTransformDefaults }),
  );
  const [rocksTransform, setRocksTransform] = useState<RocksOverlayTransform>(() =>
    normalizeRocksOverlayTransform({ ...rocksOverlayDefaults }),
  );
  const [skyTransform, setSkyTransform] = useState<SkyTransform>(() =>
    normalizeSkyTransform({ ...skyTransformDefaults }),
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
    cameraSnapshotRef.current = {
      position: { ...cameraPosition },
      target: { ...cameraTarget },
    };
  }, [cameraPosition, cameraTarget]);

  useEffect(() => {
    useGLTF.preload(resolvedModelUrl, dracoDecoderPath);
  }, [resolvedModelUrl]);

  useEffect(() => {
    loadSessionRef.current += 1;
    loadStartTimeRef.current = performance.now();

    console.log('[CastleScene] load-start', {
      loadSessionId: loadSessionRef.current,
      modelUrl: resolvedModelUrl,
      startedAt: loadStartTimeRef.current,
    });
  }, [resolvedModelUrl]);

  const handleSceneReady = (loadSessionId: number, readyModelUrl: string) => {
    if (loadSessionId !== loadSessionRef.current) {
      return;
    }

    if (completedLoadSessionRef.current === loadSessionId) {
      return;
    }

    completedLoadSessionRef.current = loadSessionId;

    const completedAt = performance.now();
    const durationMs = Number((completedAt - loadStartTimeRef.current).toFixed(2));

    console.log('[CastleScene] load-complete', {
      completedAt,
      durationMs,
      loadSessionId,
      modelUrl: readyModelUrl,
    });
  };

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
      guiControllersRef.current = { castle: {}, rocks: {}, sky: {}, towers: [] };
      return undefined;
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
      rocks: normalizeRocksOverlayTransform({ ...rocksTransform }),
      sky: normalizeSkyTransform({ ...skyTransform }),
      towers: cloneTowerTransforms(towerTransforms),
    };

    const gui = new GUI({ autoPlace: false, title: 'Castle GUI', width: 320 });
    const cameraFolder = gui.addFolder('Camera');
    const animationFolder = gui.addFolder('Animation');
    const castleFolder = gui.addFolder('Castle');
    const rocksFolder = gui.addFolder('Rocks');
    const skyFolder = gui.addFolder('Sky');

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
        .name('Lock Orbit')
        .onChange((value: boolean) => {
          if (value) {
            const snapshot = cameraSnapshotRef.current;

            setCameraPosition({ ...snapshot.position });
            setCameraTarget({ ...snapshot.target });
            setCameraLocked(true);
            return;
          }

          setCameraLocked(false);
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
      rocks: {
        x: rocksFolder
          .add(
            guiState.rocks,
            'x',
            overlayOffsetControls.x.min,
            overlayOffsetControls.x.max,
            overlayOffsetControls.x.step,
          )
          .name(overlayOffsetControls.x.label)
          .onChange((value: number) => {
            setRocksTransform((currentValue) =>
              normalizeRocksOverlayTransform({
                ...currentValue,
                x: Number(value),
              }),
            );
          }),
        y: rocksFolder
          .add(
            guiState.rocks,
            'y',
            overlayOffsetControls.y.min,
            overlayOffsetControls.y.max,
            overlayOffsetControls.y.step,
          )
          .name(overlayOffsetControls.y.label)
          .onChange((value: number) => {
            setRocksTransform((currentValue) =>
              normalizeRocksOverlayTransform({
                ...currentValue,
                y: Number(value),
              }),
            );
          }),
        rotationX: rocksFolder
          .add(
            guiState.rocks,
            'rotationX',
            towerRotationAxisControls.x.min,
            towerRotationAxisControls.x.max,
            towerRotationAxisControls.x.step,
          )
          .name(towerRotationAxisControls.x.label)
          .onChange((value: number) => {
            setRocksTransform((currentValue) =>
              normalizeRocksOverlayTransform({
                ...currentValue,
                rotationX: Number(value),
              }),
            );
          }),
        rotationY: rocksFolder
          .add(
            guiState.rocks,
            'rotationY',
            towerRotationAxisControls.y.min,
            towerRotationAxisControls.y.max,
            towerRotationAxisControls.y.step,
          )
          .name(towerRotationAxisControls.y.label)
          .onChange((value: number) => {
            setRocksTransform((currentValue) =>
              normalizeRocksOverlayTransform({
                ...currentValue,
                rotationY: Number(value),
              }),
            );
          }),
        rotationZ: rocksFolder
          .add(
            guiState.rocks,
            'rotationZ',
            towerRotationAxisControls.z.min,
            towerRotationAxisControls.z.max,
            towerRotationAxisControls.z.step,
          )
          .name(towerRotationAxisControls.z.label)
          .onChange((value: number) => {
            setRocksTransform((currentValue) =>
              normalizeRocksOverlayTransform({
                ...currentValue,
                rotationZ: Number(value),
              }),
            );
          }),
        scale: rocksFolder
          .add(
            guiState.rocks,
            'scale',
            uniformScaleControl.min,
            uniformScaleControl.max,
            uniformScaleControl.step,
          )
          .name(uniformScaleControl.label)
          .onChange((value: number) => {
            setRocksTransform((currentValue) =>
              normalizeRocksOverlayTransform({
                ...currentValue,
                scale: Number(value),
              }),
            );
          }),
      },
      sky: {
        scale: skyFolder
          .add(
            guiState.sky,
            'scale',
            uniformScaleControl.min,
            uniformScaleControl.max,
            uniformScaleControl.step,
          )
          .name(uniformScaleControl.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                scale: Number(value),
              }),
            );
          }),
        x: skyFolder
          .add(
            guiState.sky,
            'x',
            towerPositionAxisControls.x.min,
            towerPositionAxisControls.x.max,
            towerPositionAxisControls.x.step,
          )
          .name(towerPositionAxisControls.x.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                x: Number(value),
              }),
            );
          }),
        y: skyFolder
          .add(
            guiState.sky,
            'y',
            towerPositionAxisControls.y.min,
            towerPositionAxisControls.y.max,
            towerPositionAxisControls.y.step,
          )
          .name(towerPositionAxisControls.y.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                y: Number(value),
              }),
            );
          }),
        z: skyFolder
          .add(
            guiState.sky,
            'z',
            towerPositionAxisControls.z.min,
            towerPositionAxisControls.z.max,
            towerPositionAxisControls.z.step,
          )
          .name(towerPositionAxisControls.z.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                z: Number(value),
              }),
            );
          }),
        rotationX: skyFolder
          .add(
            guiState.sky,
            'rotationX',
            towerRotationAxisControls.x.min,
            towerRotationAxisControls.x.max,
            towerRotationAxisControls.x.step,
          )
          .name(towerRotationAxisControls.x.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                rotationX: Number(value),
              }),
            );
          }),
        rotationY: skyFolder
          .add(
            guiState.sky,
            'rotationY',
            towerRotationAxisControls.y.min,
            towerRotationAxisControls.y.max,
            towerRotationAxisControls.y.step,
          )
          .name(towerRotationAxisControls.y.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                rotationY: Number(value),
              }),
            );
          }),
        rotationZ: skyFolder
          .add(
            guiState.sky,
            'rotationZ',
            towerRotationAxisControls.z.min,
            towerRotationAxisControls.z.max,
            towerRotationAxisControls.z.step,
          )
          .name(towerRotationAxisControls.z.label)
          .onChange((value: number) => {
            setSkyTransform((currentValue) =>
              normalizeSkyTransform({
                ...currentValue,
                rotationZ: Number(value),
              }),
            );
          }),
      },
      towers: [],
    };

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

      towerFolder.close();
    });

    cameraFolder
      .add(
        {
          reset: () => {
            setCameraPosition({ ...castlePerspectiveCamera.position });
            setCameraTarget({ ...castlePerspectiveCamera.lookAt });
            setCameraLocked(false);
          },
        },
        'reset',
      )
      .name('Reset Camera');

    cameraFolder.close();
    animationFolder.close();
    castleFolder.close();
    rocksFolder.close();
    skyFolder.close();

    return () => {
      gui.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = { castle: {}, rocks: {}, sky: {}, towers: [] };
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
    Object.assign(guiState.rocks, normalizeRocksOverlayTransform(rocksTransform));
    Object.assign(guiState.sky, normalizeSkyTransform(skyTransform));
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
    guiControllersRef.current.rocks.x?.updateDisplay();
    guiControllersRef.current.rocks.y?.updateDisplay();
    guiControllersRef.current.rocks.rotationX?.updateDisplay();
    guiControllersRef.current.rocks.rotationY?.updateDisplay();
    guiControllersRef.current.rocks.rotationZ?.updateDisplay();
    guiControllersRef.current.rocks.scale?.updateDisplay();
    guiControllersRef.current.sky.x?.updateDisplay();
    guiControllersRef.current.sky.y?.updateDisplay();
    guiControllersRef.current.sky.z?.updateDisplay();
    guiControllersRef.current.sky.rotationX?.updateDisplay();
    guiControllersRef.current.sky.rotationY?.updateDisplay();
    guiControllersRef.current.sky.rotationZ?.updateDisplay();
    guiControllersRef.current.sky.scale?.updateDisplay();

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
  }, [animationActive, cameraLocked, cameraMode, cameraPosition, castleTransform, rocksTransform, skyTransform, towerTransforms]);

  return (
    <section
      ref={sectionRef}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        minHeight: '100dvh',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <CastleSceneCamera
          mode={cameraMode}
          position={cameraPosition}
          target={cameraTarget}
        />
        <CastleLighting />
        <CastleModel
          animationEnabled={animationActive}
          castleTransform={castleTransform}
          key={resolvedModelUrl}
          loadSessionId={loadSessionRef.current}
          modelScale={modelScale}
          modelUrl={resolvedModelUrl}
          onSceneReady={handleSceneReady}
          pointerTarget={pointerTarget}
          skyTransform={skyTransform}
          towerTransforms={towerTransforms}
        />
        <CastleOrbitControls
          basePosition={cameraPosition}
          intensity={cameraIntensity}
          locked={cameraLocked}
          onCameraSnapshotChange={(snapshot) => {
            cameraSnapshotRef.current = snapshot;
          }}
          target={cameraTarget}
        />
      </Canvas>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '75dvh',
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'stretch',
          overflow: 'hidden',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 4,
        }}
      >
        <img
          alt=""
          aria-hidden="true"
          src={rocksTextureUrl}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center bottom',
            transform: [
              `translate3d(${rocksTransform.x}px, ${rocksTransform.y}px, 0)`,
              'perspective(1400px)',
              `rotateX(${rocksTransform.rotationX}deg)`,
              `rotateY(${rocksTransform.rotationY}deg)`,
              `rotateZ(${rocksTransform.rotationZ}deg)`,
              `scale(${rocksTransform.scale})`,
            ].join(' '),
            transformOrigin: 'center bottom',
          }}
        />
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

function CastleLighting() {
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
  loadSessionId,
  modelScale,
  modelUrl,
  onSceneReady,
  pointerTarget,
  skyTransform,
  towerTransforms,
}: CastleModelProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const gltf = useGLTF(modelUrl, dracoDecoderPath);
  const towerGltf = useGLTF(defaultTowerModelUrl, dracoDecoderPath);
  const skyTexture = useTexture(vortexTextureUrl);

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
  const preparedSkyTexture = useMemo(() => prepareSkyTexture(skyTexture), [skyTexture]);
  const attachedTower = towerTransforms[0];
  const detachedTowers = towerTransforms.slice(1);

  useEffect(() => {
    onSceneReady(loadSessionId, modelUrl);
  }, [loadSessionId, modelUrl, onSceneReady, preparedCastle.root, preparedTower]);

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.set(0, 0, 0);
    groupRef.current.rotation.set(0, 0, 0);
  }, [animationEnabled, preparedCastle.root, preparedTower]);

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

    groupRef.current.position.x = THREE.MathUtils.damp(groupRef.current.position.x, x * 0.12, 3.2, delta);
    groupRef.current.position.y = THREE.MathUtils.damp(groupRef.current.position.y, y * 0.06, 3.2, delta);
    groupRef.current.position.z = THREE.MathUtils.damp(
      groupRef.current.position.z,
      -Math.abs(x) * 0.04 - Math.abs(y) * 0.03,
      3,
      delta,
    );
    groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, -y * 0.06, 3.4, delta);
    groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y, x * 0.12, 3.4, delta);
    groupRef.current.rotation.z = THREE.MathUtils.damp(groupRef.current.rotation.z, x * y * -0.03, 3.2, delta);
  });

  return (
    <group ref={groupRef}>
      <mesh
        position={[skyTransform.x, skyTransform.y, skyTransform.z]}
        renderOrder={-1}
        rotation={[
          THREE.MathUtils.degToRad(skyTransform.rotationX),
          THREE.MathUtils.degToRad(skyTransform.rotationY),
          THREE.MathUtils.degToRad(skyTransform.rotationZ),
        ]}
        scale={[skyTransform.scale, skyTransform.scale, skyTransform.scale]}
      >
        <planeGeometry args={[18, 12]} />
        <meshBasicMaterial map={preparedSkyTexture} toneMapped={false} />
      </mesh>
      <group
        position={[castleTransform.x, castleTransform.y, castleTransform.z]}
        rotation={[
          THREE.MathUtils.degToRad(castleTransform.rotationX),
          THREE.MathUtils.degToRad(castleTransform.rotationY),
          THREE.MathUtils.degToRad(castleTransform.rotationZ),
        ]}
        scale={[castleTransform.scale, castleTransform.scale, castleTransform.scale]}
      >
        <primitive object={preparedCastle.root} />
        {attachedTower ? (
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

function CastleSceneCamera({ mode, position, target }: CastleSceneCameraProps) {
  const { size } = useThree();
  const orthographicZoom = getOrthographicZoom(position, target, size.height);
  const cameraPosition: [number, number, number] = [position.x, position.y, position.z];

  if (mode === 'Orthographic') {
    return (
      <OrthographicCamera
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
      far={1000}
      fov={castlePerspectiveCamera.fov}
      makeDefault
      near={0.1}
      position={cameraPosition}
    />
  );
}

function CastleOrbitControls({
  basePosition,
  intensity,
  locked,
  onCameraSnapshotChange,
  target,
}: CastleOrbitControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.set(basePosition.x, basePosition.y, basePosition.z);
    controlsRef.current?.target.set(
      target.x,
      target.y,
      target.z,
    );
    controlsRef.current?.update();
    invalidate();
  }, [basePosition.x, basePosition.y, basePosition.z, camera, invalidate, target.x, target.y, target.z]);

  useEffect(() => {
    const controls = controlsRef.current;

    if (!controls) {
      return undefined;
    }

    const emitSnapshot = () => {
      onCameraSnapshotChange({
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        target: {
          x: controls.target.x,
          y: controls.target.y,
          z: controls.target.z,
        },
      });
    };

    emitSnapshot();
    controls.addEventListener('change', emitSnapshot);

    return () => {
      controls.removeEventListener('change', emitSnapshot);
    };
  }, [camera, onCameraSnapshotChange]);

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.08}
      enabled={!locked}
      enableDamping
      enablePan
      enableRotate
      enableZoom
      makeDefault
      maxDistance={50}
      minDistance={0.5}
      rotateSpeed={0.65 + intensity * 0.35}
      target={[target.x, target.y, target.z]}
      zoomSpeed={0.65 + intensity * 0.35}
    />
  );
}

export default CastleScene;
