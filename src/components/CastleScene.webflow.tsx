import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { CastleScene } from './CastleScene';


const castleSceneWebflow = declareComponent(CastleScene, {
  name: 'Castle Scene',
  description:
    'The castle vortex scene: a single authored GLB (castle, towers, sky, rocks, camera and light) with scroll and pointer-driven motion baked in.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    castleModelUrl: props.Text({
      name: 'Scene GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the vortex scene .glb file. Leave blank to use the bundled default.',
    }),
    animationEnabled: props.Boolean({
      name: 'Pointer Drift',
      defaultValue: true,
      trueLabel: 'On',
      falseLabel: 'Off',
    }),
  },
});

export default castleSceneWebflow;
