import { OrbitControls } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

export interface OrbitControlTarget {
  x: number;
  y: number;
  z: number;
}

export interface OrbitControlSnapshot {
  position: OrbitControlTarget;
  target: OrbitControlTarget;
}

interface DebugOrbitControlsProps {
  enabled: boolean;
  onChangeEnd?: (snapshot: OrbitControlSnapshot) => void;
  position: OrbitControlTarget;
  target: OrbitControlTarget;
}

const minOrbitDistance = 2;
const maxOrbitDistance = 30;
const minOrbitZoom = 20;
const maxOrbitZoom = 300;
const minPolarAngle = 0.12;
const maxPolarAngle = Math.PI / 2.08;

export function DebugOrbitControls({
  enabled,
  onChangeEnd,
  position,
  target,
}: DebugOrbitControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useLayoutEffect(() => {
    const controls = controlsRef.current;

    if (!controls) {
      return;
    }

    controls.object.position.set(position.x, position.y, position.z);
    controls.target.set(target.x, target.y, target.z);
    controls.update();
  }, [position.x, position.y, position.z, target.x, target.y, target.z]);

  return (
    <OrbitControls
      ref={controlsRef}
      dampingFactor={0.08}
      enableDamping
      enablePan={false}
      enabled={enabled}
      maxDistance={maxOrbitDistance}
      maxPolarAngle={maxPolarAngle}
      maxZoom={maxOrbitZoom}
      minDistance={minOrbitDistance}
      minPolarAngle={minPolarAngle}
      minZoom={minOrbitZoom}
      rotateSpeed={0.85}
      zoomSpeed={0.8}
      onEnd={() => {
        const controls = controlsRef.current;

        if (!controls || !onChangeEnd) {
          return;
        }

        const camera = controls.object;

        onChangeEnd({
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
      }}
    />
  );
}

export default DebugOrbitControls;
