export interface PaperCurtainOptions {
  color?: string;
  background?: string;
  backgroundOpacity?: number;
  ease?: string;
  duration?: number;
  texture?: string;
  amplitude?: number;
  rippedFrequency?: number;
  rippedAmplitude?: number;
  curveFrequency?: number;
  curveAmplitude?: number;
  rippedDelta?: number;
  rippedHeight?: number;
  horizontal?: boolean;
  style?: string;
  exitUsesEnterColors?: boolean;
  manageContainerBackground?: boolean;
  foldCount?: number;
  foldIntensity?: number;
  seamIntensity?: number;
  fiberCount?: number;
  dustCount?: number;
  dustOpacity?: number;
  shadowOpacity?: number;
  edgeHighlightOpacity?: number;
  grainOpacity?: number;
  fiberOpacity?: number;
  showLoader?: boolean;
  loaderColor?: string;
  curlIntensity?: number;
  debug?: boolean;
  debugLabel?: string;
}

export interface InOptions {
  waitForLoad?: boolean;
}

export default class PaperCurtainEffect {
  canvas: HTMLCanvasElement;
  options: Required<PaperCurtainOptions>;
  state: { progress: number; loadProgress: number };
  curtain: {
    uniforms: {
      uColor: { value: { set(v: string): void } };
      uBackground: { value: { set(v: string): void } };
    };
  };

  constructor(canvas: HTMLCanvasElement, options?: PaperCurtainOptions);

  in(options?: InOptions): unknown;
  out(): unknown;
  setColors(color: string, background: string): void;
  setLoadProgress(value: number): void;
  draw(): void;
  resize(): void;
  destroy(): void;
}
