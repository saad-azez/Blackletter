import { props } from '@webflow/data-types';
import { declareComponent } from '@webflow/react';

import { PaperScrollTransition } from './PaperScrollTransition';

const paperScrollTransitionWebflow = declareComponent(PaperScrollTransition, {
  name: 'Paper Scroll Transition',
  description:
    'Drop inside a Section: scrolling past its end plays the torn-paper page transition and reveals the next section.',
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
    duration: props.Number({
      name: 'Duration (s)',
      defaultValue: 2.2,
      decimals: 1,
      min: 0.6,
      max: 6,
      tooltip: 'Total transition time in seconds, matching the Start the Experience curtain by default.',
    }),
    zIndex: props.Number({
      name: 'Z Index',
      defaultValue: 200,
      tooltip: 'Stacking order of the full-screen overlay. Keep it above section content but below fixed navigation you want visible.',
    }),
    debug: props.Boolean({
      name: 'Debug Logs',
      defaultValue: false,
      trueLabel: 'On',
      falseLabel: 'Off',
      tooltip: 'Logs to the browser console which section this instance is bound to, its boundary state on scroll, and every transition step. You can also set __BLACKLETTER_PAPER_DEBUG__ = true in the console to enable logs on all instances at once.',
    }),
  },
});

export default paperScrollTransitionWebflow;
