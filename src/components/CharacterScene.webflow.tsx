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
    buildingModelUrl: props.Text({
      name: 'Building GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the building .glb file.',
    }),
    backgroundImageUrl: props.Text({
      name: 'Background Image URL (Desktop)',
      defaultValue: '',
      tooltip: 'Paste the public URL for the desktop background image.',
    }),
    backgroundTabletImageUrl: props.Text({
      name: 'Background Image URL (Tablet)',
      defaultValue: '',
      tooltip: 'Paste the public URL for the tablet background image (768–1024px).',
    }),
    backgroundMobileImageUrl: props.Text({
      name: 'Background Image URL (Mobile)',
      defaultValue: '',
      tooltip: 'Paste the public URL for the mobile background image (767px and below).',
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
