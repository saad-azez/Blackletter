import { Float } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

type BadgeVariant = 'Light' | 'Dark';

interface BadgeProps {
  variant: BadgeVariant;
  modelUrl?: string;
  resourcePath?: string;
  cloudVortexTextureUrl?: string;
  floorTextureUrl?: string;
  mapeTextureUrl?: string;
  windowIslamicArtTextureUrl?: string;
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
  resourcePath: string;
  textureOverrides: TextureOverrides;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  theme: SceneTheme;
}

interface SceneModelProps {
  modelScale: number;
  modelUrl: string;
  resourcePath: string;
  textureOverrides: TextureOverrides;
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

interface CameraRigProps {
  intensity: number;
  pointerTarget: MutableRefObject<THREE.Vector2>;
}

interface TextureOverrides {
  cloudVortexTextureUrl?: string;
  floorTextureUrl?: string;
  mapeTextureUrl?: string;
  windowIslamicArtTextureUrl?: string;
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
const interactionSelector = '.frame';
const textureOverrideDescriptors = [
  {
    assetUri: 'u1272336289_massive_cloud_vortex_--ar_3235_--v_7_45d73369-0c2c-439f-a443-b555a1d85db6.png',
    propKey: 'cloudVortexTextureUrl',
  },
  {
    assetUri: 'floor%20.png',
    propKey: 'floorTextureUrl',
  },
  {
    assetUri: 'Mape.jpg',
    propKey: 'mapeTextureUrl',
  },
  {
    assetUri: 'Window%20islamic%20art.webp',
    propKey: 'windowIslamicArtTextureUrl',
  },
] as const satisfies ReadonlyArray<{
  assetUri: string;
  propKey: keyof TextureOverrides;
}>;

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

    if (lastSlashIndex === -1) {
      return '';
    }

    return modelUrl.slice(0, lastSlashIndex + 1);
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

function buildTextureOverrideMap(textureOverrides: TextureOverrides) {
  const overrideMap = new Map<string, string>();

  for (const descriptor of textureOverrideDescriptors) {
    const overrideUrl = textureOverrides[descriptor.propKey]?.trim();

    if (!overrideUrl) {
      continue;
    }

    overrideMap.set(normalizeAssetKey(descriptor.assetUri), overrideUrl);
  }

  return overrideMap;
}

function shapePointerAxis(value: number) {
  const clampedValue = THREE.MathUtils.clamp(value, -1, 1);

  return Math.sign(clampedValue) * Math.pow(Math.abs(clampedValue), 1.2);
}

export const Badge = ({
  variant,
  modelUrl = '',
  resourcePath = '',
  cloudVortexTextureUrl = '',
  floorTextureUrl = '',
  mapeTextureUrl = '',
  windowIslamicArtTextureUrl = '',
  modelScale = 1,
  cameraIntensity = 0.35,
}: BadgeProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const theme = themes[variant];
  const resolvedModelUrl = modelUrl.trim();
  const resolvedResourcePath = resourcePath.trim();
  const modelFormat = getModelFormat(resolvedModelUrl);
  const textureOverrides = useMemo<TextureOverrides>(
    () => ({
      cloudVortexTextureUrl: cloudVortexTextureUrl.trim(),
      floorTextureUrl: floorTextureUrl.trim(),
      mapeTextureUrl: mapeTextureUrl.trim(),
      windowIslamicArtTextureUrl: windowIslamicArtTextureUrl.trim(),
    }),
    [
      cloudVortexTextureUrl,
      floorTextureUrl,
      mapeTextureUrl,
      windowIslamicArtTextureUrl,
    ],
  );
  const isBrowser = typeof window !== 'undefined';

  useEffect(() => {
    console.info(`${DEBUG_PREFIX} component-mounted`, {
      cameraIntensity,
      isBrowser,
      modelFormat,
      modelScale,
      modelUrlProp: modelUrl,
      resourcePathProp: resourcePath,
      resolvedModelUrl,
      resolvedResourcePath,
      textureOverrides,
      variant,
    });

    if (!resolvedModelUrl) {
      console.warn(`${DEBUG_PREFIX} no-model-url`, {
        message: 'No model URL was provided, so nothing will render.',
      });
    }
  }, [
    cameraIntensity,
    isBrowser,
    modelFormat,
    modelScale,
    modelUrl,
    resolvedModelUrl,
    resolvedResourcePath,
    resourcePath,
    textureOverrides,
    variant,
  ]);

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

    console.info(`${DEBUG_PREFIX} interaction-scope`, {
      className:
        interactionElement instanceof HTMLElement ? interactionElement.className : sectionElement.className,
      selector: interactionSelector,
      source: interactionElement === sectionElement ? 'component' : 'frame',
      tagName:
        interactionElement instanceof HTMLElement ? interactionElement.tagName.toLowerCase() : 'section',
    });

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
            resourcePath={resolvedResourcePath}
            textureOverrides={textureOverrides}
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
  resourcePath,
  textureOverrides,
  pointerTarget,
  theme,
}: SceneContentProps) {
  useEffect(() => {
    console.info(`${DEBUG_PREFIX} scene-content`, {
      cameraIntensity,
      modelScale,
      resourcePath,
      textureOverrides,
      modelUrl,
    });
  }, [cameraIntensity, modelScale, modelUrl, resourcePath, textureOverrides]);

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
          resourcePath={resourcePath}
          textureOverrides={textureOverrides}
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

function SceneModel({
  modelScale,
  modelUrl,
  resourcePath,
  textureOverrides,
  pointerTarget,
}: SceneModelProps) {
  const [gltf, setGltf] = useState<GLTF | null>(null);
  const group = useRef<THREE.Group>(null);
  const { viewport } = useThree();
  const modelFormat = getModelFormat(modelUrl);
  const resolvedResourcePath =
    resourcePath || (modelFormat === 'gltf' ? getDefaultResourcePath(modelUrl) : '');
  const textureOverrideMap = useMemo(
    () => buildTextureOverrideMap(textureOverrides),
    [textureOverrides],
  );

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
      const overrideUrl = textureOverrideMap.get(normalizeAssetKey(requestedUrl));

      if (overrideUrl) {
        console.info(`${DEBUG_PREFIX} texture-override-hit`, {
          overrideUrl,
          requestedUrl,
        });

        return overrideUrl;
      }

      return requestedUrl;
    });

    if (resolvedResourcePath) {
      loader.setResourcePath(ensureTrailingSlash(resolvedResourcePath));
    }

    console.info(`${DEBUG_PREFIX} model-load-start`, {
      dracoDecoderPath,
      modelFormat,
      modelUrl,
      resolvedResourcePath,
      textureOverrides,
    });

    loader.load(
      modelUrl,
      (loadedModel) => {
        console.info(`${DEBUG_PREFIX} model-load-success`, {
          animations: loadedModel.animations.length,
          cameras: loadedModel.cameras.length,
          childCount: loadedModel.scene.children.length,
          modelFormat,
          modelUrl,
          resolvedResourcePath,
          textureOverrides,
        });

        if (!cancelled) {
          setGltf(loadedModel);
        }
      },
      (event) => {
        const total = event.total || 0;
        const loaded = event.loaded || 0;
        const progress = total > 0 ? loaded / total : null;

        console.info(`${DEBUG_PREFIX} model-load-progress`, {
          loaded,
          modelFormat,
          modelUrl,
          progress,
          resolvedResourcePath,
          total,
        });
      },
      (error) => {
        console.error(`${DEBUG_PREFIX} model-load-error`, {
          error,
          message: error instanceof Error ? error.message : String(error),
          modelFormat,
          modelUrl,
          resolvedResourcePath,
          textureOverrides,
        });
      },
    );

    return () => {
      cancelled = true;
      dracoLoader.dispose();
      console.info(`${DEBUG_PREFIX} model-loader-disposed`, {
        modelFormat,
        modelUrl,
        resolvedResourcePath,
        textureOverrides,
      });
    };
  }, [modelFormat, modelUrl, resolvedResourcePath, textureOverrideMap, textureOverrides]);

  useEffect(() => {
    console.info(`${DEBUG_PREFIX} viewport-state`, {
      modelScale,
      resourcePath: resolvedResourcePath,
      textureOverrides,
      modelUrl,
      viewportHeight: viewport.height,
      viewportWidth: viewport.width,
    });
  }, [
    modelScale,
    modelUrl,
    resolvedResourcePath,
    textureOverrides,
    viewport.height,
    viewport.width,
  ]);

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

    group.current.position.x = THREE.MathUtils.damp(group.current.position.x, x * 0.12, 3.2, delta);
    group.current.position.y = THREE.MathUtils.damp(group.current.position.y, -0.18 + y * 0.06, 3.2, delta);
    group.current.position.z = THREE.MathUtils.damp(
      group.current.position.z,
      -Math.abs(x) * 0.04 - Math.abs(y) * 0.03,
      3,
      delta,
    );
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -y * 0.06, 3.4, delta);
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, x * 0.12, 3.4, delta);
    group.current.rotation.z = THREE.MathUtils.damp(
      group.current.rotation.z,
      x * y * -0.03,
      3.2,
      delta,
    );
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
  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0));

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

    camera.position.x = THREE.MathUtils.damp(
      camera.position.x,
      parallaxX * 0.6 + idleX,
      3.2,
      delta,
    );
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      parallaxY * 0.28 + idleY,
      3,
      delta,
    );
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      6.1 - Math.abs(parallaxX) * 0.14 - Math.abs(parallaxY) * 0.08,
      3.4,
      delta,
    );

    lookAtTarget.current.x = THREE.MathUtils.damp(
      lookAtTarget.current.x,
      parallaxX * 0.22,
      2.8,
      delta,
    );
    lookAtTarget.current.y = THREE.MathUtils.damp(
      lookAtTarget.current.y,
      parallaxY * 0.12,
      2.8,
      delta,
    );

    camera.lookAt(lookAtTarget.current);
  });

  return null;
}
