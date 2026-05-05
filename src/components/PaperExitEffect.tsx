import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type PaperExitVariant = 'corner-peel' | 'diagonal-wipe';

interface PaperExitEffectProps {
  sectionRef: RefObject<HTMLElement | null>;
  variant?: PaperExitVariant;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PaperExitEffect({ sectionRef }: PaperExitEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const _raw = canvasRef.current;
    if (!_raw) return;
    const canvas: HTMLCanvasElement = _raw;

    let effect: { state: { progress: number }; destroy: () => void } | null = null;
    let container: Element | null = null;
    let scrollRaf: number | null = null;
    let destroyed = false;

    function findContainer() {
      let el: Element | null = sectionRef.current;
      while (el && el !== document.documentElement) {
        if (el.getBoundingClientRect().height > 0) { container = el; return; }
        el = el.parentElement;
      }
      container = sectionRef.current;
    }

    // progress = 0 when section bottom = viewport bottom (scene just ending),
    // progress = 1 when section bottom = 0 (section fully scrolled off).
    function getProgress(): number {
      if (!container) return 0;
      const bottom = container.getBoundingClientRect().bottom;
      return Math.max(0, Math.min(1, (innerHeight - bottom) / innerHeight));
    }

    // Fades the canvas out once the section is fully off screen so the
    // makers-section behind shows through.
    function getAlpha(): number {
      if (!container) return 1;
      const bottom = container.getBoundingClientRect().bottom;
      if (bottom >= 0) return 1;
      return Math.max(0, 1 + bottom / (innerHeight * 0.15));
    }

    function update() {
      scrollRaf = null;
      if (!effect || destroyed) return;
      effect.state.progress = getProgress();
      canvas.style.opacity = String(getAlpha());
    }

    function schedule() {
      if (scrollRaf === null) scrollRaf = requestAnimationFrame(update);
    }

    async function init() {
      if (destroyed) return;
      // Use Function constructor to avoid Vite's static analysis of the URL.
      const dynamicImport = new Function('url', 'return import(url)');
      const { default: PaperCurtainEffect } = await dynamicImport('/BlackletterPaperCurtain.mjs');
      if (destroyed) return;

      effect = new PaperCurtainEffect(canvas, {
        color:                    '#1d1d1b',
        backgroundOpacity:        0,
        style:                    'classic',
        showLoader:               false,
        horizontal:               false,
        amplitude:                0.25,
        rippedFrequency:          3.5,
        rippedAmplitude:          0.05,
        curveFrequency:           1,
        curveAmplitude:           0.6,
        rippedDelta:              1,
        rippedHeight:             0.07,
        grainOpacity:             1.0,
        warmTint:                 0.6,
        manageContainerBackground: false,
      });

      findContainer();
      update();

      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
    }

    const timer = setTimeout(init, 80);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (scrollRaf !== null) cancelAnimationFrame(scrollRaf);
      effect?.destroy();
    };
  }, [sectionRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        inset:         0,
        pointerEvents: 'none',
        position:      'fixed',
        width:         '100%',
        height:        '100%',
        zIndex:        200,
      }}
    />
  );
}
