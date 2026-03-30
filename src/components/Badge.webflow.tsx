import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { Badge } from './Badge';

const badgeWebflow = declareComponent(Badge, {
  name: '3D Scene Card',
  description: 'A reusable full-viewport 3D scene with subtle mouse-driven camera movement.',
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
      tooltip:
        'Paste a public GLB or GLTF URL. For GLTF files, keep the .bin and textures publicly accessible too.',
    }),
    resourcePath: props.Text({
      name: 'Resource Path',
      defaultValue: '',
      tooltip:
        'Optional base URL for GLTF companion files like .bin and textures. Leave blank when those files sit beside the GLTF file.',
    }),
    cloudVortexTextureUrl: props.Text({
      name: 'Cloud Vortex Texture',
      defaultValue: '',
      tooltip:
        'Override for u1272336289_massive_cloud_vortex_--ar_3235_--v_7_45d73369-0c2c-439f-a443-b555a1d85db6.png.',
    }),
    floorTextureUrl: props.Text({
      name: 'Floor Texture',
      defaultValue: '',
      tooltip: 'Override for floor%20.png.',
    }),
    mapeTextureUrl: props.Text({
      name: 'Mape Texture',
      defaultValue: '',
      tooltip: 'Override for Mape.jpg.',
    }),
    windowIslamicArtTextureUrl: props.Text({
      name: 'Window Texture',
      defaultValue: '',
      tooltip: 'Override for Window%20islamic%20art.webp.',
    }),
    modelScale: props.Number({
      name: 'Model Scale',
      defaultValue: 1,
      min: 0.1,
      max: 5,
      decimals: 2,
      tooltip: 'Use this when your model needs to appear larger or smaller inside the scene.',
    }),
    cameraIntensity: props.Number({
      name: 'Camera Drift',
      defaultValue: 0.35,
      min: 0,
      max: 1.5,
      decimals: 2,
      tooltip: 'Controls how much the camera reacts to pointer movement.',
    }),
  },
});

export default badgeWebflow;
