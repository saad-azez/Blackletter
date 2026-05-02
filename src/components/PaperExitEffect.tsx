import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import parchmentUrl from '../assets/Textures/parchment back-blac 1.png';

export type PaperExitVariant = 'corner-peel' | 'diagonal-wipe';

interface PaperExitEffectProps {
  sectionRef: RefObject<HTMLElement | null>;
  variant?: PaperExitVariant;
}

export function PaperExitEffect({ sectionRef, variant = 'corner-peel' }: PaperExitEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas: HTMLCanvasElement = canvasRef.current;

    let texture: HTMLImageElement | null = null;
    let raf: number | null = null;
    let container: Element | null = null;

    const img = new Image();
    img.src = parchmentUrl;
    img.onload = () => {
      texture = img;
      schedule();
    };

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
      // Effect spans the last 1.2 viewport-heights of the section's scroll.
      const triggerRange = vh * 1.2;
      let t: number;
      let globalAlpha = 1;

      if (bottom < 0) {
        // Section has fully scrolled past. Fade the paper out quickly so
        // makers-section is not obscured.
        t = 1;
        globalAlpha = Math.max(0, 1 + bottom / (vh * 0.35));
      } else {
        t = Math.max(0, Math.min(1, 1 - bottom / triggerRange));
      }

      if (t <= 0 || globalAlpha <= 0) return;

      ctx.save();
      ctx.globalAlpha = globalAlpha;
      paintPaper(ctx, vw, vh, t, texture, variant);
      ctx.restore();
    }

    function schedule() {
      if (raf === null) raf = requestAnimationFrame(render);
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
// Phase 1 (t ≤ 0.5): line sweeps from the BR corner outward along bottom + right edges.
// Phase 2 (t > 0.5): line continues across from left edge to top edge.
function getFoldLine(vw: number, vh: number, t: number): FoldEndpoints {
  if (t <= 0.5) {
    const s = t * 2;
    return { x1: vw * (1 - s), y1: vh, x2: vw, y2: vh * (1 - s) };
  }
  const s = (t - 0.5) * 2;
  return { x1: 0, y1: vh * (1 - s), x2: vw * s, y2: 0 };
}

// Adds the paper polygon to the current path (does not stroke/fill).
function buildPaperPath(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  t: number,
) {
  ctx.beginPath();
  if (t <= 0.5) {
    const s = t * 2;
    ctx.moveTo(vw * (1 - s), vh); // bottom edge
    ctx.lineTo(vw, vh);            // BR corner
    ctx.lineTo(vw, vh * (1 - s)); // right edge
    ctx.closePath();
  } else {
    const s = (t - 0.5) * 2;
    ctx.moveTo(0, vh * (1 - s));  // left edge
    ctx.lineTo(0, vh);             // BL corner
    ctx.lineTo(vw, vh);            // BR corner
    ctx.lineTo(vw, 0);             // TR corner
    ctx.lineTo(vw * s, 0);         // top edge
    ctx.closePath();
  }
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function paintPaper(
  ctx: CanvasRenderingContext2D,
  vw: number,
  vh: number,
  t: number,
  texture: HTMLImageElement | null,
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

  // Parchment texture fill
  if (texture && texture.naturalWidth > 0) {
    const scale = Math.min(vw, vh) / texture.naturalWidth * 0.85;
    const pat = ctx.createPattern(texture, 'repeat');
    if (pat) {
      pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
      ctx.fillStyle = pat;
    } else {
      ctx.fillStyle = '#c9a479';
    }
  } else {
    ctx.fillStyle = '#c9a479';
  }
  ctx.fillRect(0, 0, vw, vh);

  // Inner-edge shading: darkens the paper near the fold to sell the curl/lift
  if (variant === 'corner-peel') {
    const inDepth = diag * 0.10;
    const innerGrad = ctx.createLinearGradient(
      mx, my,
      mx + inX * inDepth, my + inY * inDepth,
    );
    innerGrad.addColorStop(0, 'rgba(0,0,0,0.32)');
    innerGrad.addColorStop(0.45, 'rgba(0,0,0,0.10)');
    innerGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = innerGrad;
    ctx.fillRect(0, 0, vw, vh);

    // Thin dark "back-of-page" strip right at the fold edge
    const backDepth = diag * 0.018;
    const backGrad = ctx.createLinearGradient(mx, my, mx + inX * backDepth, my + inY * backDepth);
    backGrad.addColorStop(0, 'rgba(20,12,5,0.55)');
    backGrad.addColorStop(1, 'rgba(20,12,5,0)');
    ctx.fillStyle = backGrad;
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
    ctx.strokeStyle = 'rgba(255,248,220,0.70)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}
