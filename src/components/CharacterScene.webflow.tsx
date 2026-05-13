import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { CharacterScene } from './CharacterScene';

const characterSceneWebflow = declareComponent(CharacterScene, {
  name: 'Character Scene',
  description: 'A 3D character scene with pointer-driven hover animation.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    characterModelUrl: props.Text({
      name: 'Character GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the front character .glb file.',
    }),
    backCharacterModelUrl: props.Text({
      name: 'Back Character GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the back character .glb file.',
    }),
    entranceImageX: props.Number({
      name: 'Entrance X (image fraction)',
      defaultValue: 0.87,
      tooltip: 'Horizontal center of the arch entrance as a fraction of the background image width (0 = left edge, 1 = right edge). Default 0.87 targets the arch in the default background.',
    }),
    buildingModelUrl: props.Text({
      name: 'Building GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the building .glb file.',
    }),
    backgroundImageUrl: props.Text({
      name: 'Background Image URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the background image. It will cover the full scene at all screen sizes.',
    }),
    animationEnabled: props.Boolean({
      name: 'Pointer Drift',
      defaultValue: true,
      trueLabel: 'On',
      falseLabel: 'Off',
    }),
  },
});

export default characterSceneWebflow;
