import { Clone, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const TOWER_MODEL_URL = new URL('../assets/Castle/Tower/Tower.glb', import.meta.url).href;

/**
 * Worm's-eye camera: a wide lens, low to the ground, pitched sharply upward so
 * the tall flanking towers converge toward the top corners (three-point
 * perspective). The upward tilt comes from looking at a point high above and
 * behind the towers — perspective projection then bends the verticals for free.
 */
const CAMERA_FOV = 65;
const CAMERA_POSITION: [number, number, number] = [0, -1.8, 5.5];
const CAMERA_LOOK_AT: [number, number, number] = [0, 6, -3];

/**
 * Layout: towers are base-pivoted (their foot sits at the group origin), so
 * placing the group below the camera makes us look up at their undersides.
 * The base template is built at this height; each instance scales from there.
 */
const TOWER_TARGET_HEIGHT = 7.5; // tall, so the tips run off the top corners

/**
 * World-space bottom cut (no Blender needed). A horizontal clipping plane
 * removes all tower geometry below this Y at render time, so the base reads as
 * continuing past the bottom of the frame. Raise it to cut more off the bottom.
 */
const TOWER_CLIP_Y = -1.5;
const TOWER_CLIP_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOWER_CLIP_Y);

/**
 * Per-tower placement. `scale` is non-uniform `[width, height, depth]`, so a
 * tower can be fattened on x/z (thicker, occludes the background) without
 * getting taller. The left tower is the big wedge; the right stays a mirror.
 */
interface TowerPlacement {
  position: [number, number, number];
  rotationY: number;
  scale: [number, number, number];
}

const LEFT_TOWER: TowerPlacement = {
  position: [-3.4, -3.2, 2.4], // further left, lower foot, closer to camera
  rotationY: 0,
  scale: [2.4, 1.5, 2.4], // much thicker on x/z so nothing shows behind it
};

const RIGHT_TOWER: TowerPlacement = {
  position: [3.2, -2.6, 1.5],
  rotationY: Math.PI, // mirrored to face inward
  scale: [1, 1, 1],
};

// Warm the loader cache before the component mounts so the model is ready fast.
useGLTF.preload(TOWER_MODEL_URL, DRACO_DECODER_PATH);

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface CastleSceneV2Props {
  /** Uniform multiplier applied on top of the normalised tower height. */
  modelScale?: number;
  /** Optional override for the tower GLB url. */
  towerModelUrl?: string;
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Deep-clone a loaded scene and give every mesh its own front-side material so
 * the source GLTF is never mutated and clones can share these prepared assets.
 */
function cloneWithPreparedMaterials(scene: THREE.Object3D): THREE.Group {
  const root = scene.clone(true) as THREE.Group;

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.castShadow = false;
    child.receiveShadow = false;

    const prepare = (material: THREE.Material): THREE.Material => {
      const cloned = material.clone();

      // Cut the tower base at TOWER_CLIP_Y (world space). Requires the renderer
      // to have localClippingEnabled = true (set in the Canvas onCreated).
      cloned.clippingPlanes = [TOWER_CLIP_PLANE];

      if (
        cloned instanceof THREE.MeshBasicMaterial ||
        cloned instanceof THREE.MeshPhongMaterial ||
        cloned instanceof THREE.MeshPhysicalMaterial ||
        cloned instanceof THREE.MeshStandardMaterial
      ) {
        cloned.side = THREE.FrontSide;
      }

      cloned.needsUpdate = true;

      return cloned;
    };

    child.material = Array.isArray(child.material)
      ? child.material.map(prepare)
      : prepare(child.material);
  });

  return root;
}

/**
 * Build a reusable tower "template": materials prepared, base-pivoted (centred
 * on x/z, foot at y = 0), and uniformly scaled so its height equals
 * `targetHeight` world units. The returned group is a template only — render it
 * through <Clone> so both towers share the same geometry and materials.
 */
function buildTowerTemplate(scene: THREE.Object3D, targetHeight: number): THREE.Group {
  const root = cloneWithPreparedMaterials(scene);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = targetHeight / Math.max(size.y, 1e-3);

  root.scale.setScalar(scale);
  root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  root.updateMatrixWorld(true);

  return root;
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function SceneCamera() {
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const invalidate = useThree((state) => state.invalidate);

  // Point the camera up at the towers. lookAt isn't a prop, so set it once the
  // camera mounts, then request a frame (the render loop is on-demand).
  useLayoutEffect(() => {
    const camera = cameraRef.current;

    if (!camera) {
      return;
    }

    camera.lookAt(CAMERA_LOOK_AT[0], CAMERA_LOOK_AT[1], CAMERA_LOOK_AT[2]);
    camera.updateProjectionMatrix();
    invalidate();
  }, [invalidate]);

  return (
    <PerspectiveCamera
      ref={cameraRef}
      far={100}
      fov={CAMERA_FOV}
      makeDefault
      near={0.1}
      position={CAMERA_POSITION}
    />
  );
}

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight intensity={1.15} position={[5, 6, 4]} />
      <directionalLight intensity={0.35} position={[-4, 2, -5]} />
    </>
  );
}

/** A single tower instance: a shared template positioned/scaled per placement. */
function Tower({ placement, template }: { placement: TowerPlacement; template: THREE.Group }) {
  return (
    <group
      position={placement.position}
      rotation={[0, placement.rotationY, 0]}
      scale={placement.scale}
    >
      <Clone object={template} />
    </group>
  );
}

/** Renders both towers from one shared template — the left is the larger wedge. */
function TowerPair({ template }: { template: THREE.Group }) {
  return (
    <>
      <Tower placement={LEFT_TOWER} template={template} />
      <Tower placement={RIGHT_TOWER} template={template} />
    </>
  );
}

/** Loads + prepares the tower model, then mounts the mirrored pair. */
function TowerField({ modelScale, modelUrl }: { modelScale: number; modelUrl: string }) {
  const gltf = useGLTF(modelUrl, DRACO_DECODER_PATH);
  const invalidate = useThree((state) => state.invalidate);

  const template = useMemo(
    () => buildTowerTemplate(gltf.scene, TOWER_TARGET_HEIGHT * modelScale),
    [gltf.scene, modelScale],
  );

  // The render loop is on-demand, so request a frame once the model is ready.
  useEffect(() => {
    invalidate();
  }, [invalidate, template]);

  return <TowerPair template={template} />;
}

/* -------------------------------------------------------------------------- */
/*  Root component                                                             */
/* -------------------------------------------------------------------------- */

export function CastleSceneV2({ modelScale = 1, towerModelUrl }: CastleSceneV2Props) {
  const resolvedModelUrl = towerModelUrl?.trim() || TOWER_MODEL_URL;

  return (
    <section
      style={{
        background: '#0a0a0f',
        height: '100vh',
        position: 'relative',
        width: '100%',
      }}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x0a0a0f, 1);
          gl.localClippingEnabled = true;
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <SceneCamera />
        <SceneLighting />
        <Suspense fallback={null}>
          <TowerField modelScale={modelScale} modelUrl={resolvedModelUrl} />
        </Suspense>
      </Canvas>
    </section>
  );
}

export default CastleSceneV2;
