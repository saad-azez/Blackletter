import { useEffect, useRef, useState } from 'react';
import PaperCurtainEffect from './BlackletterPaperCurtain.mjs';

const styles = {
  root: {
    background: 'radial-gradient(circle at 50% 30%, #1a0f08 0%, #060607 100%)',
    color: '#f5efe5',
    fontFamily: '"Iowan Old Style", "Palatino Linotype", serif',
    minHeight: '100svh',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  hero: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.5rem',
    justifyContent: 'center',
    minHeight: '100svh',
    padding: '2rem',
    textAlign: 'center' as const,
    position: 'relative' as const,
    zIndex: 1,
  },
  heading: {
    fontSize: 'clamp(3rem, 8vw, 7rem)',
    fontWeight: 400,
    letterSpacing: '-0.03em',
    lineHeight: 0.92,
    margin: 0,
  },
  sub: {
    color: 'rgba(245, 239, 229, 0.58)',
    fontSize: 'clamp(1rem, 2.2vw, 1.35rem)',
    letterSpacing: '0.12em',
    margin: 0,
    textTransform: 'uppercase' as const,
  },
  canvas: {
    inset: 0,
    pointerEvents: 'none' as const,
    position: 'fixed' as const,
    zIndex: 10,
  },
  controls: {
    backdropFilter: 'blur(18px)',
    background: 'rgba(10, 8, 8, 0.7)',
    border: '1px solid rgba(255, 245, 230, 0.12)',
    borderRadius: '16px',
    bottom: '2rem',
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '0.6rem',
    left: '50%',
    padding: '0.9rem 1.1rem',
    position: 'fixed' as const,
    transform: 'translateX(-50%)',
    zIndex: 20,
  },
  btn: (active = false) => ({
    background: active ? 'rgba(255, 240, 210, 0.18)' : 'rgba(255, 240, 210, 0.07)',
    border: `1px solid ${active ? 'rgba(255,240,210,0.35)' : 'rgba(255,240,210,0.14)'}`,
    borderRadius: '8px',
    color: '#f5efe5',
    cursor: 'pointer',
    fontSize: '0.8rem',
    letterSpacing: '0.07em',
    padding: '0.5rem 0.85rem',
    textTransform: 'uppercase' as const,
  }),
  progress: {
    alignItems: 'center',
    display: 'flex',
    gap: '0.5rem',
  },
  range: {
    accentColor: 'rgba(255, 240, 200, 0.8)',
    cursor: 'pointer',
    width: '90px',
  },
  badge: {
    backdropFilter: 'blur(18px)',
    background: 'rgba(10, 10, 10, 0.62)',
    border: '1px solid rgba(255, 245, 230, 0.14)',
    borderRadius: '999px',
    color: '#f5efe5',
    fontSize: '0.78rem',
    left: '1rem',
    letterSpacing: '0.08em',
    padding: '0.5rem 0.9rem',
    position: 'fixed' as const,
    textTransform: 'uppercase' as const,
    top: '1rem',
    zIndex: 20,
  },
};

export function CurtainDemo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const effectRef = useRef<InstanceType<typeof PaperCurtainEffect> | null>(null);
  const [loadVal, setLoadVal] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const effect = new PaperCurtainEffect(canvas, {
      color: '#1D1D1B',
      background: '#0a0808',
      style: 'theatre',
      duration: 2.2,
      showLoader: true,
      loaderColor: 'rgba(255, 245, 210, 0.55)',
      curlIntensity: 0.14,
      seamIntensity: 0.95,
      foldCount: 7,
      dustOpacity: 0.25,
      shadowOpacity: 0.45,
      debug: window.location.search.includes('debug'),
    });

    effectRef.current = effect;

    // Auto-show on mount so you see the paper immediately.
    effect.state.progress = 0;
    effect.draw();

    return () => {
      effect.destroy();
      effectRef.current = null;
    };
  }, []);

  function handleIn() {
    if (!effectRef.current || running) return;
    setRunning(true);
    const tween = effectRef.current.in();
    const done = () => setRunning(false);
    if (tween?.then) {
      tween.then(done);
    } else if (tween) {
      (tween as any).eventCallback?.('onComplete', done);
    }
    setTimeout(done, 3000);
  }

  function handleInWaitForLoad() {
    if (!effectRef.current || running) return;
    setRunning(true);
    effectRef.current.state.progress = 0;
    effectRef.current.draw();
    setLoadVal(0);
    effectRef.current.setLoadProgress(0);

    // Simulate an async load: fill the bar over ~1.5 s, then reveal.
    let v = 0;
    const id = setInterval(() => {
      v = Math.min(v + 0.04 + Math.random() * 0.04, 1);
      setLoadVal(v);
      effectRef.current?.setLoadProgress(v);
      if (v >= 1) {
        clearInterval(id);
        setTimeout(() => setRunning(false), 2500);
      }
    }, 60);

    effectRef.current.in({ waitForLoad: false });
  }

  function handleOut() {
    if (!effectRef.current || running) return;
    setRunning(true);
    effectRef.current.out();
    setTimeout(() => setRunning(false), 3000);
  }

  function handleSetLoad(val: number) {
    setLoadVal(val);
    effectRef.current?.setLoadProgress(val);
  }

  return (
    <div style={styles.root}>
      <a href="/" style={styles.badge}>← Back</a>

      {/* Hero content that gets revealed */}
      <div style={styles.hero}>
        <p style={styles.sub}>Blackletter</p>
        <h1 style={styles.heading}>
          Paper<br />Curtain
        </h1>
        <p style={styles.sub}>The show begins</p>
      </div>

      {/* The curtain canvas — fixed, full-screen, above content */}
      <canvas ref={canvasRef} style={styles.canvas} />

      {/* Controls */}
      <div style={styles.controls}>
        <button style={styles.btn()} onClick={handleIn} disabled={running}>
          Reveal
        </button>
        <button style={styles.btn()} onClick={handleInWaitForLoad} disabled={running}>
          Simulate Load →&nbsp;Reveal
        </button>
        <button style={styles.btn()} onClick={handleOut} disabled={running}>
          Cover
        </button>
        <div style={styles.progress}>
          <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Load</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={loadVal}
            style={styles.range}
            onChange={(e) => handleSetLoad(Number(e.target.value))}
          />
          <span style={{ fontSize: '0.75rem', opacity: 0.6, minWidth: '2.5rem' }}>
            {Math.round(loadVal * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}
