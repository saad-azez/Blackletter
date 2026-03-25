import { Float } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

type BadgeVariant = 'Light' | 'Dark';

interface BadgeProps {
  variant: BadgeVariant;
  modelUrl?: string;
  modelScale?: number;
  cameraIntensity?: number;
}

interface SceneTheme {
  ambientLight: string;
  keyLight: string;
  fillLight: string;
  rimLight: string;
}

interface SceneContentProps {
  cameraIntensity: number;
  modelScale: number;
  modelUrl: string;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  theme: SceneTheme;
}

interface SceneModelProps {
  modelScale: number;
  modelUrl: string;
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

interface CameraRigProps {
  intensity: number;
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

const themes: Record<BadgeVariant, SceneTheme> = {
  Dark: {
    ambientLight: '#f6ebd9',
    keyLight: '#9eb5ff',
    fillLight: '#ffcb8f',
    rimLight: '#6e88d8',
  },
  Light: {
    ambientLight: '#fff8ee',
    keyLight: '#f9d49f',
    fillLight: '#fff4df',
    rimLight: '#9d7352',
  },
};

const DEBUG_PREFIX = '[Badge3D]';
const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export const Badge = ({
  variant,
  modelUrl = '',
  modelScale = 1,
  cameraIntensity = 0.35,
}: BadgeProps) => {
  const pointerTarget = useRef(new THREE.Vector2());
  const theme = themes[variant];
  const resolvedModelUrl = modelUrl.trim();
  const isBrowser = typeof window !== 'undefined';

  useEffect(() => {
    console.info(`${DEBUG_PREFIX} component-mounted`, {
      cameraIntensity,
      isBrowser,
      modelScale,
      modelUrlProp: modelUrl,
      resolvedModelUrl,
      variant,
    });

    if (!resolvedModelUrl) {
      console.warn(`${DEBUG_PREFIX} no-model-url`, {
        message: 'No model URL was provided, so nothing will render.',
      });
    }
  }, [cameraIntensity, isBrowser, modelScale, modelUrl, resolvedModelUrl, variant]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = 1 - ((event.clientY - bounds.top) / bounds.height) * 2;

    pointerTarget.current.set(x, y);
  };

  const resetPointer = () => {
    pointerTarget.current.set(0, 0);
  };

  return (
    <section
      onPointerLeave={resetPointer}
      onPointerMove={handlePointerMove}
      style={{
        position: 'relative',
        width: '100vw',
        height: '100dvh',
        minHeight: '100dvh',
        marginLeft: 'calc(50% - 50vw)',
        marginRight: 'calc(50% - 50vw)',
        display: 'block',
        boxSizing: 'border-box',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      {isBrowser ? (
        <Canvas
          camera={{ fov: 42, position: [0, 0, 6] }}
          dpr={[1, 1.75]}
          gl={{ alpha: true, antialias: true }}
          onCreated={({ gl, size, viewport }) => {
            gl.setClearColor(0x000000, 0);
            console.info(`${DEBUG_PREFIX} canvas-created`, {
              canvasHeight: size.height,
              canvasWidth: size.width,
              pixelRatio: gl.getPixelRatio(),
              viewport,
            });
          }}
          shadows
          style={{ position: 'absolute', inset: 0, zIndex: 1 }}
        >
          <SceneContent
            cameraIntensity={cameraIntensity}
            modelScale={modelScale}
            modelUrl={resolvedModelUrl}
            pointerTarget={pointerTarget}
            theme={theme}
          />
        </Canvas>
      ) : null}
    </section>
  );
};

function SceneContent({
  cameraIntensity,
  modelScale,
  modelUrl,
  pointerTarget,
  theme,
}: SceneContentProps) {
  useEffect(() => {
    console.info(`${DEBUG_PREFIX} scene-content`, {
      cameraIntensity,
      modelScale,
      modelUrl,
    });
  }, [cameraIntensity, modelScale, modelUrl]);

  return (
    <>
      <SceneEnvironment />
      <ambientLight color={theme.ambientLight} intensity={2.1} />
      <hemisphereLight
        args={['#ffffff', '#8c98a8', 2.2]}
        position={[0, 2, 0]}
      />
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
          key={modelUrl}
          modelScale={modelScale}
          modelUrl={modelUrl}
          pointerTarget={pointerTarget}
        />
      ) : null}
      <CameraRig intensity={cameraIntensity} pointerTarget={pointerTarget} />
    </>
  );
}

function SceneEnvironment() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const renderer = gl;
    const currentScene = scene;
    const previousEnvironment = currentScene.environment;
    const previousExposure = renderer.toneMappingExposure;
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const environmentScene = new RoomEnvironment();
    const environmentTexture = pmremGenerator.fromScene(environmentScene, 0.04).texture;

    // eslint-disable-next-line react-hooks/immutability
    currentScene.environment = environmentTexture;
    // eslint-disable-next-line react-hooks/immutability
    renderer.toneMappingExposure = 1.18;

    console.info(`${DEBUG_PREFIX} environment-ready`, {
      toneMappingExposure: renderer.toneMappingExposure,
    });

    return () => {
      currentScene.environment = previousEnvironment;
      renderer.toneMappingExposure = previousExposure;
      environmentTexture.dispose();
      pmremGenerator.dispose();
    };
  }, [gl, scene]);

  return null;
}

function SceneModel({ modelScale, modelUrl, pointerTarget }: SceneModelProps) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  useEffect(() => {
    let cancelled = false;
    const dracoLoader = new DRACOLoader();
    const loader = new GLTFLoader();
    dracoLoader.setDecoderPath(dracoDecoderPath);
    dracoLoader.setDecoderConfig({ type: 'js' });
    dracoLoader.preload();
    loader.setDRACOLoader(dracoLoader);
    loader.setCrossOrigin('anonymous');

    console.info(`${DEBUG_PREFIX} glb-load-start`, {
      dracoDecoderPath,
      modelUrl,
    });

    loader.load(
      modelUrl,
      (loadedModel) => {
        console.info(`${DEBUG_PREFIX} glb-load-success`, {
          animations: loadedModel.animations.length,
          cameras: loadedModel.cameras.length,
          childCount: loadedModel.scene.children.length,
          modelUrl,
        });

        if (!cancelled) {
          setGltf(loadedModel);
        }
      },
      (event) => {
        const total = event.total || 0;
        const loaded = event.loaded || 0;
        const progress = total > 0 ? loaded / total : null;

        console.info(`${DEBUG_PREFIX} glb-load-progress`, {
          loaded,
          modelUrl,
          progress,
          total,
        });
      },
      (error) => {
        console.error(`${DEBUG_PREFIX} glb-load-error`, {
          error,
          message: error instanceof Error ? error.message : String(error),
          modelUrl,
        });
      },
    );

    return () => {
      cancelled = true;
      dracoLoader.dispose();
      console.info(`${DEBUG_PREFIX} glb-loader-disposed`, { modelUrl });
    };
  }, [modelUrl]);

  useEffect(() => {
    console.info(`${DEBUG_PREFIX} viewport-state`, {
      modelScale,
      modelUrl,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
  }, [modelScale, modelUrl, viewport.height, viewport.width]);

  const preparedScene = useMemo(() => {
    if (!gltf) {
      return null;
    }

    const clonedScene = gltf.scene.clone(true);
    const bounds = new THREE.Box3().setFromObject(clonedScene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const widthScale = viewport.width / Math.max(size.x, 0.001);
    const heightScale = viewport.height / Math.max(size.y, 0.001);
    const normalizedScale = Math.min(widthScale, heightScale) * modelScale * 0.92;

    console.info(`${DEBUG_PREFIX} scene-bounds`, {
      center: center.toArray(),
      heightScale,
      modelScale,
      normalizedScale,
      size: size.toArray(),
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
      widthScale,
    });

    clonedScene.position.sub(center);
    clonedScene.scale.multiplyScalar(normalizedScale);
    clonedScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    return clonedScene;
  }, [gltf, modelScale, viewport.height, viewport.width]);

  useFrame((_, delta) => {
    if (!group.current || !preparedScene) {
      return;
    }

    const { x, y } = pointerTarget.current;

    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, x * 0.16, 4, delta);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, -0.2 + y * 0.08, 4, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, y * 0.12, 4, delta);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, x * 0.3, 4, delta);
  });

  useEffect(() => {
    if (!gltf) {
      console.warn(`${DEBUG_PREFIX} scene-not-ready`, {
        hasGltf: false,
        modelUrl,
      });
    }
  }, [gltf, modelUrl]);

  if (!preparedScene) {
    return null;
  }

  return (
    <Float floatIntensity={0.18} rotationIntensity={0.05} speed={1.15}>
      <group ref={group} position={[0, -0.2, 0]}>
        <primitive object={preparedScene} />
      </group>
    </Float>
  );
}

function CameraRig({ intensity, pointerTarget }: CameraRigProps) {
  const smoothedPointer = useRef(new THREE.Vector2());

  useFrame(({ camera }, delta) => {
    smoothedPointer.current.x = THREE.MathUtils.damp(
      smoothedPointer.current.x,
      pointerTarget.current.x,
      3.5,
      delta,
    );
    smoothedPointer.current.y = THREE.MathUtils.damp(
      smoothedPointer.current.y,
      pointerTarget.current.y,
      3.5,
      delta,
    );

    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      smoothedPointer.current.x * intensity,
      4,
      delta,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      smoothedPointer.current.y * intensity * 0.65,
      4,
      delta,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      6 - Math.abs(smoothedPointer.current.x) * intensity * 0.35,
      4,
      delta,
    );
    camera.lookAt(0, 0, 0);
  });

  return null;
}
