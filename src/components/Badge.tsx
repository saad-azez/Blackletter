import { Float } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type BadgeVariant = 'Light' | 'Dark';

export interface BadgeProps {
  variant: BadgeVariant;
  modelUrl?: string;
  modelScale?: number;
  cameraIntensity?: number;
  cameraX?: number;
  cameraY?: number;
  cameraZ?: number;
}

interface SceneTheme {
  ambientLight: string;
  fillLight: string;
  keyLight: string;
  rimLight: string;
}

interface SceneContentProps {
  cameraIntensity: number;
  cameraPosition: CameraPosition;
  modelScale: number;
  modelUrl: string;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  theme: SceneTheme;
}

interface SceneModelProps {
  cameraPosition: CameraPosition;
  modelScale: number;
  modelUrl: string;
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

interface CameraRigProps {
  basePosition: CameraPosition;
  intensity: number;
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

interface CameraPosition {
  x: number;
  y: number;
  z: number;
}

const themes: Record<BadgeVariant, SceneTheme> = {
  Dark: {
    ambientLight: '#f6ebd9',
    fillLight: '#ffcb8f',
    keyLight: '#9eb5ff',
    rimLight: '#6e88d8',
  },
  Light: {
    ambientLight: '#fff8ee',
    fillLight: '#fff4df',
    keyLight: '#f9d49f',
    rimLight: '#9d7352',
  },
};

const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const interactionSelector = '.frame';
const defaultCamera = {
  fov: 42,
  lookAt: new THREE.Vector3(0, 0, 0),
  position: {
    x: 0,
    y: 0,
    z: 6.1,
  },
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

export function Badge({
  variant,
  modelUrl = '',
  modelScale = 1,
  cameraIntensity = 0.35,
  cameraX = defaultCamera.position.x,
  cameraY = defaultCamera.position.y,
  cameraZ = defaultCamera.position.z,
}: BadgeProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const theme = themes[variant];
  const isBrowser = typeof window !== 'undefined';
  const resolvedModelUrl = coerceTextInput(modelUrl).trim();
  const cameraPosition = useMemo<CameraPosition>(
    () => ({
      x: coerceNumberInput(cameraX, defaultCamera.position.x),
      y: coerceNumberInput(cameraY, defaultCamera.position.y),
      z: Math.max(0.5, coerceNumberInput(cameraZ, defaultCamera.position.z)),
    }),
    [cameraX, cameraY, cameraZ],
  );

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
            fov: defaultCamera.fov,
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
            cameraIntensity={cameraIntensity}
            cameraPosition={cameraPosition}
            modelScale={modelScale}
            modelUrl={resolvedModelUrl}
            pointerTarget={pointerTarget}
            theme={theme}
          />
        </Canvas>
      ) : null}
    </section>
  );
}

function SceneContent({
  cameraIntensity,
  cameraPosition,
  modelScale,
  modelUrl,
  pointerTarget,
  theme,
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
          cameraPosition={cameraPosition}
          key={modelUrl}
          modelScale={modelScale}
          modelUrl={modelUrl}
          pointerTarget={pointerTarget}
        />
      ) : null}
      <CameraRig basePosition={cameraPosition} intensity={cameraIntensity} pointerTarget={pointerTarget} />
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
  cameraPosition,
  modelScale,
  modelUrl,
  pointerTarget,
}: SceneModelProps) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const group = useRef<THREE.Group>(null);
  const { camera, size } = useThree();

  useEffect(() => {
    let cancelled = false;
    const loadingManager = new THREE.LoadingManager();
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader(loadingManager);
    const modelFormat = getModelFormat(modelUrl);
    const resourcePath = modelFormat === 'gltf' ? getDefaultResourcePath(modelUrl) : '';

    dracoLoader.setDecoderPath(dracoDecoderPath);
    dracoLoader.setDecoderConfig({ type: 'js' });
    dracoLoader.preload();
    loader.setDRACOLoader(dracoLoader);
    loader.setCrossOrigin('anonymous');

    if (resourcePath) {
      loader.setResourcePath(resourcePath.endsWith('/') ? resourcePath : `${resourcePath}/`);
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
        console.error('[Badge] model-load-error', error);
      },
    );

    return () => {
      cancelled = true;
      dracoLoader.dispose();
    };
  }, [modelUrl]);

  const preparedScene = useMemo(() => {
    if (!gltf) {
      return null;
    }

    const clonedScene = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clonedScene);
    const center = bounds.getCenter(new THREE.Vector3());
    const sceneSize = bounds.getSize(new THREE.Vector3());
    const viewportAtFitDistance = getViewportAtDistance(
      cameraPosition.z,
      camera instanceof THREE.PerspectiveCamera ? camera.fov : defaultCamera.fov,
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
  }, [camera, cameraPosition.z, gltf, modelScale, size.height, size.width]);

  useFrame((_, delta) => {
    if (!group.current) {
      return;
    }

    const { x, y } = pointerTarget.current;
    const targetPosition = {
      x: x * 0.12,
      y: -0.18 + y * 0.06,
      z: -Math.abs(x) * 0.04 - Math.abs(y) * 0.03,
    };
    const targetRotation = {
      x: -y * 0.06,
      y: x * 0.12,
      z: x * y * -0.03,
    };

    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, targetPosition.x, 3.2, delta);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, targetPosition.y, 3.2, delta);
    group.current.position.z = THREE.MathUtils.damp(group.current.position.z, targetPosition.z, 3, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, targetRotation.x, 3.4, delta);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, targetRotation.y, 3.4, delta);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, targetRotation.z, 3.2, delta);
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

function CameraRig({ basePosition, intensity, pointerTarget }: CameraRigProps) {
  const smoothedPointer = useRef(new THREE.Vector2());
  const lookAtTarget = useRef(defaultCamera.lookAt.clone());

  useFrame((state, delta) => {
    const { camera, clock } = state;
    const elapsedTime = clock.getElapsedTime();

    smoothedPointer.current.x = THREE.MathUtils.damp(
      smoothedPointer.current.x,
      pointerTarget.current.x,
      2.6,
      delta,
    );
    smoothedPointer.current.y = THREE.MathUtils.damp(
      smoothedPointer.current.y,
      pointerTarget.current.y,
      2.6,
      delta,
    );

    const idleX = Math.sin(elapsedTime * 0.32) * 0.035;
    const idleY = Math.cos(elapsedTime * 0.24) * 0.028;
    const parallaxX = smoothedPointer.current.x * intensity;
    const parallaxY = smoothedPointer.current.y * intensity;

    camera.position.x = THREE.MathUtils.damp(camera.position.x, basePosition.x + parallaxX * 0.6 + idleX, 3.2, delta);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, basePosition.y + parallaxY * 0.28 + idleY, 3, delta);
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      basePosition.z - Math.abs(parallaxX) * 0.14 - Math.abs(parallaxY) * 0.08,
      3.4,
      delta,
    );

    lookAtTarget.current.x = THREE.MathUtils.damp(lookAtTarget.current.x, parallaxX * 0.22, 2.8, delta);
    lookAtTarget.current.y = THREE.MathUtils.damp(lookAtTarget.current.y, parallaxY * 0.12, 2.8, delta);
    lookAtTarget.current.z = THREE.MathUtils.damp(lookAtTarget.current.z, 0, 2.8, delta);

    camera.lookAt(lookAtTarget.current);
  });

  return null;
}

export default Badge;
