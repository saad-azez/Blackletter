import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export type PaperExitVariant = 'corner-peel' | 'diagonal-wipe';

interface PaperExitEffectProps {
  sectionRef: RefObject<HTMLElement | null>;
  variant?: PaperExitVariant;
}

function readCSSColor(cssVar: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (!raw) return fallback;
  if (/^#[0-9A-Fa-f]{3,8}$/.test(raw)) return raw;
  try {
    const el = document.createElement('div');
    document.head.appendChild(el);
    el.style.color = raw;
    const rgb = getComputedStyle(el).color;
    document.head.removeChild(el);
    const m = rgb.match(/(\d+)/g);
    if (m && m.length >= 3) {
      return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  return fallback;
}

export function PaperExitEffect({ sectionRef, variant = 'corner-peel' }: PaperExitEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas: HTMLCanvasElement = canvasRef.current;

    let raf: number | null = null;
    let container: Element | null = null;

    // Walk up the DOM to find the nearest ancestor with non-zero layout height.
    // In Webflow the component's own section reports height:0 (CSS override),
    // so we use the wrapping div that Webflow controls for scroll dimensions.
    function findContainer() {
      let el: Element | null = sectionRef.current;
      while (el && el !== document.documentElement) {
        if (el.getBoundingClientRect().height > 0) {
          container = el;
          return;
        }
        el = el.parentElement;
      }
      container = sectionRef.current;
    }

    function resize() {
      const dpr = devicePixelRatio;
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    }
    resize();

    function schedule() {
      if (raf === null) raf = requestAnimationFrame(render);
    }

    function render() {
      raf = null;
      const ctx = canvas.getContext('2d');
      if (!ctx || !container) return;

      const dpr = devicePixelRatio;
      const vw = innerWidth;
      const vh = innerHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);

      const bottom = container.getBoundingClientRect().bottom;

      // t = 0 → no paper, t = 1 → full screen covered
      // Start the moment the section's bottom edge hits the viewport bottom
      // (rocks visible at viewport bottom). Paper sweeps over the castle scene.
      const triggerRange = vh;
      let t: number;
      let globalAlpha = 1;

      if (bottom < 0) {
        // Section has fully scrolled past — fade the paper out so makers-section shows.
        t = 1;
        globalAlpha = Math.max(0, 1 + bottom / (vh * 0.35));
      } else {
        t = Math.max(0, Math.min(1, 1 - bottom / triggerRange));
      }

      if (t <= 0 || globalAlpha <= 0) return;

      const paperColor = readCSSColor('--paper-color-two', '#ffffff');

      ctx.save();
      ctx.globalAlpha = globalAlpha;
      paintPaper(ctx, vw, vh, t, paperColor, variant);
      ctx.restore();
    }

    function onResize() {
      resize();
      schedule();
    }

    const timer = setTimeout(() => {
      findContainer();
      schedule();
    }, 80);

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [sectionRef, variant]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        height: '100%',
        inset: 0,
        pointerEvents: 'none',
        position: 'fixed',
        width: '100%',
        zIndex: 200,
      }}
    />
  );
}

// ─── Geometry ────────────────────────────────────────────────────────────────

interface FoldEndpoints {
  x1: number; y1: number;
  x2: number; y2: number;
}

// Returns the two screen-edge endpoints of the fold line at coverage t.
//
// d = (vw + vh) * (1 - t) is the "wave distance" from the TL corner along the
// diagonal. Three phases track which pair of edges the fold line intersects,
// with natural breakpoints at t = vh/(vw+vh) and t = vw/(vw+vh) so the line
// moves continuously with no jumps as t goes 0 → 1.
//
// Phase A (t ≤ vh/(vw+vh)): right edge → bottom edge   (triangle from BR)
// Phase B (             ): top edge  → bottom edge   (quad, crossing screen)
// Phase C (t > vw/(vw+vh)): top edge  → left edge    (pentagon toward TL)
function getFoldLine(vw: number, vh: number, t: number): FoldEndpoints {
  const d = (vw + vh) * (1 - t);
  if (t <= vh / (vw + vh)) {
    return { x1: vw, y1: d - vw, x2: d - vh, y2: vh };
  }
  if (t <= vw / (vw + vh)) {
    return { x1: d, y1: 0, x2: d - vh, y2: vh };
  }
  return { x1: d, y1: 0, x2: 0, y2: d };
}

// Adds the paper polygon to the current path (does not stroke/fill).
function buildPaperPath(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  t: number,
) {
  const d = (vw + vh) * (1 - t);
  ctx.beginPath();
  if (t <= vh / (vw + vh)) {
    ctx.moveTo(vw, d - vw);  // right edge
    ctx.lineTo(vw, vh);       // BR corner
    ctx.lineTo(d - vh, vh);   // bottom edge
  } else if (t <= vw / (vw + vh)) {
    ctx.moveTo(d, 0);         // top edge
    ctx.lineTo(vw, 0);        // TR corner
    ctx.lineTo(vw, vh);       // BR corner
    ctx.lineTo(d - vh, vh);   // bottom edge
  } else {
    ctx.moveTo(d, 0);         // top edge
    ctx.lineTo(vw, 0);        // TR corner
    ctx.lineTo(vw, vh);       // BR corner
    ctx.lineTo(0, vh);        // BL corner
    ctx.lineTo(0, d);         // left edge
  }
  ctx.closePath();
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function paintPaper(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  t: number,
  paperColor: string,
  variant: PaperExitVariant,
) {
  const { x1, y1, x2, y2 } = getFoldLine(vw, vh, t);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;

  // Unit perpendicular toward BR (into paper)
  let inX = dy / len;
  let inY = -dx / len;
  if (inX + inY < 0) { inX = -inX; inY = -inY; }

  // Unit perpendicular toward TL (away from paper / uncovered side)
  const outX = -inX;
  const outY = -inY;

  const diag = Math.hypot(vw, vh);
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // ── 1. Clipped paper body ──────────────────────────────────────────────────
  ctx.save();
  buildPaperPath(ctx, vw, vh, t);
  ctx.clip();

  ctx.fillStyle = paperColor;
  ctx.fillRect(0, 0, vw, vh);

  if (variant === 'corner-peel') {
    // Back face of the peeled page — the paper curls outward so you see its
    // underside at the fold edge as a wide dark strip fading inward.
    const backFaceDepth = diag * 0.07;
    const backFaceGrad = ctx.createLinearGradient(
      mx, my,
      mx + inX * backFaceDepth, my + inY * backFaceDepth,
    );
    backFaceGrad.addColorStop(0,    'rgba(0,0,0,0.65)');
    backFaceGrad.addColorStop(0.35, 'rgba(0,0,0,0.22)');
    backFaceGrad.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = backFaceGrad;
    ctx.fillRect(0, 0, vw, vh);

    // Subtle light sheen on the front face just past the back face strip.
    const sheenDepth = diag * 0.18;
    const sheenGrad = ctx.createLinearGradient(
      mx, my,
      mx + inX * sheenDepth, my + inY * sheenDepth,
    );
    sheenGrad.addColorStop(0,    'rgba(255,255,255,0)');
    sheenGrad.addColorStop(0.10, 'rgba(255,255,255,0.09)');
    sheenGrad.addColorStop(0.45, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheenGrad;
    ctx.fillRect(0, 0, vw, vh);
  }

  ctx.restore();

  // ── 2. Cast shadow on the uncovered side ──────────────────────────────────
  const shadowDepth = variant === 'corner-peel' ? diag * 0.065 : diag * 0.028;
  const shadowGrad = ctx.createLinearGradient(
    mx, my,
    mx + outX * shadowDepth, my + outY * shadowDepth,
  );
  if (variant === 'corner-peel') {
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.62)');
    shadowGrad.addColorStop(0.35, 'rgba(0,0,0,0.20)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.38)');
    shadowGrad.addColorStop(0.5, 'rgba(0,0,0,0.10)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 + outX * shadowDepth, y2 + outY * shadowDepth);
  ctx.lineTo(x1 + outX * shadowDepth, y1 + outY * shadowDepth);
  ctx.closePath();
  ctx.fillStyle = shadowGrad;
  ctx.fill();
  ctx.restore();

  // ── 3. Fold-edge highlight — light catching the lifted paper edge ──────────
  if (variant === 'corner-peel') {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
}
