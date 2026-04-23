import { OrthographicCamera, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import GUI from 'lil-gui';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';

import charactersBackgroundTextureUrl from '../assets/Textures/characters-background.jpeg';
import { DebugOrbitControls } from './DebugOrbitControls';
import {
  backCharacterTransformDefaults,
  buildingTransformDefaults,
  characterCameraAxisControls,
  characterPerspectiveCamera,
  characterTransformDefaults,
  scenePositionAxisControls,
  sceneRotationAxisControls,
  uniformScaleControl,
  type CharacterTransform,
  type SceneCameraPosition,
} from './CharacterScene.config';

const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const cameraModes = ['Perspective', 'Orthographic'] as const;
const defaultCharacterModelUrl = new URL('../assets/Characters/Front-character.glb', import.meta.url).href;
const defaultBackCharacterModelUrl = new URL('../assets/Characters/Back-character.glb', import.meta.url).href;
const defaultBuildingModelUrl = new URL('../assets/Characters/Building.glb', import.meta.url).href;

useGLTF.preload(defaultCharacterModelUrl, dracoDecoderPath);
useGLTF.preload(defaultBackCharacterModelUrl, dracoDecoderPath);
useGLTF.preload(defaultBuildingModelUrl, dracoDecoderPath);

type CameraMode = (typeof cameraModes)[number];

export interface CharacterSceneProps {
  animationEnabled?: boolean;
  backCharacterModelUrl?: string;
  buildingModelUrl?: string;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
  characterModelUrl?: string;
  modelScale?: number;
  showGui?: boolean;
}

interface GuiState {
  animationEnabled: boolean;
  backCharacter: CharacterTransform;
  backgroundEnabled: boolean;
  building: CharacterTransform;
  cameraMode: CameraMode;
  orbitEnabled: boolean;
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  character: CharacterTransform;
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

interface GuiControllers {
  animationEnabled?: ReturnType<GUI['add']>;
  backCharacter: TransformGuiControllers;
  backgroundEnabled?: ReturnType<GUI['add']>;
  building: TransformGuiControllers;
  cameraMode?: ReturnType<GUI['add']>;
  orbitEnabled?: ReturnType<GUI['add']>;
  cameraX?: ReturnType<GUI['add']>;
  cameraY?: ReturnType<GUI['add']>;
  cameraZ?: ReturnType<GUI['add']>;
  character: TransformGuiControllers;
}

interface PreparedSceneResult {
  root: THREE.Group;
  size: THREE.Vector3;
}

interface CharacterStageProps {
  characterModelUrl: string;
  characterTransform: CharacterTransform;
  modelScale: number;
  onPreparedSizeChange?: (size: THREE.Vector3) => void;
}

interface CharacterSceneCameraProps {
  animationEnabled: boolean;
  mode: CameraMode;
  orbitEnabled: boolean;
  pointerTarget: MutableRefObject<THREE.Vector2>;
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
  const control = characterCameraAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampScenePositionAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = scenePositionAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampSceneRotationAxis(axis: keyof SceneCameraPosition, value: number) {
  const control = sceneRotationAxisControls[axis];

  return THREE.MathUtils.clamp(value, control.min, control.max);
}

function clampUniformScale(value: number) {
  return THREE.MathUtils.clamp(value, uniformScaleControl.min, uniformScaleControl.max);
}

function normalizeCharacterTransform(transform: CharacterTransform): CharacterTransform {
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

function getOrthographicZoom(
  position: SceneCameraPosition,
  target: SceneCameraPosition,
  viewportHeight: number,
) {
  const cameraVector = new THREE.Vector3(position.x, position.y, position.z);
  const targetVector = new THREE.Vector3(target.x, target.y, target.z);
  const cameraDistance = Math.max(cameraVector.distanceTo(targetVector), 0.5);
  const visibleHeight =
    2 * cameraDistance * Math.tan(THREE.MathUtils.degToRad(characterPerspectiveCamera.fov / 2));

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

function getMaterialTexture(material: THREE.Material, key: string) {
  const texture = (material as unknown as Record<string, unknown>)[key];

  return texture instanceof THREE.Texture ? texture : null;
}

function createUnlitMaterial(material: THREE.Material) {
  if (material instanceof THREE.MeshBasicMaterial) {
    const clonedMaterial = material.clone();

    clonedMaterial.side = THREE.FrontSide;
    clonedMaterial.needsUpdate = true;

    return clonedMaterial;
  }

  const nextMaterial = new THREE.MeshBasicMaterial({
    color:
      'color' in material && material.color instanceof THREE.Color
        ? material.color.clone()
        : new THREE.Color('#ffffff'),
    map: getMaterialTexture(material, 'map'),
    opacity: material.opacity,
    side: THREE.FrontSide,
    transparent: material.transparent,
  });

  nextMaterial.alphaMap = getMaterialTexture(material, 'alphaMap');
  nextMaterial.depthTest = material.depthTest;
  nextMaterial.depthWrite = material.depthWrite;
  nextMaterial.name = material.name;
  nextMaterial.needsUpdate = true;

  return nextMaterial;
}

function prepareSceneObject(scene: THREE.Object3D) {
  const root = scene.clone(true) as THREE.Group;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;

    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => createUnlitMaterial(material));
      return;
    }

    child.material = createUnlitMaterial(child.material);
  });

  return root;
}

function buildPreparedCharacterScene(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  aspectRatio: number,
  modelScale: number,
): PreparedSceneResult {
  const root = prepareSceneObject(scene);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : characterPerspectiveCamera.fov;
  const viewport = getViewportAtDistance(
    Math.max(characterPerspectiveCamera.position.z - 0.6, 4.5),
    fov,
    aspectRatio,
  );
  const targetHeight = viewport.height * (aspectRatio < 0.85 ? 0.76 : 0.84);
  const targetWidth = viewport.width * (aspectRatio < 0.85 ? 0.48 : 0.34);
  const worldScale =
    Math.min(
      targetWidth / Math.max(size.x, 0.001),
      targetHeight / Math.max(size.y, 0.001),
    ) * modelScale;
  const baseY = bounds.min.y;

  root.scale.setScalar(worldScale);
  root.position.set(-center.x * worldScale, -baseY * worldScale, -center.z * worldScale);
  root.updateMatrixWorld(true);

  return {
    root,
    size: size.clone().multiplyScalar(worldScale),
  };
}

export function CharacterScene({
  animationEnabled = true,
  backCharacterModelUrl = '',
  buildingModelUrl = '',
  cameraX = characterPerspectiveCamera.position.x,
  cameraY = characterPerspectiveCamera.position.y,
  cameraZ = characterPerspectiveCamera.position.z,
  characterModelUrl = '',
  modelScale = 1,
  showGui = false,
}: CharacterSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const guiRootRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<GUI | null>(null);
  const guiStateRef = useRef<GuiState | null>(null);
  const guiControllersRef = useRef<GuiControllers>({ backCharacter: {}, building: {}, character: {} });
  const resolvedCharacterModelUrl = toText(characterModelUrl).trim() || defaultCharacterModelUrl;
  const resolvedBackCharacterModelUrl =
    toText(backCharacterModelUrl).trim() || defaultBackCharacterModelUrl;
  const resolvedBuildingModelUrl = toText(buildingModelUrl).trim() || defaultBuildingModelUrl;
  const [cameraPosition, setCameraPosition] = useState<SceneCameraPosition>({
    x: clampCameraAxis('x', toNumber(cameraX, characterPerspectiveCamera.position.x)),
    y: clampCameraAxis('y', toNumber(cameraY, characterPerspectiveCamera.position.y)),
    z: clampCameraAxis('z', toNumber(cameraZ, characterPerspectiveCamera.position.z)),
  });
  const [cameraMode, setCameraMode] = useState<CameraMode>('Perspective');
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [animationActive, setAnimationActive] = useState(animationEnabled);
  const [backgroundEnabled, setBackgroundEnabled] = useState(true);
  const [characterTransform, setCharacterTransform] = useState<CharacterTransform>(() =>
    normalizeCharacterTransform({ ...characterTransformDefaults }),
  );
  const [backCharacterTransform, setBackCharacterTransform] = useState<CharacterTransform>(() =>
    normalizeCharacterTransform({ ...backCharacterTransformDefaults }),
  );
  const [buildingTransform, setBuildingTransform] = useState<CharacterTransform>(() =>
    normalizeCharacterTransform({ ...buildingTransformDefaults }),
  );
  const [preparedSceneSize, setPreparedSceneSize] = useState(() => new THREE.Vector3(1, 1, 1));
  const defaultCameraTarget = useMemo<SceneCameraPosition>(
    () => ({
      x: characterPerspectiveCamera.lookAt.x,
      y: characterPerspectiveCamera.lookAt.y + Math.max(preparedSceneSize.y * 0.06, 0),
      z: characterPerspectiveCamera.lookAt.z,
    }),
    [preparedSceneSize.y],
  );
  const [cameraTarget, setCameraTarget] = useState<SceneCameraPosition>(() => ({
    ...characterPerspectiveCamera.lookAt,
  }));

  useEffect(() => {
    setCameraPosition({
      x: clampCameraAxis('x', toNumber(cameraX, characterPerspectiveCamera.position.x)),
      y: clampCameraAxis('y', toNumber(cameraY, characterPerspectiveCamera.position.y)),
      z: clampCameraAxis('z', toNumber(cameraZ, characterPerspectiveCamera.position.z)),
    });
  }, [cameraX, cameraY, cameraZ]);

  useEffect(() => {
    setAnimationActive(animationEnabled);
  }, [animationEnabled]);

  useEffect(() => {
    setCameraTarget(defaultCameraTarget);
  }, [defaultCameraTarget]);

  useEffect(() => {
    useGLTF.preload(resolvedCharacterModelUrl, dracoDecoderPath);
    useGLTF.preload(resolvedBackCharacterModelUrl, dracoDecoderPath);
    useGLTF.preload(resolvedBuildingModelUrl, dracoDecoderPath);
  }, [resolvedBackCharacterModelUrl, resolvedBuildingModelUrl, resolvedCharacterModelUrl]);

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
      guiControllersRef.current = { backCharacter: {}, building: {}, character: {} };
      return undefined;
    }

    guiRootRef.current.replaceChildren();

    const gui = new GUI({ container: guiRootRef.current, title: 'Character Scene Controls' });
    const guiState: GuiState = {
      animationEnabled: animationActive,
      backCharacter: normalizeCharacterTransform({ ...backCharacterTransform }),
      backgroundEnabled,
      building: normalizeCharacterTransform({ ...buildingTransform }),
      cameraMode,
      orbitEnabled,
      cameraX: cameraPosition.x,
      cameraY: cameraPosition.y,
      cameraZ: cameraPosition.z,
      character: normalizeCharacterTransform({ ...characterTransform }),
    };

    guiRef.current = gui;
    guiStateRef.current = guiState;
    guiControllersRef.current = { backCharacter: {}, building: {}, character: {} };

    const cameraFolder = gui.addFolder('Camera');
    const animationFolder = gui.addFolder('Animation');
    const backgroundFolder = gui.addFolder('Background');
    const characterFolder = gui.addFolder('Front Character');
    const backCharacterFolder = gui.addFolder('Back Character');
    const buildingFolder = gui.addFolder('Building');

    guiControllersRef.current.animationEnabled = animationFolder
      .add(guiState, 'animationEnabled')
      .name('Camera Drift')
      .onChange((value: boolean) => {
        setAnimationActive(Boolean(value));
      });

    guiControllersRef.current.backgroundEnabled = backgroundFolder
      .add(guiState, 'backgroundEnabled')
      .name('Enabled')
      .onChange((value: boolean) => {
        setBackgroundEnabled(Boolean(value));
      });

    guiControllersRef.current.cameraMode = cameraFolder
      .add(guiState, 'cameraMode', [...cameraModes])
      .name('Mode')
      .onChange((value: string) => {
        if (cameraModes.includes(value as CameraMode)) {
          setCameraMode(value as CameraMode);
        }
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
        characterCameraAxisControls.x.min,
        characterCameraAxisControls.x.max,
        characterCameraAxisControls.x.step,
      )
      .name(characterCameraAxisControls.x.label)
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
        characterCameraAxisControls.y.min,
        characterCameraAxisControls.y.max,
        characterCameraAxisControls.y.step,
      )
      .name(characterCameraAxisControls.y.label)
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
        characterCameraAxisControls.z.min,
        characterCameraAxisControls.z.max,
        characterCameraAxisControls.z.step,
      )
      .name(characterCameraAxisControls.z.label)
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
            setCameraPosition({ ...characterPerspectiveCamera.position });
            setCameraMode('Perspective');
            setOrbitEnabled(true);
            setCameraTarget(defaultCameraTarget);
          },
        },
        'reset',
      )
      .name('Reset Camera');

    guiControllersRef.current.character.visible = characterFolder
      .add(guiState.character, 'visible')
      .name('Visible')
      .onChange((value: boolean) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, visible: Boolean(value) }),
        );
      });

    guiControllersRef.current.character.x = characterFolder
      .add(
        guiState.character,
        'x',
        scenePositionAxisControls.x.min,
        scenePositionAxisControls.x.max,
        scenePositionAxisControls.x.step,
      )
      .name(scenePositionAxisControls.x.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, x: clampScenePositionAxis('x', Number(value)) }),
        );
      });

    guiControllersRef.current.character.y = characterFolder
      .add(
        guiState.character,
        'y',
        scenePositionAxisControls.y.min,
        scenePositionAxisControls.y.max,
        scenePositionAxisControls.y.step,
      )
      .name(scenePositionAxisControls.y.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, y: clampScenePositionAxis('y', Number(value)) }),
        );
      });

    guiControllersRef.current.character.z = characterFolder
      .add(
        guiState.character,
        'z',
        scenePositionAxisControls.z.min,
        scenePositionAxisControls.z.max,
        scenePositionAxisControls.z.step,
      )
      .name(scenePositionAxisControls.z.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, z: clampScenePositionAxis('z', Number(value)) }),
        );
      });

    guiControllersRef.current.character.rotationX = characterFolder
      .add(
        guiState.character,
        'rotationX',
        sceneRotationAxisControls.x.min,
        sceneRotationAxisControls.x.max,
        sceneRotationAxisControls.x.step,
      )
      .name(sceneRotationAxisControls.x.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationX: clampSceneRotationAxis('x', Number(value)),
          }),
        );
      });

    guiControllersRef.current.character.rotationY = characterFolder
      .add(
        guiState.character,
        'rotationY',
        sceneRotationAxisControls.y.min,
        sceneRotationAxisControls.y.max,
        sceneRotationAxisControls.y.step,
      )
      .name(sceneRotationAxisControls.y.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationY: clampSceneRotationAxis('y', Number(value)),
          }),
        );
      });

    guiControllersRef.current.character.rotationZ = characterFolder
      .add(
        guiState.character,
        'rotationZ',
        sceneRotationAxisControls.z.min,
        sceneRotationAxisControls.z.max,
        sceneRotationAxisControls.z.step,
      )
      .name(sceneRotationAxisControls.z.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationZ: clampSceneRotationAxis('z', Number(value)),
          }),
        );
      });

    guiControllersRef.current.character.scale = characterFolder
      .add(
        guiState.character,
        'scale',
        uniformScaleControl.min,
        uniformScaleControl.max,
        uniformScaleControl.step,
      )
      .name(uniformScaleControl.label)
      .onChange((value: number) => {
        setCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, scale: clampUniformScale(Number(value)) }),
        );
      });

    characterFolder
      .add(
        {
          reset: () => {
            setCharacterTransform(normalizeCharacterTransform({ ...characterTransformDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Character');

    guiControllersRef.current.backCharacter.visible = backCharacterFolder
      .add(guiState.backCharacter, 'visible')
      .name('Visible')
      .onChange((value: boolean) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, visible: Boolean(value) }),
        );
      });

    guiControllersRef.current.backCharacter.x = backCharacterFolder
      .add(
        guiState.backCharacter,
        'x',
        scenePositionAxisControls.x.min,
        scenePositionAxisControls.x.max,
        scenePositionAxisControls.x.step,
      )
      .name(scenePositionAxisControls.x.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, x: clampScenePositionAxis('x', Number(value)) }),
        );
      });

    guiControllersRef.current.backCharacter.y = backCharacterFolder
      .add(
        guiState.backCharacter,
        'y',
        scenePositionAxisControls.y.min,
        scenePositionAxisControls.y.max,
        scenePositionAxisControls.y.step,
      )
      .name(scenePositionAxisControls.y.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, y: clampScenePositionAxis('y', Number(value)) }),
        );
      });

    guiControllersRef.current.backCharacter.z = backCharacterFolder
      .add(
        guiState.backCharacter,
        'z',
        scenePositionAxisControls.z.min,
        scenePositionAxisControls.z.max,
        scenePositionAxisControls.z.step,
      )
      .name(scenePositionAxisControls.z.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, z: clampScenePositionAxis('z', Number(value)) }),
        );
      });

    guiControllersRef.current.backCharacter.rotationX = backCharacterFolder
      .add(
        guiState.backCharacter,
        'rotationX',
        sceneRotationAxisControls.x.min,
        sceneRotationAxisControls.x.max,
        sceneRotationAxisControls.x.step,
      )
      .name(sceneRotationAxisControls.x.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationX: clampSceneRotationAxis('x', Number(value)),
          }),
        );
      });

    guiControllersRef.current.backCharacter.rotationY = backCharacterFolder
      .add(
        guiState.backCharacter,
        'rotationY',
        sceneRotationAxisControls.y.min,
        sceneRotationAxisControls.y.max,
        sceneRotationAxisControls.y.step,
      )
      .name(sceneRotationAxisControls.y.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationY: clampSceneRotationAxis('y', Number(value)),
          }),
        );
      });

    guiControllersRef.current.backCharacter.rotationZ = backCharacterFolder
      .add(
        guiState.backCharacter,
        'rotationZ',
        sceneRotationAxisControls.z.min,
        sceneRotationAxisControls.z.max,
        sceneRotationAxisControls.z.step,
      )
      .name(sceneRotationAxisControls.z.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationZ: clampSceneRotationAxis('z', Number(value)),
          }),
        );
      });

    guiControllersRef.current.backCharacter.scale = backCharacterFolder
      .add(
        guiState.backCharacter,
        'scale',
        uniformScaleControl.min,
        uniformScaleControl.max,
        uniformScaleControl.step,
      )
      .name(uniformScaleControl.label)
      .onChange((value: number) => {
        setBackCharacterTransform((current) =>
          normalizeCharacterTransform({ ...current, scale: clampUniformScale(Number(value)) }),
        );
      });

    backCharacterFolder
      .add(
        {
          reset: () => {
            setBackCharacterTransform(normalizeCharacterTransform({ ...backCharacterTransformDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Character');

    guiControllersRef.current.building.visible = buildingFolder
      .add(guiState.building, 'visible')
      .name('Visible')
      .onChange((value: boolean) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({ ...current, visible: Boolean(value) }),
        );
      });

    guiControllersRef.current.building.x = buildingFolder
      .add(
        guiState.building,
        'x',
        scenePositionAxisControls.x.min,
        scenePositionAxisControls.x.max,
        scenePositionAxisControls.x.step,
      )
      .name(scenePositionAxisControls.x.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({ ...current, x: clampScenePositionAxis('x', Number(value)) }),
        );
      });

    guiControllersRef.current.building.y = buildingFolder
      .add(
        guiState.building,
        'y',
        scenePositionAxisControls.y.min,
        scenePositionAxisControls.y.max,
        scenePositionAxisControls.y.step,
      )
      .name(scenePositionAxisControls.y.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({ ...current, y: clampScenePositionAxis('y', Number(value)) }),
        );
      });

    guiControllersRef.current.building.z = buildingFolder
      .add(
        guiState.building,
        'z',
        scenePositionAxisControls.z.min,
        scenePositionAxisControls.z.max,
        scenePositionAxisControls.z.step,
      )
      .name(scenePositionAxisControls.z.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({ ...current, z: clampScenePositionAxis('z', Number(value)) }),
        );
      });

    guiControllersRef.current.building.rotationX = buildingFolder
      .add(
        guiState.building,
        'rotationX',
        sceneRotationAxisControls.x.min,
        sceneRotationAxisControls.x.max,
        sceneRotationAxisControls.x.step,
      )
      .name(sceneRotationAxisControls.x.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationX: clampSceneRotationAxis('x', Number(value)),
          }),
        );
      });

    guiControllersRef.current.building.rotationY = buildingFolder
      .add(
        guiState.building,
        'rotationY',
        sceneRotationAxisControls.y.min,
        sceneRotationAxisControls.y.max,
        sceneRotationAxisControls.y.step,
      )
      .name(sceneRotationAxisControls.y.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationY: clampSceneRotationAxis('y', Number(value)),
          }),
        );
      });

    guiControllersRef.current.building.rotationZ = buildingFolder
      .add(
        guiState.building,
        'rotationZ',
        sceneRotationAxisControls.z.min,
        sceneRotationAxisControls.z.max,
        sceneRotationAxisControls.z.step,
      )
      .name(sceneRotationAxisControls.z.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({
            ...current,
            rotationZ: clampSceneRotationAxis('z', Number(value)),
          }),
        );
      });

    guiControllersRef.current.building.scale = buildingFolder
      .add(
        guiState.building,
        'scale',
        uniformScaleControl.min,
        uniformScaleControl.max,
        uniformScaleControl.step,
      )
      .name(uniformScaleControl.label)
      .onChange((value: number) => {
        setBuildingTransform((current) =>
          normalizeCharacterTransform({ ...current, scale: clampUniformScale(Number(value)) }),
        );
      });

    buildingFolder
      .add(
        {
          reset: () => {
            setBuildingTransform(normalizeCharacterTransform({ ...buildingTransformDefaults }));
          },
        },
        'reset',
      )
      .name('Reset Building');

    cameraFolder.close();
    animationFolder.close();
    backgroundFolder.close();
    characterFolder.close();
    backCharacterFolder.close();
    buildingFolder.close();

    return () => {
      gui.destroy();
      guiRef.current = null;
      guiStateRef.current = null;
      guiControllersRef.current = { backCharacter: {}, building: {}, character: {} };
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
    Object.assign(guiState.backCharacter, normalizeCharacterTransform(backCharacterTransform));
    guiState.backgroundEnabled = backgroundEnabled;
    Object.assign(guiState.building, normalizeCharacterTransform(buildingTransform));
    guiState.cameraMode = cameraMode;
    guiState.orbitEnabled = orbitEnabled;
    guiState.cameraX = cameraPosition.x;
    guiState.cameraY = cameraPosition.y;
    guiState.cameraZ = cameraPosition.z;
    Object.assign(guiState.character, normalizeCharacterTransform(characterTransform));

    guiControllersRef.current.animationEnabled?.updateDisplay();
    guiControllersRef.current.backgroundEnabled?.updateDisplay();
    guiControllersRef.current.cameraMode?.updateDisplay();
    guiControllersRef.current.orbitEnabled?.updateDisplay();
    guiControllersRef.current.cameraX?.updateDisplay();
    guiControllersRef.current.cameraY?.updateDisplay();
    guiControllersRef.current.cameraZ?.updateDisplay();
    guiControllersRef.current.backCharacter.visible?.updateDisplay();
    guiControllersRef.current.backCharacter.x?.updateDisplay();
    guiControllersRef.current.backCharacter.y?.updateDisplay();
    guiControllersRef.current.backCharacter.z?.updateDisplay();
    guiControllersRef.current.backCharacter.rotationX?.updateDisplay();
    guiControllersRef.current.backCharacter.rotationY?.updateDisplay();
    guiControllersRef.current.backCharacter.rotationZ?.updateDisplay();
    guiControllersRef.current.backCharacter.scale?.updateDisplay();
    guiControllersRef.current.building.visible?.updateDisplay();
    guiControllersRef.current.building.x?.updateDisplay();
    guiControllersRef.current.building.y?.updateDisplay();
    guiControllersRef.current.building.z?.updateDisplay();
    guiControllersRef.current.building.rotationX?.updateDisplay();
    guiControllersRef.current.building.rotationY?.updateDisplay();
    guiControllersRef.current.building.rotationZ?.updateDisplay();
    guiControllersRef.current.building.scale?.updateDisplay();
    guiControllersRef.current.character.visible?.updateDisplay();
    guiControllersRef.current.character.x?.updateDisplay();
    guiControllersRef.current.character.y?.updateDisplay();
    guiControllersRef.current.character.z?.updateDisplay();
    guiControllersRef.current.character.rotationX?.updateDisplay();
    guiControllersRef.current.character.rotationY?.updateDisplay();
    guiControllersRef.current.character.rotationZ?.updateDisplay();
    guiControllersRef.current.character.scale?.updateDisplay();
  }, [
    animationActive,
    backCharacterTransform,
    backgroundEnabled,
    buildingTransform,
    cameraMode,
    cameraPosition,
    characterTransform,
    orbitEnabled,
  ]);

  return (
    <section
      className="scene-viewport"
      ref={sectionRef}
      style={{
        backgroundColor: '#ffffff',
        backgroundImage: backgroundEnabled ? `url(${charactersBackgroundTextureUrl})` : 'none',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'contain',
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.toneMappingExposure = 1;
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <CharacterSceneCamera
          animationEnabled={animationActive}
          mode={cameraMode}
          orbitEnabled={showGui && orbitEnabled}
          pointerTarget={pointerTarget}
          position={cameraPosition}
          target={cameraTarget}
        />
        {showGui ? (
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
        ) : null}
        <CharacterStage
          characterModelUrl={resolvedBackCharacterModelUrl}
          characterTransform={backCharacterTransform}
          modelScale={modelScale}
        />
        <CharacterStage
          characterModelUrl={resolvedBuildingModelUrl}
          characterTransform={buildingTransform}
          modelScale={modelScale}
        />
        <CharacterStage
          characterModelUrl={resolvedCharacterModelUrl}
          characterTransform={characterTransform}
          modelScale={modelScale}
          onPreparedSizeChange={setPreparedSceneSize}
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
    </section>
  );
}

function CharacterStage({
  characterModelUrl,
  characterTransform,
  modelScale,
  onPreparedSizeChange,
}: CharacterStageProps) {
  const { camera, size } = useThree();
  const characterGltf = useGLTF(characterModelUrl, dracoDecoderPath);

  const preparedCharacter = useMemo(
    () =>
      buildPreparedCharacterScene(
        characterGltf.scene,
        camera,
        size.height > 0 ? size.width / size.height : 1,
        modelScale,
      ),
    [camera, characterGltf.scene, modelScale, size.height, size.width],
  );

  useEffect(() => {
    onPreparedSizeChange?.(preparedCharacter.size.clone());
  }, [onPreparedSizeChange, preparedCharacter.size]);

  if (!characterTransform.visible) {
    return null;
  }

  return (
    <group position={[characterTransform.x, characterTransform.y, characterTransform.z]}>
      <group
        rotation={[
          THREE.MathUtils.degToRad(characterTransform.rotationX),
          THREE.MathUtils.degToRad(characterTransform.rotationY),
          THREE.MathUtils.degToRad(characterTransform.rotationZ),
        ]}
        scale={[characterTransform.scale, characterTransform.scale, characterTransform.scale]}
      >
        <primitive object={preparedCharacter.root} />
      </group>
    </group>
  );
}

function CharacterSceneCamera({
  animationEnabled,
  mode,
  orbitEnabled,
  pointerTarget,
  position,
  target,
}: CharacterSceneCameraProps) {
  const { size } = useThree();
  const orthographicZoom = getOrthographicZoom(position, target, size.height);
  const cameraPosition: [number, number, number] = [position.x, position.y, position.z];
  const orthographicCameraRef = useRef<THREE.OrthographicCamera>(null);
  const perspectiveCameraRef = useRef<THREE.PerspectiveCamera>(null);
  const driftTargetRef = useRef(new THREE.Vector3(target.x, target.y, target.z));

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

  useFrame((_, delta) => {
    const camera = mode === 'Orthographic' ? orthographicCameraRef.current : perspectiveCameraRef.current;

    if (!camera || orbitEnabled) {
      return;
    }

    const driftX = animationEnabled ? pointerTarget.current.x * 0.2 : 0;
    const driftY = animationEnabled ? pointerTarget.current.y * 0.14 : 0;
    const driftZ = animationEnabled ? -Math.abs(pointerTarget.current.x) * 0.08 : 0;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, position.x + driftX, 3.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, position.y + driftY, 3.2, delta);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, position.z + driftZ, 3.2, delta);

    driftTargetRef.current.set(target.x + driftX * 0.28, target.y + driftY * 0.18, target.z);
    camera.lookAt(driftTargetRef.current);
    camera.updateMatrixWorld();
  });

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
      fov={characterPerspectiveCamera.fov}
      makeDefault
      near={0.1}
      position={cameraPosition}
    />
  );
}

export default CharacterScene;
