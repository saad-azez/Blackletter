const DEFAULT_OPTIONS = {
  color: '#1D1D1B',
  background: '#000000',
  backgroundOpacity: 1,
  ease: 'power3.inOut',
  duration: 1.35,
  texture: '',
  amplitude: 0.25,
  rippedFrequency: 3.5,
  rippedAmplitude: 0.05,
  curveFrequency: 1,
  curveAmplitude: 0.1,
  rippedDelta: 1,
  rippedHeight: 0.07,
  horizontal: false,
};

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function noise(value, seed) {
  const x = Math.sin(value * 12.9898 + seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function fallbackEase(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function getCanvasSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || window.innerWidth || canvas.width || 1;
  const height = rect.height || window.innerHeight || canvas.height || 1;

  return { width, height };
}

function makeUniformSetter(effect, key) {
  return {
    set(value) {
      effect.options[key] = value;
      effect.draw();
    },
  };
}

export default class PaperCurtainEffect {
  constructor(canvas, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('PaperCurtainEffect expects a canvas element.');
    }

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = { progress: 0 };
    this.seed = Math.random() * 1000;
    this.pattern = null;
    this.textureImage = null;
    this.animationFrame = 0;
    this.resizeObserver = null;

    this.curtain = {
      uniforms: {
        uColor: { value: makeUniformSetter(this, 'color') },
        uBackground: { value: makeUniformSetter(this, 'background') },
      },
    };

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);

    this.loadTexture(this.options.texture);
    this.resize();

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', this.resize);
    }
  }

  loadTexture(textureUrl) {
    if (!textureUrl) return;

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      this.textureImage = image;
      this.pattern = this.ctx.createPattern(image, 'repeat');
      this.draw();
    };
    image.src = textureUrl;
  }

  resize() {
    const { width, height } = getCanvasSize(this.canvas);
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const targetWidth = Math.max(1, Math.round(width * dpr));
    const targetHeight = Math.max(1, Math.round(height * dpr));

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }

    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  setColors(color, background) {
    if (color) this.options.color = color;
    if (background) this.options.background = background;
    this.draw();
  }

  in() {
    this.state.progress = 0;
    this.draw();
    return this.animateTo(1);
  }

  out() {
    if (this.state.progress <= 0.001) {
      this.state.progress = 1;
      this.draw();
    }

    return this.animateTo(0);
  }

  animateTo(targetProgress) {
    const duration = Number(this.options.duration) || DEFAULT_OPTIONS.duration;

    if (window.gsap) {
      window.gsap.killTweensOf(this.state);

      return window.gsap.to(this.state, {
        progress: targetProgress,
        duration,
        ease: this.options.ease || DEFAULT_OPTIONS.ease,
        onUpdate: this.draw,
        onComplete: this.draw,
      });
    }

    cancelAnimationFrame(this.animationFrame);

    const startProgress = this.state.progress;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = (now - startTime) / 1000;
      const time = clamp(elapsed / duration, 0, 1);
      const eased = fallbackEase(time);

      this.state.progress = startProgress + (targetProgress - startProgress) * eased;
      this.draw();

      if (time < 1) {
        this.animationFrame = requestAnimationFrame(tick);
      }
    };

    this.animationFrame = requestAnimationFrame(tick);
    return null;
  }

  getEdgePoint(index, count, length, depth) {
    const t = count <= 1 ? 0 : index / (count - 1);
    const { curveFrequency, curveAmplitude, rippedFrequency, rippedAmplitude, rippedDelta, rippedHeight } = this.options;
    const softWave =
      Math.sin(t * Math.PI * Math.max(0.25, curveFrequency) + this.seed * 0.01) *
      length *
      curveAmplitude *
      0.18;
    const tornWave =
      Math.sin(t * TAU * Math.max(0.25, rippedFrequency) + this.seed * 0.03) *
      length *
      rippedAmplitude;
    const grain =
      (noise(t * 42 + index * 0.13, this.seed + rippedDelta) - 0.5) *
      length *
      rippedHeight *
      0.8;

    return depth + softWave + tornWave + grain;
  }

  tracePaperShape(width, height, progress) {
    const ctx = this.ctx;
    const horizontal = Boolean(this.options.horizontal);
    const travelLength = horizontal ? width : height;
    const crossLength = horizontal ? height : width;
    const roughness = clamp(Number(this.options.amplitude) || 0.25, 0, 1);
    const overscan = travelLength * (0.08 + roughness * 0.08);
    const depth = progress * (travelLength + overscan * 2) - overscan;
    const steps = Math.max(28, Math.round(crossLength / 28));

    ctx.beginPath();

    if (horizontal) {
      ctx.moveTo(0, 0);
      ctx.lineTo(depth, 0);

      for (let i = 0; i <= steps; i += 1) {
        const y = (i / steps) * height;
        const x = this.getEdgePoint(i, steps + 1, width, depth);
        ctx.lineTo(x, y);
      }

      ctx.lineTo(0, height);
      ctx.closePath();
      return;
    }

    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);

    for (let i = 0; i <= steps; i += 1) {
      const x = width - (i / steps) * width;
      const y = this.getEdgePoint(i, steps + 1, height, depth);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(0, 0);
    ctx.closePath();
  }

  drawPaperTexture(width, height, progress) {
    const ctx = this.ctx;

    if (this.pattern) {
      ctx.save();
      ctx.globalAlpha = 0.24 * progress;
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.13 * progress;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';

    for (let i = 0; i < 70; i += 1) {
      const x = noise(i * 7.1, this.seed) * width;
      const y = noise(i * 4.3, this.seed + 11) * height;
      const r = 18 + noise(i * 2.7, this.seed + 19) * 70;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  draw() {
    if (!this.ctx) return;

    const { width, height } = getCanvasSize(this.canvas);
    const progress = clamp(this.state.progress, 0, 1);
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);

    if (progress <= 0.001) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = clamp(Number(this.options.backgroundOpacity) || 0, 0, 1) * progress;
    ctx.fillStyle = this.options.background;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();

    ctx.save();
    this.tracePaperShape(width, height, progress);
    ctx.clip();

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, this.options.color);
    gradient.addColorStop(0.52, this.options.color);
    gradient.addColorStop(1, this.options.background);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.drawPaperTexture(width, height, progress);
    ctx.restore();
  }

  destroy() {
    cancelAnimationFrame(this.animationFrame);

    if (window.gsap) {
      window.gsap.killTweensOf(this.state);
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', this.resize);
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
