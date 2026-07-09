import { useEffect, useRef } from 'react';
import PaperCurtainEffect from './BlackletterPaperCurtain.mjs';

export type PaperScrollDirection = 'Bottom to Top' | 'Top to Bottom';

export interface PaperScrollTransitionProps {
  /** Paper colour for the sheet and torn band. */
  color?: string;
  /** Sweep direction of the wipe. Defaults to bottom-to-top. */
  direction?: string;
  /** z-index of the fixed overlay canvas. */
  zIndex?: number;
}

/**
 * The wipe is scrubbed by scroll across one viewport-height of travel: it
 * starts when the host section's bottom reaches the viewport bottom (t = 0)
 * and finishes when that bottom leaves the viewport top (t = 1). Cover runs
 * over the first half, reveal over the second.
 */
const COVER_END = 0.5;

/**
 * Create/destroy the WebGL effect based on distance to the transition zone so
 * a page full of sections never holds more than a couple of live contexts.
 */
const WAKE_DISTANCE_VH = 1.75;

function getComposedParent(element: Element | null): Element | null {
  if (!element) {
    return null;
  }

  if (element.parentElement) {
    return element.parentElement;
  }

  const root = element.getRootNode();

  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * The section whose end drives the wipe: nearest composed ancestor that is a
 * <section> (Webflow's Section element) or opts in via data-curtain-section;
 * otherwise the first ancestor with real height, as a fallback for wrappers.
 */
function findHostSection(element: Element | null): Element | null {
  let firstSized: Element | null = null;
  let current = getComposedParent(element);

  while (current && current !== document.documentElement) {
    if (current.matches('section, [data-curtain-section]')) {
      return current;
    }

    if (!firstSized && current.getBoundingClientRect().height > 0) {
      firstSized = current;
    }

    current = getComposedParent(current);
  }

  return firstSized;
}

function normalizeDirection(direction: unknown): PaperScrollDirection {
  return String(direction ?? '').toLowerCase().includes('top to bottom')
    ? 'Top to Bottom'
    : 'Bottom to Top';
}

function toText(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  return fallback;
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
}

export function PaperScrollTransition({
  color = '#1d1d1b',
  direction = 'Bottom to Top',
  zIndex = 200,
}: PaperScrollTransitionProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolvedColor = toText(color, '#1d1d1b');
  const resolvedDirection = normalizeDirection(direction);
  const resolvedZIndex = toNumber(zIndex, 200);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    // Cover anchors the sheet on the edge it sweeps in from; at full cover the
    // anchor swaps invisibly so the reveal continues in the same direction and
    // the sheet passes through the screen instead of retracing.
    const coverFlip = resolvedDirection === 'Bottom to Top';

    let effect: InstanceType<typeof PaperCurtainEffect> | null = null;
    let section: Element | null = null;
    let scrollRaf: number | null = null;
    let destroyed = false;

    const ensureEffect = () => {
      if (effect || destroyed) {
        return;
      }

      effect = new PaperCurtainEffect(canvas, {
        color: resolvedColor,
        backgroundOpacity: 0,
        style: 'classic',
        showLoader: false,
        horizontal: false,
        flipAxis: coverFlip,
        amplitude: 0.25,
        rippedFrequency: 3.5,
        rippedAmplitude: 0.05,
        curveFrequency: 1,
        curveAmplitude: 0.6,
        rippedDelta: 1,
        rippedHeight: 0.07,
        grainOpacity: 1.0,
        warmTint: 0.6,
        manageContainerBackground: false,
        registerGlobal: false,
      });
    };

    const releaseEffect = () => {
      effect?.destroy();
      effect = null;
    };

    const update = () => {
      scrollRaf = null;

      if (destroyed) {
        return;
      }

      if (!section) {
        section = findHostSection(anchorRef.current);

        if (!section) {
          return;
        }
      }

      const viewportHeight = window.innerHeight;
      const bottom = section.getBoundingClientRect().bottom;
      const t = (viewportHeight - bottom) / viewportHeight;

      if (t <= 0 || t >= 1) {
        canvas.style.opacity = '0';

        // Sleep the WebGL context once the zone is comfortably off screen.
        if (Math.abs(t - 0.5) > WAKE_DISTANCE_VH) {
          releaseEffect();
        } else {
          ensureEffect();
        }

        if (effect) {
          effect.state.progress = 0;
        }

        return;
      }

      ensureEffect();

      if (!effect) {
        return;
      }

      const covering = t < COVER_END;

      effect.setAxisFlip(covering ? coverFlip : !coverFlip);
      effect.state.progress = covering ? t / COVER_END : (1 - t) / (1 - COVER_END);
      canvas.style.opacity = '1';
    };

    const schedule = () => {
      if (scrollRaf === null) {
        scrollRaf = requestAnimationFrame(update);
      }
    };

    // Give Webflow's slot/host layout a beat to settle before measuring.
    const timer = setTimeout(() => {
      update();
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
    }, 80);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);

      if (scrollRaf !== null) {
        cancelAnimationFrame(scrollRaf);
      }

      releaseEffect();
    };
  }, [resolvedColor, resolvedDirection]);

  return (
    <div ref={anchorRef} style={{ height: 0, width: 0 }}>
      <canvas
        ref={canvasRef}
        style={{
          height: '100%',
          inset: 0,
          opacity: 0,
          pointerEvents: 'none',
          position: 'fixed',
          width: '100%',
          zIndex: resolvedZIndex,
        }}
      />
    </div>
  );
}

export default PaperScrollTransition;
