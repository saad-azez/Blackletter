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

export function clampFloorLightOpacity(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

export function clampFloorLightIntensity(value: number) {
  return THREE.MathUtils.clamp(value, 0, 4);
}
