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

/** How quickly the smoothed scroll value chases the raw scroll position —
    higher tracks the actual scroll more tightly (less lag), lower trails
    behind it for longer (a more syrupy, delayed feel). */
const SCROLL_DAMP_RATE = 8;

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

/**
 * Designer-tuned adjustment on top of the pivot-scaled castle, dialed in via
 * the debug positioning panel and baked in as the permanent framing. Applied
 * in the castle's own pitch-local space (same space the debug panel's castle
 * offsets use), after the castle parts are pivot-scaled — the whole
 * composition-fitting system (applyCoverFraming) keeps this framing
 * consistent across every aspect ratio, the same way CASTLE_SCALE already
 * does, so no extra per-viewport handling is needed here.
 *
 * Y is set lower than the designer's original 0.08 so the castle's base
 * consistently sinks behind the rocks billboard instead of leaving a gap
 * above it — the rocks stay exactly where they are (camera-pinned per
 * fitRocksAsCameraBillboard); only the castle moved to tuck behind them.
 * The rocks silhouette isn't a flat line (it dips lower in the middle,
 * around the entrance, and rises higher at the edges), so this value is
 * the smallest downward shift that still clears the gap at every point
 * across the width, on every viewport tested — any less and a gap
 * reappears at the tallest part of the rocks on narrow/tall screens; any
 * more needlessly buries the entrance where the rocks are already low.
 */
const CASTLE_POSITION_OFFSET = new THREE.Vector3(1.3, -0.32, 0);
const CASTLE_ROTATION_OFFSET_DEG = { x: 0, y: -30, z: 2 };
const CASTLE_SCALE_MULTIPLIER = 0.9;

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
  animationEnabled?: boolean;
  castleModelUrl?: string;
  /** @deprecated use castleModelUrl */
  modelUrl?: string;
  showGui?: boolean;
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

/**
 * Candidate elements that might carry the section's true, scrollable height.
 * Inside a Webflow code-island the component's own <section> (sectionRef) is
 * rendered in a shadow root and often reports height 0 — so we also consider
 * the shadow host (the <code-island> element) and its Webflow wrapper. Rendered
 * normally (local dev, no shadow root) the list is just the element itself.
 */
function sectionHeightCandidates(element: HTMLElement): Element[] {
  const candidates: Element[] = [element];
  const root = element.getRootNode();

  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    candidates.push(root.host);

    const wrapper = root.host.parentElement;

    if (wrapper && wrapper !== document.body && wrapper !== document.documentElement) {
      candidates.push(wrapper);
    }
  }

  return candidates;
}

/**
 * The section's scroll box: its top offset and its REAL height. A zero-height
 * shell (the Webflow shadow-DOM case) would otherwise fall back to a single
 * viewport, collapsing the scroll animation into the first screenful and
 * freezing it for the rest of a taller section. Picking the tallest candidate
 * box is self-correcting — it uses the element that actually has the height,
 * whether that's the section itself (local) or the Webflow wrapper (embed).
 */
function resolveScrollBox(element: HTMLElement): { top: number; height: number } {
  let best = element.getBoundingClientRect();

  sectionHeightCandidates(element).forEach((candidate) => {
    const rect = candidate.getBoundingClientRect();

    if (rect.height > best.height) {
      best = rect;
    }
  });

  const viewportHeight = window.innerHeight || 1;

  return { top: best.top, height: best.height >= 2 ? best.height : viewportHeight };
}

/**
 * The element to hand the IntersectionObserver. It must be chosen
 * DETERMINISTICALLY (not by measured height, which is 0 at mount before
 * layout), or the observer ends up watching the zero-height shadow shell —
 * which browsers treat unreliably and flip to "not intersecting" partway down,
 * sleeping the on-demand render loop and freezing the picture mid-section.
 * Inside a Webflow code-island, watch the real section wrapper; otherwise the
 * element itself.
 */
function resolveObserveTarget(element: HTMLElement): Element {
  const root = element.getRootNode();

  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    const wrapper = root.host.parentElement;

    if (wrapper && wrapper !== document.body && wrapper !== document.documentElement) {
      return wrapper;
    }

    return root.host;
  }

  return element;
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

function forEachMaterial(
  object: THREE.Object3D | null,
  visit: (material: THREE.MeshStandardMaterial) => void,
) {
  const mesh = object as THREE.Mesh | null;

  if (!mesh?.isMesh) {
    return;
  }

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  materials.forEach((material) => {
    visit(material as THREE.MeshStandardMaterial);
  });
}

/** The vortex sky and the rocks are pure emission planes (buildVortexRig
    zeroes their lit base colour), so their emissiveIntensity IS their
    brightness — the one dial that can fade them up out of the flash. */
function captureEmissiveBase(object: THREE.Object3D | null) {
  forEachMaterial(object, (material) => {
    if (material.userData.__baseEmissiveIntensity === undefined) {
      material.userData.__baseEmissiveIntensity = material.emissiveIntensity;
    }
  });
}

function setEmissiveScale(object: THREE.Object3D | null, scale: number) {
  forEachMaterial(object, (material) => {
    const base = material.userData.__baseEmissiveIntensity as number | undefined;

    if (base !== undefined) {
      material.emissiveIntensity = base * scale;
    }
  });
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
  /** The cathedral body — the castle's broad, low mass. */
  cathedral: THREE.Object3D | null;
  fill: THREE.HemisphereLight | null;
  /** The tall spire behind the cathedral. */
  keepTower: THREE.Object3D | null;
  pitch: THREE.Group;
  rocks: THREE.Object3D | null;
  sky: THREE.Object3D | null;
  sun: THREE.DirectionalLight | null;
  towerLeft: THREE.Object3D | null;
  towerRight: THREE.Object3D | null;
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
    // The intro moves the camera off its mark, so its rest orientation has
    // to be read from here rather than from the live transform — otherwise a
    // reveal starting while another is still running would take the offset
    // pose for the authored one and drift.
    camera.userData.__authoredQuaternion = camera.quaternion.clone();
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
 * Project one world-space point through the camera into NDC (x/y in
 * roughly [-1, 1] when on-screen). Returns null for points at or behind the
 * camera, where a raw projection is meaningless (it would mirror to the
 * wrong side instead of correctly reporting "not visible this way").
 */
function projectToNdc(camera: THREE.PerspectiveCamera, toCameraSpace: THREE.Matrix4, point: THREE.Vector3) {
  const cameraSpacePoint = point.clone().applyMatrix4(toCameraSpace);

  if (cameraSpacePoint.z >= -1e-4) {
    return null;
  }

  const ndc = point.clone().project(camera);

  return { x: ndc.x, y: ndc.y };
}

/**
 * Measure an object's actual on-screen NDC bounding box by projecting all
 * 8 corners of its world-space AABB through the camera's real projection.
 * Unlike a fixed-depth approximation, this is correct for a plane tilted at
 * a steep angle to the camera, where the near and far edges can sit at
 * wildly different true depths (this scene's sky/rocks backdrops are
 * tilted ~40°, and part of their bounding box can even fall behind the
 * camera — a single "average depth" is meaningless there).
 */
function measureNdcCoverage(camera: THREE.PerspectiveCamera, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);

  if (box.isEmpty()) {
    return null;
  }

  const toCameraSpace = new THREE.Matrix4().copy(camera.matrixWorld).invert();
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let visible = 0;

  corners.forEach((corner) => {
    const ndc = projectToNdc(camera, toCameraSpace, corner);

    if (!ndc) {
      return;
    }

    visible += 1;
    minX = Math.min(minX, ndc.x);
    maxX = Math.max(maxX, ndc.x);
    minY = Math.min(minY, ndc.y);
    maxY = Math.max(maxY, ndc.y);
  });

  return visible > 0 ? { minX, maxX, minY, maxY } : null;
}

/**
 * Scale `object` uniformly about its own AABB centre rather than its local
 * origin. A plain `object.scale.multiplyScalar` scales about whatever the
 * mesh's authored pivot happens to be; holding the AABB centre fixed instead
 * keeps growth symmetric regardless of where that pivot sits.
 */
function scaleAboutOwnCenter(object: THREE.Object3D, factor: number) {
  const box = new THREE.Box3().setFromObject(object);

  if (box.isEmpty()) {
    object.scale.multiplyScalar(factor);
    object.updateMatrixWorld(true);
    return;
  }

  const centerWorld = box.getCenter(new THREE.Vector3());
  const centerParent = object.parent ? object.parent.worldToLocal(centerWorld) : centerWorld;

  // Keeping centerParent fixed while scale multiplies by `factor` requires
  // position' = centerParent * (1 - factor) + position * factor (derived
  // from how a local-space point maps through position + scale*point).
  object.position.copy(
    centerParent.multiplyScalar(1 - factor).add(object.position.clone().multiplyScalar(factor)),
  );
  object.scale.multiplyScalar(factor);
  object.updateMatrixWorld(true);
}

/**
 * Grow `object`'s scale (about its own AABB centre, via scaleAboutOwnCenter)
 * until its projected NDC footprint covers at least [-bleed, bleed] in both
 * axes. Iterative rather than solved directly, since perspective projection
 * makes "how much scale closes this NDC gap" depend on where the object
 * currently sits — but it converges in a handful of steps and is correct
 * regardless of tilt, whereas a single-shot depth-based estimate is not (see
 * above).
 */
function growToFullNdcCoverage(camera: THREE.PerspectiveCamera, object: THREE.Object3D, bleed: number) {
  const MAX_ITERATIONS = 40;

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const coverage = measureNdcCoverage(camera, object);

    if (coverage) {
      const xOk = coverage.minX <= -bleed && coverage.maxX >= bleed;
      const yOk = coverage.minY <= -bleed && coverage.maxY >= bleed;

      if (xOk && yOk) {
        return;
      }
    }

    if (!coverage) {
      // Nothing currently projects in front of the camera — grow blindly
      // until some part of the plane comes into view to measure against.
      scaleAboutOwnCenter(object, 2);
      continue;
    }

    const spanX = coverage.maxX - coverage.minX;
    const spanY = coverage.maxY - coverage.minY;
    const neededSpan = 2 * bleed;
    const growX = spanX > 1e-6 ? neededSpan / spanX : 2;
    const growY = spanY > 1e-6 ? neededSpan / spanY : 2;
    const grow = Math.max(growX, growY, 1.05) * 1.05;

    scaleAboutOwnCenter(object, grow);
  }

  console.warn('[CastleScene] growToFullNdcCoverage did not converge — the object may still leave a gap.');
}

/**
 * Reset an object to its pristine authored local position/scale, capturing
 * that baseline the first time it's called. pushSkyBack re-runs on every
 * resize (a fit sized for one aspect ratio can leave a gap on a narrower
 * one), and without this reset each re-run would compound on top of the
 * PREVIOUS fit's already-adjusted position/scale instead of recomputing
 * fresh from the design.
 */
function resetToAuthoredLocal(object: THREE.Object3D) {
  if (!object.userData.__authoredLocal) {
    object.userData.__authoredLocal = {
      position: object.position.clone(),
      scale: object.scale.clone(),
    };
  }

  const authored = object.userData.__authoredLocal as { position: THREE.Vector3; scale: THREE.Vector3 };

  object.position.copy(authored.position);
  object.scale.copy(authored.scale);
  object.updateMatrixWorld(true);
}

/**
 * Push the backdrop away from the camera along its view ray, then grow it
 * (via growToFullNdcCoverage) to the minimum size that still covers the
 * entire frame at that new distance. A flat backdrop's apparent size
 * depends only on scale-to-distance ratio, not distance alone — oversizing
 * it while pushing it back is invisible (or reads as zooming in), so this
 * always lands on the least "zoomed" size that leaves no gap, which is the
 * most convincingly distant result.
 *
 * Re-run this on every resize (via refitFrameDependentLayers), since a fit
 * sized for one aspect ratio can leave a gap on another.
 */
function pushSkyBack(camera: THREE.PerspectiveCamera, sky: THREE.Object3D) {
  resetToAuthoredLocal(sky);

  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const skyPosition = sky.getWorldPosition(new THREE.Vector3());
  const currentDistance = skyPosition.distanceTo(cameraPosition);

  if (currentDistance <= 0) {
    return;
  }

  const direction = skyPosition.clone().sub(cameraPosition).normalize();
  const targetWorld = cameraPosition.clone().add(direction.multiplyScalar(currentDistance * SKY_PUSH));

  sky.parent?.worldToLocal(targetWorld);
  sky.position.copy(targetWorld);
  sky.updateMatrixWorld(true);

  growToFullNdcCoverage(camera, sky, SKY_COVER_BLEED);
}

/**
 * The rocks are pinned to the CAMERA rather than fit within the scene: a
 * flat, camera-facing billboard at a fixed distance in front of the lens,
 * closed-form sized/positioned every resize instead of iteratively fit.
 *
 * The scene-space approach (growing/shifting the authored, ~40°-tilted
 * plane to hit NDC targets) had two problems that this sidesteps entirely:
 * it could only ever rest the plane's bottom edge at the frame's bottom for
 * ONE specific camera distance/tilt combination, and closing that fit's
 * remaining NDC gap via a world-space shift measurably changed the plane's
 * OWN depth (because "camera up" has a world-Z component once the camera is
 * pitched), which could push it in front of castle geometry it should sit
 * behind. A camera-attached billboard has neither issue: its position is
 * always exactly "this far in front of the lens," so it's always flush
 * with the bottom of frame regardless of scroll/pitch/FOV changes, and
 * staying reliably closer to the camera than any castle geometry keeps
 * normal depth-testing correct (never wrongly hidden, never bleeding over
 * things it shouldn't).
 */
const ROCKS_CAMERA_DISTANCE = 2;
const ROCKS_BILLBOARD_BLEED = 1.04;

function attachRocksToCamera(camera: THREE.PerspectiveCamera, rocks: THREE.Object3D) {
  if (rocks.parent === camera) {
    return;
  }

  camera.attach(rocks);
  rocks.rotation.set(0, 0, 0);
}

function fitRocksAsCameraBillboard(camera: THREE.PerspectiveCamera, rocks: THREE.Object3D) {
  attachRocksToCamera(camera, rocks);

  const mesh = rocks as THREE.Mesh;

  if (!mesh.isMesh) {
    return;
  }

  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;

  if (!box) {
    return;
  }

  const halfExtentX = (box.max.x - box.min.x) / 2;
  const halfExtentY = (box.max.y - box.min.y) / 2;

  if (halfExtentX <= 0 || halfExtentY <= 0) {
    return;
  }

  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const halfHeightAtDistance = Math.tan(vfov / 2) * ROCKS_CAMERA_DISTANCE;
  const halfWidthAtDistance = halfHeightAtDistance * camera.aspect;

  // Uniform scale (preserves the silhouette's own aspect ratio) sized to
  // just cover the frame's width at this fixed distance.
  const scale = (ROCKS_BILLBOARD_BLEED * halfWidthAtDistance) / halfExtentX;

  rocks.scale.setScalar(scale);
  // Position so the geometry's bottom edge (local y = -halfExtentY) lands
  // slightly past the frustum's true bottom, for a safety overlap rather
  // than a hairline gap.
  rocks.position.set(0, scale * halfExtentY - ROCKS_BILLBOARD_BLEED * halfHeightAtDistance, -ROCKS_CAMERA_DISTANCE);
  rocks.updateMatrixWorld(true);
}

/**
 * Re-fit the sky and rocks to the camera's current frustum. Called once at
 * first build and again on every resize/orientation change (via
 * applyCoverFraming's effect), since a fit sized for one aspect ratio can
 * leave a gap or crop on another. Re-captures their base transform each
 * time so the designer panel's offsets keep layering on the latest fit.
 */
function refitFrameDependentLayers(rig: VortexRig, camera: THREE.PerspectiveCamera | null) {
  if (!camera) {
    return;
  }

  if (rig.sky) {
    pushSkyBack(camera, rig.sky);
    captureBaseTransform(rig.sky);
  }

  if (rig.rocks) {
    fitRocksAsCameraBillboard(camera, rig.rocks);
    captureBaseTransform(rig.rocks);
  }
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

  // attach() fixes each part's world position at THIS moment, so the pivot
  // scale/offset/rotation below must come after — changing castleRig's own
  // transform now moves the whole attached group rigidly, whereas changing
  // it beforehand would just have attach() cancel the offset back out.
  castleRig.scale.setScalar(CASTLE_SCALE * CASTLE_SCALE_MULTIPLIER);
  castleRig.position.add(CASTLE_POSITION_OFFSET);
  castleRig.rotation.set(
    THREE.MathUtils.degToRad(CASTLE_ROTATION_OFFSET_DEG.x),
    THREE.MathUtils.degToRad(CASTLE_ROTATION_OFFSET_DEG.y),
    THREE.MathUtils.degToRad(CASTLE_ROTATION_OFFSET_DEG.z),
  );

  return castleRig;
}

/**
 * The whole castle scene lives in one authored GLB: castle + towers
 * (GRP_Towers), Foreground_Rocks, Backdrop_VortexSky, Light_Sun and
 * Camera_Main. The castle and towers are re-parented into a pitch rig so
 * they can rear up on scroll without taking the sky, rocks, camera or
 * light with them. The scroll animation leaves the rocks exactly where the
 * file authors them; only the intro reveal moves them. useGLTF caches the
 * scene per URL, so the restructure and the animation baselines are only
 * ever captured once.
 */
function buildVortexRig(gltf: LoadedVortexScene, sceneUrl: string): VortexRig {
  const root = gltf.scene;
  const sky = root.getObjectByName('Backdrop_VortexSky') ?? null;
  const rocks = root.getObjectByName('Foreground_Rocks') ?? null;
  const towers = root.getObjectByName('GRP_Towers') ?? null;
  // Individually addressable so the intro can stagger them; every one of
  // them is optional, and a missing node simply drops out of the reveal.
  const cathedral = root.getObjectByName('Castle_Cathedral') ?? null;
  const keepTower = root.getObjectByName('Castle_KeepTower') ?? null;
  const towerLeft = root.getObjectByName('Tower_Left') ?? null;
  const towerRight = root.getObjectByName('Tower_Right') ?? null;
  const sun = (root.getObjectByName('Light_Sun') ?? null) as THREE.DirectionalLight | null;

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

    // Grow the castle body about its own base — a one-time structural fit,
    // independent of the scroll/pointer animation. The sky push-back and
    // rocks frame-fit are viewport-dependent (they must re-run on resize),
    // so they happen separately in refitFrameDependentLayers instead.
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

    // Every debug-adjustable object records its own post-fit rest state, so
    // the designer panel's offsets and (for the sky's scale) the per-frame
    // scroll animation can both layer on top without fighting each other.
    if (castleRig) captureBaseTransform(castleRig);
    if (towers) captureBaseTransform(towers);

    // The intro's own targets. These must be captured AFTER scaleCastleUp:
    // attach() rewrites each part's local transform to preserve its world
    // position, so a baseline read before the re-parent would be the wrong
    // rest state to animate back to.
    [cathedral, keepTower, towerLeft, towerRight, sun].forEach((object) => {
      if (object) captureBaseTransform(object);
    });
    captureEmissiveBase(sky);
    captureEmissiveBase(rocks);

    if (sun) sun.userData.__baseIntensity = sun.intensity;
    fillLight.userData.__baseIntensity = fillLight.intensity;

    root.userData.__castleRig = castleRig;
    root.userData.__fillLight = fillLight;
  }

  const castleRig = (root.userData.__castleRig as THREE.Group | undefined) ?? null;
  const fill = (root.userData.__fillLight as THREE.HemisphereLight | undefined) ?? null;

  return {
    castleRig,
    cathedral,
    fill,
    keepTower,
    pitch,
    rocks,
    sky,
    sun,
    towerLeft,
    towerRight,
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
  const { pitch, sky } = rig;
  // Read live rather than caching at rig-construction time: the sky's base
  // transform isn't captured until refitFrameDependentLayers runs (after the
  // initial camera fit), so a value captured earlier would always be stale
  // null and permanently disable this animation.
  const skyBaseScale = sky ? getBaseTransform(sky)?.scale ?? null : null;

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

/* ============================================================
   INTRO — the "Start Experience" reveal
   ============================================================

   The page script (webflow/blackletter-page.js) tears a paper curtain open
   over the hero, then hands the screen to this section. At that instant the
   only thing on screen is the flat colour the curtain left behind, so the
   reveal opens on that exact colour and dissolves it off the lens — the cut
   between the two components is invisible, and what the viewer reads is one
   continuous move: a flash, then the world resolving out of it.

   Everything below layers ON TOP of the rest state the rig was fitted into,
   never replaces it:

     - nodes the per-frame animation already writes (the pitch rig's x/y
       rotation, the sky's scale) are ADDED to / MULTIPLIED by, after
       animateVortexRig has assigned them for this frame;
     - every other node is assigned base + offset(p), so at p = 1 the scene
       is bit-for-bit its authored rest state again and the intro can simply
       stop touching it.

   The pointer parallax is deliberately untouched: it rides on the same pitch
   rig and keeps working, at full strength, throughout the reveal.
*/

/** Fired by the page script the moment the curtain hands over the screen. */
const INTRO_EVENT = 'blackletter:enter-experience';

/** The page also parks the same detail here, so an island that finished
    mounting a few frames late still catches the reveal it just missed. */
const INTRO_STATE_KEY = '__blackletterEnterExperience';
const INTRO_LATE_MOUNT_MS = 2000;

const INTRO_DURATION = 4.2;

/** Matches --paper-color-two, the colour the curtain leaves on screen. */
const INTRO_FLASH_COLOR = '#ffffff';
const INTRO_FLASH_NAME = 'IntroFlash';
const INTRO_FLASH_DISTANCE = 0.35;
const INTRO_FLASH_BLEED = 1.06;

/**
 * The reveal as a score: [start, end] windows in normalised intro time.
 * Read top to bottom it is the running order — the vortex and the light
 * establish the world, the castle rises out from behind the rocks, the
 * flanking towers sweep in to frame it, and the foreground rocks settle
 * last, because the nearest thing in a real camera move always arrives late.
 */
const INTRO_SCORE = {
  /** The curtain's leftover colour dissolving off the lens. */
  flash: [0, 0.14],
  /** Vortex: over-scaled and slowly unwinding back to rest. */
  sky: [0, 0.95],
  /** Vortex emission cooling down out of the flash. */
  skyGlow: [0, 0.34],
  /** Sun: blown out, settling to the authored key light. */
  sunGlow: [0.02, 0.55],
  /** Sun: the shadow raking across the stone as the light swings home. */
  sunSwing: [0, 0.85],
  fill: [0, 0.5],
  /** The whole castle + towers rig swinging up out of its lean. */
  swing: [0, 0.9],
  castle: [0.04, 0.72],
  cathedral: [0.06, 0.62],
  keep: [0.12, 0.78],
  towers: [0.1, 0.8],
  towerLeft: [0.12, 0.7],
  towerRight: [0.17, 0.75],
  camera: [0, 0.92],
  rocks: [0.14, 1],
  rocksGlow: [0.05, 0.5],
} as const;

/**
 * Amplitudes. Distances are fractions of the thing they move — of the
 * castle's own height, of the towers' half-width, of the camera-to-castle
 * distance — measured live in measureIntro, so the reveal keeps its
 * proportions on any authored GLB the designer points the component at
 * rather than being tied to one file's units.
 */
const INTRO_AMOUNT = {
  cameraDolly: 0.16,
  cameraLift: 0.05,
  cameraPitchDeg: 1.6,
  cameraRollDeg: 0.9,
  skyZoom: 0.3,
  skyRollDeg: 2.6,
  skyGlow: 1.55,
  sunGlow: 1.85,
  sunSwingXDeg: 4.5,
  sunSwingYDeg: -6,
  fillGlow: 2.4,
  swingPitchRad: 0.085,
  swingYawRad: 0.05,
  swingRollRad: 0.022,
  castleRise: 0.3,
  castleScale: 0.9,
  castleYawDeg: 9,
  cathedralRise: 0.16,
  keepRise: 0.26,
  keepStretch: 1.07,
  towerRise: 0.2,
  towerSpread: 0.14,
  towerLeanDeg: 3.5,
  rocksDrop: 0.16,
  rocksZoom: 1.07,
  rocksGlow: 0.25,
} as const;

type IntroWindow = readonly [number, number];

/** Progress through one window of the score, clamped to [0, 1]. */
function span(p: number, window: IntroWindow) {
  const [start, end] = window;

  return THREE.MathUtils.clamp((p - start) / Math.max(end - start, 1e-6), 0, 1);
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

function easeOutExpo(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Interpolates from `from` down to 1 as `eased` runs 0 → 1. */
function settleTo1(from: number, eased: number) {
  return from + (1 - from) * eased;
}

interface IntroPlan {
  cameraDolly: number;
  cameraForward: THREE.Vector3;
  cameraLift: number;
  cameraPosition: THREE.Vector3;
  cameraQuaternion: THREE.Quaternion;
  cameraUp: THREE.Vector3;
  castleRise: number;
  cathedralRise: number;
  keepRise: number;
  towerLeftSign: number;
  towerRightSign: number;
  towerRise: number;
  towerSpread: number;
}

const introScratch = {
  euler: new THREE.Euler(),
  quaternion: new THREE.Quaternion(),
  vector: new THREE.Vector3(),
};

/**
 * An object's size along one axis, expressed in its PARENT's units — the
 * space a local position offset actually moves it through. The world AABB is
 * divided back down by the parent's world scale, so a castle sitting under a
 * 1.35x-scaled rig still gets an offset that reads as "a third of its own
 * height" on screen.
 */
function localExtent(object: THREE.Object3D | null, axis: 'x' | 'y' | 'z') {
  if (!object) {
    return 0;
  }

  const box = new THREE.Box3().setFromObject(object);

  if (box.isEmpty()) {
    return 0;
  }

  const worldExtent = box.max[axis] - box.min[axis];
  const parentScale = object.parent
    ? Math.abs(object.parent.getWorldScale(introScratch.vector)[axis])
    : 1;

  return worldExtent / (parentScale || 1);
}

/**
 * Measure the scene once, at the moment the reveal starts, and turn the
 * fractional amplitudes above into real distances in each node's own local
 * space. Everything measured here is viewport-independent, so a resize
 * landing mid-reveal (the page fires a burst of them as the sections gain
 * their height) can't invalidate it — the sky and rocks re-fit and re-capture
 * their own baselines, which applyIntro re-reads every frame anyway.
 */
function measureIntro(rig: VortexRig, camera: THREE.PerspectiveCamera | null): IntroPlan {
  const castleHeight = localExtent(rig.castleRig, 'y');
  const towerHeight = localExtent(rig.towerLeft ?? rig.towerRight, 'y');
  const towersHalfWidth = localExtent(rig.towersGroup, 'x') / 2;

  const cameraPosition =
    (camera?.userData.__authoredPosition as THREE.Vector3 | undefined)?.clone() ??
    camera?.position.clone() ??
    new THREE.Vector3();
  const cameraQuaternion =
    (camera?.userData.__authoredQuaternion as THREE.Quaternion | undefined)?.clone() ??
    camera?.quaternion.clone() ??
    new THREE.Quaternion();
  // The camera's own axes, expressed in its parent's space — the space its
  // position lives in — so the dolly runs straight down the lens whatever
  // orientation the file authored it at.
  const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion);

  const castleWorld = rig.castleRig?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
  const cameraWorld = camera?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
  const castleDistance = castleWorld.distanceTo(cameraWorld) || 1;

  // Which way each flanking tower steps aside, taken from where it actually
  // sits in the group rather than from its name.
  const towersCenterX =
    ((rig.towerLeft?.position.x ?? 0) + (rig.towerRight?.position.x ?? 0)) / 2;
  const sideOf = (tower: THREE.Object3D | null, fallback: number) => {
    if (!tower) {
      return fallback;
    }

    return Math.sign(tower.position.x - towersCenterX) || fallback;
  };

  return {
    cameraDolly: castleDistance * INTRO_AMOUNT.cameraDolly,
    cameraForward,
    cameraLift: castleDistance * INTRO_AMOUNT.cameraLift,
    cameraPosition,
    cameraQuaternion,
    cameraUp,
    castleRise: castleHeight * INTRO_AMOUNT.castleRise,
    cathedralRise: localExtent(rig.cathedral, 'y') * INTRO_AMOUNT.cathedralRise,
    keepRise: localExtent(rig.keepTower, 'y') * INTRO_AMOUNT.keepRise,
    towerLeftSign: sideOf(rig.towerLeft, -1),
    towerRightSign: sideOf(rig.towerRight, 1),
    towerRise: towerHeight * INTRO_AMOUNT.towerRise,
    towerSpread: towersHalfWidth * INTRO_AMOUNT.towerSpread,
  };
}

/** The full-frame sheet the reveal opens on, parented to the camera so it
    covers the lens no matter where the dolly has taken it. */
function ensureIntroFlash(camera: THREE.PerspectiveCamera, color: string) {
  const existing = camera.getObjectByName(INTRO_FLASH_NAME) as THREE.Mesh | undefined;

  if (existing) {
    (existing.material as THREE.MeshBasicMaterial).color.set(color);
    existing.visible = true;

    return existing;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      transparent: true,
    }),
  );

  flash.name = INTRO_FLASH_NAME;
  // Nothing may cull or sort in front of it: it is the screen for a moment.
  flash.frustumCulled = false;
  flash.renderOrder = 999;
  camera.add(flash);

  return flash;
}

function removeIntroFlash(camera: THREE.PerspectiveCamera | null) {
  const flash = camera?.getObjectByName(INTRO_FLASH_NAME) as THREE.Mesh | undefined;

  if (!camera || !flash) {
    return;
  }

  camera.remove(flash);
  flash.geometry.dispose();
  (flash.material as THREE.Material).dispose();
}

/**
 * One frame of the reveal. Runs immediately after animateVortexRig, and is
 * a pure function of `p` — it never accumulates, so it can be driven forward,
 * restarted, or jumped straight to 1 (which restores the authored rest state
 * exactly, and is how the reveal ends).
 */
function applyIntro(
  rig: VortexRig,
  camera: THREE.PerspectiveCamera | null,
  plan: IntroPlan,
  p: number,
) {
  // Every camera displacement decays on a quintic; the backdrop's extra
  // coverage on a cubic over a slightly longer window. easeOutCubic(t) is
  // <= easeOutQuint(t) for all t, so the sky's margin always outlives the
  // motion that could swing a frame edge off it — the void behind the
  // backdrop can never show, at any point in the reveal.
  const cameraK = 1 - easeOutQuint(span(p, INTRO_SCORE.camera));
  const skyK = 1 - easeOutCubic(span(p, INTRO_SCORE.sky));

  /* ---------- camera: a slow push-in out of the flash ---------- */
  if (camera) {
    camera.position
      .copy(plan.cameraPosition)
      .addScaledVector(plan.cameraForward, -plan.cameraDolly * cameraK)
      .addScaledVector(plan.cameraUp, plan.cameraLift * cameraK);

    // A hair of tilt and roll, unwinding — the shot settling on its mark.
    introScratch.euler.set(
      THREE.MathUtils.degToRad(INTRO_AMOUNT.cameraPitchDeg) * cameraK,
      0,
      THREE.MathUtils.degToRad(INTRO_AMOUNT.cameraRollDeg) * cameraK,
    );
    camera.quaternion
      .copy(plan.cameraQuaternion)
      .multiply(introScratch.quaternion.setFromEuler(introScratch.euler));

    const flash = camera.getObjectByName(INTRO_FLASH_NAME) as THREE.Mesh | undefined;

    if (flash) {
      const opacity = 1 - easeInOutCubic(span(p, INTRO_SCORE.flash));
      const halfHeight =
        Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * INTRO_FLASH_DISTANCE;

      (flash.material as THREE.MeshBasicMaterial).opacity = opacity;
      flash.visible = opacity > 0.001;
      flash.position.set(0, 0, -INTRO_FLASH_DISTANCE);
      flash.scale.set(
        halfHeight * camera.aspect * 2 * INTRO_FLASH_BLEED,
        halfHeight * 2 * INTRO_FLASH_BLEED,
        1,
      );
    }
  }

  /* ---------- vortex: over-scaled, rolling, unwinding to rest ---------- */
  const skyBase = getBaseTransform(rig.sky);

  if (rig.sky && skyBase) {
    // Multiplied onto the scroll zoom animateVortexRig just wrote, so the
    // two compose instead of one clobbering the other.
    rig.sky.scale.multiplyScalar(1 + INTRO_AMOUNT.skyZoom * skyK);
    // The backdrop is a flat plane whose local +Z is its normal, so this is
    // a true in-plane roll: the vortex spinning down, not the plane tipping
    // out of frame.
    rig.sky.rotation.z =
      skyBase.rotation.z + THREE.MathUtils.degToRad(INTRO_AMOUNT.skyRollDeg) * skyK;
  }

  setEmissiveScale(
    rig.sky,
    settleTo1(INTRO_AMOUNT.skyGlow, easeOutCubic(span(p, INTRO_SCORE.skyGlow))),
  );

  /* ---------- light: blown out, then cooling and swinging home ---------- */
  if (rig.sun) {
    const base = rig.sun.userData.__baseIntensity as number | undefined;
    const sunBase = getBaseTransform(rig.sun);

    if (base !== undefined) {
      rig.sun.intensity =
        base * settleTo1(INTRO_AMOUNT.sunGlow, easeOutCubic(span(p, INTRO_SCORE.sunGlow)));
    }

    // glTF parents a directional light's target under the light itself, so
    // rotating the node IS the sun swinging across the sky.
    if (sunBase) {
      const swing = 1 - easeInOutCubic(span(p, INTRO_SCORE.sunSwing));

      rig.sun.rotation.set(
        sunBase.rotation.x + THREE.MathUtils.degToRad(INTRO_AMOUNT.sunSwingXDeg) * swing,
        sunBase.rotation.y + THREE.MathUtils.degToRad(INTRO_AMOUNT.sunSwingYDeg) * swing,
        sunBase.rotation.z,
      );
    }
  }

  if (rig.fill) {
    const base = rig.fill.userData.__baseIntensity as number | undefined;

    if (base !== undefined) {
      rig.fill.intensity =
        base * settleTo1(INTRO_AMOUNT.fillGlow, easeOutCubic(span(p, INTRO_SCORE.fill)));
    }
  }

  /* ---------- the rig swinging up out of its lean ----------
     x and y are re-assigned by animateVortexRig every frame (scroll +
     pointer), so the swing ADDS to them and the parallax keeps its full
     range; z is the intro's alone, and the rig is built at identity, so
     it is assigned outright. */
  const swing = 1 - easeOutExpo(span(p, INTRO_SCORE.swing));

  rig.pitch.rotation.x += INTRO_AMOUNT.swingPitchRad * swing;
  rig.pitch.rotation.y += INTRO_AMOUNT.swingYawRad * swing;
  rig.pitch.rotation.z = INTRO_AMOUNT.swingRollRad * swing;

  /* ---------- the castle rising from behind the rocks ---------- */
  const castleBase = getBaseTransform(rig.castleRig);

  if (rig.castleRig && castleBase) {
    const rise = 1 - easeOutExpo(span(p, INTRO_SCORE.castle));
    const scale = settleTo1(INTRO_AMOUNT.castleScale, easeOutQuint(span(p, INTRO_SCORE.castle)));

    rig.castleRig.position.set(
      castleBase.position.x,
      castleBase.position.y - plan.castleRise * rise,
      castleBase.position.z,
    );
    rig.castleRig.rotation.set(
      castleBase.rotation.x,
      castleBase.rotation.y + THREE.MathUtils.degToRad(INTRO_AMOUNT.castleYawDeg) * rise,
      castleBase.rotation.z,
    );
    rig.castleRig.scale.set(
      castleBase.scale.x * scale,
      castleBase.scale.y * scale,
      castleBase.scale.z * scale,
    );
  }

  // Cathedral first, spire after — the mass lands, then the silhouette
  // punches up into the sky behind it.
  const cathedralBase = getBaseTransform(rig.cathedral);

  if (rig.cathedral && cathedralBase) {
    const rise = 1 - easeOutExpo(span(p, INTRO_SCORE.cathedral));

    rig.cathedral.position.set(
      cathedralBase.position.x,
      cathedralBase.position.y - plan.cathedralRise * rise,
      cathedralBase.position.z,
    );
  }

  const keepBase = getBaseTransform(rig.keepTower);

  if (rig.keepTower && keepBase) {
    const eased = easeOutExpo(span(p, INTRO_SCORE.keep));
    const rise = 1 - eased;
    const stretch = settleTo1(INTRO_AMOUNT.keepStretch, eased);

    rig.keepTower.position.set(
      keepBase.position.x,
      keepBase.position.y - plan.keepRise * rise,
      keepBase.position.z,
    );
    rig.keepTower.scale.set(keepBase.scale.x, keepBase.scale.y * stretch, keepBase.scale.z);
  }

  /* ---------- the flanking towers sweeping in to frame it ---------- */
  const towersBase = getBaseTransform(rig.towersGroup);

  if (rig.towersGroup && towersBase) {
    const rise = 1 - easeOutQuint(span(p, INTRO_SCORE.towers));

    rig.towersGroup.position.set(
      towersBase.position.x,
      towersBase.position.y - plan.towerRise * rise,
      towersBase.position.z,
    );
  }

  const applyTower = (
    tower: THREE.Object3D | null,
    window: IntroWindow,
    side: number,
  ) => {
    const base = getBaseTransform(tower);

    if (!tower || !base) {
      return;
    }

    const arrive = 1 - easeOutQuint(span(p, window));

    tower.position.set(
      base.position.x + plan.towerSpread * side * arrive,
      base.position.y - plan.towerRise * arrive,
      base.position.z,
    );
    // Leaning outward, righting itself as it arrives.
    tower.rotation.set(
      base.rotation.x,
      base.rotation.y,
      base.rotation.z - THREE.MathUtils.degToRad(INTRO_AMOUNT.towerLeanDeg) * side * arrive,
    );
  };

  applyTower(rig.towerLeft, INTRO_SCORE.towerLeft, plan.towerLeftSign);
  applyTower(rig.towerRight, INTRO_SCORE.towerRight, plan.towerRightSign);

  /* ---------- foreground rocks, settling last ---------- */
  const rocksBase = getBaseTransform(rig.rocks);

  if (rig.rocks && rocksBase) {
    const eased = easeOutQuint(span(p, INTRO_SCORE.rocks));
    const settle = 1 - eased;
    const zoom = settleTo1(INTRO_AMOUNT.rocksZoom, eased);
    // The billboard is sized to the frustum every re-fit, so its drop is
    // measured against its own current half-height rather than a number
    // captured at some other viewport size.
    const geometry = (rig.rocks as THREE.Mesh).geometry;
    const halfHeight = geometry?.boundingBox
      ? ((geometry.boundingBox.max.y - geometry.boundingBox.min.y) / 2) * rocksBase.scale.y
      : 0;

    rig.rocks.position.set(
      rocksBase.position.x,
      rocksBase.position.y - halfHeight * INTRO_AMOUNT.rocksDrop * settle,
      rocksBase.position.z,
    );
    rig.rocks.scale.set(
      rocksBase.scale.x * zoom,
      rocksBase.scale.y * zoom,
      rocksBase.scale.z * zoom,
    );
  }

  setEmissiveScale(
    rig.rocks,
    settleTo1(INTRO_AMOUNT.rocksGlow, easeOutCubic(span(p, INTRO_SCORE.rocksGlow))),
  );
}

interface IntroState {
  active: boolean;
  elapsed: number;
  flashColor: string;
  plan: IntroPlan | null;
}

interface IntroSignal {
  at: number;
  flashColor?: string;
}

function readIntroSignal(): IntroSignal | null {
  const signal = (window as unknown as Record<string, unknown>)[INTRO_STATE_KEY];

  if (!signal || typeof signal !== 'object') {
    return null;
  }

  const { at } = signal as IntroSignal;

  return typeof at === 'number' ? (signal as IntroSignal) : null;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
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
  const gl = useThree((state) => state.gl);
  const scrollSmoothRef = useRef(0);
  const pointerSmoothRef = useRef(new THREE.Vector2());
  const debugOffsetsRef = useRef(createDebugOffsets());
  const introRef = useRef<IntroState>({
    active: false,
    elapsed: 0,
    flashColor: INTRO_FLASH_COLOR,
    plan: null,
  });
  // Debug (remove with the debug pass): expose the actual render loop so the
  // page can see whether frames keep drawing and the damped value keeps moving.
  const frameCountRef = useRef(0);
  const debugHostRef = useRef<Element | null>(null);

  const authoredCamera = useMemo(() => prepareAuthoredCamera(gltf), [gltf]);
  const rig = useMemo(() => buildVortexRig(gltf, sceneUrl), [gltf, sceneUrl]);

  useLayoutEffect(() => {
    if (!authoredCamera) {
      console.warn('[CastleScene] no camera found in', sceneUrl, '— using the default camera.');
      return;
    }

    set({ camera: authoredCamera });
  }, [authoredCamera, sceneUrl, set]);

  // Re-fit the authored framing whenever the canvas changes size, then
  // re-fit the sky/rocks to that same real frustum — a fit sized for one
  // aspect ratio can leave a gap (sky) or crop off-screen (rocks) on
  // another, so both must re-run together on every resize, in this order.
  useLayoutEffect(() => {
    if (!authoredCamera) {
      return;
    }

    applyCoverFraming(authoredCamera, size.width / Math.max(size.height, 1));
    refitFrameDependentLayers(rig, authoredCamera);
    invalidate();
  }, [authoredCamera, invalidate, rig, size]);

  // Let the page-level input listeners wake the demand-rendered canvas.
  useLayoutEffect(() => {
    invalidateRef.current = invalidate;
    invalidate();

    return () => {
      invalidateRef.current = () => {};
    };
  }, [invalidate, invalidateRef]);

  // The reveal, armed for the moment the page hands over the screen. The
  // plan is measured on the first frame rather than here, so it reads world
  // matrices the renderer has actually updated.
  useEffect(() => {
    if (prefersReducedMotion()) {
      return undefined;
    }

    const start = (flashColor?: string) => {
      const intro = introRef.current;

      intro.flashColor = flashColor ?? INTRO_FLASH_COLOR;
      intro.plan = null;
      intro.elapsed = 0;
      intro.active = true;

      if (authoredCamera) {
        try {
          ensureIntroFlash(authoredCamera, intro.flashColor);
        } catch {
          // An unparseable colour from the page is not worth failing over.
          ensureIntroFlash(authoredCamera, INTRO_FLASH_COLOR);
        }
      }

      invalidate();
    };

    const onEnter = (event: Event) => {
      const detail = (event as CustomEvent<IntroSignal>).detail;

      start(typeof detail?.flashColor === 'string' ? detail.flashColor : undefined);
    };

    window.addEventListener(INTRO_EVENT, onEnter);

    // Mounted late (the section is display:none until the experience
    // starts): catch a hand-over that already happened.
    const pending = readIntroSignal();

    if (pending && Date.now() - pending.at < INTRO_LATE_MOUNT_MS) {
      start(pending.flashColor);
    }

    return () => {
      window.removeEventListener(INTRO_EVENT, onEnter);
      removeIntroFlash(authoredCamera);
    };
  }, [authoredCamera, invalidate]);

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
      SCROLL_DAMP_RATE,
      dt,
    );

    animateVortexRig(rig, scrollSmoothRef.current, pointer, debugOffsetsRef.current.sky.scale);

    // The reveal layers on top of the rest state animateVortexRig just
    // wrote, so scroll and pointer keep their full range underneath it.
    const intro = introRef.current;

    if (intro.active) {
      intro.elapsed += dt;
      intro.plan = intro.plan ?? measureIntro(rig, authoredCamera);

      const progress = Math.min(intro.elapsed / INTRO_DURATION, 1);

      applyIntro(rig, authoredCamera, intro.plan, progress);

      // p === 1 restored every baseline exactly, so the intro is done
      // touching the scene and simply stops.
      if (progress >= 1) {
        intro.active = false;
        removeIntroFlash(authoredCamera);
      }
    }

    // Debug (remove with the debug pass): publish the live render loop.
    frameCountRef.current += 1;
    if (!debugHostRef.current) {
      const root = gl.domElement.getRootNode();
      debugHostRef.current = root instanceof ShadowRoot ? root.host : gl.domElement;
    }
    if (debugHostRef.current) {
      debugHostRef.current.setAttribute('data-frames', String(frameCountRef.current));
      debugHostRef.current.setAttribute('data-scroll-smooth', scrollSmoothRef.current.toFixed(3));
    }

    // Keep frames coming until every damped value has settled on its target
    // — and for as long as the reveal is still running.
    const settled =
      !intro.active &&
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

    // Debug marker (remove with the debug pass): stamp the shadow host so the
    // page script can confirm THIS build is live and read the real scroll
    // target this component actually computes.
    const rootNode = element.getRootNode();
    const debugHost: Element = rootNode instanceof ShadowRoot ? rootNode.host : element;
    debugHost.setAttribute('data-castle-fix', 'wrapbox-v1');

    const updateScroll = () => {
      // Measure the real section box (walks out to the Webflow wrapper when the
      // component's own <section> is a zero-height shadow-DOM shell), so the
      // animation spans the whole section instead of just the first viewport.
      const { top, height } = resolveScrollBox(element);
      const viewportHeight = window.innerHeight || 1;
      const enter = THREE.MathUtils.clamp(top / viewportHeight, 0, 1);
      const exit = THREE.MathUtils.clamp(-top / height, 0, 1);

      scrollTarget.current = exit - enter;
      debugHost.setAttribute('data-scroll-tgt', scrollTarget.current.toFixed(3));
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

  // The section is hidden until the experience starts, so the observer below
  // may still have the loop asleep at the exact moment the reveal fires.
  // Wake it here; the observer's own callback takes over from the next frame.
  useEffect(() => {
    const wake = () => {
      setFrameloop('demand');
      invalidateRef.current();
    };

    window.addEventListener(INTRO_EVENT, wake);

    return () => {
      window.removeEventListener(INTRO_EVENT, wake);
    };
  }, []);

  // Sleep the render loop entirely while the scene is far off-screen.
  useEffect(() => {
    const element = sectionRef.current;

    if (!element || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const rootNode = element.getRootNode();
    const debugHost: Element = rootNode instanceof ShadowRoot ? rootNode.host : element;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];

        if (entry) {
          const next = entry.isIntersecting ? 'demand' : 'never';
          // Debug (remove with the debug pass): expose render-loop state.
          debugHost.setAttribute('data-frameloop', next);
          setFrameloop(next);

          if (entry.isIntersecting) {
            invalidateRef.current();
          }
        }
      },
      { rootMargin: '200px' },
    );

    // Observe the real section box, not a zero-height shadow-DOM shell — a
    // shell at the section's top leaves the viewport after one screenful and
    // would otherwise sleep the scene mid-section.
    observer.observe(resolveObserveTarget(element));

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
