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
      tooltip: 'Paste a public GLB or GLTF URL for the Castle scene.',
    }),
    resourcePath: props.Text({
      name: 'Resource Path',
      defaultValue: '',
      tooltip:
        'Optional folder URL for GLTF companion files. Leave blank when the .gltf and .bin live in the same folder.',
    }),
    binaryUrl: props.Text({
      name: 'Binary URL',
      defaultValue: '',
      tooltip: 'Optional direct URL for the Castle .bin file when you need to override it.',
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
    showAxesHelpers: props.Boolean({
      name: 'Show Axes',
      defaultValue: true,
      trueLabel: 'On',
      falseLabel: 'Off',
    }),
    selectedNodeName: props.Text({
      name: 'Selected Node',
      defaultValue: '',
      tooltip: 'Optional node path to preselect in the GUI.',
    }),
    selectedNodeOnlyMotion: props.Boolean({
      name: 'Selected Motion',
      defaultValue: false,
      trueLabel: 'Selected Only',
      falseLabel: 'Whole Scene',
    }),
  },
});

export default castleSceneWebflow;
