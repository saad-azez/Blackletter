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
  style: 'theatre',
  exitUsesEnterColors: true,
  manageContainerBackground: true,
  foldCount: 7,
  foldIntensity: 0.36,
  seamIntensity: 0.9,
  fiberCount: 54,
  dustCount: 90,
  dustOpacity: 0.22,
  shadowOpacity: 0.34,
  edgeHighlightOpacity: 0.28,
  grainOpacity: 0.16,
  fiberOpacity: 0.13,
  debug: false,
  debugLabel: 'BlackletterPaperCurtain',
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

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
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
    this.debugProgressMarks = new Set();
    this.debugAnimationId = 0;
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
    this.log('created', {
      style: this.getStyle(),
      canvas,
      size: getCanvasSize(this.canvas),
      colors: {
        color: this.options.color,
        background: this.options.background,
      },
      options: this.getDebugOptions(),
      gsap: Boolean(window.gsap),
    });

    window.__BLACKLETTER_LAST_PAPER_EFFECT__ = this;

    if ('ResizeObserver' in window) {
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener('resize', this.resize);
    }
  }

  isDebug() {
    return Boolean(this.options.debug || window.__BLACKLETTER_PAPER_DEBUG__);
  }

  getDebugOptions() {
    return {
      style: this.options.style,
      duration: this.options.duration,
      ease: this.options.ease,
      horizontal: this.options.horizontal,
      exitUsesEnterColors: this.options.exitUsesEnterColors,
      manageContainerBackground: this.options.manageContainerBackground,
      foldCount: this.options.foldCount,
      foldIntensity: this.options.foldIntensity,
      seamIntensity: this.options.seamIntensity,
      fiberCount: this.options.fiberCount,
      dustCount: this.options.dustCount,
      dustOpacity: this.options.dustOpacity,
      shadowOpacity: this.options.shadowOpacity,
      edgeHighlightOpacity: this.options.edgeHighlightOpacity,
      grainOpacity: this.options.grainOpacity,
      fiberOpacity: this.options.fiberOpacity,
    };
  }

  log(message, data = {}) {
    if (!this.isDebug()) return;

    console.log(`[${this.options.debugLabel}] ${message}`, data);
  }

  resetDebugProgressMarks() {
    this.debugProgressMarks = new Set();
  }

  logProgress(progress, width, height) {
    if (!this.isDebug()) return;

    const marks = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

    marks.forEach((mark) => {
      const reached = mark === 0 ? progress <= 0.001 : progress >= mark;
      const key = `${this.debugAnimationId}:${mark}`;

      if (!reached || this.debugProgressMarks.has(key)) return;

      this.debugProgressMarks.add(key);
      this.log(`draw progress ${Math.round(mark * 100)}%`, {
        actualProgress: Number(progress.toFixed(3)),
        style: this.getStyle(),
        theatre: this.isTheatreStyle(),
        width: Math.round(width),
        height: Math.round(height),
        colors: {
          color: this.options.color,
          background: this.options.background,
        },
      });
    });
  }

  loadTexture(textureUrl) {
    if (!textureUrl) {
      this.log('texture skipped', { reason: 'No texture URL provided.' });
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      this.textureImage = image;
      this.pattern = this.ctx.createPattern(image, 'repeat');
      this.log('texture loaded', {
        textureUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      this.draw();
    };
    image.onerror = () => {
      this.log('texture failed', { textureUrl });
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
    this.log('resize', {
      cssWidth: width,
      cssHeight: height,
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      dpr,
    });
    this.draw();
  }

  getStyle() {
    return String(this.options.style || '').toLowerCase();
  }

  isTheatreStyle() {
    const style = this.getStyle();
    return style === 'theatre' || style === 'theater' || style === 'split';
  }

  prepareContainer() {
    if (!this.options.manageContainerBackground || !this.canvas.parentElement) return;

    this.canvas.parentElement.style.background = 'transparent';
  }

  setColors(color, background) {
    if (color) this.options.color = color;
    if (background) this.options.background = background;
    this.log('setColors', {
      color: this.options.color,
      background: this.options.background,
    });
    this.draw();
  }

  in() {
    this.enterColors = {
      color: this.options.color,
      background: this.options.background,
    };
    this.prepareContainer();
    this.state.progress = 0;
    this.log('in() called', {
      behavior: this.isTheatreStyle() ? 'theatre sheet starts closed and tears open from center' : 'classic paper enters',
      enterColors: this.enterColors,
      size: getCanvasSize(this.canvas),
    });
    this.draw();
    return this.animateTo(1);
  }

  out() {
    if (this.options.exitUsesEnterColors !== false) {
      this.options.color = this.enterColors.color;
      this.options.background = this.enterColors.background;
    }

    this.prepareContainer();
    this.log('out() called', {
      behavior: this.isTheatreStyle()
        ? 'theatre exit uses the same visual direction: closed sheet tears open to reveal'
        : 'classic paper exits',
      exitUsesEnterColors: this.options.exitUsesEnterColors,
      colors: {
        color: this.options.color,
        background: this.options.background,
      },
      size: getCanvasSize(this.canvas),
    });

    if (this.isTheatreStyle()) {
      this.state.progress = 0;
      this.draw();
      return this.animateTo(1);
    }

    if (this.state.progress <= 0.001) {
      this.state.progress = 1;
      this.draw();
    }

    return this.animateTo(0);
  }

  animateTo(targetProgress) {
    const duration = Number(this.options.duration) || DEFAULT_OPTIONS.duration;
    const startProgress = this.state.progress;

    this.debugAnimationId += 1;
    this.resetDebugProgressMarks();
    this.log('animateTo()', {
      animationId: this.debugAnimationId,
      from: Number(startProgress.toFixed(3)),
      to: targetProgress,
      duration,
      ease: this.options.ease || DEFAULT_OPTIONS.ease,
      usingGsap: Boolean(window.gsap),
    });

    if (window.gsap) {
      window.gsap.killTweensOf(this.state);

      return window.gsap.to(this.state, {
        progress: targetProgress,
        duration,
        ease: this.options.ease || DEFAULT_OPTIONS.ease,
        onUpdate: this.draw,
        onComplete: () => {
          this.draw();
          this.log('animation complete', {
            animationId: this.debugAnimationId,
            progress: Number(this.state.progress.toFixed(3)),
          });
        },
      });
    }

    cancelAnimationFrame(this.animationFrame);

    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = (now - startTime) / 1000;
      const time = clamp(elapsed / duration, 0, 1);
      const eased = fallbackEase(time);

      this.state.progress = startProgress + (targetProgress - startProgress) * eased;
      this.draw();

      if (time < 1) {
        this.animationFrame = requestAnimationFrame(tick);
      } else {
        this.log('animation complete', {
          animationId: this.debugAnimationId,
          progress: Number(this.state.progress.toFixed(3)),
        });
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

  getTheatreSeamPoints(width, height, progress, side) {
    const steps = Math.max(48, Math.round(height / 18));
    const points = [];
    const open = clamp(progress, 0, 1);
    const openPower = Math.pow(open, 1.12);
    const pull = openPower * width * 0.16;
    const gap = openPower * (width * 0.64 + Math.min(width, height) * 0.16);
    const tension = Math.sin(open * Math.PI);
    const seamIntensity = clamp(Number(this.options.seamIntensity) || 0.9, 0, 2);
    const tearScale = Math.min(width, height) * (0.018 + seamIntensity * 0.022);
    const waveScale = width * (0.006 + seamIntensity * 0.009);
    const sideSign = side === 'left' ? -1 : 1;

    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const y = t * height;
      const highWave =
        Math.sin(t * TAU * 5.6 + this.seed * 0.021) * waveScale * (0.8 + tension * 1.6);
      const lowWave =
        Math.sin(t * Math.PI * 1.45 + this.seed * 0.009) * width * 0.012 * (0.35 + tension);
      const paperTooth =
        (noise(t * 91 + i * 0.13, this.seed + sideSign * 17) - 0.5) *
        tearScale *
        (0.75 + tension);
      const deepCut =
        Math.pow(noise(t * 37 + i * 0.47, this.seed + sideSign * 31), 9) *
        tearScale *
        2.35 *
        sideSign;
      const center = width / 2 + lowWave + highWave * 0.45;
      const edge = center + sideSign * gap + paperTooth + deepCut + sideSign * pull * 0.2;

      points.push({ x: edge, y });
    }

    return points;
  }

  traceTheatreHalf(width, height, progress, side, offset = 0) {
    const ctx = this.ctx;
    const sideSign = side === 'left' ? -1 : 1;
    const open = clamp(progress, 0, 1);
    const openPower = Math.pow(open, 1.12);
    const overscan = Math.max(width, height) * 0.16;
    const pull = openPower * width * 0.18;
    const edgePoints = this.getTheatreSeamPoints(width, height, progress, side);
    const outerX = side === 'left' ? -overscan - pull : width + overscan + pull;

    ctx.beginPath();

    if (side === 'left') {
      ctx.moveTo(outerX, -overscan);
      ctx.lineTo(edgePoints[0].x + offset * sideSign, -overscan);

      edgePoints.forEach((point) => {
        ctx.lineTo(point.x + offset * sideSign, point.y);
      });

      ctx.lineTo(outerX, height + overscan);
    } else {
      ctx.moveTo(outerX, -overscan);
      ctx.lineTo(edgePoints[0].x + offset * sideSign, -overscan);

      edgePoints.forEach((point) => {
        ctx.lineTo(point.x + offset * sideSign, point.y);
      });

      ctx.lineTo(outerX, height + overscan);
    }

    ctx.closePath();
  }

  traceTheatreEdge(width, height, progress, side, offset = 0) {
    const ctx = this.ctx;
    const sideSign = side === 'left' ? -1 : 1;
    const edgePoints = this.getTheatreSeamPoints(width, height, progress, side);

    ctx.beginPath();
    edgePoints.forEach((point, index) => {
      const x = point.x + offset * sideSign;

      if (index === 0) ctx.moveTo(x, point.y);
      else ctx.lineTo(x, point.y);
    });
  }

  drawTheatreHalfBase(width, height, progress, side) {
    const ctx = this.ctx;
    const sideSign = side === 'left' ? -1 : 1;
    const open = clamp(progress, 0, 1);
    const tension = Math.sin(open * Math.PI);
    const gradient = ctx.createLinearGradient(side === 'left' ? 0 : width, 0, width / 2, height);

    gradient.addColorStop(0, this.options.background);
    gradient.addColorStop(0.18, this.options.color);
    gradient.addColorStop(0.68, this.options.color);
    gradient.addColorStop(1, this.options.background);

    ctx.fillStyle = gradient;
    ctx.fillRect(-width * 0.25, -height * 0.1, width * 1.5, height * 1.2);

    this.drawDepthWash(width, height, 0.55 + progress * 0.45);
    this.drawPaperTexture(width, height, 0.85 + progress * 0.15);
    this.drawTheatreFolds(width, height, progress, side, sideSign, tension);
  }

  drawTheatreFolds(width, height, progress, side, sideSign, tension) {
    const ctx = this.ctx;
    const foldCount = Math.max(3, Math.round(Number(this.options.foldCount) || 7));
    const foldIntensity = clamp(Number(this.options.foldIntensity) || 0.36, 0, 1.4);
    const spanStart = side === 'left' ? -width * 0.18 : width * 0.5;
    const spanWidth = width * 0.68;
    const openBoost = 0.3 + tension * 0.9 + progress * 0.55;

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';

    for (let i = 0; i < foldCount; i += 1) {
      const local = foldCount <= 1 ? 0 : i / (foldCount - 1);
      const x = side === 'left'
        ? spanStart + local * spanWidth
        : width - (spanStart + local * spanWidth);
      const foldWidth = width * (0.035 + noise(i * 3.4, this.seed + 75) * 0.035);
      const alpha = (0.08 + noise(i * 2.7, this.seed + 28) * 0.13) * foldIntensity * openBoost;
      const foldGradient = ctx.createLinearGradient(x - foldWidth, 0, x + foldWidth, 0);

      foldGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
      foldGradient.addColorStop(0.48, `rgba(0, 0, 0, ${alpha})`);
      foldGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = foldGradient;
      ctx.beginPath();
      ctx.moveTo(x - foldWidth, -height * 0.1);
      ctx.bezierCurveTo(
        x + sideSign * width * 0.028,
        height * 0.26,
        x - sideSign * width * 0.035,
        height * 0.72,
        x + sideSign * width * 0.014,
        height * 1.1,
      );
      ctx.lineTo(x + foldWidth, height * 1.1);
      ctx.lineTo(x + foldWidth, -height * 0.1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < foldCount - 1; i += 1) {
      const local = (i + 0.5) / foldCount;
      const x = side === 'left'
        ? spanStart + local * spanWidth
        : width - (spanStart + local * spanWidth);
      const highlightWidth = width * 0.026;
      const alpha = 0.08 * foldIntensity * openBoost;
      const highlightGradient = ctx.createLinearGradient(x - highlightWidth, 0, x + highlightWidth, 0);

      highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
      highlightGradient.addColorStop(0.52, `rgba(255, 255, 255, ${alpha})`);
      highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = highlightGradient;
      ctx.fillRect(x - highlightWidth, -height * 0.1, highlightWidth * 2, height * 1.2);
    }

    ctx.restore();
  }

  drawTheatreEdge(width, height, progress, side) {
    const ctx = this.ctx;
    const minSide = Math.min(width, height);
    const edgeAlpha = clamp(Number(this.options.edgeHighlightOpacity) || 0, 0, 1);
    const lineWidth = Math.max(1.2, minSide * 0.004);
    const sideSign = side === 'left' ? -1 : 1;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(0, 0, 0, ${edgeAlpha * 0.85})`;
    ctx.lineWidth = lineWidth * 2.2;
    this.traceTheatreEdge(width, height, progress, side, lineWidth * 1.9);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(255, 255, 255, ${edgeAlpha * 0.9})`;
    ctx.lineWidth = lineWidth;
    this.traceTheatreEdge(width, height, progress, side, -lineWidth * 0.65);
    ctx.stroke();
    ctx.restore();

    this.drawTheatreFibers(width, height, progress, side, sideSign);
  }

  drawTheatreFibers(width, height, progress, side, sideSign) {
    const ctx = this.ctx;
    const count = Math.max(16, Math.round(Number(this.options.fiberCount) || 54));
    const tension = Math.sin(progress * Math.PI);
    const edgePoints = this.getTheatreSeamPoints(width, height, progress, side);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = (0.18 + tension * 0.32) * clamp(Number(this.options.fiberOpacity) || 0.13, 0, 1);
    ctx.strokeStyle = 'rgba(245, 238, 219, 0.9)';
    ctx.lineWidth = Math.max(0.7, Math.min(width, height) * 0.0012);

    for (let i = 0; i < count; i += 1) {
      const point = edgePoints[Math.floor(noise(i * 4.3, this.seed + sideSign * 54) * edgePoints.length)];
      if (!point) continue;

      const length = (10 + noise(i * 7.7, this.seed + 24) * 38) * (0.45 + tension);
      const yDrift = (noise(i * 5.1, this.seed + 64) - 0.5) * 15;

      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.quadraticCurveTo(
        point.x - sideSign * length * 0.45,
        point.y + yDrift,
        point.x - sideSign * length,
        point.y + yDrift * 0.35,
      );
      ctx.stroke();
    }

    ctx.restore();
  }

  drawTheatreSeam(width, height, progress) {
    const ctx = this.ctx;
    const seamFade = 1 - smoothstep(0.02, 0.32, progress);
    const leftEdge = this.getTheatreSeamPoints(width, height, 0, 'left');
    const rightEdge = this.getTheatreSeamPoints(width, height, 0, 'right');

    if (seamFade <= 0.001) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = seamFade;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.003);
    ctx.beginPath();

    leftEdge.forEach((point, index) => {
      const rightPoint = rightEdge[index] || point;
      const x = (point.x + rightPoint.x) / 2;
      if (index === 0) ctx.moveTo(x, point.y);
      else ctx.lineTo(x, point.y);
    });

    ctx.stroke();
    ctx.restore();
  }

  drawTheatreHalf(width, height, progress, side) {
    const ctx = this.ctx;
    const minSide = Math.min(width, height);
    const shadowStrength = clamp(Number(this.options.shadowOpacity) || 0, 0, 1);
    const tension = Math.sin(progress * Math.PI);
    const sideSign = side === 'left' ? -1 : 1;

    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${shadowStrength * (0.35 + tension * 0.85)})`;
    ctx.shadowBlur = Math.max(18, minSide * (0.032 + tension * 0.03));
    ctx.shadowOffsetX = -sideSign * Math.max(8, width * 0.018) * (0.4 + progress);
    ctx.shadowOffsetY = Math.max(5, height * 0.01) * tension;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    this.traceTheatreHalf(width, height, progress, side);
    ctx.fill();
    ctx.restore();

    ctx.save();
    this.traceTheatreHalf(width, height, progress, side);
    ctx.clip();
    this.drawTheatreHalfBase(width, height, progress, side);
    ctx.restore();

    this.drawTheatreEdge(width, height, progress, side);
  }

  drawTheatreClosedSheet(width, height, progress) {
    const ctx = this.ctx;
    const alpha = 1 - smoothstep(0.035, 0.24, progress);

    if (alpha <= 0.001) return;

    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, this.options.background);
    gradient.addColorStop(0.18, this.options.color);
    gradient.addColorStop(0.72, this.options.color);
    gradient.addColorStop(1, this.options.background);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    this.drawDepthWash(width, height, 0.9);
    this.drawPaperTexture(width, height, 0.86);
    ctx.restore();
  }

  drawTheatreDust(width, height, progress) {
    const ctx = this.ctx;
    const open = clamp(progress, 0, 1);
    const burst = smoothstep(0.06, 0.34, open) * (1 - smoothstep(0.52, 1, open));
    const dustOpacity = clamp(Number(this.options.dustOpacity) || 0.22, 0, 1);

    if (burst <= 0.001 || dustOpacity <= 0.001) return;

    const count = Math.max(20, Math.round(Number(this.options.dustCount) || 90));
    const leftEdge = this.getTheatreSeamPoints(width, height, open, 'left');
    const rightEdge = this.getTheatreSeamPoints(width, height, open, 'right');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < count; i += 1) {
      const sideSign = noise(i * 2.7, this.seed + 99) > 0.5 ? -1 : 1;
      const edge = sideSign < 0 ? leftEdge : rightEdge;
      const edgePoint = edge[Math.floor(noise(i * 4.9, this.seed + 71) * edge.length)];

      if (!edgePoint) continue;

      const travel = (18 + noise(i * 3.2, this.seed + 44) * Math.min(width, height) * 0.09) * open;
      const drift = (noise(i * 6.7, this.seed + 18) - 0.5) * height * 0.08 * open;
      const x = edgePoint.x - sideSign * travel;
      const y = edgePoint.y + drift;
      const radius = 0.8 + noise(i * 9.1, this.seed + 28) * 2.4;
      const alpha = dustOpacity * burst * (0.35 + noise(i * 8.4, this.seed + 7) * 0.65);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(255, 248, 228, 0.78)';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }

    ctx.restore();
  }

  drawTheatre(width, height, progress) {
    const ctx = this.ctx;
    const open = clamp(progress, 0, 1);

    if (open >= 0.997) return;

    this.drawTheatreClosedSheet(width, height, open);
    this.drawTheatreHalf(width, height, open, 'left');
    this.drawTheatreHalf(width, height, open, 'right');
    this.drawTheatreSeam(width, height, open);
    this.drawTheatreDust(width, height, open);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (1 - smoothstep(0.18, 0.9, open)) * 0.08;
    ctx.fillStyle = this.options.background;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  draw() {
    if (!this.ctx) return;

    const { width, height } = getCanvasSize(this.canvas);
    const progress = clamp(this.state.progress, 0, 1);
    const ctx = this.ctx;

    ctx.clearRect(0, 0, width, height);
    this.logProgress(progress, width, height);

    if (this.isTheatreStyle()) {
      this.drawTheatre(width, height, progress);
      return;
    }

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
