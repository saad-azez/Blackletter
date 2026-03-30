export interface SceneCameraPosition {
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
