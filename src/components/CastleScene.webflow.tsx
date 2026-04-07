import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { CastleScene } from './CastleScene';
import { castleCameraAxisControls, castlePerspectiveCamera } from './CastleScene.config';

const castleSceneWebflow = declareComponent(CastleScene, {
  name: 'Castle Scene',
  description: 'A Castle-specific scene component with its own built-in GUI and camera controls.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    modelUrl: props.Text({
      name: 'Model URL',
      defaultValue: '',
      tooltip: 'Paste the public Castle .glb or .gltf URL.',
    }),
    modelScale: props.Number({
      name: 'Model Scale',
      defaultValue: 1,
      min: 0.1,
      max: 5,
      decimals: 2,
    }),
    cameraIntensity: props.Number({
      name: 'Orbit Sensitivity',
      defaultValue: 0.35,
      min: 0,
      max: 1.5,
      decimals: 2,
    }),
    cameraX: props.Number({
      name: castleCameraAxisControls.x.label,
      defaultValue: castlePerspectiveCamera.position.x,
      min: castleCameraAxisControls.x.min,
      max: castleCameraAxisControls.x.max,
      decimals: 2,
    }),
    cameraY: props.Number({
      name: castleCameraAxisControls.y.label,
      defaultValue: castlePerspectiveCamera.position.y,
      min: castleCameraAxisControls.y.min,
      max: castleCameraAxisControls.y.max,
      decimals: 2,
    }),
    cameraZ: props.Number({
      name: castleCameraAxisControls.z.label,
      defaultValue: castlePerspectiveCamera.position.z,
      min: castleCameraAxisControls.z.min,
      max: castleCameraAxisControls.z.max,
      decimals: 2,
    }),
    showGui: props.Boolean({
      name: 'Show GUI',
      defaultValue: true,
      trueLabel: 'On',
      falseLabel: 'Off',
    }),
    animationEnabled: props.Boolean({
      name: 'Enable Motion',
      defaultValue: true,
      trueLabel: 'On',
      falseLabel: 'Off',
    }),
  },
});

export default castleSceneWebflow;
