import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import PaperCurtainEffect from './BlackletterPaperCurtain.mjs';

export type PaperScrollDirection = 'Bottom to Top' | 'Top to Bottom';

/** Minimal shape of the page's Lenis instance (exposed as window.__lenis). */
interface LenisLike {
  scrollTo: (
    target: number,
    options?: {
      duration?: number;
      easing?: (t: number) => number;
      immediate?: boolean;
      lock?: boolean;
      force?: boolean;
      onComplete?: () => void;
    },
  ) => void;
  /** Where Lenis is heading (leads the visible position). */
  targetScroll?: number;
  /** The current interpolated scroll position. */
  animatedScroll?: number;
}

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

/**
 * Page-level code (e.g. GSAP section intros in Webflow custom code) listens
 * for these to hold content reveals until the sheet has fully cleared.
 */
function emitTransitionPhase(phase: 'start' | 'end', towards: 'next' | 'previous') {
  window.dispatchEvent(
    new CustomEvent('blackletter:paper-transition', { detail: { phase, towards } }),
  );
}

/**
 * Page-level paper choreography (e.g. the footer loop curtain in Webflow
 * custom code) announces itself on the same event; every boundary holds
 * while any paper transition — ours or foreign — covers the viewport.
 */
const foreignBus = { active: false };

if (typeof window !== 'undefined') {
  window.addEventListener('blackletter:paper-transition', (event) => {
    const detail = (event as CustomEvent<{ phase?: string }>).detail;

    if (detail?.phase === 'start') {
      foreignBus.active = true;
    } else if (detail?.phase === 'end') {
      foreignBus.active = false;
    }
  });
}

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

// TEMP debug — flip to false / remove once the transitions are dialed in.
const PAPER_SCROLL_DEBUG = true;
const PAPER_SCROLL_VERSION = 'cross-3';

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
    // Previous frame's section-bottom position, so we can detect the actual
    // moment the boundary is CROSSED rather than firing on a lingering state
    // (which would re-fire from anywhere past the section).
    let lastBottom = 0;
    let haveLast = false;
    // Debug: this instance's section label + a log throttle.
    let logLabel = '?';
    let lastLog = 0;

    // Drive scroll through the page's Lenis smooth-scroll instance when it
    // exists, so the whole transition (including the cross-boundary glide) is
    // one smooth, interpolated motion instead of a hard window.scrollTo lock.
    // A raw window.scrollTo would also just be overridden by Lenis next frame.
    const getLenis = () =>
      (window as unknown as { __lenis?: LenisLike }).__lenis || null;

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

        // Identify this instance by the section it's bound to, and announce it
        // so we can see exactly which sections carry a transition.
        const cls =
          section instanceof HTMLElement && typeof section.className === 'string'
            ? section.className.trim().split(/\s+/).join('.')
            : '';
        logLabel = cls ? section.tagName.toLowerCase() + '.' + cls : section.tagName.toLowerCase();

        if (PAPER_SCROLL_DEBUG) {
          const r = section.getBoundingClientRect();
          console.log(
            '[PaperScroll]',
            PAPER_SCROLL_VERSION,
            'MOUNTED on',
            logLabel,
            '{ height:',
            Math.round(r.height),
            ', dir:',
            resolvedDirection,
            ', lenis:',
            Boolean(getLenis()),
            '}',
          );
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
      // With Lenis driving the glide, pinning against every scroll event would
      // fight it; user input is already blocked by the capture handlers, and
      // Lenis's own `lock` covers the glide. Keep the pin only as the fallback.
      if (!getLenis()) {
        window.addEventListener('scroll', holdScrollPosition, { passive: true });
      }
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

    let runningTowards: 'next' | 'previous' = 'next';

    const finishTransition = () => {
      canvas.style.opacity = '0';
      unlockScroll();
      running = false;
      transitionBus.active = false;
      transitionBus.cooldownUntil = performance.now() + RETRIGGER_COOLDOWN_MS;
      lastScrollY = window.scrollY;
      emitTransitionPhase('end', runningTowards);
    };

    const runTransition = (towards: 'next' | 'previous') => {
      ensureEffect();

      if (!effect || !section || running || transitionBus.active || foreignBus.active) {
        return;
      }

      const coverFlip = towards === 'next' ? downCoverFlip : !downCoverFlip;

      if (PAPER_SCROLL_DEBUG) {
        const r = section.getBoundingClientRect();
        console.log(
          '[PaperScroll]',
          logLabel,
          '>>> FIRE',
          towards,
          '{ scrollY:',
          Math.round(window.scrollY),
          ', top:',
          Math.round(r.top),
          ', bottom:',
          Math.round(r.bottom),
          '}',
        );
      }

      running = true;
      runningTowards = towards;
      transitionBus.active = true;
      lockScroll();
      effect.setAxisFlip(coverFlip);
      effect.state.progress = 0;
      canvas.style.opacity = '1';
      emitTransitionPhase('start', towards);

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

        const onGlideDone = () => {
          if (destroyed || !effect) {
            finishTransition();
            return;
          }

          pinnedScrollY = targetY;
          effect.setAxisFlip(!coverFlip);
          tweenProgress(1, 0, finishTransition);
        };

        const lenis = getLenis();

        if (lenis) {
          // Hand the cross-boundary scroll to Lenis: one smooth, eased,
          // interpolated motion instead of a hard-locked window.scrollTo jump.
          pinnedScrollY = targetY;
          lenis.scrollTo(targetY, {
            duration: SNAP_GLIDE_MS / 1000,
            easing: easeInOutCubic,
            lock: true,
            force: true,
            onComplete: onGlideDone,
          });

          return;
        }

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

          onGlideDone();
        };

        tweenRaf = requestAnimationFrame(glide);
      });
    };

    // =====================================================================
    // BOUNDARY CROSSING
    //
    // With Lenis (the normal case) Lenis owns the scroll. We watch where it is
    // HEADING — targetScroll leads the visible position — and start the
    // transition the instant that lead crosses a section boundary, BEFORE the
    // visible scroll can shoot past and get pulled back. That pull-back, from
    // Lenis overshooting and being clamped, was the bounce. No clamp now: the
    // page never crosses, so there is nothing to yank back.
    //
    // Without Lenis we fall back to predicting from the raw wheel/touch delta.
    // =====================================================================

    // Fire a hair before the edge exactly meets the viewport, so it triggers
    // right as the section ends rather than a frame or two after.
    const EDGE_LOOKAHEAD_FR = 0.06; // × viewport
    // Tight tolerance around a boundary — small enough that it fires on time,
    // wide enough that a normal scroll frame lands inside it.
    const STATE_BAND_FR = 0.2; // × viewport
    // "Up" only arms near the top boundary, not from deep inside the section.
    const UP_ARM_FR = 0.35; // × viewport

    // Direction and crossing are read from how the section's own bottom moved
    // since last frame (lastBottom) — robust, and independent of Lenis internals.
    const boundaryCheck = (rect: DOMRect) => {
      if (!haveLast || performance.now() < transitionBus.cooldownUntil) {
        return;
      }

      const vh = window.innerHeight;
      const edge = vh * EDGE_LOOKAHEAD_FR;
      const band = vh * STATE_BAND_FR;
      const goingDown = rect.bottom < lastBottom;
      const goingUp = rect.bottom > lastBottom;

      // Debug: while heading down anywhere near this section's end, report what
      // the instance sees and whether it will fire — so we can see exactly why a
      // given boundary does or doesn't trigger.
      if (
        PAPER_SCROLL_DEBUG &&
        goingDown &&
        rect.top <= vh &&
        rect.bottom <= vh * 1.6 &&
        rect.bottom >= vh - band - 4
      ) {
        const now = performance.now();
        if (now - lastLog > 180) {
          lastLog = now;
          const willFire =
            rect.top <= 2 &&
            rect.bottom <= vh + edge &&
            (lastBottom > vh + edge || rect.bottom >= vh - band);
          console.log(
            '[PaperScroll]',
            logLabel,
            'approach↓',
            '{ top:', Math.round(rect.top),
            ', bottom:', Math.round(rect.bottom),
            ', lastBottom:', Math.round(lastBottom),
            ', vh:', vh,
            ', topOk:', rect.top <= 2,
            ', crossed:', lastBottom > vh + edge,
            ', atBand:', rect.bottom >= vh - band,
            ', willFire:', willFire,
            '}',
          );
        }
      }

      // DOWN — scrolling down and the section's bottom just reached the viewport
      // bottom (its end). Fire only when we CROSS that line this frame, or are
      // sitting right at it — never from far past (which re-fired endlessly).
      if (
        rect.top <= 2 &&
        goingDown &&
        rect.bottom <= vh + edge &&
        (lastBottom > vh + edge || rect.bottom >= vh - band)
      ) {
        runTransition('next');
        return;
      }

      // UP — scrolling up and the section's bottom just reached the viewport
      // top, caught only near that boundary (not from deep inside the section).
      if (
        goingUp &&
        rect.bottom >= -edge &&
        rect.bottom <= vh * UP_ARM_FR &&
        (lastBottom < -edge || rect.bottom <= band)
      ) {
        runTransition('previous');
      }
    };

    // Fallback (no Lenis): predict from the raw delta and start at the boundary.
    // `projectedDelta` widens the window so a fling lands on the boundary
    // instead of sailing across it.
    const nativeCaptureIntent = (towardsNext: boolean, projectedDelta = 0) => {
      if (destroyed || running || transitionBus.active || foreignBus.active) {
        return running || transitionBus.active || foreignBus.active;
      }

      const rect = measure();

      if (!rect || rect.height < 2) {
        return false;
      }

      const viewportHeight = window.innerHeight;
      const reach = Math.max(0, projectedDelta);

      if (towardsNext) {
        const atEnd =
          rect.top <= 2 &&
          rect.bottom >= viewportHeight - 2 &&
          rect.bottom <= viewportHeight + CAPTURE_WINDOW_PX + reach;

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

      const atFollowingTop =
        rect.bottom >= -(2 + reach) && rect.bottom <= CAPTURE_WINDOW_PX;

      if (!atFollowingTop) {
        return false;
      }

      if (performance.now() < transitionBus.cooldownUntil) {
        return true;
      }

      if (Math.abs(rect.bottom) > 2) {
        window.scrollTo(0, window.scrollY + rect.bottom);
      }

      runTransition('previous');
      return true;
    };

    // Is any transition (ours or a foreign one) currently covering the screen?
    const transitionCovering = () =>
      running || transitionBus.active || foreignBus.active;

    // Capture-phase input. While a transition covers the screen, swallow every
    // scroll input outright so nothing — not even Lenis — moves the page under
    // the sheet. Otherwise: with Lenis, let it flow (the crossing is caught
    // from Lenis's lead target in `update`); without Lenis, drive prediction.
    const onWheelCapture = (event: WheelEvent) => {
      if (transitionCovering()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (getLenis() || event.deltaY === 0) {
        return;
      }

      const unit =
        event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? window.innerHeight : 1;
      const step = Math.abs(event.deltaY) * unit;

      if (nativeCaptureIntent(event.deltaY > 0, step)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };

    const onTouchMoveCapture = (event: TouchEvent) => {
      if (transitionCovering()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (getLenis()) {
        return;
      }

      const currentY = event.touches[0]?.clientY;

      if (currentY == null || lastTouchY == null) {
        return;
      }

      const delta = lastTouchY - currentY; // finger up = scroll down
      lastTouchY = currentY;

      if (delta !== 0 && nativeCaptureIntent(delta > 0, Math.abs(delta))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const downKeys = ['ArrowDown', 'PageDown', 'End'];
      const upKeys = ['ArrowUp', 'PageUp', 'Home'];
      const isDown = downKeys.includes(event.key) || (event.key === ' ' && !event.shiftKey);
      const isUp = upKeys.includes(event.key) || (event.key === ' ' && event.shiftKey);

      if (!isDown && !isUp) {
        return;
      }

      if (transitionCovering()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const step = event.key === 'ArrowDown' || event.key === 'ArrowUp' ? 120 : window.innerHeight;
      const lenis = getLenis();

      if (lenis) {
        // Route keyboard scrolling through Lenis so it stays smooth and the
        // boundary watcher in `update` can catch a crossing.
        event.preventDefault();
        lenis.scrollTo(window.scrollY + (isDown ? step : -step), { force: true });
        return;
      }

      if (nativeCaptureIntent(isDown, step)) {
        event.preventDefault();
      }
    };

    // Runs on every scroll frame. With Lenis it watches the lead target; without
    // Lenis it clamps momentum that slipped across the boundary between frames.
    const update = () => {
      scrollRaf = null;

      if (destroyed || transitionCovering()) {
        // Discard crossing history while any transition covers the screen, so
        // the first scroll after landing re-initializes from the CURRENT
        // position instead of comparing against a stale pre-transition one
        // (which faked a boundary crossing and skipped the section).
        haveLast = false;
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

      const lenis = getLenis();

      if (lenis) {
        boundaryCheck(rect);
        lastBottom = rect.bottom;
        haveLast = true;
        return;
      }

      const clampWindow = viewportHeight * CLAMP_WINDOW_FRACTION;

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
      // Capture phase so we can beat Lenis's own wheel/touch handlers and
      // block input outright while the sheet covers the screen.
      window.addEventListener('wheel', onWheelCapture, { passive: false, capture: true });
      window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
      window.addEventListener('touchmove', onTouchMoveCapture, { passive: false, capture: true });
      window.addEventListener('keydown', onKeyDownCapture, { capture: true });
    }, 80);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('wheel', onWheelCapture, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchstart', onTouchStart, { capture: true } as EventListenerOptions);
      window.removeEventListener('touchmove', onTouchMoveCapture, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', onKeyDownCapture, { capture: true } as EventListenerOptions);

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
        emitTransitionPhase('end', runningTowards);
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
