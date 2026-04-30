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
    y: -0.08,
    z: 0,
  },
  position: {
    x: 0,
    y: 0.85,
    z: 8.9,
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

export const chessCameraFovControl = {
  label: 'Camera FOV',
  max: 90,
  min: 18,
  step: 1,
} as const satisfies {
  label: string;
  max: number;
  min: number;
  step: number;
};

export const chessFloorTransformDefaults = {
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  scale: 1.5,
  x: 0,
  y: -1.55,
  z: 0.85,
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
    scale: 0.85,
    visible: true,
    x: -0.51,
    y: 0.02,
    z: -0.45,
  },
  {
    rotationX: 0,
    rotationY: -124,
    rotationZ: 0,
    scale: 0.85,
    visible: true,
    x: 0.03,
    y: 0.02,
    z: -0.45,
  },
  {
    rotationX: 0,
    rotationY: -130,
    rotationZ: 0,
    scale: 0.85,
    visible: true,
    x: 0.6,
    y: 0.02,
    z: -0.45,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 0.93,
    visible: true,
    x: -0.55,
    y: 0.02,
    z: 0.12,
  },
  {
    rotationX: 0,
    rotationY: -130,
    rotationZ: 0,
    scale: 0.92,
    visible: true,
    x: -0.2,
    y: 0.02,
    z: -0.15,
  },
  {
    rotationX: 0,
    rotationY: -115,
    rotationZ: 0,
    scale: 0.89,
    visible: true,
    x: 0.24,
    y: 0.02,
    z: -0.1,
  },
  {
    rotationX: -4,
    rotationY: -120,
    rotationZ: 0,
    scale: 0.88,
    visible: true,
    x: 0.59,
    y: 0.02,
    z: 0.0800,
  },
  {
    rotationX: 0,
    rotationY: -120,
    rotationZ: 0,
    scale: 1,
    visible: false,
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
  ambient: { color: '#bdbdbc', intensity: 1.14 },
  backSpot: { color: '#ffffff', intensity: 137, x: 0, y: 8, z: -3 },
  hemisphere: { groundColor: '#3d3834', intensity: 1.1, skyColor: '#c9c9c5', x: -8.3, y: 5.9, z: -3.6 },
  mainDirectional: { color: '#aeaead', intensity: 6.75, x: 5.3, y: 11.6, z: -12.5 },
  secondaryDirectional: { color: '#59524a', intensity: 2.44, x: -11.4, y: 2.2, z: -15.6 },
  topSpot: { color: '#f6ddb0', intensity: 48, x: -10.9, y: 2.7, z: 0.1 },
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
