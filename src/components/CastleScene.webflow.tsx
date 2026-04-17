import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { CastleScene } from './CastleScene';

const castleSceneWebflow = declareComponent(CastleScene, {
  name: 'Castle Scene',
  description: 'A Castle-specific scene component with a fixed, non-interactive camera.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    castleModelUrl: props.Text({
      name: 'Castle GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the main castle .glb file.',
    }),
    towerModelUrl: props.Text({
      name: 'Tower GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the tower .glb file used across the scene.',
    }),
    floorModelUrl: props.Text({
      name: 'Floor GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the floor .glb file.',
    }),
  },
});

export default castleSceneWebflow;
