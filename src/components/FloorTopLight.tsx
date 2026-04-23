import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export const defaultFloorLightColor = '#fff7da';

export interface FloorLightSettings {
  color: string;
  enabled: boolean;
  intensity: number;
  opacity: number;
  x: number;
  y: number;
  z: number;
}

interface FloorTopLightProps {
  color?: THREE.ColorRepresentation;
  depth: number;
  settings: FloorLightSettings;
  width: number;
}

function createFallbackTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function createFloorLightTexture() {
  if (typeof document === 'undefined') {
    return createFallbackTexture();
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    return createFallbackTexture();
  }

  canvas.width = 768;
  canvas.height = 768;

  const gradient = context.createRadialGradient(384, 384, 32, 384, 384, 384);
  gradient.addColorStop(0, 'rgba(255, 248, 228, 1)');
  gradient.addColorStop(0.18, 'rgba(255, 236, 180, 0.84)');
  gradient.addColorStop(0.42, 'rgba(255, 223, 140, 0.34)');
  gradient.addColorStop(0.72, 'rgba(255, 214, 128, 0.08)');
  gradient.addColorStop(1, 'rgba(255, 214, 128, 0)');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;

  return texture;
}

export function clampFloorLightOpacity(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function clampFloorLightIntensity(value: number) {
  return THREE.MathUtils.clamp(value, 0, 4);
}

export function FloorTopLight({
  color = defaultFloorLightColor,
  depth,
  settings,
  width,
}: FloorTopLightProps) {
  const texture = useMemo(() => createFloorLightTexture(), []);
  const lightColor = useMemo(
    () =>
      new THREE.Color(settings.color || color).multiplyScalar(
        clampFloorLightIntensity(settings.intensity),
      ),
    [color, settings.color, settings.intensity],
  );

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  if (!settings.enabled || settings.opacity <= 0 || settings.intensity <= 0) {
    return null;
  }

  return (
    <mesh position={[settings.x, settings.y, settings.z]} renderOrder={2} rotation={[-Math.PI * 0.5, 0, 0]}>
      <planeGeometry args={[Math.max(width, 0.001), Math.max(depth, 0.001)]} />
      <meshBasicMaterial
        blending={THREE.AdditiveBlending}
        color={lightColor}
        depthWrite={false}
        map={texture}
        opacity={clampFloorLightOpacity(settings.opacity)}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-2}
        side={THREE.DoubleSide}
        toneMapped={false}
        transparent
      />
    </mesh>
  );
}
