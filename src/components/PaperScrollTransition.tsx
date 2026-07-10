import { useEffect, useRef } from 'react';
import PaperCurtainEffect from './BlackletterPaperCurtain.mjs';

export type PaperScrollDirection = 'Bottom to Top' | 'Top to Bottom';

export interface PaperScrollTransitionProps {
  /** Paper colour for the sheet and torn band. */
  color?: string;
  /** Sweep direction of the wipe. Defaults to bottom-to-top. */
  direction?: string;
  /** Total transition time in seconds (cover + reveal). */
  duration?: number;
  /** z-index of the fixed overlay canvas. */
  zIndex?: number;
}

/**
 * How far (px) the section end must scroll past the viewport bottom before the
 * transition fires — a little intent, so resting exactly at a 100vh section's
 * end doesn't trigger it.
 */
const TRIGGER_OFFSET_PX = 60;

/** Pause at full cover before the reveal, like a page changing underneath. */
const COVER_HOLD_MS = 180;

/**
 * Create/destroy the WebGL effect based on distance to the section end so a
 * page full of sections never holds more than a couple of live contexts.
 */
const WAKE_DISTANCE_PX_FACTOR = 1.75;

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
 * The section whose end triggers the wipe: nearest composed ancestor that is a
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

// Matches the button curtain's power2.inOut feel.
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function PaperScrollTransition({
  color = '#1d1d1b',
  direction = 'Bottom to Top',
  duration = 2.2,
  zIndex = 200,
}: PaperScrollTransitionProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolvedColor = toText(color, '#1d1d1b');
  const resolvedDirection = normalizeDirection(direction);
  const resolvedDuration = Math.min(Math.max(toNumber(duration, 2.2), 0.6), 6);
  const resolvedZIndex = toNumber(zIndex, 200);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return undefined;
    }

    // Cover anchors the sheet on the edge it sweeps in from; the reveal swaps
    // the anchor while the screen is fully covered so the sheet keeps moving
    // the same way and exits through the opposite edge — one continuous pass.
    const coverFlip = resolvedDirection === 'Bottom to Top';
    const phaseMs = (resolvedDuration * 1000 - COVER_HOLD_MS) / 2;

    let effect: InstanceType<typeof PaperCurtainEffect> | null = null;
    let section: Element | null = null;
    let scrollRaf: number | null = null;
    let tweenRaf: number | null = null;
    let holdTimer: number | null = null;
    let destroyed = false;
    let running = false;
    let armed = true;
    let lastScrollY = window.scrollY;
    let previousOverflow = '';

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
      if (!running) {
        effect?.destroy();
        effect = null;
      }
    };

    const preventTouchScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    const lockScroll = () => {
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      window.addEventListener('touchmove', preventTouchScroll, { passive: false });
    };

    const unlockScroll = () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener('touchmove', preventTouchScroll);
    };

    const tweenProgress = (from: number, to: number, onDone: () => void) => {
      const start = performance.now();

      const step = (now: number) => {
        tweenRaf = null;

        if (destroyed || !effect) {
          return;
        }

        const t = Math.min((now - start) / phaseMs, 1);

        effect.state.progress = from + (to - from) * easeInOutCubic(t);

        if (t < 1) {
          tweenRaf = requestAnimationFrame(step);
        } else {
          onDone();
        }
      };

      tweenRaf = requestAnimationFrame(step);
    };

    const finishTransition = () => {
      canvas.style.opacity = '0';
      unlockScroll();
      running = false;
      lastScrollY = window.scrollY;
    };

    const runTransition = () => {
      ensureEffect();

      if (!effect || !section) {
        return;
      }

      running = true;
      armed = false;
      lockScroll();
      effect.setAxisFlip(coverFlip);
      effect.state.progress = 0;
      canvas.style.opacity = '1';

      tweenProgress(0, 1, () => {
        if (destroyed || !effect || !section) {
          finishTransition();
          return;
        }

        // Screen is fully covered: move to the next section underneath, then
        // let the sheet continue out through the far edge to reveal it.
        const bottom = section.getBoundingClientRect().bottom;

        window.scrollTo(0, window.scrollY + bottom);

        holdTimer = window.setTimeout(() => {
          holdTimer = null;

          if (destroyed || !effect) {
            finishTransition();
            return;
          }

          effect.setAxisFlip(!coverFlip);
          tweenProgress(1, 0, finishTransition);
        }, COVER_HOLD_MS);
      });
    };

    const update = () => {
      scrollRaf = null;

      if (destroyed || running) {
        return;
      }

      const scrollY = window.scrollY;
      const goingDown = scrollY > lastScrollY;

      lastScrollY = scrollY;

      if (!section) {
        section = findHostSection(anchorRef.current);

        if (!section) {
          return;
        }
      }

      const viewportHeight = window.innerHeight;
      const bottom = section.getBoundingClientRect().bottom;

      // Sleep the WebGL context when the section end is far away.
      if (Math.abs(bottom - viewportHeight) > viewportHeight * WAKE_DISTANCE_PX_FACTOR) {
        releaseEffect();
      } else {
        ensureEffect();
      }

      // Re-arm once the user has scrolled back up so the end is out of view.
      if (!armed && bottom >= viewportHeight - 4) {
        armed = true;
      }

      if (armed && goingDown && bottom > 0 && bottom < viewportHeight - TRIGGER_OFFSET_PX) {
        runTransition();
      }
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

      if (tweenRaf !== null) {
        cancelAnimationFrame(tweenRaf);
      }

      if (holdTimer !== null) {
        clearTimeout(holdTimer);
      }

      if (running) {
        unlockScroll();
        running = false;
      }

      releaseEffect();
    };
  }, [resolvedColor, resolvedDirection, resolvedDuration]);

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
