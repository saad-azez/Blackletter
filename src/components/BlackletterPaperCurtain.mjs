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
  exitUsesEnterColors: true,
  shadowOpacity: 0.34,
  edgeHighlightOpacity: 0.28,
  grainOpacity: 0.16,
  fiberOpacity: 0.13,
};

const TAU = Math.PI * 2;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
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
    this.enterColors = {
      color: this.options.color,
      background: this.options.background,
    };

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
    this.enterColors = {
      color: this.options.color,
      background: this.options.background,
    };
    this.state.progress = 0;
    this.draw();
    return this.animateTo(1);
  }

  out() {
    if (this.options.exitUsesEnterColors !== false) {
      this.options.color = this.enterColors.color;
      this.options.background = this.enterColors.background;
    }

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
    const tooth =
      Math.sin(t * TAU * Math.max(0.5, rippedFrequency * 2.8) + this.seed * 0.07) *
      length *
      rippedAmplitude *
      0.22;
    const notchNoise = noise(t * 115 + index * 0.31, this.seed + rippedDelta + 41);
    const notch = Math.pow(notchNoise, 8) * length * rippedHeight * 1.45;

    return depth + softWave + tornWave + grain + tooth - notch;
  }

  getDepth(width, height, progress, offset = 0) {
    const horizontal = Boolean(this.options.horizontal);
    const travelLength = horizontal ? width : height;
    const roughness = clamp(Number(this.options.amplitude) || 0.25, 0, 1);
    const overscan = travelLength * (0.08 + roughness * 0.08);

    return progress * (travelLength + overscan * 2) - overscan + offset;
  }

  tracePaperShape(width, height, progress, offset = 0) {
    const ctx = this.ctx;
    const horizontal = Boolean(this.options.horizontal);
    const crossLength = horizontal ? height : width;
    const depth = this.getDepth(width, height, progress, offset);
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

  traceLeadingEdge(width, height, progress, offset = 0) {
    const ctx = this.ctx;
    const horizontal = Boolean(this.options.horizontal);
    const crossLength = horizontal ? height : width;
    const depth = this.getDepth(width, height, progress, offset);
    const steps = Math.max(28, Math.round(crossLength / 28));

    ctx.beginPath();

    if (horizontal) {
      for (let i = 0; i <= steps; i += 1) {
        const y = (i / steps) * height;
        const x = this.getEdgePoint(i, steps + 1, width, depth);

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      return;
    }

    for (let i = 0; i <= steps; i += 1) {
      const x = width - (i / steps) * width;
      const y = this.getEdgePoint(i, steps + 1, height, depth);

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
  }

  drawPaperShadow(width, height, progress) {
    const ctx = this.ctx;
    const horizontal = Boolean(this.options.horizontal);
    const minSide = Math.min(width, height);
    const shadowStrength = clamp(Number(this.options.shadowOpacity) || 0, 0, 1) * progress;

    if (shadowStrength <= 0.001) return;

    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${shadowStrength})`;
    ctx.shadowBlur = Math.max(18, minSide * 0.045);
    ctx.shadowOffsetX = horizontal ? Math.max(10, width * 0.018) : 0;
    ctx.shadowOffsetY = horizontal ? 0 : Math.max(10, height * 0.018);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    this.tracePaperShape(width, height, progress);
    ctx.fill();
    ctx.restore();
  }

  drawPaperTexture(width, height, progress) {
    const ctx = this.ctx;
    const grainOpacity = clamp(Number(this.options.grainOpacity) || 0, 0, 1);
    const fiberOpacity = clamp(Number(this.options.fiberOpacity) || 0, 0, 1);

    if (this.pattern) {
      ctx.save();
      ctx.globalAlpha = 0.24 * progress;
      ctx.fillStyle = this.pattern;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = grainOpacity * progress;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';

    for (let i = 0; i < 95; i += 1) {
      const x = noise(i * 7.1, this.seed) * width;
      const y = noise(i * 4.3, this.seed + 11) * height;
      const r = 18 + noise(i * 2.7, this.seed + 19) * 70;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = fiberOpacity * progress;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 0.7;

    for (let i = 0; i < 46; i += 1) {
      const y = noise(i * 5.9, this.seed + 91) * height;
      const startX = noise(i * 3.7, this.seed + 42) * width * 0.18;
      const endX = lerp(width * 0.52, width * 1.12, noise(i * 2.1, this.seed + 22));
      const drift = (noise(i * 8.2, this.seed + 15) - 0.5) * height * 0.055;

      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.bezierCurveTo(width * 0.28, y + drift, width * 0.62, y - drift, endX, y + drift * 0.35);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawDepthWash(width, height, progress) {
    const ctx = this.ctx;
    const horizontal = Boolean(this.options.horizontal);
    const gradient = horizontal
      ? ctx.createLinearGradient(0, 0, width, 0)
      : ctx.createLinearGradient(0, 0, 0, height);

    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    gradient.addColorStop(0.42, 'rgba(255, 255, 255, 0.02)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.22)');

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.7 * progress;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  drawLeadingEdge(width, height, progress) {
    const ctx = this.ctx;
    const minSide = Math.min(width, height);
    const edgeAlpha = clamp(Number(this.options.edgeHighlightOpacity) || 0, 0, 1) * progress;
    const lineWidth = Math.max(1, minSide * 0.0035);

    if (edgeAlpha <= 0.001) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(0, 0, 0, ${edgeAlpha * 0.82})`;
    ctx.lineWidth = lineWidth * 1.75;
    this.traceLeadingEdge(width, height, progress, lineWidth * 2.2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha})`;
    ctx.lineWidth = lineWidth;
    this.traceLeadingEdge(width, height, progress, -lineWidth * 0.7);
    ctx.stroke();
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

    this.drawPaperShadow(width, height, progress);

    ctx.save();
    this.tracePaperShape(width, height, progress);
    ctx.clip();

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, this.options.color);
    gradient.addColorStop(0.52, this.options.color);
    gradient.addColorStop(1, this.options.background);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    this.drawDepthWash(width, height, progress);
    this.drawPaperTexture(width, height, progress);
    ctx.restore();

    this.drawLeadingEdge(width, height, progress);
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
