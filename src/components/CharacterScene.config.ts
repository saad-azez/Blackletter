export interface SceneCameraPosition {
  x: number;
  y: number;
  z: number;
}

export interface CharacterTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  visible: boolean;
  x: number;
  y: number;
  z: number;
}

export const characterPerspectiveCamera = {
  fov: 36,
  lookAt: {
    x: 0,
    y: 0.9,
    z: 0,
  },
  position: {
    x: 0,
    y: 1.25,
    z: 6.8,
  },
} as const satisfies {
  fov: number;
  lookAt: SceneCameraPosition;
  position: SceneCameraPosition;
};

export const characterCameraAxisControls = {
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
    max: 25,
    min: 1.5,
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

export const characterTransformDefaults = {
  rotationX: 0,
  rotationY: 60,
  rotationZ: 0,
  scale: 1,
  visible: true,
  x: -1.15,
  y: -1.05,
  z: 0,
} as const satisfies CharacterTransform;

export const backCharacterTransformDefaults = {
  rotationX: -2,
  rotationY: -120,
  rotationZ: -10,
  scale: 0.41,
  visible: true,
  x: 3.6,
  y: -1.7,
  z: -2.13,
} as const satisfies CharacterTransform;

export const backCharacterTransformTabletDefaults = {
  rotationX: -2,
  rotationY: -120,
  rotationZ: -10,
  scale: 0.41,
  visible: true,
  x: 2.8,
  y: -1.7,
  z: -2.13,
} as const satisfies CharacterTransform;

export const backCharacterTransformMobileDefaults = {
  rotationX: -2,
  rotationY: -120,
  rotationZ: -10,
  scale: 0.55,
  visible: true,
  x: 1.3,
  y: -1.5,
  z: -1.5,
} as const satisfies CharacterTransform;

export const characterTransformMobileDefaults = {
  rotationX: 0,
  rotationY: 60,
  rotationZ: 0,
  scale: 1,
  visible: true,
  x: -0.6,
  y: -1.5,
  z: 1.5,
} as const satisfies CharacterTransform;

export const buildingTransformDefaults = {
  rotationX: 0,
  rotationY: 15,
  rotationZ: -22,
  scale: 1,
  visible: true,
  x: -2.5,
  y: -2,
  z: -1,
} as const satisfies CharacterTransform;

export const scenePositionAxisControls = {
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

export const sceneRotationAxisControls = {
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
