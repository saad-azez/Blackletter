import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';

interface RigVector {
  x: number;
  y: number;
  z: number;
}

export interface CameraRigDomLayer {
  element: RefObject<HTMLElement | null> | MutableRefObject<HTMLElement | null>;
  /** px the layer rises at full downward scroll progress. */
  lift: number;
  /** px the layer follows the cursor horizontally at full deflection. */
  panX: number;
  /** px the layer follows the cursor vertically at full deflection. */
  panY: number;
  /** Oversize factor so translation never reveals the layer's edges. */
  scale?: number;
}

export interface CameraParallaxRigProps {
  basePosition: RigVector;
  baseTarget: RigVector;
  /** DOM images outside the canvas that should move with the camera. */
  domLayers?: CameraRigDomLayer[];
  /** When false the rig releases the camera entirely (e.g. debug orbit controls). */
  enabled?: boolean;
  /** Radians the camera orbits vertically at full pointer deflection. */
  orbitPitch: number;
  /** Radians the camera orbits around the target at full pointer deflection. */
  orbitYaw: number;
  /** World units the camera pans horizontally at full pointer deflection. */
  panX: number;
  /** World units the camera pans vertically at full pointer deflection. */
  panY: number;
  /** Gates only the hover response; scroll travel always applies. */
  pointerEnabled?: boolean;
  pointerTarget: MutableRefObject<THREE.Vector2>;
  /** World units the camera descends across the section's full scroll travel. */
  scrollLift: number;
  /** Multiplier on the look target's descent, tilting the camera downward as it drops. */
  scrollLookAhead?: number;
  /** Signed scroll progress: -1 section below viewport, 0 aligned, 1 scrolled past. */
  scrollTarget: MutableRefObject<number>;
}

const POINTER_DAMP = 4;
const SCROLL_DAMP = 2.2;

export function CameraParallaxRig({
  basePosition,
  baseTarget,
  domLayers,
  enabled = true,
  orbitPitch,
  orbitYaw,
  panX,
  panY,
  pointerEnabled = true,
  pointerTarget,
  scrollLift,
  scrollLookAhead = 1.35,
  scrollTarget,
}: CameraParallaxRigProps) {
  const { camera } = useThree();
  const pointerSmooth = useRef(new THREE.Vector2());
  const scrollSmooth = useRef(0);
  const scratchRef = useRef({
    look: new THREE.Vector3(),
    offset: new THREE.Vector3(),
    spherical: new THREE.Spherical(),
  });

  useFrame((_state, delta) => {
    if (!enabled) {
      return;
    }

    const dt = Math.min(delta, 1 / 20);
    const pointer = pointerSmooth.current;
    const pointerX = pointerEnabled ? pointerTarget.current.x : 0;
    const pointerY = pointerEnabled ? pointerTarget.current.y : 0;

    pointer.x = THREE.MathUtils.damp(pointer.x, pointerX, POINTER_DAMP, dt);
    pointer.y = THREE.MathUtils.damp(pointer.y, pointerY, POINTER_DAMP, dt);
    scrollSmooth.current = THREE.MathUtils.damp(
      scrollSmooth.current,
      scrollTarget.current,
      SCROLL_DAMP,
      dt,
    );

    const scroll = scrollSmooth.current;
    const { look, offset, spherical } = scratchRef.current;

    offset.set(
      basePosition.x - baseTarget.x,
      basePosition.y - baseTarget.y,
      basePosition.z - baseTarget.z,
    );
    spherical.setFromVector3(offset);
    spherical.theta -= pointer.x * orbitYaw;
    spherical.phi = THREE.MathUtils.clamp(
      spherical.phi - pointer.y * orbitPitch,
      0.15,
      Math.PI - 0.15,
    );
    offset.setFromSpherical(spherical);

    camera.position.set(
      baseTarget.x + offset.x + pointer.x * panX,
      baseTarget.y + offset.y + pointer.y * panY - scroll * scrollLift,
      baseTarget.z + offset.z,
    );
    look.set(
      baseTarget.x,
      baseTarget.y - scroll * scrollLift * scrollLookAhead,
      baseTarget.z,
    );
    camera.lookAt(look);

    domLayers?.forEach((layer) => {
      const element = layer.element.current;

      if (!element) {
        return;
      }

      const x = pointer.x * layer.panX;
      const y = -pointer.y * layer.panY - scroll * layer.lift;
      const transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${layer.scale ?? 1})`;

      if (element.style.transform !== transform) {
        element.style.transform = transform;
      }
    });
  });

  return null;
}

export default CameraParallaxRig;
