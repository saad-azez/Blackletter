import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PaperCurtainEffect from './BlackletterPaperCurtain.mjs';

export type PaperScrollDirection = 'Bottom to Top' | 'Top to Bottom';

export interface PaperScrollTransitionProps {
  /** Paper colour for the sheet and torn band. */
  color?: string;
  /** Sweep direction of the wipe when moving to the next section. */
  direction?: string;
  /** Total transition time in seconds (cover + reveal). */
  duration?: number;
  /** z-index of the fixed overlay canvas. */
  zIndex?: number;
}

/**
 * While the screen is fully covered, the page glides to its target over this
 * window instead of teleporting — the scrollbar thumb moves smoothly and the
 * pause doubles as the "page changing underneath" beat.
 */
const SNAP_GLIDE_MS = 320;

/**
 * Wheel/key input within this many px of the boundary is captured and snapped
 * to it, so the transition always starts pixel-aligned with the section end.
 */
const CAPTURE_WINDOW_PX = 48;

/**
 * Scroll that slips past a boundary between events (momentum, scrollbar drag)
 * is clamped back if it's within this fraction of the viewport; beyond that we
 * assume a deliberate jump (anchor link) and leave it alone.
 */
const CLAMP_WINDOW_FRACTION = 0.5;

/** Ignore new triggers briefly after a transition so momentum can't chain. */
const RETRIGGER_COOLDOWN_MS = 400;

/**
 * Create/destroy the WebGL effect based on distance to the section end so a
 * page full of sections never holds more than a couple of live contexts.
 */
const WAKE_DISTANCE_PX_FACTOR = 1.75;

/**
 * All instances share this so only one boundary can transition at a time and
 * a finished transition briefly suppresses every other boundary on the page.
 */
const transitionBus = { active: false, cooldownUntil: 0 };

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
 * The section whose end is this component's boundary: nearest composed
 * ancestor that is a <section> (Webflow's Section element) or opts in via
 * data-curtain-section; otherwise the first ancestor with real height.
 */
function findHostSection(element: Element | null): Element | null {
  let firstSized: Element | null = null;
  let current = getComposedParent(element);

  while (current && current !== document.documentElement) {
    if (current.matches('[data-curtain-section]') || current.matches('section')) {
      return current;
    }

    // Never fall back to the page itself — an instance bound to <body> would
    // treat the whole page as one section and hijack the first scroll.
    if (
      !firstSized &&
      current !== document.body &&
      current.getBoundingClientRect().height > 0
    ) {
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

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'))
  );
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

    // Track the mobile browser chrome expanding/collapsing where supported.
    if (typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh')) {
      canvas.style.height = '100dvh';
    }

    // Cover anchors the sheet on the edge it sweeps in from; the reveal swaps
    // the anchor while the screen is fully covered so the sheet keeps moving
    // the same way and exits through the opposite edge — one continuous pass.
    // Crossing the boundary upward plays the mirrored pass.
    const downCoverFlip = resolvedDirection === 'Bottom to Top';
    const phaseMs = (resolvedDuration * 1000 - SNAP_GLIDE_MS) / 2;

    let effect: InstanceType<typeof PaperCurtainEffect> | null = null;
    let section: Element | null = null;
    let liftChecked = false;
    let scrollRaf: number | null = null;
    let tweenRaf: number | null = null;
    let destroyed = false;
    let running = false;
    let lastScrollY = window.scrollY;
    let lastTouchY: number | null = null;
    let pinnedScrollY = 0;

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
        flipAxis: downCoverFlip,
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
      if (!running && effect) {
        effect.destroy();
        effect = null;
      }
    };

    const measure = () => {
      if (!section) {
        section = findHostSection(anchorRef.current);

        if (!section) {
          return null;
        }
      }

      const rect = section.getBoundingClientRect();

      // A boundary section must be able to fill the viewport on its own —
      // otherwise its neighbours are visible beside it and no curtain can
      // hide them. Lift short sections to viewport height. Deferred until the
      // section has layout, so initially-hidden sections get measured for
      // real once the experience reveals them.
      if (!liftChecked && rect.height >= 2 && section instanceof HTMLElement) {
        liftChecked = true;

        if (rect.height < window.innerHeight - 1) {
          section.style.minHeight = '100vh';
          section.style.minHeight = '100svh';

          return section.getBoundingClientRect();
        }
      }

      return rect;
    };

    const preventTouchScroll = (event: TouchEvent) => {
      event.preventDefault();
    };

    // Repins the page against anything the input handlers can't intercept
    // (scrollbar drags, middle-click autoscroll) while a transition plays.
    // Unlike overflow: hidden, this keeps the scrollbar visible so the
    // layout doesn't shift under the paper.
    const holdScrollPosition = () => {
      if (window.scrollY !== pinnedScrollY) {
        window.scrollTo(0, pinnedScrollY);
      }
    };

    const lockScroll = () => {
      pinnedScrollY = window.scrollY;
      window.addEventListener('scroll', holdScrollPosition, { passive: true });
      window.addEventListener('touchmove', preventTouchScroll, { passive: false });
    };

    const unlockScroll = () => {
      window.removeEventListener('scroll', holdScrollPosition);
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
      transitionBus.active = false;
      transitionBus.cooldownUntil = performance.now() + RETRIGGER_COOLDOWN_MS;
      lastScrollY = window.scrollY;
    };

    const runTransition = (towards: 'next' | 'previous') => {
      ensureEffect();

      if (!effect || !section || running || transitionBus.active) {
        return;
      }

      const coverFlip = towards === 'next' ? downCoverFlip : !downCoverFlip;

      running = true;
      transitionBus.active = true;
      lockScroll();
      effect.setAxisFlip(coverFlip);
      effect.state.progress = 0;
      canvas.style.opacity = '1';

      tweenProgress(0, 1, () => {
        if (destroyed || !effect || !section) {
          finishTransition();
          return;
        }

        // Screen is fully covered: glide the page (and the scrollbar thumb)
        // to its target instead of teleporting, then let the sheet continue
        // out through the far edge to reveal it. `next` lands with the
        // following section's top at the viewport top; `previous` lands with
        // this section's end at the viewport bottom.
        const bottom = section.getBoundingClientRect().bottom;
        const fromY = window.scrollY;
        const targetY = Math.max(
          0,
          towards === 'next' ? fromY + bottom : fromY + bottom - window.innerHeight,
        );
        const glideStart = performance.now();

        const glide = (now: number) => {
          tweenRaf = null;

          if (destroyed || !effect) {
            finishTransition();
            return;
          }

          const t = Math.min((now - glideStart) / SNAP_GLIDE_MS, 1);

          pinnedScrollY = Math.round(fromY + (targetY - fromY) * easeInOutCubic(t));
          window.scrollTo(0, pinnedScrollY);

          if (t < 1) {
            tweenRaf = requestAnimationFrame(glide);
            return;
          }

          effect.setAxisFlip(!coverFlip);
          tweenProgress(1, 0, finishTransition);
        };

        tweenRaf = requestAnimationFrame(glide);
      });
    };

    /**
     * Capture a scroll intent (wheel/touch/key) at the boundary. Returns true
     * when the event was consumed. The transition starts with the viewport
     * pixel-aligned inside this section, so the neighbour is never shown.
     */
    const captureIntent = (towardsNext: boolean) => {
      if (destroyed || running || transitionBus.active) {
        return running || transitionBus.active;
      }

      const rect = measure();

      // No section, or a section without layout (hidden) — never capture.
      if (!rect || rect.height < 2) {
        return false;
      }

      const viewportHeight = window.innerHeight;

      if (towardsNext) {
        // At (or approaching) this section's end while fully inside it.
        const atEnd =
          rect.top <= 2 &&
          rect.bottom >= viewportHeight - 2 &&
          rect.bottom <= viewportHeight + CAPTURE_WINDOW_PX;

        if (!atEnd) {
          return false;
        }

        if (performance.now() < transitionBus.cooldownUntil) {
          return true;
        }

        if (rect.bottom > viewportHeight + 2) {
          window.scrollTo(0, window.scrollY + (rect.bottom - viewportHeight));
        }

        runTransition('next');

        return true;
      }

      // Heading back up: the viewport sits at the top of the following
      // section, i.e. this section's end is at (or just above) the viewport top.
      const atFollowingTop = rect.bottom >= -2 && rect.bottom <= CAPTURE_WINDOW_PX;

      if (!atFollowingTop) {
        return false;
      }

      if (performance.now() < transitionBus.cooldownUntil) {
        return true;
      }

      if (rect.bottom > 2) {
        window.scrollTo(0, window.scrollY + rect.bottom);
      }

      runTransition('previous');

      return true;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      if (captureIntent(event.deltaY > 0)) {
        event.preventDefault();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const currentY = event.touches[0]?.clientY;

      if (currentY == null || lastTouchY == null) {
        return;
      }

      const delta = lastTouchY - currentY; // finger up = scroll down

      lastTouchY = currentY;

      if (delta !== 0 && captureIntent(delta > 0)) {
        event.preventDefault();
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const downKeys = ['ArrowDown', 'PageDown', 'End'];
      const upKeys = ['ArrowUp', 'PageUp', 'Home'];
      const isDown = downKeys.includes(event.key) || (event.key === ' ' && !event.shiftKey);
      const isUp = upKeys.includes(event.key) || (event.key === ' ' && event.shiftKey);

      if ((isDown || isUp) && captureIntent(isDown)) {
        event.preventDefault();
      }
    };

    // Momentum and scrollbar drags produce no capturable events; if they bleed
    // across the boundary between frames, clamp straight back and transition.
    const update = () => {
      scrollRaf = null;

      if (destroyed || running || transitionBus.active) {
        return;
      }

      const scrollY = window.scrollY;
      const goingDown = scrollY > lastScrollY;
      const goingUp = scrollY < lastScrollY;

      lastScrollY = scrollY;

      const rect = measure();

      if (!rect) {
        return;
      }

      const viewportHeight = window.innerHeight;
      const clampWindow = viewportHeight * CLAMP_WINDOW_FRACTION;

      // A section without layout (hidden until the experience starts, or a
      // collapsed wrapper) has no meaningful boundary — stay fully inert.
      if (rect.height < 2) {
        releaseEffect();
        return;
      }

      // Sleep the WebGL context when the boundary is far away.
      if (Math.abs(rect.bottom - viewportHeight) > viewportHeight * WAKE_DISTANCE_PX_FACTOR) {
        releaseEffect();
      } else {
        ensureEffect();
      }

      if (
        goingDown &&
        rect.bottom < viewportHeight - 2 &&
        rect.bottom > viewportHeight - clampWindow
      ) {
        window.scrollTo(0, scrollY - (viewportHeight - rect.bottom));

        if (performance.now() >= transitionBus.cooldownUntil) {
          runTransition('next');
        }

        return;
      }

      if (goingUp && rect.bottom > 2 && rect.bottom < clampWindow) {
        window.scrollTo(0, scrollY + rect.bottom);

        if (performance.now() >= transitionBus.cooldownUntil) {
          runTransition('previous');
        }
      }
    };

    const schedule = () => {
      if (scrollRaf === null) {
        scrollRaf = requestAnimationFrame(update);
      }
    };

    // Give Webflow's slot/host layout a beat to settle before measuring.
    const timer = setTimeout(() => {
      measure();
      update();
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      window.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('touchstart', onTouchStart, { passive: true });
      window.addEventListener('touchmove', onTouchMove, { passive: false });
      window.addEventListener('keydown', onKeyDown);
    }, 80);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKeyDown);

      if (scrollRaf !== null) {
        cancelAnimationFrame(scrollRaf);
      }

      if (tweenRaf !== null) {
        cancelAnimationFrame(tweenRaf);
      }

      if (running) {
        unlockScroll();
        running = false;
        transitionBus.active = false;
      }

      releaseEffect();
    };
  }, [resolvedColor, resolvedDirection, resolvedDuration]);

  // The canvas is portalled to <body>: any ancestor with a transform,
  // will-change or filter would become the containing block for a fixed
  // element and shrink the sheet to that box instead of the viewport.
  return (
    <div ref={anchorRef} style={{ height: 0, width: 0 }}>
      {typeof document === 'undefined'
        ? null
        : createPortal(
            <canvas
              ref={canvasRef}
              style={{
                height: '100vh',
                left: 0,
                opacity: 0,
                pointerEvents: 'none',
                position: 'fixed',
                top: 0,
                width: '100vw',
                zIndex: resolvedZIndex,
              }}
            />,
            document.body,
          )}
    </div>
  );
}

export default PaperScrollTransition;
