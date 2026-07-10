import { useEffect, useRef } from 'react';
import PaperCurtainEffect from './BlackletterPaperCurtain.mjs';

export type PaperScrollDirection = 'Bottom to Top' | 'Top to Bottom';

export interface PaperScrollTransitionProps {
  /** Paper colour for the sheet and torn band. */
  color?: string;
  /** Emit detailed console logs describing what this boundary sees and does. */
  debug?: boolean;
  /** Sweep direction of the wipe when moving to the next section. */
  direction?: string;
  /** Total transition time in seconds (cover + reveal). */
  duration?: number;
  /** z-index of the fixed overlay canvas. */
  zIndex?: number;
}

/** Pause at full cover before the reveal, like a page changing underneath. */
const COVER_HOLD_MS = 180;

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

/**
 * Which host sections already have an instance bound — two instances on one
 * section is almost always a markup problem (inner wrappers that aren't
 * <section> elements), so it gets a loud warning in debug mode.
 */
const hostRegistry = new Map<Element, number>();

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
function findHostSection(element: Element | null): {
  element: Element | null;
  matchedBy: 'data-curtain-section' | 'section tag' | 'sized ancestor fallback' | 'none';
} {
  let firstSized: Element | null = null;
  let current = getComposedParent(element);

  while (current && current !== document.documentElement) {
    if (current.matches('[data-curtain-section]')) {
      return { element: current, matchedBy: 'data-curtain-section' };
    }

    if (current.matches('section')) {
      return { element: current, matchedBy: 'section tag' };
    }

    if (!firstSized && current.getBoundingClientRect().height > 0) {
      firstSized = current;
    }

    current = getComposedParent(current);
  }

  return firstSized
    ? { element: firstSized, matchedBy: 'sized ancestor fallback' }
    : { element: null, matchedBy: 'none' };
}

function describeElement(element: Element) {
  const id = element.id ? `#${element.id}` : '';
  const classes = element.classList.length
    ? `.${[...element.classList].slice(0, 3).join('.')}`
    : '';

  if (id || classes) {
    return `${element.tagName.toLowerCase()}${id}${classes}`;
  }

  // No id/classes to tell sections apart — fall back to document order.
  const peers = [...document.querySelectorAll('section, [data-curtain-section]')];
  const index = peers.indexOf(element);

  return index >= 0
    ? `${element.tagName.toLowerCase()}[${index + 1}]`
    : element.tagName.toLowerCase();
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
  debug = false,
  direction = 'Bottom to Top',
  duration = 2.2,
  zIndex = 200,
}: PaperScrollTransitionProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resolvedColor = toText(color, '#1d1d1b');
  const resolvedDebug = debug === true || String(debug).toLowerCase() === 'true';
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
    // Crossing the boundary upward plays the mirrored pass.
    const downCoverFlip = resolvedDirection === 'Bottom to Top';
    const phaseMs = (resolvedDuration * 1000 - COVER_HOLD_MS) / 2;

    let effect: InstanceType<typeof PaperCurtainEffect> | null = null;
    let section: Element | null = null;
    let sectionLabel = 'unbound';
    let lastLoggedState = '';
    let transitionStartedAt = 0;
    let scrollRaf: number | null = null;
    let tweenRaf: number | null = null;
    let holdTimer: number | null = null;
    let destroyed = false;
    let running = false;
    let lastScrollY = window.scrollY;
    let lastTouchY: number | null = null;
    let previousOverflow = '';

    const debugEnabled = () =>
      resolvedDebug ||
      Boolean(
        (window as unknown as { __BLACKLETTER_PAPER_DEBUG__?: unknown })
          .__BLACKLETTER_PAPER_DEBUG__,
      );

    const log = (message: string, data?: Record<string, unknown>, level: 'log' | 'warn' = 'log') => {
      if (!debugEnabled()) {
        return;
      }

      console[level](`[PaperScroll · ${sectionLabel}] ${message}`, data ?? '');
    };

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

      log('WebGL curtain created — boundary is nearby');
    };

    const releaseEffect = () => {
      if (!running && effect) {
        effect.destroy();
        effect = null;
        log('WebGL curtain released — boundary is far away');
      }
    };

    const measure = () => {
      if (!section) {
        const found = findHostSection(anchorRef.current);

        section = found.element;

        if (!section) {
          return null;
        }

        sectionLabel = describeElement(section);

        const boundCount = (hostRegistry.get(section) ?? 0) + 1;

        hostRegistry.set(section, boundCount);

        const rect = section.getBoundingClientRect();

        log('bound to host section', {
          matchedBy: found.matchedBy,
          heightPx: Math.round(rect.height),
          topPx: Math.round(rect.top),
          bottomPx: Math.round(rect.bottom),
          viewportPx: window.innerHeight,
          scrollY: Math.round(window.scrollY),
          direction: resolvedDirection,
          durationS: resolvedDuration,
          instancesOnThisSection: boundCount,
        });

        if (boundCount > 1) {
          log(
            `${boundCount} transition instances are bound to this SAME section — each instance needs its own section. If your inner sections are divs inside a wrapper (e.g. experience-started), add a data-curtain-section attribute to each inner wrapper.`,
            undefined,
            'warn',
          );
        }

        // A boundary section must be able to fill the viewport on its own —
        // otherwise its neighbours are visible beside it and no curtain can
        // hide them. Lift short sections to viewport height.
        if (section instanceof HTMLElement) {
          const height = rect.height;

          if (height > 0 && height < window.innerHeight - 1) {
            section.style.minHeight = '100vh';
            section.style.minHeight = '100svh';
            log('section is shorter than the viewport — lifted min-height to 100svh', {
              originalHeightPx: Math.round(height),
              viewportPx: window.innerHeight,
            });
          }
        }
      }

      return section.getBoundingClientRect();
    };

    const describeState = (rect: DOMRect, viewportHeight: number) => {
      if (rect.bottom < -2) {
        return 'passed — section is fully above the viewport';
      }

      if (rect.bottom <= CAPTURE_WINDOW_PX) {
        return 'resting at the FOLLOWING section top — armed for an upward transition';
      }

      if (rect.top > viewportHeight - 2) {
        return 'not reached — section is fully below the viewport';
      }

      if (
        rect.top <= 2 &&
        rect.bottom >= viewportHeight - 2 &&
        rect.bottom <= viewportHeight + CAPTURE_WINDOW_PX
      ) {
        return 'at END boundary — armed, next scroll-down input starts the transition';
      }

      if (rect.top <= 2 && rect.bottom > viewportHeight) {
        return 'viewport inside section — free scroll (end not reached yet)';
      }

      if (rect.top > 2) {
        return 'entering — section top is visible, previous section still on screen above';
      }

      return 'boundary bleed inside viewport — clamp should fire';
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
      transitionBus.active = false;
      transitionBus.cooldownUntil = performance.now() + RETRIGGER_COOLDOWN_MS;
      lastScrollY = window.scrollY;
      log('transition finished — resting on target section, scroll unlocked', {
        scrollY: Math.round(window.scrollY),
        elapsedMs: Math.round(performance.now() - transitionStartedAt),
        cooldownMs: RETRIGGER_COOLDOWN_MS,
      });
    };

    const runTransition = (towards: 'next' | 'previous', source: string) => {
      ensureEffect();

      if (!effect || !section || running || transitionBus.active) {
        return;
      }

      const coverFlip = towards === 'next' ? downCoverFlip : !downCoverFlip;

      running = true;
      transitionBus.active = true;
      transitionStartedAt = performance.now();
      lockScroll();
      effect.setAxisFlip(coverFlip);
      effect.state.progress = 0;
      canvas.style.opacity = '1';

      log(`transition started → ${towards.toUpperCase()} section (scroll locked)`, {
        triggeredBy: source,
        paperEntersFrom: coverFlip ? 'bottom' : 'top',
        coverMs: Math.round(phaseMs),
        holdMs: COVER_HOLD_MS,
        revealMs: Math.round(phaseMs),
        scrollY: Math.round(window.scrollY),
      });

      tweenProgress(0, 1, () => {
        if (destroyed || !effect || !section) {
          finishTransition();
          return;
        }

        // Screen is fully covered: move the page underneath, then let the
        // sheet continue out through the far edge to reveal it. `next` lands
        // with the following section's top at the viewport top; `previous`
        // lands with this section's end at the viewport bottom.
        const bottom = section.getBoundingClientRect().bottom;
        const target =
          towards === 'next'
            ? window.scrollY + bottom
            : window.scrollY + bottom - window.innerHeight;
        const clampedTarget = Math.max(0, target);

        log('cover complete — screen fully hidden, snapping page underneath', {
          fromScrollY: Math.round(window.scrollY),
          toScrollY: Math.round(clampedTarget),
        });

        window.scrollTo(0, clampedTarget);

        holdTimer = window.setTimeout(() => {
          holdTimer = null;

          if (destroyed || !effect) {
            finishTransition();
            return;
          }

          effect.setAxisFlip(!coverFlip);
          log(`reveal started — sheet exiting through the ${coverFlip ? 'top' : 'bottom'}`);
          tweenProgress(1, 0, finishTransition);
        }, COVER_HOLD_MS);
      });
    };

    /**
     * Capture a scroll intent (wheel/touch/key) at the boundary. Returns true
     * when the event was consumed. The transition starts with the viewport
     * pixel-aligned inside this section, so the neighbour is never shown.
     */
    const captureIntent = (towardsNext: boolean, source: string) => {
      if (destroyed || running || transitionBus.active) {
        return running || transitionBus.active;
      }

      const rect = measure();

      if (!rect) {
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
          log(`${source} at end boundary ignored — cooldown after previous transition`, {
            remainingMs: Math.round(transitionBus.cooldownUntil - performance.now()),
          });
          return true;
        }

        if (rect.bottom > viewportHeight + 2) {
          log('aligning section end to the viewport bottom before cover', {
            byPx: Math.round(rect.bottom - viewportHeight),
          });
          window.scrollTo(0, window.scrollY + (rect.bottom - viewportHeight));
        }

        log(`${source} captured at END boundary — page did not move, starting transition`, {
          sectionBottomPx: Math.round(rect.bottom),
          viewportPx: viewportHeight,
        });
        runTransition('next', source);

        return true;
      }

      // Heading back up: the viewport sits at the top of the following
      // section, i.e. this section's end is at (or just above) the viewport top.
      const atFollowingTop = rect.bottom >= -2 && rect.bottom <= CAPTURE_WINDOW_PX;

      if (!atFollowingTop) {
        return false;
      }

      if (performance.now() < transitionBus.cooldownUntil) {
        log(`${source} at upward boundary ignored — cooldown after previous transition`, {
          remainingMs: Math.round(transitionBus.cooldownUntil - performance.now()),
        });
        return true;
      }

      if (rect.bottom > 2) {
        log('aligning following section top to the viewport top before cover', {
          byPx: Math.round(rect.bottom),
        });
        window.scrollTo(0, window.scrollY + rect.bottom);
      }

      log(`${source} captured at UPWARD boundary — page did not move, starting transition`, {
        sectionBottomPx: Math.round(rect.bottom),
      });
      runTransition('previous', source);

      return true;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      if (captureIntent(event.deltaY > 0, 'wheel')) {
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

      if (delta !== 0 && captureIntent(delta > 0, 'touch')) {
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

      if ((isDown || isUp) && captureIntent(isDown, 'keyboard')) {
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

      // Sleep the WebGL context when the boundary is far away.
      if (Math.abs(rect.bottom - viewportHeight) > viewportHeight * WAKE_DISTANCE_PX_FACTOR) {
        releaseEffect();
      } else {
        ensureEffect();
      }

      const state = describeState(rect, viewportHeight);

      if (state !== lastLoggedState) {
        lastLoggedState = state;
        log(`state → ${state}`, {
          topPx: Math.round(rect.top),
          bottomPx: Math.round(rect.bottom),
          viewportPx: viewportHeight,
          scrollY: Math.round(scrollY),
        });
      }

      if (
        goingDown &&
        rect.bottom < viewportHeight - 2 &&
        rect.bottom > viewportHeight - clampWindow
      ) {
        log('scroll bled past the end boundary (momentum/scrollbar) — clamping back', {
          bleedPx: Math.round(viewportHeight - rect.bottom),
        });
        window.scrollTo(0, scrollY - (viewportHeight - rect.bottom));

        if (performance.now() >= transitionBus.cooldownUntil) {
          runTransition('next', 'scroll clamp');
        }

        return;
      }

      if (goingUp && rect.bottom > 2 && rect.bottom < clampWindow) {
        log('scroll bled above the boundary (momentum/scrollbar) — clamping back', {
          bleedPx: Math.round(rect.bottom),
        });
        window.scrollTo(0, scrollY + rect.bottom);

        if (performance.now() >= transitionBus.cooldownUntil) {
          runTransition('previous', 'scroll clamp');
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

      if (holdTimer !== null) {
        clearTimeout(holdTimer);
      }

      if (running) {
        unlockScroll();
        running = false;
        transitionBus.active = false;
      }

      if (section) {
        const count = (hostRegistry.get(section) ?? 1) - 1;

        if (count <= 0) {
          hostRegistry.delete(section);
        } else {
          hostRegistry.set(section, count);
        }
      }

      releaseEffect();
    };
  }, [resolvedColor, resolvedDebug, resolvedDirection, resolvedDuration]);

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
