import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type GUI from 'lil-gui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';

const dracoDecoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const defaultVortexSceneUrl = new URL(
  '../assets/Castle/Castle-Building/vortex_scene.glb',
  import.meta.url,
).href;

/** The scene was authored and framed for a 1440x1575 canvas. */
const AUTHORED_ASPECT = 1440 / 1575;

/** Extra sky scale at rest, released quadratically as the section scrolls out. */
const SKY_ZOOM = 0.22;

/** The castle and towers pitch back around X as the section scrolls away —
    rearing upward like a ship climbing. */
const SCROLL_PITCH_RAD = -0.22;

/** Pointer parallax amplitudes (radians / scene-relative units). */
const POINTER_YAW_RAD = 0.1;
const POINTER_PITCH_RAD = 0.06;

/** The backdrop is pushed this much farther from the camera along its view
    ray, then re-scaled to the minimum size that still covers the frame at
    that new distance — the most "pulled back" it can look without ever
    leaving a gap. A flat backdrop's on-screen size only depends on the
    scale-to-distance RATIO, not on distance alone, so simply moving it
    back is invisible unless the compensating scale is capped like this. */
const SKY_PUSH = 3;
const SKY_COVER_BLEED = 1.03;

/** The main castle is scaled up about its base centre. */
const CASTLE_SCALE = 1.5;

/** Slight overshoot when fitting the rocks across the frame width. */
const ROCKS_BLEED = 1.04;

/**
 * The GLB's only light is a single directional sun (Blender's glTF export
 * doesn't carry the viewport's implicit world/ambient light), so anything
 * not directly facing it — like the left tower's camera-facing side —
 * renders pure black. This restores a soft fill so shadow-side geometry
 * stays visible, without flattening the sun's dramatic contrast.
 */
const FILL_LIGHT_SKY_COLOR = 0xbfc4d6;
const FILL_LIGHT_GROUND_COLOR = 0x0b0a10;
const FILL_LIGHT_INTENSITY = 0.55;

useGLTF.preload(defaultVortexSceneUrl, dracoDecoderPath);

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

function shapePointerAxis(value: number) {
  const clampedValue = THREE.MathUtils.clamp(value, -1, 1);

  return Math.sign(clampedValue) * Math.pow(Math.abs(clampedValue), 1.2);
}

/** A group's rest-state transform, captured once (on the object's own
    userData) so debug offsets and per-frame animation can both be layered
    on top without fighting each other. */
interface BaseTransform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

function captureBaseTransform(object: THREE.Object3D): BaseTransform {
  const base: BaseTransform = {
    position: object.position.clone(),
    rotation: object.rotation.clone(),
    scale: object.scale.clone(),
  };

  object.userData.__base = base;

  return base;
}

function getBaseTransform(object: THREE.Object3D | null): BaseTransform | null {
  return (object?.userData.__base as BaseTransform | undefined) ?? null;
}

/** Debug-only offsets a designer can nudge live; all additive/multiplicative
    atop the authored/fitted rest state, so the scroll and pointer animation
    keep working exactly as before while the panel is open. */
interface DebugOffsets {
  camera: { fov: number; x: number; y: number; z: number };
  castle: { rx: number; ry: number; rz: number; scale: number; x: number; y: number; z: number };
  rocks: { scale: number; x: number; y: number; z: number };
  sky: { scale: number; x: number; y: number; z: number };
  towers: { rx: number; ry: number; rz: number; scale: number; x: number; y: number; z: number };
}

function createDebugOffsets(): DebugOffsets {
  return {
    camera: { fov: 0, x: 0, y: 0, z: 0 },
    castle: { rx: 0, ry: 0, rz: 0, scale: 1, x: 0, y: 0, z: 0 },
    rocks: { scale: 1, x: 0, y: 0, z: 0 },
    sky: { scale: 1, x: 0, y: 0, z: 0 },
    towers: { rx: 0, ry: 0, rz: 0, scale: 1, x: 0, y: 0, z: 0 },
  };
}

/**
 * Apply the debug panel's offsets to every non-per-frame-animated object
 * (camera, castle, towers, rocks, and the sky's position — everything
 * except the sky's scale, which the scroll-zoom animation drives every
 * frame and layers its own offset onto separately).
 */
function applyDebugOffsets(rig: VortexRig, camera: THREE.PerspectiveCamera | null, offsets: DebugOffsets) {
  if (camera) {
    const authoredPosition = camera.userData.__authoredPosition as THREE.Vector3 | undefined;
    const authoredFovBase = camera.userData.__authoredFovBase as number | undefined;

    if (authoredPosition) {
      camera.position.set(
        authoredPosition.x + offsets.camera.x,
        authoredPosition.y + offsets.camera.y,
        authoredPosition.z + offsets.camera.z,
      );
    }

    if (authoredFovBase !== undefined) {
      camera.userData.__authoredFov = authoredFovBase + offsets.camera.fov;
      applyCoverFraming(camera, camera.aspect);
    }
  }

  const applyGroup = (
    object: THREE.Object3D | null,
    offset: { rx?: number; ry?: number; rz?: number; scale: number; x: number; y: number; z: number },
  ) => {
    if (!object) {
      return;
    }

    const base = getBaseTransform(object);

    if (!base) {
      return;
    }

    object.position.set(base.position.x + offset.x, base.position.y + offset.y, base.position.z + offset.z);
    object.rotation.set(
      base.rotation.x + THREE.MathUtils.degToRad(offset.rx ?? 0),
      base.rotation.y + THREE.MathUtils.degToRad(offset.ry ?? 0),
      base.rotation.z + THREE.MathUtils.degToRad(offset.rz ?? 0),
    );
    object.scale.set(base.scale.x * offset.scale, base.scale.y * offset.scale, base.scale.z * offset.scale);
  };

  applyGroup(rig.castleRig, offsets.castle);
  applyGroup(rig.towersGroup, offsets.towers);
  applyGroup(rig.rocks, offsets.rocks);

  if (rig.sky) {
    const skyBase = getBaseTransform(rig.sky);

    if (skyBase) {
      rig.sky.position.set(
        skyBase.position.x + offsets.sky.x,
        skyBase.position.y + offsets.sky.y,
        skyBase.position.z + offsets.sky.z,
      );
    }
  }
}

interface VortexRig {
  castleRig: THREE.Group | null;
  pitch: THREE.Group;
  rocks: THREE.Object3D | null;
  sky: THREE.Object3D | null;
  skyBaseScale: THREE.Vector3 | null;
  towersGroup: THREE.Object3D | null;
}

interface LoadedVortexScene {
  cameras?: THREE.Camera[];
  scene: THREE.Group;
}

/** Locks the authored camera so we manage its framing ourselves. */
function prepareAuthoredCamera(gltf: LoadedVortexScene): THREE.PerspectiveCamera | null {
  const camera = gltf.cameras?.[0];

  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return null;
  }

  (camera as THREE.PerspectiveCamera & { manual?: boolean }).manual = true;

  if (camera.userData.__authoredFovBase === undefined) {
    camera.userData.__authoredFovBase = camera.fov;
    camera.userData.__authoredFov = camera.fov;
    camera.userData.__authoredPosition = camera.position.clone();
  }

  return camera;
}

/**
 * "object-fit: cover" for the authored composition: render at the canvas's
 * real aspect (no distortion) while keeping the view inside the authored
 * frame. Narrow screens crop the sides and keep the full authored height;
 * wide screens keep the full authored width and crop vertically — the void
 * beyond the designed framing is never revealed.
 */
function applyCoverFraming(camera: THREE.PerspectiveCamera, aspect: number) {
  const authoredFov = (camera.userData.__authoredFov as number | undefined) ?? camera.fov;
  const authoredVertical = THREE.MathUtils.degToRad(authoredFov);

  camera.aspect = aspect;

  if (aspect > AUTHORED_ASPECT) {
    const authoredHorizontal = 2 * Math.atan(Math.tan(authoredVertical / 2) * AUTHORED_ASPECT);

    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(authoredHorizontal / 2) / aspect));
  } else {
    camera.fov = authoredFov;
  }

  camera.updateProjectionMatrix();
}

/**
 * Project an object's world-space bounding box corners into camera space
 * (x = right, y = up, z = -depth). Shared by the sky and rocks fits so both
 * measure coverage the same way.
 */
function cameraSpaceBounds(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);

  if (box.isEmpty()) {
    return null;
  }

  const toCameraSpace = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const bounds = new THREE.Box3();

  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        bounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(toCameraSpace));
      }
    }
  }

  return bounds;
}

/**
 * Push the backdrop away from the camera along its view ray, then re-scale
 * it to the MINIMUM size that still covers the frame at that new distance.
 * A flat backdrop's apparent size depends only on scale-to-distance ratio,
 * not distance alone — oversizing it while pushing it back is invisible
 * (or reads as zooming in), so this always lands on the least "zoomed"
 * size that leaves no gap, which is the most convincingly distant result.
 */
function pushSkyBack(camera: THREE.PerspectiveCamera, sky: THREE.Object3D) {
  const bounds = cameraSpaceBounds(camera, sky);

  if (!bounds) {
    return;
  }

  const fovDegrees = (camera.userData.__authoredFov as number | undefined) ?? camera.fov;
  const vfov = THREE.MathUtils.degToRad(fovDegrees);
  const currentDepth = -(bounds.min.z + bounds.max.z) / 2;

  if (currentDepth <= 0) {
    return;
  }

  const targetDepth = currentDepth * SKY_PUSH;

  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const skyPosition = sky.getWorldPosition(new THREE.Vector3());
  const direction = skyPosition.sub(cameraPosition).normalize();
  const targetWorld = cameraPosition.clone().add(direction.multiplyScalar(targetDepth));

  sky.parent?.worldToLocal(targetWorld);
  sky.position.copy(targetWorld);
  sky.updateMatrixWorld(true);

  const halfHeight = Math.tan(vfov / 2) * targetDepth;
  const halfWidth = halfHeight * AUTHORED_ASPECT;
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;

  if (width > 0 && height > 0) {
    const scaleForWidth = (2 * halfWidth) / width;
    const scaleForHeight = (2 * halfHeight) / height;

    sky.scale.multiplyScalar(Math.max(scaleForWidth, scaleForHeight) * SKY_COVER_BLEED);
  }
}

/**
 * Fit the rocks so the COMPLETE image is on screen: scaled to span the
 * authored frame's width and bottom-aligned with the authored frame's
 * lower edge.
 */
function fitRocksToFrame(camera: THREE.PerspectiveCamera, rocks: THREE.Object3D) {
  const fovDegrees = (camera.userData.__authoredFov as number | undefined) ?? camera.fov;
  const vfov = THREE.MathUtils.degToRad(fovDegrees);

  let bounds = cameraSpaceBounds(camera, rocks);

  if (!bounds) {
    return;
  }

  const depth = -(bounds.min.z + bounds.max.z) / 2;

  if (depth <= 0) {
    return;
  }

  const halfHeight = Math.tan(vfov / 2) * depth;
  const halfWidth = halfHeight * AUTHORED_ASPECT;
  const width = bounds.max.x - bounds.min.x;

  if (width > 0) {
    rocks.scale.multiplyScalar((2 * halfWidth * ROCKS_BLEED) / width);
    rocks.updateMatrixWorld(true);
    bounds = cameraSpaceBounds(camera, rocks);

    if (!bounds) {
      return;
    }
  }

  // Centre horizontally, rest the image's bottom edge on the frame's bottom.
  // Computed as a camera-local delta, then carried through world space —
  // rocks.position is parent-relative, so a naive local add would be wrong
  // if the rocks (or sky) sit under a rotated/scaled environment group.
  const shiftCameraSpace = new THREE.Vector3(
    -(bounds.min.x + bounds.max.x) / 2,
    -halfHeight - bounds.min.y,
    0,
  );
  const shiftWorld = shiftCameraSpace.applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
  const targetWorld = rocks.getWorldPosition(new THREE.Vector3()).add(shiftWorld);

  rocks.parent?.worldToLocal(targetWorld);
  rocks.position.copy(targetWorld);
  rocks.updateMatrixWorld(true);
}

/**
 * Group the Castle_* parts under one rig pivoted at the building's base
 * centre, so scaling grows the castle upward and outward without moving
 * its footing.
 */
function scaleCastleUp(pitch: THREE.Group, castleParts: THREE.Object3D[]): THREE.Group | null {
  if (!castleParts.length) {
    return null;
  }

  const box = new THREE.Box3();
  castleParts.forEach((part) => {
    box.expandByObject(part);
  });

  if (box.isEmpty()) {
    return null;
  }

  // The box is in world space; castleRig.position is relative to pitch, so
  // route the pivot through worldToLocal rather than assuming pitch sits at
  // the world origin.
  const pivotWorld = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    box.min.y,
    (box.min.z + box.max.z) / 2,
  );

  const castleRig = new THREE.Group();
  castleRig.name = 'CastleRig';
  pitch.add(castleRig);
  pitch.worldToLocal(pivotWorld);
  castleRig.position.copy(pivotWorld);

  castleParts.forEach((part) => {
    castleRig.attach(part);
  });

  castleRig.scale.setScalar(CASTLE_SCALE);

  return castleRig;
}

/**
 * The whole castle scene lives in one authored GLB: castle + towers
 * (GRP_Towers), Foreground_Rocks, Backdrop_VortexSky, Light_Sun and
 * Camera_Main. The castle and towers are re-parented into a pitch rig so
 * they can rear up on scroll without taking the sky, rocks, camera or
 * light with them. The rocks are deliberately never animated — they sit
 * exactly where the file authors them. useGLTF caches the scene per URL,
 * so the restructure and the animation baselines are only ever captured
 * once.
 */
function buildVortexRig(
  gltf: LoadedVortexScene,
  sceneUrl: string,
  camera: THREE.PerspectiveCamera | null,
): VortexRig {
  const root = gltf.scene;
  const sky = root.getObjectByName('Backdrop_VortexSky') ?? null;
  const rocks = root.getObjectByName('Foreground_Rocks') ?? null;
  const towers = root.getObjectByName('GRP_Towers') ?? null;

  ['Backdrop_VortexSky', 'GRP_Towers'].forEach((name) => {
    if (!root.getObjectByName(name)) {
      console.warn(`[CastleScene] node "${name}" not found in ${sceneUrl}`);
    }
  });

  // Foreground_Rocks is optional: some authored scenes omit it, and the
  // rocks fit below is skipped entirely when it's absent.
  if (!rocks) {
    console.warn(`[CastleScene] node "Foreground_Rocks" not found in ${sceneUrl} — rocks fit skipped.`);
  }

  let pitch = root.getObjectByName('PitchRig') as THREE.Group | null;

  if (!pitch) {
    // Restore the authored look. Blender's exporter writes sun strength in
    // lux (strength x 683), which three.js applies raw — divide it back so
    // the castle is lit as designed. Materials with an emissive texture
    // (the vortex sky and the rocks) are pure emission planes: kill their
    // lit base term so the images render at their exact authored colours.
    root.traverse((object) => {
      if ((object as THREE.DirectionalLight).isDirectionalLight) {
        (object as THREE.DirectionalLight).intensity /= 683;
      }

      const mesh = object as THREE.Mesh;

      if (mesh.isMesh) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        materials.forEach((material) => {
          const standard = material as THREE.MeshStandardMaterial;

          if (standard.emissiveMap) {
            standard.color.setRGB(0, 0, 0);
            standard.needsUpdate = true;
          }
        });
      }
    });

    const fillLight = new THREE.HemisphereLight(
      FILL_LIGHT_SKY_COLOR,
      FILL_LIGHT_GROUND_COLOR,
      FILL_LIGHT_INTENSITY,
    );
    fillLight.name = 'FillLight';
    root.add(fillLight);

    const rigGroup = new THREE.Group();
    rigGroup.name = 'PitchRig';
    root.add(rigGroup);

    const wanted: THREE.Object3D[] = [];
    const castleParts: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object === root || object === rigGroup) {
        return;
      }

      if (object === towers) {
        wanted.push(object);
      } else if (object.name.startsWith('Castle_')) {
        wanted.push(object);
        castleParts.push(object);
      }
    });

    // Re-parent only the topmost matches; attach() preserves world
    // transforms so the authored layout is untouched at rest.
    const topmost = wanted.filter((object) => {
      let parent = object.parent;

      while (parent) {
        if (wanted.includes(parent)) {
          return false;
        }
        parent = parent.parent;
      }

      return true;
    });

    topmost.forEach((object) => {
      rigGroup.attach(object);
    });

    pitch = rigGroup;
    root.updateMatrixWorld(true);

    // Grow the castle body about its own base, then push the backdrop back
    // and stretch the foreground rocks across the authored frame — all
    // one-time structural fits, independent of the scroll/pointer animation.
    const topmostCastleParts = castleParts.filter((object) => {
      let parent = object.parent;

      while (parent) {
        if (castleParts.includes(parent)) {
          return false;
        }
        parent = parent.parent;
      }

      return true;
    });

    const castleRig = scaleCastleUp(pitch, topmostCastleParts);
    root.updateMatrixWorld(true);

    if (camera) {
      if (sky) {
        pushSkyBack(camera, sky);
      }

      if (rocks) {
        fitRocksToFrame(camera, rocks);
      }
    }

    // Every debug-adjustable object records its own post-fit rest state, so
    // the designer panel's offsets and (for the sky's scale) the per-frame
    // scroll animation can both layer on top without fighting each other.
    if (castleRig) captureBaseTransform(castleRig);
    if (towers) captureBaseTransform(towers);
    if (sky) captureBaseTransform(sky);
    if (rocks) captureBaseTransform(rocks);

    root.userData.__castleRig = castleRig;
  }

  const castleRig = (root.userData.__castleRig as THREE.Group | undefined) ?? null;

  return {
    castleRig,
    pitch,
    rocks,
    sky,
    skyBaseScale: getBaseTransform(sky)?.scale ?? null,
    towersGroup: towers,
  };
}

/** One animation step: sky zoom and castle/tower pitch. */
function animateVortexRig(
  rig: VortexRig,
  scroll: number,
  pointer: THREE.Vector2,
  skyZoomOffset: number,
) {
  const { pitch, sky, skyBaseScale } = rig;

  // Clouds: rest zoomed-in, zooming out as the user scrolls — the release
  // is quadratic so most of it lands early in the scroll. skyZoomOffset is
  // the debug panel's multiplier (1 = no change), layered on top.
  if (sky && skyBaseScale) {
    const settle = 1 - Math.min(Math.abs(scroll), 1);
    const zoom = (1 + SKY_ZOOM * settle * settle) * skyZoomOffset;

    sky.scale.set(skyBaseScale.x * zoom, skyBaseScale.y * zoom, skyBaseScale.z * zoom);
  }

  // Castle + towers: scroll pitches them back; the pointer adds a gentle
  // look-around on top.
  pitch.rotation.x = scroll * SCROLL_PITCH_RAD - pointer.y * POINTER_PITCH_RAD;
  pitch.rotation.y = pointer.x * POINTER_YAW_RAD;
}

interface VortexSceneProps {
  guiRootRef: MutableRefObject<HTMLDivElement | null>;
  invalidateRef: MutableRefObject<() => void>;
  pointerEnabled: boolean;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  sceneUrl: string;
  scrollTarget: MutableRefObject<number>;
  showGui: boolean;
}

/** How close the damped values must be to their targets to stop rendering. */
const SETTLE_EPSILON = 0.0006;

function VortexScene({
  guiRootRef,
  invalidateRef,
  pointerEnabled,
  pointerTarget,
  sceneUrl,
  scrollTarget,
  showGui,
}: VortexSceneProps) {
  const gltf = useGLTF(sceneUrl, dracoDecoderPath) as unknown as LoadedVortexScene;
  const set = useThree((state) => state.set);
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const scrollSmoothRef = useRef(0);
  const pointerSmoothRef = useRef(new THREE.Vector2());
  const debugOffsetsRef = useRef(createDebugOffsets());

  const authoredCamera = useMemo(() => prepareAuthoredCamera(gltf), [gltf]);
  const rig = useMemo(
    () => buildVortexRig(gltf, sceneUrl, authoredCamera),
    [authoredCamera, gltf, sceneUrl],
  );

  useLayoutEffect(() => {
    if (!authoredCamera) {
      console.warn('[CastleScene] no camera found in', sceneUrl, '— using the default camera.');
      return;
    }

    set({ camera: authoredCamera });
  }, [authoredCamera, sceneUrl, set]);

  // Re-fit the authored framing whenever the canvas changes size.
  useLayoutEffect(() => {
    if (!authoredCamera) {
      return;
    }

    applyCoverFraming(authoredCamera, size.width / Math.max(size.height, 1));
    invalidate();
  }, [authoredCamera, invalidate, size]);

  // Let the page-level input listeners wake the demand-rendered canvas.
  useLayoutEffect(() => {
    invalidateRef.current = invalidate;
    invalidate();

    return () => {
      invalidateRef.current = () => {};
    };
  }, [invalidate, invalidateRef]);

  // Designer positioning panel: live-adjustable offsets on top of the
  // authored/fitted rest state, so a Figma comparison can be dialed in
  // without touching code. Only mounted on the debug route.
  useEffect(() => {
    if (!showGui || !guiRootRef.current) {
      return undefined;
    }

    let disposed = false;
    let gui: GUI | null = null;

    void import('lil-gui').then(({ default: GUI }) => {
      if (disposed || !guiRootRef.current) {
        return;
      }

      guiRootRef.current.replaceChildren();
      gui = new GUI({ container: guiRootRef.current, title: 'Castle Scene — Designer Controls' });

      const offsets = debugOffsetsRef.current;
      const reapply = () => {
        applyDebugOffsets(rig, authoredCamera, offsets);
        invalidate();
      };

      const cameraFolder = gui.addFolder('Camera');
      cameraFolder.add(offsets.camera, 'x', -10, 10, 0.01).name('Position X').onChange(reapply);
      cameraFolder.add(offsets.camera, 'y', -10, 10, 0.01).name('Position Y').onChange(reapply);
      cameraFolder.add(offsets.camera, 'z', -10, 10, 0.01).name('Position Z').onChange(reapply);
      cameraFolder.add(offsets.camera, 'fov', -30, 30, 0.1).name('FOV Offset').onChange(reapply);

      const castleFolder = gui.addFolder('Castle');
      castleFolder.add(offsets.castle, 'x', -5, 5, 0.01).name('Position X').onChange(reapply);
      castleFolder.add(offsets.castle, 'y', -5, 5, 0.01).name('Position Y').onChange(reapply);
      castleFolder.add(offsets.castle, 'z', -5, 5, 0.01).name('Position Z').onChange(reapply);
      castleFolder.add(offsets.castle, 'rx', -45, 45, 0.5).name('Rotation X°').onChange(reapply);
      castleFolder.add(offsets.castle, 'ry', -45, 45, 0.5).name('Rotation Y°').onChange(reapply);
      castleFolder.add(offsets.castle, 'rz', -45, 45, 0.5).name('Rotation Z°').onChange(reapply);
      castleFolder.add(offsets.castle, 'scale', 0.2, 3, 0.01).name('Scale ×').onChange(reapply);

      const towersFolder = gui.addFolder('Towers');
      towersFolder.add(offsets.towers, 'x', -5, 5, 0.01).name('Position X').onChange(reapply);
      towersFolder.add(offsets.towers, 'y', -5, 5, 0.01).name('Position Y').onChange(reapply);
      towersFolder.add(offsets.towers, 'z', -5, 5, 0.01).name('Position Z').onChange(reapply);
      towersFolder.add(offsets.towers, 'rx', -45, 45, 0.5).name('Rotation X°').onChange(reapply);
      towersFolder.add(offsets.towers, 'ry', -45, 45, 0.5).name('Rotation Y°').onChange(reapply);
      towersFolder.add(offsets.towers, 'rz', -45, 45, 0.5).name('Rotation Z°').onChange(reapply);
      towersFolder.add(offsets.towers, 'scale', 0.2, 3, 0.01).name('Scale ×').onChange(reapply);

      const skyFolder = gui.addFolder('Sky');
      skyFolder.add(offsets.sky, 'x', -20, 20, 0.1).name('Position X').onChange(reapply);
      skyFolder.add(offsets.sky, 'y', -20, 20, 0.1).name('Position Y').onChange(reapply);
      skyFolder.add(offsets.sky, 'z', -20, 20, 0.1).name('Position Z').onChange(reapply);
      skyFolder.add(offsets.sky, 'scale', 0.3, 3, 0.01).name('Scale ×').onChange(reapply);

      const rocksFolder = gui.addFolder('Rocks');
      rocksFolder.add(offsets.rocks, 'x', -5, 5, 0.01).name('Position X').onChange(reapply);
      rocksFolder.add(offsets.rocks, 'y', -5, 5, 0.01).name('Position Y').onChange(reapply);
      rocksFolder.add(offsets.rocks, 'z', -5, 5, 0.01).name('Position Z').onChange(reapply);
      rocksFolder.add(offsets.rocks, 'scale', 0.3, 3, 0.01).name('Scale ×').onChange(reapply);

      gui
        .add(
          {
            logValues: () => {
              console.log('[CastleScene] designer offsets:', JSON.stringify(offsets, null, 2));
            },
          },
          'logValues',
        )
        .name('Log Values to Console');

      gui
        .add(
          {
            reset: () => {
              Object.assign(offsets, createDebugOffsets());
              gui?.controllersRecursive().forEach((controller) => controller.updateDisplay());
              reapply();
            },
          },
          'reset',
        )
        .name('Reset All');

      if (disposed) {
        gui.destroy();
      }
    });

    return () => {
      disposed = true;
      gui?.destroy();
    };
  }, [authoredCamera, guiRootRef, invalidate, rig, showGui]);

  useFrame((_state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const pointer = pointerSmoothRef.current;
    const pointerX = pointerEnabled ? pointerTarget.current.x : 0;
    const pointerY = pointerEnabled ? pointerTarget.current.y : 0;

    pointer.x = THREE.MathUtils.damp(pointer.x, pointerX, 4, dt);
    pointer.y = THREE.MathUtils.damp(pointer.y, pointerY, 4, dt);
    scrollSmoothRef.current = THREE.MathUtils.damp(
      scrollSmoothRef.current,
      scrollTarget.current,
      2.2,
      dt,
    );

    animateVortexRig(rig, scrollSmoothRef.current, pointer, debugOffsetsRef.current.sky.scale);

    // Keep frames coming until every damped value has settled on its target.
    const settled =
      Math.abs(scrollSmoothRef.current - scrollTarget.current) < SETTLE_EPSILON &&
      Math.abs(pointer.x - pointerX) < SETTLE_EPSILON &&
      Math.abs(pointer.y - pointerY) < SETTLE_EPSILON;

    if (!settled) {
      invalidate();
    }
  });

  return <primitive object={gltf.scene} />;
}

export function CastleScene({
  castleModelUrl = '',
  modelUrl = '',
  animationEnabled = true,
  showGui = false,
}: CastleSceneProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const pointerTarget = useRef(new THREE.Vector2());
  const scrollTarget = useRef(0);
  const invalidateRef = useRef<() => void>(() => {});
  const guiRootRef = useRef<HTMLDivElement>(null);
  // Demand rendering: frames are only drawn while an input or a damped value
  // is still moving, and never while the section is far off-screen.
  const [frameloop, setFrameloop] = useState<'demand' | 'never'>('demand');

  const resolvedSceneUrl =
    toText(castleModelUrl).trim() || toText(modelUrl).trim() || defaultVortexSceneUrl;

  useEffect(() => {
    useGLTF.preload(resolvedSceneUrl, dracoDecoderPath);
  }, [resolvedSceneUrl]);

  useEffect(() => {
    const element = sectionRef.current;

    if (!element) {
      return undefined;
    }

    const resetPointer = () => {
      pointerTarget.current.set(0, 0);
      invalidateRef.current();
    };

    const updatePointer = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      // In Webflow embeds the section reports height:0 even though it fills
      // the viewport, so fall back to window dimensions when that happens.
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
      invalidateRef.current();
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
      invalidateRef.current();
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
    const element = sectionRef.current;

    if (!element) {
      return undefined;
    }

    const updateScroll = () => {
      const rect = element.getBoundingClientRect();
      const viewportHeight = window.innerHeight || 1;
      // Hidden Webflow wrappers report height 0; treat them as one viewport tall.
      const height = rect.height >= 2 ? rect.height : viewportHeight;
      const enter = THREE.MathUtils.clamp(rect.top / viewportHeight, 0, 1);
      const exit = THREE.MathUtils.clamp(-rect.top / height, 0, 1);

      scrollTarget.current = exit - enter;
      invalidateRef.current();
    };

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateScroll);
    };
  }, []);

  // Sleep the render loop entirely while the scene is far off-screen.
  useEffect(() => {
    const element = sectionRef.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];

        if (entry) {
          setFrameloop(entry.isIntersecting ? 'demand' : 'never');

          if (entry.isIntersecting) {
            invalidateRef.current();
          }
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <section className="castle-scene-shell" ref={sectionRef}>
      <div
        className="castle-scene-viewport"
        style={{
          zIndex: 2,
        }}
      >
        <Canvas
          dpr={[1, 1.25]}
          // No tone mapping: render the GLB's authored colours exactly like a
          // vanilla three.js renderer would.
          flat
          frameloop={frameloop}
          gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', stencil: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); }, false);
          }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <VortexScene
            key={resolvedSceneUrl}
            guiRootRef={guiRootRef}
            invalidateRef={invalidateRef}
            pointerEnabled={animationEnabled}
            pointerTarget={pointerTarget}
            sceneUrl={resolvedSceneUrl}
            scrollTarget={scrollTarget}
            showGui={showGui}
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

export default CastleScene;
