import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { Badge } from './Badge';

const badgeWebflow = declareComponent(Badge, {
  name: '3D Badge',
  description: 'A simple fullscreen 3D scene with camera drift.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    variant: props.Variant({
      name: 'Theme',
      options: ['Dark', 'Light'],
      defaultValue: 'Dark',
    }),
    modelUrl: props.Text({
      name: 'Model URL',
      defaultValue: '',
      tooltip: 'Paste a public GLB or GLTF URL. For GLTF files, keep companion assets in the same folder.',
    }),
    modelScale: props.Number({
      name: 'Model Scale',
      defaultValue: 1,
      min: 0.1,
      max: 5,
      decimals: 2,
    }),
    cameraIntensity: props.Number({
      name: 'Camera Drift',
      defaultValue: 0.35,
      min: 0,
      max: 1.5,
      decimals: 2,
    }),
    cameraX: props.Number({
      name: 'Camera X',
      defaultValue: 0,
      min: -20,
      max: 20,
      decimals: 2,
    }),
    cameraY: props.Number({
      name: 'Camera Y',
      defaultValue: 0,
      min: -20,
      max: 20,
      decimals: 2,
    }),
    cameraZ: props.Number({
      name: 'Camera Z',
      defaultValue: 6.1,
      min: 0.5,
      max: 20,
      decimals: 2,
    }),
  },
});

export default badgeWebflow;
