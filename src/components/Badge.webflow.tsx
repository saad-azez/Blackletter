import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { Badge } from './Badge';

const badgeWebflow = declareComponent(Badge, {
  name: '3D Scene Card',
  description: 'A single full-viewport 3D scene card with subtle mouse-driven camera movement.',
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
        'Paste a public GLB URL. In Webflow, use the published asset CDN URL rather than a bundled local file.',
    }),
    modelScale: props.Number({
      name: 'Model Scale',
      defaultValue: 1,
      min: 0.1,
      max: 5,
      decimals: 2,
      tooltip: 'Use this when your GLB needs to appear larger or smaller inside the card.',
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
