import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { PaperScrollTransition } from './PaperScrollTransition';

const paperScrollTransitionWebflow = declareComponent(PaperScrollTransition, {
  name: 'Paper Scroll Transition',
  description:
    'Drop inside a Section: as that section scrolls out, a torn-paper curtain sweeps across the screen and reveals the next section.',
  group: 'Media',
  options: {
    ssr: false,
  },
  props: {
    direction: props.Variant({
      name: 'Direction',
      defaultValue: 'Bottom to Top',
      options: ['Bottom to Top', 'Top to Bottom'],
      tooltip: 'Which way the paper sweeps across the screen during the transition.',
    }),
    color: props.Text({
      name: 'Paper Color',
      defaultValue: '#1d1d1b',
      tooltip: 'CSS colour of the paper sheet and torn edge.',
    }),
    zIndex: props.Number({
      name: 'Z Index',
      defaultValue: 200,
      tooltip: 'Stacking order of the full-screen overlay. Keep it above section content but below fixed navigation you want visible.',
    }),
  },
});

export default paperScrollTransitionWebflow;
