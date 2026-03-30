import { Float, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import GUI from 'lil-gui';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  castleCameraAxisControls,
  castlePerspectiveCamera,
  type SceneCameraPosition,
} from './CastleScene.config';

export interface CastleSceneProps {
  modelUrl?: string;
  resourcePath?: string;
  binaryUrl?: string;
  modelScale?: number;
  cameraIntensity?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  showGui?: boolean;
  showAxesHelpers?: boolean;
  selectedNodeName?: string;
  selectedNodeOnlyMotion?: boolean;
}

interface SceneContentProps {
  binaryUrl: string;
  cameraIntensity: number;
  cameraPosition: SceneCameraPosition;
  debugConfig: SceneDebugConfig;
  modelScale: number;
  modelUrl: string;
  onDebugNodesChange: (value: DebugNodeOption[]) => void;
  onDebugSnapshotChange: (value: DebugSnapshot | null) => void;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  resourcePath: string;
}

interface SceneModelProps {
  binaryUrl: string;
  debugConfig: SceneDebugConfig;
  modelScale: number;
  modelUrl: string;
  onDebugNodesChange: (value: DebugNodeOption[]) => void;
  onDebugSnapshotChange: (value: DebugSnapshot | null) => void;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  resourcePath: string;
}

interface SceneOrbitControlsProps {
  basePosition: SceneCameraPosition;
  intensity: number;
}

interface DebugNodeOption {
  key: string;
  label: string;
}

interface DebugSnapshot {
  activeNodeLabel: string;
  localPosition: [number, number, number];
  parentLabel: string | null;
  rotation: [number, number, number];
  scale: [number, number, number];
  worldPosition: [number, number, number];
}

interface SceneDebugConfig {
  enabled: boolean;
  selectedNodeKey: string;
  selectedOnlyMotion: boolean;
  showAxesHelpers: boolean;
}

interface GuiState {
  activeNodeKey: string;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  local: string;
  node: string;
  parent: string;
  rotate: string;
  scale: string;
  selectedOnlyMotion: boolean;
  showAxesHelpers: boolean;
  world: string;
}

type GuiController = ReturnType<GUI['add']>;

interface GuiControllers {
  activeNode?: GuiController;
  cameraX?: GuiController;
  cameraY?: GuiController;
  cameraZ?: GuiController;
  readOnly: GuiController[];
  selectedOnlyMotion?: GuiController;
  showAxesHelpers?: GuiController;
}

const interactionSelector = '.frame';
const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const sceneRootDebugKey = '__scene_root__';
const theme = {
  ambientLight: '#f6ebd9',
  fillLight: '#ffcb8f',
  keyLight: '#9eb5ff',
  rimLight: '#6e88d8',
} as const;

function coerceTextInput(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => coerceTextInput(entry)).filter(Boolean).join('\n');
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

function coerceNumberInput(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsedValue = Number(coerceTextInput(value).trim());

  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function clampCameraAxisValue(axis: keyof SceneCameraPosition, value: number) {
  const control = castleCameraAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function getModelFormat(modelUrl: string) {
  const normalizedUrl = modelUrl.split('?')[0]?.split('#')[0]?.toLowerCase() ?? '';

  if (normalizedUrl.endsWith('.gltf')) {
    return 'gltf';
  }

  if (normalizedUrl.endsWith('.glb')) {
    return 'glb';
  }

  return 'unknown';
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

function getDefaultResourcePath(modelUrl: string) {
  try {
    const parsedUrl = new URL(modelUrl, window.location.href);
    const directoryPath = parsedUrl.pathname.slice(0, parsedUrl.pathname.lastIndexOf('/') + 1);

    return `${parsedUrl.origin}${directoryPath}`;
  } catch {
    const lastSlashIndex = modelUrl.lastIndexOf('/');

    return lastSlashIndex === -1 ? '' : modelUrl.slice(0, lastSlashIndex + 1);
  }
}

function getResourceDirectoryPath(resourcePath: string) {
  const trimmedPath = resourcePath.trim();

  if (!trimmedPath) {
    return '';
  }

  try {
    const parsedUrl = new URL(trimmedPath, window.location.href);
    const pathname = parsedUrl.pathname;
    const lastSegment = pathname.split('/').pop() ?? '';

    if (lastSegment.includes('.')) {
      const directoryPath = pathname.slice(0, pathname.lastIndexOf('/') + 1);

      return `${parsedUrl.origin}${directoryPath}`;
    }

    return ensureTrailingSlash(trimmedPath);
  } catch {
    const normalizedPath = trimmedPath.replace(/[?#].*$/, '');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');
    const lastSegment = lastSlashIndex >= 0 ? normalizedPath.slice(lastSlashIndex + 1) : normalizedPath;

    if (lastSegment.includes('.')) {
      return trimmedPath.slice(0, trimmedPath.lastIndexOf('/') + 1);
    }

    return ensureTrailingSlash(trimmedPath);
  }
}

function normalizeAssetKey(value: string) {
  const withoutQuery = value.split('?')[0]?.split('#')[0] ?? '';
  const lastSlashIndex = withoutQuery.lastIndexOf('/');
  const fileName = lastSlashIndex >= 0 ? withoutQuery.slice(lastSlashIndex + 1) : withoutQuery;

  try {
    return decodeURIComponent(fileName).toLowerCase();
  } catch {
    return fileName.toLowerCase();
  }
}

function getViewportAtDistance(distance: number, fov: number, aspectRatio: number) {
  const viewportHeight = 2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2) * distance;

  return {
    height: viewportHeight,
    width: viewportHeight * aspectRatio,
  };
}

function shapePointerAxis(value: number) {
  const clampedValue = THREE.MathUtils.clamp(value, -1, 1);

  return Math.sign(clampedValue) * Math.pow(Math.abs(clampedValue), 1.2);
}

function getObjectLabel(object: THREE.Object3D) {
  const trimmedName = object.name.trim();

  return trimmedName || object.type;
}

function getDebugNodeKey(object: THREE.Object3D, sceneRoot: THREE.Object3D) {
  if (object === sceneRoot) {
    return sceneRootDebugKey;
  }

  const pathParts: string[] = [];
  let current: THREE.Object3D | null = object;

  while (current && current !== sceneRoot) {
    pathParts.unshift(getObjectLabel(current));
    current = current.parent;
  }

  return pathParts.join(' / ');
}

function roundVector(values: THREE.Vector3 | THREE.Euler): [number, number, number] {
  return [values.x, values.y, values.z].map((value) => Number(value.toFixed(3))) as [
    number,
    number,
    number,
  ];
}

function resetObjectTransform(target: THREE.Object3D | null) {
  if (!target) {
    return;
  }

  const basePosition = target.userData.__castleBasePosition as THREE.Vector3 | undefined;
  const baseRotation = target.userData.__castleBaseRotation as THREE.Euler | undefined;

  if (basePosition) {
    target.position.copy(basePosition);
  }

  if (baseRotation) {
    target.rotation.set(baseRotation.x, baseRotation.y, baseRotation.z, baseRotation.order);
  }
}

function createDebugSnapshot(activeNode: THREE.Object3D): DebugSnapshot {
  const worldPosition = new THREE.Vector3();

  activeNode.getWorldPosition(worldPosition);

  return {
    activeNodeLabel: getObjectLabel(activeNode),
    localPosition: roundVector(activeNode.position),
    parentLabel: activeNode.parent ? getObjectLabel(activeNode.parent) : null,
    rotation: roundVector(activeNode.rotation),
    scale: roundVector(activeNode.scale),
    worldPosition: roundVector(worldPosition),
  };
}

function renderVector(label: string, value: [number, number, number]) {
  return `${label}: ${value.join(', ')}`;
}

function applyDebugSnapshotToGuiState(guiState: GuiState, debugSnapshot: DebugSnapshot | null) {
  guiState.node = debugSnapshot?.activeNodeLabel ?? 'Waiting for scene data...';
  guiState.parent = debugSnapshot?.parentLabel ?? 'None';
  guiState.local = debugSnapshot ? renderVector('Local', debugSnapshot.localPosition) : 'Local: -';
  guiState.world = debugSnapshot ? renderVector('World', debugSnapshot.worldPosition) : 'World: -';
  guiState.rotate = debugSnapshot ? renderVector('Rotate', debugSnapshot.rotation) : 'Rotate: -';
  guiState.scale = debugSnapshot ? renderVector('Scale', debugSnapshot.scale) : 'Scale: -';
}

export function CastleScene({
  modelUrl = '',
  resourcePath = '',
  binaryUrl = '',
  modelScale = 1,
  cameraIntensity = 0.35,
  cameraX = castlePerspectiveCamera.position.x,
  cameraY = castlePerspectiveCamera.position.y,
  cameraZ = castlePerspectiveCamera.position.z,
  showGui = true,
  showAxesHelpers = true,
  selectedNodeName = '',
  selectedNodeOnlyMotion = false,
}: CastleSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const isBrowser = typeof window !== 'undefined';
  const resolvedModelUrl = coerceTextInput(modelUrl).trim();
  const resolvedResourcePath = coerceTextInput(resourcePath).trim();
  const resolvedBinaryUrl = coerceTextInput(binaryUrl).trim();
  const resolvedSelectedNodeName = coerceTextInput(selectedNodeName).trim();
  const [nodeOptions, setNodeOptions] = useState<DebugNodeOption[]>([
    { key: sceneRootDebugKey, label: 'Scene Root' },
  ]);
  const [activeNodeKey, setActiveNodeKey] = useState(resolvedSelectedNodeName || sceneRootDebugKey);
  const [axesEnabled, setAxesEnabled] = useState(showAxesHelpers);
  const [selectedOnlyMotion, setSelectedOnlyMotion] = useState(selectedNodeOnlyMotion);
  const [cameraPosition, setCameraPosition] = useState<SceneCameraPosition>({
    x: clampCameraAxisValue('x', coerceNumberInput(cameraX, castlePerspectiveCamera.position.x)),
    y: clampCameraAxisValue('y', coerceNumberInput(cameraY, castlePerspectiveCamera.position.y)),
    z: clampCameraAxisValue('z', coerceNumberInput(cameraZ, castlePerspectiveCamera.position.z)),
  });
  const [debugSnapshot, setDebugSnapshot] = useState<DebugSnapshot | null>(null);
  const guiRootRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const guiStateRef = useRef<GuiState | null>(null);
  const guiControllersRef = useRef<GuiControllers>({ readOnly: [] });

  useEffect(() => {
    setActiveNodeKey(resolvedSelectedNodeName || sceneRootDebugKey);
  }, [resolvedSelectedNodeName]);

  useEffect(() => {
    setAxesEnabled(showAxesHelpers);
  }, [showAxesHelpers]);

  useEffect(() => {
    setSelectedOnlyMotion(selectedNodeOnlyMotion);
  }, [selectedNodeOnlyMotion]);

  useEffect(() => {
    setCameraPosition({
      x: clampCameraAxisValue('x', coerceNumberInput(cameraX, castlePerspectiveCamera.position.x)),
      y: clampCameraAxisValue('y', coerceNumberInput(cameraY, castlePerspectiveCamera.position.y)),
      z: clampCameraAxisValue('z', coerceNumberInput(cameraZ, castlePerspectiveCamera.position.z)),
    });
  }, [cameraX, cameraY, cameraZ]);

  useEffect(() => {
    if (!nodeOptions.some((option) => option.key === activeNodeKey)) {
      setActiveNodeKey(sceneRootDebugKey);
    }
  }, [activeNodeKey, nodeOptions]);

  useEffect(() => {
    if (!isBrowser || !sectionRef.current) {
      return undefined;
    }

    const sectionElement = sectionRef.current;
    const closestFrame = sectionElement.closest(interactionSelector);
    const interactionElement =
      (closestFrame instanceof HTMLElement
        ? closestFrame
        : document.querySelector(interactionSelector)) ?? sectionElement;

    const resetPointer = () => {
      pointerTarget.current.set(0, 0);
    };

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const bounds = interactionElement.getBoundingClientRect();

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

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', handlePointerMove, { passive: true });
    window.addEventListener('blur', resetPointer);
    interactionElement.addEventListener('pointerleave', resetPointer);
    interactionElement.addEventListener('pointercancel', resetPointer);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerMove);
      window.removeEventListener('blur', resetPointer);
      interactionElement.removeEventListener('pointerleave', resetPointer);
      interactionElement.removeEventListener('pointercancel', resetPointer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isBrowser]);

  const debugConfig = useMemo<SceneDebugConfig>(
    () => ({
      enabled: showGui,
      selectedNodeKey: activeNodeKey,
      selectedOnlyMotion,
      showAxesHelpers: axesEnabled,
    }),
    [activeNodeKey, axesEnabled, selectedOnlyMotion, showGui],
  );

  useEffect(() => {
    if (!showGui || !guiRootRef.current) {
      guiRef.current?.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = { readOnly: [] };
      return undefined;
    }

    guiRootRef.current.replaceChildren();

    const guiState: GuiState = {
      activeNodeKey,
      cameraX: cameraPosition.x,
      cameraY: cameraPosition.y,
      cameraZ: cameraPosition.z,
      local: '',
      node: '',
      parent: '',
      rotate: '',
      scale: '',
      selectedOnlyMotion,
      showAxesHelpers: axesEnabled,
      world: '',
    };

    applyDebugSnapshotToGuiState(guiState, debugSnapshot);

    const gui = new GUI({ autoPlace: false, title: 'Castle GUI', width: 320 });
    const sceneFolder = gui.addFolder('Scene');
    const cameraFolder = gui.addFolder('Camera');
    const nodeFolder = gui.addFolder('Selected Node');
    const nodeOptionsMap = Object.fromEntries(nodeOptions.map((option) => [option.label, option.key]));

    guiRootRef.current.appendChild(gui.domElement);
    guiRef.current = gui;
    guiStateRef.current = guiState;

    const controllers: GuiControllers = {
      readOnly: [],
    };

    controllers.activeNode = sceneFolder
      .add(guiState, 'activeNodeKey', nodeOptionsMap)
      .name('Active Node')
      .onChange((value: string) => {
        setActiveNodeKey(String(value));
      });
    controllers.showAxesHelpers = sceneFolder
      .add(guiState, 'showAxesHelpers')
      .name('Show Axes')
      .onChange((value: boolean) => {
        setAxesEnabled(Boolean(value));
      });
    controllers.selectedOnlyMotion = sceneFolder
      .add(guiState, 'selectedOnlyMotion')
      .name('Selected Motion')
      .onChange((value: boolean) => {
        setSelectedOnlyMotion(Boolean(value));
      });
    controllers.cameraX = cameraFolder
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
          x: clampCameraAxisValue('x', Number(value)),
        }));
      });
    controllers.cameraY = cameraFolder
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
          y: clampCameraAxisValue('y', Number(value)),
        }));
      });
    controllers.cameraZ = cameraFolder
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
          z: clampCameraAxisValue('z', Number(value)),
        }));
      });
    cameraFolder
      .add(
        {
          reset: () => {
            setCameraPosition({
              ...castlePerspectiveCamera.position,
            });
          },
        },
        'reset',
      )
      .name('Reset Camera');

    const addReadOnlyController = (property: keyof Pick<GuiState, 'node' | 'parent' | 'local' | 'world' | 'rotate' | 'scale'>, label: string) => {
      const controller = nodeFolder.add(guiState, property).name(label).listen();
      controllers.readOnly.push(controller);
    };

    addReadOnlyController('node', 'Node');
    addReadOnlyController('parent', 'Parent');
    addReadOnlyController('local', 'Local');
    addReadOnlyController('world', 'World');
    addReadOnlyController('rotate', 'Rotate');
    addReadOnlyController('scale', 'Scale');

    sceneFolder.open();
    cameraFolder.open();
    nodeFolder.open();

    guiControllersRef.current = controllers;

    return () => {
      gui.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = { readOnly: [] };
    };
    // We only recreate lil-gui when the panel is toggled or the node list changes.
    // Live values are synced in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeOptions, showGui]);

  useEffect(() => {
    const guiState = guiStateRef.current;
    const controllers = guiControllersRef.current;

    if (!guiState) {
      return;
    }

    guiState.activeNodeKey = activeNodeKey;
    guiState.showAxesHelpers = axesEnabled;
    guiState.selectedOnlyMotion = selectedOnlyMotion;
    guiState.cameraX = cameraPosition.x;
    guiState.cameraY = cameraPosition.y;
    guiState.cameraZ = cameraPosition.z;
    applyDebugSnapshotToGuiState(guiState, debugSnapshot);

    controllers.activeNode?.updateDisplay();
    controllers.showAxesHelpers?.updateDisplay();
    controllers.selectedOnlyMotion?.updateDisplay();
    controllers.cameraX?.updateDisplay();
    controllers.cameraY?.updateDisplay();
    controllers.cameraZ?.updateDisplay();
    controllers.readOnly.forEach((controller) => {
      controller.updateDisplay();
    });
  }, [activeNodeKey, axesEnabled, cameraPosition, debugSnapshot, selectedOnlyMotion]);

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
      {isBrowser ? (
        <Canvas
          camera={{
            fov: castlePerspectiveCamera.fov,
            position: [cameraPosition.x, cameraPosition.y, cameraPosition.z],
          }}
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
          }}
          shadows
          style={{ position: 'absolute', inset: 0 }}
        >
          <SceneContent
            binaryUrl={resolvedBinaryUrl}
            cameraIntensity={cameraIntensity}
            cameraPosition={cameraPosition}
            debugConfig={debugConfig}
            modelScale={modelScale}
            modelUrl={resolvedModelUrl}
            onDebugNodesChange={setNodeOptions}
            onDebugSnapshotChange={setDebugSnapshot}
            pointerTarget={pointerTarget}
            resourcePath={resolvedResourcePath}
          />
        </Canvas>
      ) : null}
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

function SceneContent({
  binaryUrl,
  cameraIntensity,
  cameraPosition,
  debugConfig,
  modelScale,
  modelUrl,
  onDebugNodesChange,
  onDebugSnapshotChange,
  pointerTarget,
  resourcePath,
}: SceneContentProps) {
  return (
    <>
      <SceneEnvironment />
      <ambientLight color={theme.ambientLight} intensity={2.1} />
      <hemisphereLight args={['#ffffff', '#8c98a8', 2.2]} position={[0, 2, 0]} />
      <directionalLight color={theme.keyLight} intensity={3.4} position={[4.5, 5.5, 6]} />
      <spotLight
        angle={0.42}
        color={theme.fillLight}
        intensity={90}
        penumbra={1}
        position={[-5.5, 4.5, 7]}
      />
      <pointLight color={theme.rimLight} intensity={45} position={[-6, -2, -5]} />
      {modelUrl ? (
        <SceneModel
          binaryUrl={binaryUrl}
          debugConfig={debugConfig}
          key={`${modelUrl}:${resourcePath}:${binaryUrl}`}
          modelScale={modelScale}
          modelUrl={modelUrl}
          onDebugNodesChange={onDebugNodesChange}
          onDebugSnapshotChange={onDebugSnapshotChange}
          pointerTarget={pointerTarget}
          resourcePath={resourcePath}
        />
      ) : null}
      <SceneOrbitControls basePosition={cameraPosition} intensity={cameraIntensity} />
    </>
  );
}

function SceneEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const previousEnvironment = scene.environment;
    const previousExposure = gl.toneMappingExposure;
    const pmremGenerator = new THREE.PMREMGenerator(gl);
    const environmentTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

    // eslint-disable-next-line react-hooks/immutability
    scene.environment = environmentTexture;
    // eslint-disable-next-line react-hooks/immutability
    gl.toneMappingExposure = 1.18;

    return () => {
      scene.environment = previousEnvironment;
      gl.toneMappingExposure = previousExposure;
      environmentTexture.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);

  return null;
}

function SceneModel({
  binaryUrl,
  debugConfig,
  modelScale,
  modelUrl,
  onDebugNodesChange,
  onDebugSnapshotChange,
  pointerTarget,
  resourcePath,
}: SceneModelProps) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const group = useRef<THREE.Group>(null);
  const sceneRootHelper = useRef<THREE.AxesHelper | null>(null);
  const selectedNodeHelper = useRef<THREE.AxesHelper | null>(null);
  const lastAnimatedNode = useRef<THREE.Object3D | null>(null);
  const lastDebugUpdate = useRef(0);
  const { camera, size } = useThree();
  const modelFormat = getModelFormat(modelUrl);
  const resolvedResourcePath =
    resourcePath
      ? getResourceDirectoryPath(resourcePath)
      : modelFormat === 'gltf'
        ? getDefaultResourcePath(modelUrl)
        : '';
  const resolvedBinaryUrl = binaryUrl.trim();

  useEffect(() => {
    let cancelled = false;
    const loadingManager = new THREE.LoadingManager();
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader(loadingManager);

    dracoLoader.setDecoderPath(dracoDecoderPath);
    dracoLoader.setDecoderConfig({ type: 'js' });
    dracoLoader.preload();
    loader.setDRACOLoader(dracoLoader);
    loader.setCrossOrigin('anonymous');

    loadingManager.setURLModifier((requestedUrl) => {
      if (resolvedBinaryUrl && normalizeAssetKey(requestedUrl).endsWith('.bin')) {
        return resolvedBinaryUrl;
      }

      return requestedUrl;
    });

    if (resolvedResourcePath) {
      loader.setResourcePath(ensureTrailingSlash(resolvedResourcePath));
    }

    loader.load(
      modelUrl,
      (loadedModel) => {
        if (!cancelled) {
          setGltf(loadedModel);
        }
      },
      undefined,
      (error) => {
        console.error('[CastleScene] model-load-error', error);
      },
    );

    return () => {
      cancelled = true;
      dracoLoader.dispose();
    };
  }, [modelUrl, resolvedBinaryUrl, resolvedResourcePath]);

  const preparedScene = useMemo(() => {
    if (!gltf) {
      return null;
    }

    const clonedScene = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clonedScene);
    const center = bounds.getCenter(new THREE.Vector3());
    const sceneSize = bounds.getSize(new THREE.Vector3());
    const viewportAtFitDistance = getViewportAtDistance(
      castlePerspectiveCamera.position.z,
      camera instanceof THREE.PerspectiveCamera ? camera.fov : castlePerspectiveCamera.fov,
      size.height > 0 ? size.width / size.height : 1,
    );
    const widthScale = viewportAtFitDistance.width / Math.max(sceneSize.x, 0.001);
    const heightScale = viewportAtFitDistance.height / Math.max(sceneSize.y, 0.001);
    const normalizedScale = Math.min(widthScale, heightScale) * modelScale * 0.92;

    clonedScene.position.sub(center);
    clonedScene.scale.multiplyScalar(normalizedScale);
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clonedScene;
  }, [camera, gltf, modelScale, size.height, size.width]);

  const resolveActiveDebugObject = () => {
    if (!preparedScene) {
      return null;
    }

    if (!debugConfig.selectedNodeKey || debugConfig.selectedNodeKey === sceneRootDebugKey) {
      return preparedScene;
    }

    let matchedObject: THREE.Object3D | null = null;

    preparedScene.traverse((child) => {
      if (child.userData.__castleDebugKey === debugConfig.selectedNodeKey) {
        matchedObject = child;
      }
    });

    return matchedObject ?? preparedScene;
  };

  useEffect(() => {
    if (!preparedScene) {
      onDebugNodesChange([{ key: sceneRootDebugKey, label: 'Scene Root' }]);
      onDebugSnapshotChange(null);
      return;
    }

    const nextNodeOptions: DebugNodeOption[] = [{ key: sceneRootDebugKey, label: 'Scene Root' }];

    preparedScene.traverse((child) => {
      child.userData.__castleDebugKey = getDebugNodeKey(child, preparedScene);
      child.userData.__castleBasePosition = child.position.clone();
      child.userData.__castleBaseRotation = child.rotation.clone();

      if (child !== preparedScene) {
        nextNodeOptions.push({
          key: child.userData.__castleDebugKey as string,
          label: child.userData.__castleDebugKey as string,
        });
      }
    });

    onDebugNodesChange(nextNodeOptions);
    onDebugSnapshotChange(createDebugSnapshot(preparedScene));
  }, [onDebugNodesChange, onDebugSnapshotChange, preparedScene]);

  useEffect(() => {
    if (!preparedScene) {
      return undefined;
    }

    preparedScene.traverse((child) => {
      resetObjectTransform(child);
    });

    if (group.current) {
      group.current.position.set(0, -0.18, 0);
      group.current.rotation.set(0, 0, 0);
    }

    return undefined;
  }, [debugConfig.selectedNodeKey, debugConfig.selectedOnlyMotion, preparedScene]);

  useEffect(() => {
    const groupObject = group.current;

    if (!groupObject || !preparedScene) {
      return undefined;
    }

    let activeDebugObject: THREE.Object3D | null = preparedScene;

    if (debugConfig.selectedNodeKey && debugConfig.selectedNodeKey !== sceneRootDebugKey) {
      preparedScene.traverse((child) => {
        if (child.userData.__castleDebugKey === debugConfig.selectedNodeKey) {
          activeDebugObject = child;
        }
      });
    }

    if (sceneRootHelper.current) {
      groupObject.remove(sceneRootHelper.current);
      sceneRootHelper.current.dispose();
      sceneRootHelper.current = null;
    }

    if (selectedNodeHelper.current?.parent) {
      selectedNodeHelper.current.parent.remove(selectedNodeHelper.current);
      selectedNodeHelper.current.dispose();
      selectedNodeHelper.current = null;
    }

    if (!debugConfig.enabled || !debugConfig.showAxesHelpers) {
      return undefined;
    }

    sceneRootHelper.current = new THREE.AxesHelper(0.85);
    groupObject.add(sceneRootHelper.current);

    if (activeDebugObject && activeDebugObject !== preparedScene) {
      selectedNodeHelper.current = new THREE.AxesHelper(0.55);
      activeDebugObject.add(selectedNodeHelper.current);
    }

    return () => {
      if (sceneRootHelper.current) {
        groupObject.remove(sceneRootHelper.current);
        sceneRootHelper.current.dispose();
        sceneRootHelper.current = null;
      }

      if (selectedNodeHelper.current?.parent) {
        selectedNodeHelper.current.parent.remove(selectedNodeHelper.current);
        selectedNodeHelper.current.dispose();
        selectedNodeHelper.current = null;
      }
    };
  }, [debugConfig.enabled, debugConfig.selectedNodeKey, debugConfig.showAxesHelpers, preparedScene]);

  useFrame((_, delta) => {
    if (!group.current || !preparedScene) {
      return;
    }

    const activeDebugObject = resolveActiveDebugObject();
    const { x, y } = pointerTarget.current;
    const motionOffsets = {
      positionX: x * 0.12,
      positionY: y * 0.06,
      positionZ: -Math.abs(x) * 0.04 - Math.abs(y) * 0.03,
      rotationX: -y * 0.06,
      rotationY: x * 0.12,
      rotationZ: x * y * -0.03,
    };

    const applyMotionToObject = (target: THREE.Object3D) => {
      const basePosition = (target.userData.__castleBasePosition as THREE.Vector3 | undefined) ?? new THREE.Vector3();
      const baseRotation = (target.userData.__castleBaseRotation as THREE.Euler | undefined) ?? new THREE.Euler();

      target.position.x = THREE.MathUtils.damp(target.position.x, basePosition.x + motionOffsets.positionX, 3.2, delta);
      target.position.y = THREE.MathUtils.damp(target.position.y, basePosition.y + motionOffsets.positionY, 3.2, delta);
      target.position.z = THREE.MathUtils.damp(target.position.z, basePosition.z + motionOffsets.positionZ, 3, delta);
      target.rotation.x = THREE.MathUtils.damp(target.rotation.x, baseRotation.x + motionOffsets.rotationX, 3.4, delta);
      target.rotation.y = THREE.MathUtils.damp(target.rotation.y, baseRotation.y + motionOffsets.rotationY, 3.4, delta);
      target.rotation.z = THREE.MathUtils.damp(target.rotation.z, baseRotation.z + motionOffsets.rotationZ, 3.2, delta);
    };

    if (debugConfig.selectedOnlyMotion && activeDebugObject) {
      if (lastAnimatedNode.current && lastAnimatedNode.current !== activeDebugObject) {
        resetObjectTransform(lastAnimatedNode.current);
      }

      group.current.position.x = THREE.MathUtils.damp(group.current.position.x, 0, 3.2, delta);
      group.current.position.y = THREE.MathUtils.damp(group.current.position.y, -0.18, 3.2, delta);
      group.current.position.z = THREE.MathUtils.damp(group.current.position.z, 0, 3, delta);
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, 0, 3.4, delta);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, 0, 3.4, delta);
      group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, 0, 3.2, delta);

      applyMotionToObject(activeDebugObject);
      lastAnimatedNode.current = activeDebugObject;
    } else {
      if (lastAnimatedNode.current) {
        resetObjectTransform(lastAnimatedNode.current);
        lastAnimatedNode.current = null;
      }

      group.current.position.x = THREE.MathUtils.damp(group.current.position.x, motionOffsets.positionX, 3.2, delta);
      group.current.position.y = THREE.MathUtils.damp(group.current.position.y, -0.18 + motionOffsets.positionY, 3.2, delta);
      group.current.position.z = THREE.MathUtils.damp(group.current.position.z, motionOffsets.positionZ, 3, delta);
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, motionOffsets.rotationX, 3.4, delta);
      group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, motionOffsets.rotationY, 3.4, delta);
      group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, motionOffsets.rotationZ, 3.2, delta);
    }

    if (debugConfig.enabled && activeDebugObject) {
      const elapsedTime = performance.now();

      if (elapsedTime - lastDebugUpdate.current > 120) {
        onDebugSnapshotChange(createDebugSnapshot(activeDebugObject));
        lastDebugUpdate.current = elapsedTime;
      }
    }
  });

  if (!preparedScene) {
    return null;
  }

  return (
    <Float floatIntensity={0.18} rotationIntensity={0.05} speed={1.15}>
      <group ref={group} position={[0, -0.18, 0]}>
        <primitive object={preparedScene} />
      </group>
    </Float>
  );
}

function SceneOrbitControls({ basePosition, intensity }: SceneOrbitControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const { camera, invalidate } = useThree();

  useEffect(() => {
    camera.position.set(basePosition.x, basePosition.y, basePosition.z);
    controlsRef.current?.target.set(
      castlePerspectiveCamera.lookAt.x,
      castlePerspectiveCamera.lookAt.y,
      castlePerspectiveCamera.lookAt.z,
    );
    controlsRef.current?.update();
    invalidate();
  }, [basePosition.x, basePosition.y, basePosition.z, camera, invalidate]);

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.08}
      enableDamping
      enablePan
      enableRotate
      enableZoom
      makeDefault
      maxDistance={50}
      minDistance={0.5}
      rotateSpeed={0.65 + intensity * 0.35}
      target={[
        castlePerspectiveCamera.lookAt.x,
        castlePerspectiveCamera.lookAt.y,
        castlePerspectiveCamera.lookAt.z,
      ]}
      zoomSpeed={0.65 + intensity * 0.35}
    />
  );
}

export default CastleScene;
