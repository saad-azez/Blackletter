import { defaultFloorLightColor, type FloorLightSettings } from './FloorTopLight.config';

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
  planeHeight: number;
  planeWidth: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  x: number;
  y: number;
  z: number;
}

export interface CastleFloorTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  visible: boolean;
  x: number;
  y: number;
  z: number;
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
    rotationX: -20,
    rotationY: 0,
    rotationZ: -5,
    scale: 0.5,
    visible: true,
    x: -3,
    y: 0,
    z: 0,
  },
  {
    rotationX: -20,
    rotationY: 0,
    rotationZ: 5,
    scale: 0.5,
    visible: true,
    x: 3,
    y: 0,
    z: 0,
  },
] as const satisfies readonly TowerTransform[];

export const castleTransformDefaults = {
  rotationX: -6,
  rotationY: -56,
  rotationZ: 0,
  scale: 1,
  x: 0,
  y: 0,
  z: -0.66,
} as const satisfies CastleTransform;

export const skyTransformDefaults = {
  planeHeight: 12,
  planeWidth: 18,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
  x: 0,
  y: 0,
  z: -4,
} as const satisfies SkyTransform;

export const castleFloorTransformDefaults = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
  visible: false,
  x: 0,
  y: 0,
  z: 0,
} as const satisfies CastleFloorTransform;

export const castleVortexPlaneControls = {
  planeHeight: {
    label: 'Plane Y',
    max: 80,
    min: 1,
    step: 0.1,
  },
  planeWidth: {
    label: 'Plane X',
    max: 80,
    min: 1,
    step: 0.1,
  },
} as const satisfies Record<
  'planeHeight' | 'planeWidth',
  {
    label: string;
    max: number;
    min: number;
    step: number;
  }
>;

export const castleFloorLightDefaults = {
  color: defaultFloorLightColor,
  enabled: true,
  intensity: 1,
  opacity: 0.42,
  x: 0,
  y: 0.012,
  z: 0,
} as const satisfies FloorLightSettings;

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

export const castleFloorLightAxisControls = {
  x: {
    label: 'Light X',
    max: 10,
    min: -10,
    step: 0.01,
  },
  y: {
    label: 'Light Height',
    max: 2,
    min: 0.001,
    step: 0.001,
  },
  z: {
    label: 'Light Z',
    max: 10,
    min: -10,
    step: 0.01,
  },
} as const satisfies Record<
  'x' | 'y' | 'z',
  {
    label: string;
    max: number;
    min: number;
    step: number;
  }
>;

export const castleFloorLightOpacityControl = {
  label: 'Light Opacity',
  max: 1,
  min: 0,
  step: 0.01,
} as const satisfies {
  label: string;
  max: number;
  min: number;
  step: number;
};

export const castleFloorLightIntensityControl = {
  label: 'Light Intensity',
  max: 4,
  min: 0,
  step: 0.01,
} as const satisfies {
  label: string;
  max: number;
  min: number;
  step: number;
};

export const castleFloorLightColorControl = {
  label: 'Light Color',
} as const satisfies {
  label: string;
};

export const castleFloorLightEnabledControl = {
  label: 'Enabled',
} as const satisfies {
  label: string;
};

export const castleLightsControl = {
  label: 'Enabled',
} as const satisfies {
  label: string;
};

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
