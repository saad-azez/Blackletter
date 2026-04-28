import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { ChessScene } from './ChessScene';

const chessSceneWebflow = declareComponent(ChessScene, {
  name: 'Chess Scene',
  description: 'A contained 3D chess scene that can fill a Webflow frame element.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    floorModelUrl: props.Text({
      name: 'Floor GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the floor .glb file.',
    }),
    chessModelUrl: props.Text({
      name: 'Chess GLB URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the chess .glb file.',
    }),
    backgroundImageUrl: props.Text({
      name: 'Background Image URL',
      defaultValue: '',
      tooltip: 'Paste the public URL for the background image.',
    }),
    animationEnabled: props.Boolean({
      name: 'Pointer Drift',
      defaultValue: true,
      trueLabel: 'On',
      falseLabel: 'Off',
    }),
    fillParent: props.Boolean({
      name: 'Fill Parent',
      defaultValue: true,
      trueLabel: 'Frame',
      falseLabel: 'Viewport',
      tooltip: 'Keep this on when the scene is placed inside a sized Webflow frame.',
    }),
  },
});

export default chessSceneWebflow;
