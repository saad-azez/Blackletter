export interface SceneCameraPosition {
  x: number;
  y: number;
  z: number;
}

export interface TowerTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  visible: boolean;
  x: number;
  y: number;
  z: number;
}

export interface CastleTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  x: number;
  y: number;
  z: number;
}

export interface SkyTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  x: number;
  y: number;
  z: number;
}

export interface RocksOverlayTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  x: number;
  y: number;
}

export const castlePerspectiveCamera = {
  fov: 42,
  lookAt: {
    x: 0,
    y: 0,
    z: 0,
  },
  position: {
    x: 0,
    y: 0,
    z: 6.1,
  },
} as const satisfies {
  fov: number;
  lookAt: SceneCameraPosition;
  position: SceneCameraPosition;
};

export const castleCameraAxisControls = {
  x: {
    label: 'Camera X',
    max: 20,
    min: -20,
    step: 0.1,
  },
  y: {
    label: 'Camera Y',
    max: 20,
    min: -20,
    step: 0.1,
  },
  z: {
    label: 'Camera Z',
    max: 20,
    min: 0.5,
    step: 0.1,
  },
} as const satisfies Record<
  keyof SceneCameraPosition,
  {
    label: string;
    max: number;
    min: number;
    step: number;
  }
>;

export const castleTowerDefaults = [
  {
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    scale: 0.6,
    visible: true,
    x: -3.07,
    y: -2.15,
    z: 0.4,
  },
  {
    rotationX: 0,
    rotationY: 12,
    rotationZ: 0,
    scale: 0.5,
    visible: true,
    x: -2.31,
    y: -2.15,
    z: -0.15,
  },
  {
    rotationX: 0,
    rotationY: 12,
    rotationZ: 0,
    scale: 0.5,
    visible: true,
    x: -1.77,
    y: -2.15,
    z: -0.66,
  },
] as const satisfies readonly TowerTransform[];

export const castleTransformDefaults = {
  rotationX: -6,
  rotationY: -56,
  rotationZ: 0,
  scale: 1,
  x: 1.15,
  y: 0.16,
  z: -0.66,
} as const satisfies CastleTransform;

export const skyTransformDefaults = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
  x: 0,
  y: 0,
  z: -4,
} as const satisfies SkyTransform;

export const rocksOverlayDefaults = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
  x: 0,
  y: 98,
} as const satisfies RocksOverlayTransform;

export const towerPositionAxisControls = {
  x: {
    label: 'Position X',
    max: 10,
    min: -10,
    step: 0.01,
  },
  y: {
    label: 'Position Y',
    max: 10,
    min: -10,
    step: 0.01,
  },
  z: {
    label: 'Position Z',
    max: 10,
    min: -10,
    step: 0.01,
  },
} as const satisfies Record<
  keyof SceneCameraPosition,
  {
    label: string;
    max: number;
    min: number;
    step: number;
  }
>;

export const towerRotationAxisControls = {
  x: {
    label: 'Rotation X',
    max: 180,
    min: -180,
    step: 1,
  },
  y: {
    label: 'Rotation Y',
    max: 180,
    min: -180,
    step: 1,
  },
  z: {
    label: 'Rotation Z',
    max: 180,
    min: -180,
    step: 1,
  },
} as const satisfies Record<
  keyof SceneCameraPosition,
  {
    label: string;
    max: number;
    min: number;
    step: number;
  }
>;

export const overlayOffsetControls = {
  x: {
    label: 'Offset X',
    max: 1600,
    min: -1600,
    step: 1,
  },
  y: {
    label: 'Offset Y',
    max: 1200,
    min: -1200,
    step: 1,
  },
} as const satisfies Record<
  'x' | 'y',
  {
    label: string;
    max: number;
    min: number;
    step: number;
  }
>;

export const uniformScaleControl = {
  label: 'Scale',
  max: 10,
  min: 0.05,
  step: 0.01,
} as const satisfies {
  label: string;
  max: number;
  min: number;
  step: number;
};
