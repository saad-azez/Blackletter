import { defaultFloorLightColor, type FloorLightSettings } from './FloorTopLight';

export interface SceneCameraPosition {
  x: number;
  y: number;
  z: number;
}

export interface SceneTransform {
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
  x: number;
  y: number;
  z: number;
}

export interface ChessFloorMeshTransform extends SceneTransform {
  visible: boolean;
}

export interface ChessPieceTransform extends SceneTransform {
  visible: boolean;
}

export const chessPerspectiveCamera = {
  fov: 38,
  lookAt: {
    x: 0,
    y: 0.45,
    z: 0,
  },
  position: {
    x: 0,
    y: 1.8,
    z: 9.2,
  },
} as const satisfies {
  fov: number;
  lookAt: SceneCameraPosition;
  position: SceneCameraPosition;
};

export const chessCameraAxisControls = {
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

export const chessFloorTransformDefaults = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1.5,
  x: 0,
  y: -1.4,
  z: 0,
} as const satisfies SceneTransform;

export const chessFloorMeshTransformDefaults = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1,
  visible: true,
  x: 0,
  y: 0,
  z: 0,
} as const satisfies ChessFloorMeshTransform;

export const chessFloorLightDefaults = {
  color: defaultFloorLightColor,
  enabled: false,
  intensity: 1,
  opacity: 0.48,
  x: 0,
  y: 0.012,
  z: 0.14,
} as const satisfies FloorLightSettings;

export const chessPieceDefaults = [
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: -0.54,
    y: 0.02,
    z: -0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: -0.18,
    y: 0.02,
    z: -0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: 0.18,
    y: 0.02,
    z: -0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: 0.54,
    y: 0.02,
    z: -0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: -0.54,
    y: 0.02,
    z: 0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: -0.18,
    y: 0.02,
    z: 0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: 0.18,
    y: 0.02,
    z: 0.24,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: true,
    x: 0.54,
    y: 0.02,
    z: 0.24,
  },
] as const satisfies readonly ChessPieceTransform[];

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

export const chessFloorLightAxisControls = {
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

export const chessFloorLightOpacityControl = {
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

export const chessFloorLightIntensityControl = {
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

export const chessFloorLightColorControl = {
  label: 'Light Color',
} as const satisfies {
  label: string;
};

export const chessFloorLightEnabledControl = {
  label: 'Enabled',
} as const satisfies {
  label: string;
};

export const chessLightsControl = {
  label: 'Enabled',
} as const satisfies {
  label: string;
};

export const pieceLayoutAxisControls = {
  x: {
    label: 'Board X',
    max: 1,
    min: -1,
    step: 0.01,
  },
  y: {
    label: 'Lift',
    max: 2,
    min: -2,
    step: 0.01,
  },
  z: {
    label: 'Board Z',
    max: 1,
    min: -1,
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

export interface ChessAmbientLightSettings {
  color: string;
  intensity: number;
}

export interface ChessHemisphereLightSettings {
  groundColor: string;
  intensity: number;
  skyColor: string;
  x: number;
  y: number;
  z: number;
}

export interface ChessPositionedLightSettings {
  color: string;
  intensity: number;
  x: number;
  y: number;
  z: number;
}

export interface ChessSceneLightSettings {
  ambient: ChessAmbientLightSettings;
  backSpot: ChessPositionedLightSettings;
  hemisphere: ChessHemisphereLightSettings;
  mainDirectional: ChessPositionedLightSettings;
  secondaryDirectional: ChessPositionedLightSettings;
  topSpot: ChessPositionedLightSettings;
}

export const chessSceneLightDefaults: ChessSceneLightSettings = {
  ambient: { color: '#fff2de', intensity: 1.3 },
  backSpot: { color: '#f6ddb0', intensity: 64, x: 0, y: 3.5, z: -3.2 },
  hemisphere: { groundColor: '#4d4034', intensity: 1.1, skyColor: '#ffffff', x: 0, y: 5, z: 0 },
  mainDirectional: { color: '#fff4dc', intensity: 2.8, x: 6, y: 8, z: 5 },
  secondaryDirectional: { color: '#dcb992', intensity: 0.9, x: -5, y: 4, z: -6 },
  topSpot: { color: '#f6ddb0', intensity: 60, x: 0, y: 10, z: 2 },
};

export const chessLightPositionAxisControls = {
  x: { label: 'Position X', max: 20, min: -20, step: 0.1 },
  y: { label: 'Position Y', max: 20, min: -20, step: 0.1 },
  z: { label: 'Position Z', max: 20, min: -20, step: 0.1 },
} as const satisfies Record<
  'x' | 'y' | 'z',
  { label: string; max: number; min: number; step: number }
>;

export const chessAmbientIntensityControl = {
  label: 'Intensity',
  max: 5,
  min: 0,
  step: 0.01,
} as const satisfies { label: string; max: number; min: number; step: number };

export const chessDirectionalIntensityControl = {
  label: 'Intensity',
  max: 15,
  min: 0,
  step: 0.01,
} as const satisfies { label: string; max: number; min: number; step: number };

export const chessSpotIntensityControl = {
  label: 'Intensity',
  max: 200,
  min: 0,
  step: 0.5,
} as const satisfies { label: string; max: number; min: number; step: number };
