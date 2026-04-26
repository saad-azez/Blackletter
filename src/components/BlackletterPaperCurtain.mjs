// Blackletter Paper Curtain — WebGL / GLSL implementation.
//
// Award-winning paper-tear effect rendered as a single full-screen
// fragment shader. Inspired by Niccolo Miranda's PaperCurtain pattern;
// adapted with: theatre-split (tears from horizontal seam outward),
// phased animation (anticipation → tear → reveal), in-shader loader bar,
// setLoadProgress / waitForLoad APIs, and runtime color hot-swapping.
//
// API (backwards-compatible with the prior Canvas 2D version):
//   new PaperCurtainEffect(canvas, options)
//   .in({ waitForLoad?: boolean })
//   .out()
//   .setColors(color, background)
//   .setLoadProgress(0..1)
//   .destroy()
//   .curtain.uniforms.uColor.value.set('#hex')
//   .curtain.uniforms.uBackground.value.set('#hex')

import { Renderer } from 'https://unpkg.com/ogl@0.0.74/src/core/Renderer.js';
import { Program } from 'https://unpkg.com/ogl@0.0.74/src/core/Program.js';
import { Texture } from 'https://unpkg.com/ogl@0.0.74/src/core/Texture.js';
import { Triangle } from 'https://unpkg.com/ogl@0.0.74/src/extras/Triangle.js';
import { Mesh } from 'https://unpkg.com/ogl@0.0.74/src/core/Mesh.js';
import { Color } from 'https://unpkg.com/ogl@0.0.74/src/math/Color.js';
import { Vec2 } from 'https://unpkg.com/ogl@0.0.74/src/math/Vec2.js';

// Converts any valid CSS color string (named, rgb(), rgba(), hex) to a
// #rrggbb hex string that OGL's Color class can parse. Falls back to
// #000000 if the value is empty or unrecognised.
function cssColorToHex(value) {
  if (!value) return '#000000';
  if (/^#[0-9A-Fa-f]{3,8}$/.test(value)) return value;
  try {
    const el = document.createElement('div');
    document.head.appendChild(el);
    el.style.color = value;
    const rgb = getComputedStyle(el).color; // always "rgb(r, g, b)"
    document.head.removeChild(el);
    const m = rgb.match(/(\d+)/g);
    if (m && m.length >= 3) {
      return '#' + m.slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { /* ignore */ }
  return '#000000';
}

const DEFAULT_OPTIONS = {
  color: '#1D1D1B',
  background: '#000000',
  backgroundOpacity: 1,
  ease: 'power2.inOut',
  duration: 2.0,
  texture: 'https://uploads-ssl.webflow.com/5f2429f172d117fcee10e819/6059a3e2b9ae6d2bd508685c_pt-texture-2.jpg',
  amplitude: 0.25,
  rippedFrequency: 3.5,
  rippedAmplitude: 0.05,
  curveFrequency: 1,
  curveAmplitude: 0.6,
  rippedDelta: 1,
  rippedHeight: 0.07,
  horizontal: false,
  style: 'theatre',
  exitUsesEnterColors: true,
  manageContainerBackground: true,
  showLoader: true,
  loaderColor: '#f5edcc',
  warmTint: 0.6,
  grainOpacity: 1.0,
  debug: false,
  debugLabel: 'BlackletterPaperCurtain',
};

const VERTEX_SHADER = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  varying vec2 vImageUv;

  uniform vec2 uRatio;

  float map(float v, float a, float b, float c, float d) {
    return c + (v - a) * (d - c) / (b - a);
  }

  void main() {
    vUv = uv;
    vImageUv = vec2(
      map(uv.x, 0.0, 1.0, 0.5 - uRatio.x / 2.0, 0.5 + uRatio.x / 2.0),
      map(uv.y, 0.0, 1.0, 0.5 - uRatio.y / 2.0, 0.5 + uRatio.y / 2.0)
    );
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  #define PI 3.1415926538
  #define NUM_OCTAVES 5
  #define ANTE_END 0.04
  #define TEAR_END 0.70

  precision highp float;

  uniform float uHorizontal;
  uniform float uStyle;          // 0 = classic wipe, 1 = theatre split
  uniform float uProgress;       // 0..1 over the full animation
  uniform float uMaxAmplitude;
  uniform float uRippedNoiseFrequency;
  uniform float uCurveNoiseFrequency;
  uniform float uRippedNoiseAmplitude;
  uniform float uCurveNoiseAmplitude;
  uniform float uAspect;
  uniform float uRippedDelta;
  uniform sampler2D uTexture;    // ripped-band paper texture
  uniform float uRippedHeight;
  uniform vec3  uColor;
  uniform sampler2D uImage;      // optional logo/foreground texture
  uniform vec3  uBackground;
  uniform float uBackgroundOpacity;
  uniform bool  uInverted;
  uniform float uWarmTint;

  uniform float uShowLoader;
  uniform float uLoadProgress;
  uniform vec3  uLoaderColor;
  uniform float uGrainOpacity;

  uniform float uTime;

  varying vec2 vUv;
  varying vec2 vImageUv;

  // ─── Simplex 2D noise (Ashima) ──────────────────────────────────────────
  vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                       -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
           + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                             dot(x12.zw, x12.zw)), 0.0);
    m = m * m; m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
  }

  float fbm(vec2 x) {
    float v = 0.0, a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < NUM_OCTAVES; i++) {
      v += a * snoise(x);
      x = rot * x * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  // Hash for cheap film grain
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // Colorize: extracts luminance from a texture sample and remaps it onto
  // baseColor. The texture drives the highlight/shadow detail; baseColor
  // sets the hue and value. luma 0 → 0.55×color, luma 1 → 1.45×color.
  vec3 colorize(vec3 texSample, vec3 baseColor) {
    float luma = dot(texSample, vec3(0.299, 0.587, 0.114));
    return clamp(baseColor * mix(0.55, 1.45, luma), 0.0, 1.0);
  }

  vec4 paperSample(vec2 imageUv) {
    vec4 img = texture2D(uImage, uInverted ? vec2(0.0, 1.0) - imageUv : imageUv);
    if (img.a > 0.0) return img;
    return vec4(uColor, 1.0);
  }

  // ─── Per-fragment lighting / paper feel ─────────────────────────────────
  vec3 paperLighting(vec3 base, vec2 uv) {
    // Soft warm/cool gradient (top warm, bottom cool, very subtle)
    vec3 warm = vec3(1.04, 1.01, 0.96);
    vec3 cool = vec3(0.96, 0.99, 1.03);
    vec3 tint = mix(cool, warm, uv.y * 0.5 + 0.5);
    base *= mix(vec3(1.0), tint, 0.18 * uWarmTint);

    // Fine static grain
    float g = hash21(uv * vec2(uAspect * 1200.0, 1200.0));
    base += (g - 0.5) * 0.04 * uGrainOpacity;

    // Animated film grain — subtle drift
    float fg = hash21(uv * vec2(uAspect * 700.0, 700.0) + vec2(uTime * 17.0, uTime * 23.0));
    base += (fg - 0.5) * 0.025 * uGrainOpacity;

    return base;
  }

  // Loader bar — thin rounded line near the bottom of the canvas, fades out
  // during the tear phase. Drawn in UV space so it scales with the canvas.
  vec4 drawLoader(vec4 baseColor, float tearT) {
    if (uShowLoader < 0.5 || uProgress >= TEAR_END + 0.05) return baseColor;
    float fadeOut = 1.0 - smoothstep(0.5, 0.95, tearT);

    float barCY = 0.18;
    float barHalfW = 0.11;
    float barHalfH = 0.0018;
    float xMin = 0.5 - barHalfW;
    float xMax = 0.5 + barHalfW;

    if (vUv.y > barCY - barHalfH && vUv.y < barCY + barHalfH
        && vUv.x > xMin && vUv.x < xMax) {
      float t = (vUv.x - xMin) / (barHalfW * 2.0);
      // Track
      vec3 trackCol = mix(baseColor.rgb, vec3(1.0), 0.12);
      vec3 fillCol  = mix(baseColor.rgb, uLoaderColor, 0.85);
      vec3 col = t < uLoadProgress ? fillCol : trackCol;
      // Soft glow at the leading edge
      float edgeGlow = smoothstep(0.012, 0.0, abs(t - uLoadProgress)) * 0.6;
      col += uLoaderColor * edgeGlow * fadeOut;

      return mix(baseColor, vec4(col, 1.0), fadeOut);
    }
    return baseColor;
  }

  void main() {
    vec2 aspectUv = vUv * vec2(uAspect, 1.0);

    // Phase decomposition (theatre style only — classic ignores phases)
    float anteT   = clamp( uProgress / ANTE_END,                          0.0, 1.0);
    float tearT   = clamp((uProgress - ANTE_END) / (TEAR_END - ANTE_END), 0.0, 1.0);
    float rawRev  = clamp((uProgress - TEAR_END) / (1.0 - TEAR_END),       0.0, 1.0);
    float revealT = 1.0 - pow(1.0 - rawRev, 3.0); // easeOutCubic

    bool theatre  = uStyle > 0.5;
    bool inReveal = uProgress >= TEAR_END;

    // Background fallback — what shows behind the paper / through the gap.
    gl_FragColor.rgb = uBackground;
    gl_FragColor.a   = uBackgroundOpacity;

    if (theatre) {
      // ── THEATRE SPLIT ───────────────────────────────────────────────
      // Distance from horizontal seam: 0 at centre, 1 at top/bottom edges.
      float dist = abs(vUv.y - 0.5) * 2.0;
      float useT = inReveal ? revealT : 0.0;
      float amp  = sin(useT * PI);

      // Seam-bias curve so the tear doesn't run perfectly straight.
      float curve = amp * uMaxAmplitude * sin(vUv.x * PI);

      float rip1   = fbm(aspectUv * uRippedNoiseFrequency)
                       * uRippedNoiseAmplitude * amp;
      float crv1   = snoise((aspectUv + vec2(-0.5)) * uCurveNoiseFrequency)
                       * uCurveNoiseAmplitude * 0.3 * amp;
      float rip2   = fbm((aspectUv + vec2(uRippedDelta)) * uRippedNoiseFrequency)
                       * uRippedNoiseAmplitude * amp;
      float crv2   = snoise((aspectUv + vec2(uRippedDelta)) * uCurveNoiseFrequency)
                       * uCurveNoiseAmplitude * 0.3 * amp;

      float halfRippedH = uRippedHeight * 0.5 * amp;
      float colorLimit  = useT - curve + rip1 + crv1 + halfRippedH;
      float rippedLimit = useT - curve + rip2 + crv2 - halfRippedH;

      if (!inReveal) {
        // Closed sheet — full paper covering everything.
        vec4 paper = paperSample(vImageUv);
        paper.rgb = mix(paper.rgb, colorize(texture2D(uTexture, aspectUv * 2.0).rgb, paper.rgb), uGrainOpacity);
        paper.rgb = paperLighting(paper.rgb, vUv);
        gl_FragColor = paper;

        // Horizontal tear-crack along the seam at y≈0.5, extending from
        // centre outward as tearT grows. Reads as a slow page-loading
        // indicator before the halves snap apart.
        if (uProgress >= ANTE_END) {
          float crackBaseY = 0.5;
          // Wobble along x so the crack isn't dead straight.
          float wobbleY = snoise(vec2(vUv.x * 14.0, 11.7)) * 0.004;
          float crackY = crackBaseY + wobbleY;

          // Half-width grows with tearT — eased so the propagation slows
          // toward the edges (gives the "loading-then-snap" feel).
          float crackHalfW = pow(tearT, 0.7) * 0.5;
          float distFromCenterX = abs(vUv.x - 0.5);
          float onLine = step(abs(vUv.y - crackY), 0.0022);
          float withinExtent = step(distFromCenterX, crackHalfW);

          // Dark crack line.
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.02), onLine * withinExtent);

          // Soft shadow band just under the line — sells depth.
          float shadowMask = withinExtent
            * smoothstep(0.012, 0.0, abs(vUv.y - crackY))
            * 0.35;
          gl_FragColor.rgb *= 1.0 - shadowMask * 0.4;

          // Hot stress glow at both propagating tips (left + right).
          float leftTipX  = 0.5 - crackHalfW;
          float rightTipX = 0.5 + crackHalfW;
          float leftDist  = length(vec2((vUv.x - leftTipX)  * uAspect, vUv.y - crackY));
          float rightDist = length(vec2((vUv.x - rightTipX) * uAspect, vUv.y - crackY));
          float tipDist   = min(leftDist, rightDist);
          float tipMask = smoothstep(0.06, 0.0, tipDist)
                         * smoothstep(0.02, 0.18, tearT)
                         * (1.0 - smoothstep(0.92, 1.0, tearT));
          gl_FragColor.rgb += vec3(1.0, 1.0, 1.0) * tipMask * 0.65;

          // Tiny anticipation shudder before the tear breaks.
          float anteShake = sin(uTime * 30.0) * 0.0015 * smoothstep(0.4, 1.0, anteT);
          gl_FragColor.rgb *= 1.0 + anteShake;
        }
      } else if (dist > colorLimit) {
        // Outer paper still attached.
        vec4 paper = paperSample(vImageUv);
        paper.rgb = mix(paper.rgb, colorize(texture2D(uTexture, aspectUv * 2.0).rgb, paper.rgb), uGrainOpacity);
        paper.rgb = paperLighting(paper.rgb, vUv);
        gl_FragColor = paper;
      } else if (dist > rippedLimit) {
        // Torn paper band — colorize the fibre texture with uColor.
        vec3 ripTex = texture2D(uTexture, aspectUv).rgb;
        gl_FragColor.rgb = mix(uColor, colorize(ripTex, uColor), uGrainOpacity);
        gl_FragColor.a   = 1.0;
      }
    } else {
      // ── CLASSIC WIPE (Niccolo Miranda's original behaviour) ─────────
      float axis = (uHorizontal == 1.0) ? (1.0 - vUv.x) : vUv.y;
      float amp  = sin(uProgress * PI);
      float curve = amp * uMaxAmplitude * sin(axis * PI);

      float rip1 = fbm(aspectUv * uRippedNoiseFrequency)
                     * uRippedNoiseAmplitude * amp;
      float crv1 = snoise((aspectUv + vec2(-0.5)) * uCurveNoiseFrequency)
                     * uCurveNoiseAmplitude * amp;
      float rip2 = fbm((aspectUv + vec2(uRippedDelta)) * uRippedNoiseFrequency)
                     * uRippedNoiseAmplitude * amp;
      float crv2 = snoise((aspectUv + vec2(uRippedDelta)) * uCurveNoiseFrequency)
                     * uCurveNoiseAmplitude * amp;

      float halfRH = uRippedHeight * 0.5 * amp;
      float colorLimit  = 1.0 - (uProgress + curve - rip1 - crv1 - halfRH);
      float rippedLimit = 1.0 - (uProgress + curve - rip2 - crv2 + halfRH);

      if (axis > colorLimit) {
        vec4 paper = paperSample(vImageUv);
        paper.rgb = mix(paper.rgb, colorize(texture2D(uTexture, aspectUv * 2.0).rgb, paper.rgb), uGrainOpacity);
        paper.rgb = paperLighting(paper.rgb, vUv);
        gl_FragColor = paper;
      } else if (axis > rippedLimit) {
        vec3 ripTex = texture2D(uTexture, aspectUv).rgb;
        gl_FragColor.rgb = mix(uColor, colorize(ripTex, uColor), uGrainOpacity);
        gl_FragColor.a   = 1.0;
      }
    }

    // Loader bar overlay (closed-sheet phases only).
    gl_FragColor = drawLoader(gl_FragColor, tearT);
  }
`;

// ─── PaperCurtain mesh ────────────────────────────────────────────────────

class PaperCurtain {
  constructor(gl, opts) {
    this.gl = gl;

    const geometry = new Triangle(gl);

    this.texture = new Texture(gl, { wrapS: gl.REPEAT, wrapT: gl.REPEAT });
    if (opts.texture) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => { this.texture.image = img; };
      img.src = opts.texture;
    }

    this.uniforms = {
      uTime:                 { value: 0 },
      uProgress:             { value: 0 },
      uMaxAmplitude:         { value: opts.amplitude },
      uAspect:               { value: 1 },
      uTexture:              { value: this.texture },
      uRippedNoiseFrequency: { value: opts.rippedFrequency },
      uRippedNoiseAmplitude: { value: opts.rippedAmplitude },
      uCurveNoiseFrequency:  { value: opts.curveFrequency },
      uCurveNoiseAmplitude:  { value: opts.curveAmplitude },
      uRippedHeight:         { value: opts.rippedHeight },
      uRippedDelta:          { value: opts.rippedDelta },
      uImage:                { value: new Texture(gl) },
      uRatio:                { value: new Vec2(0, 0) },
      uColor:                { value: new Color(cssColorToHex(opts.color)) },
      uBackground:           { value: new Color(cssColorToHex(opts.background)) },
      uBackgroundOpacity:    { value: opts.backgroundOpacity },
      uInverted:             { value: false },
      uHorizontal:           { value: opts.horizontal ? 1 : 0 },
      uStyle:                { value: opts.style === 'theatre' || opts.style === 'theater' || opts.style === 'split' ? 1 : 0 },
      uWarmTint:             { value: opts.warmTint },
      uShowLoader:           { value: opts.showLoader ? 1 : 0 },
      uLoadProgress:         { value: 0 },
      uLoaderColor:          { value: new Color(cssColorToHex(opts.loaderColor)) },
      uGrainOpacity:         { value: opts.grainOpacity !== undefined ? opts.grainOpacity : 1.0 },
    };

    this.program = new Program(gl, {
      vertex: VERTEX_SHADER,
      fragment: FRAGMENT_SHADER,
      uniforms: this.uniforms,
      transparent: true,
    });

    this.mesh = new Mesh(gl, { geometry, program: this.program });
  }

  setColor(color) {
    if (color) this.uniforms.uColor.value.set(cssColorToHex(color));
  }

  setBackground(color, opacity) {
    if (color) this.uniforms.uBackground.value.set(cssColorToHex(color));
    if (opacity != null) this.uniforms.uBackgroundOpacity.value = opacity;
  }

  setGrainOpacity(value) {
    this.uniforms.uGrainOpacity.value = Math.max(0, Math.min(1, Number(value) || 0));
  }

  setInverted(value) {
    this.uniforms.uInverted.value = Boolean(value);
  }

  setStyle(style) {
    const s = String(style || '').toLowerCase();
    this.uniforms.uStyle.value =
      s === 'theatre' || s === 'theater' || s === 'split' ? 1 : 0;
  }

  setImage(src) {
    if (!src) return Promise.resolve();
    const gl = this.gl;
    const tex = new Texture(gl, { wrapS: gl.REPEAT, wrapT: gl.REPEAT });
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        tex.image = img;
        const naturalRatio  = img.naturalWidth / img.naturalHeight;
        const viewportRatio = window.innerWidth / window.innerHeight;
        const w = viewportRatio > naturalRatio
          ? window.innerWidth
          : window.innerHeight * naturalRatio;
        const h = w / naturalRatio;
        this.uniforms.uRatio.value = new Vec2(
          window.innerWidth / w,
          window.innerHeight / h,
        );
        this.uniforms.uImage.value = tex;
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
  }
}

// ─── PaperCurtainEffect — public class ────────────────────────────────────

export default class PaperCurtainEffect {
  constructor(canvas, options = {}) {
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error('PaperCurtainEffect expects a canvas element.');
    }

    this.canvas = canvas;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = { progress: 0, loadProgress: 0 };
    this.canvasSize = this._measureCanvas();

    this._isExiting   = false;
    this._pendingReveal = false;
    this._loaderStart = null;
    this._tween = null;
    this._destroyed = false;
    this._startTime = performance.now();

    this.enterColors = {
      color: this.options.color,
      background: this.options.background,
    };

    this._initGL();

    this.curtain = new PaperCurtain(this.gl, this.options);

    this._bindEvents();
    this._resize();
    this._tickHandler = this._tick.bind(this);
    this._startTicker();

    if (window.__BLACKLETTER_LAST_PAPER_EFFECT__) {
      try { window.__BLACKLETTER_LAST_PAPER_EFFECT__.destroy?.(); } catch (e) { /* ignore */ }
    }
    window.__BLACKLETTER_LAST_PAPER_EFFECT__ = this;

    this._log('created', { options: this.options, gsap: Boolean(window.gsap) });
  }

  // ─── setup ────────────────────────────────────────────────────────────

  _initGL() {
    this.renderer = new Renderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });
    this.gl = this.renderer.gl;
  }

  _measureCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    let width  = rect.width  || this.canvas.clientWidth;
    let height = rect.height || this.canvas.clientHeight;
    // Canvas defaults to 300x150 when no CSS size is applied — treat that
    // as "unsized" and fall back to the viewport so the effect always fills.
    if (!width  || width  <= 1 || (width  === 300 && height === 150)) width  = window.innerWidth;
    if (!height || height <= 1 || (rect.width === 300 && height === 150)) height = window.innerHeight;
    return { width, height };
  }

  _bindEvents() {
    this._onResize = (entries) => {
      const entry = entries && entries[0];
      if (entry && entry.contentRect.width > 1 && entry.contentRect.height > 1) {
        this.canvasSize = {
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        };
      } else {
        this.canvasSize = this._measureCanvas();
      }
      this._resize();
    };

    if ('ResizeObserver' in window) {
      this._resizeObserver = new ResizeObserver(this._onResize);
      this._resizeObserver.observe(this.canvas);
    } else {
      this._onWindowResize = () => this._onResize();
      window.addEventListener('resize', this._onWindowResize);
    }
  }

  _resize() {
    const { width, height } = this.canvasSize;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.curtain.uniforms.uAspect.value = width / height;
  }

  _startTicker() {
    if (window.gsap && window.gsap.ticker) {
      window.gsap.ticker.add(this._tickHandler);
    } else {
      const loop = () => {
        if (this._destroyed) return;
        this._tickHandler(performance.now());
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
  }

  _tick() {
    if (this._destroyed) return;
    const now = performance.now();
    this.curtain.uniforms.uTime.value = (now - this._startTime) * 0.001;
    this.curtain.uniforms.uProgress.value = this.state.progress;
    this.curtain.uniforms.uLoadProgress.value = this.state.loadProgress;
    this.renderer.render({ scene: this.curtain.mesh });
  }

  // ─── public API ───────────────────────────────────────────────────────

  setColors(color, background) {
    if (color) {
      this.options.color = color;
      this.curtain.setColor(color);
    }
    if (background) {
      this.options.background = background;
      this.curtain.setBackground(background, this.options.backgroundOpacity);
    }
    this._log('setColors', { color, background });
  }

  setGrainOpacity(value) {
    this.curtain.setGrainOpacity(value);
  }

  setLoadProgress(value) {
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    this.state.loadProgress = v;
    if (v >= 1 && this._pendingReveal) {
      this._pendingReveal = false;
      this._startReveal();
    }
  }

  in(options = {}) {
    const waitForLoad = typeof options === 'object' && Boolean(options.waitForLoad);

    this._isExiting = false;
    this.enterColors = {
      color: this.options.color,
      background: this.options.background,
    };
    this._prepareContainer();
    this.state.progress = 0;
    this._loaderStart = performance.now();
    this._log('in()', { waitForLoad });

    if (waitForLoad) {
      this._pendingReveal = true;
      const onReady = () => {
        if (!this._pendingReveal) return;
        this._pendingReveal = false;
        this._startReveal();
      };
      if (document.readyState === 'complete') {
        onReady();
      } else {
        window.addEventListener('load', onReady, { once: true });
      }
      return null;
    }

    return this._tweenProgress(1);
  }

  out() {
    if (this.options.exitUsesEnterColors !== false) {
      this.options.color = this.enterColors.color;
      this.options.background = this.enterColors.background;
      this.curtain.setColor(this.options.color);
      this.curtain.setBackground(this.options.background, this.options.backgroundOpacity);
    }

    this._prepareContainer();
    this._isExiting = true;
    this._log('out()');

    if (this._isTheatre()) {
      this.state.progress = 0;
      return this._tweenProgress(1);
    }

    if (this.state.progress <= 0.001) this.state.progress = 1;
    return this._tweenProgress(0);
  }

  destroy() {
    this._destroyed = true;
    if (this._tween) {
      try { this._tween.kill(); } catch (e) { /* ignore */ }
      this._tween = null;
    }
    if (window.gsap && window.gsap.ticker) {
      window.gsap.ticker.remove(this._tickHandler);
    }
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._onWindowResize) window.removeEventListener('resize', this._onWindowResize);
    // OGL doesn't expose a destroy on Renderer; loose the GL ref.
    this.gl = null;
    this.renderer = null;
    if (window.__BLACKLETTER_LAST_PAPER_EFFECT__ === this) {
      window.__BLACKLETTER_LAST_PAPER_EFFECT__ = null;
    }
  }

  // For backwards-compat with the prior Canvas 2D API. WebGL renders every
  // frame via the ticker, so an explicit draw() call is a no-op.
  draw() { /* no-op */ }

  // ─── internals ────────────────────────────────────────────────────────

  _isTheatre() {
    const s = String(this.options.style || '').toLowerCase();
    return s === 'theatre' || s === 'theater' || s === 'split';
  }

  _prepareContainer() {
    if (!this.options.manageContainerBackground || !this.canvas.parentElement) return;
    this.canvas.parentElement.style.background = 'transparent';
  }

  _startReveal() {
    const MIN_DISPLAY = 0.5;
    const elapsed = this._loaderStart != null
      ? (performance.now() - this._loaderStart) / 1000
      : MIN_DISPLAY;
    const delay = Math.max(0, MIN_DISPLAY - elapsed);
    if (delay > 0) setTimeout(() => this._tweenProgress(1), delay * 1000);
    else this._tweenProgress(1);
  }

  _tweenProgress(target) {
    const duration = Number(this.options.duration) || DEFAULT_OPTIONS.duration;
    const ease = this.options.ease || DEFAULT_OPTIONS.ease;

    if (window.gsap) {
      if (this._tween) {
        try { this._tween.kill(); } catch (e) { /* ignore */ }
      }
      this._tween = window.gsap.to(this.state, {
        progress: target,
        duration,
        ease,
        onComplete: () => {
          try {
            document.body.dispatchEvent(new Event('paper-curtain'));
          } catch (e) { /* ignore */ }
          this._log('animation complete', { progress: this.state.progress });
        },
      });
      return this._tween;
    }

    // Fallback rAF tween (cubic ease-in-out).
    const start = performance.now();
    const startProgress = this.state.progress;
    const easeFn = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      if (this._destroyed) return;
      const t = Math.max(0, Math.min(1, (now - start) / (duration * 1000)));
      this.state.progress = startProgress + (target - startProgress) * easeFn(t);
      if (t < 1) requestAnimationFrame(step);
      else {
        try {
          document.body.dispatchEvent(new Event('paper-curtain'));
        } catch (e) { /* ignore */ }
      }
    };
    requestAnimationFrame(step);
    return null;
  }

  _log(message, data) {
    if (!this.options.debug && !window.__BLACKLETTER_PAPER_DEBUG__) return;
    // eslint-disable-next-line no-console
    console.log(`[${this.options.debugLabel}] ${message}`, data || {});
  }
}
