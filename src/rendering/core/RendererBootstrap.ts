import * as THREE from 'three';
import { PerformanceTier, PerformanceTierConfig, TIER_CONFIGS } from '../types';

export interface RendererBootstrapOptions {
  canvas?: HTMLCanvasElement;
  tier?: PerformanceTier;
  alpha?: boolean;
}

export class RendererBootstrap {
  private _renderer: THREE.WebGLRenderer | null = null;
  private _tierConfig: PerformanceTierConfig;
  private _isContextLost: boolean = false;

  constructor(options: RendererBootstrapOptions = {}) {
    this._tierConfig = TIER_CONFIGS[options.tier ?? 'HIGH'];
    this.initRenderer(options);
  }

  public get renderer(): THREE.WebGLRenderer {
    if (!this._renderer) {
      throw new Error('WebGLRenderer has not been initialized or has been destroyed');
    }
    return this._renderer;
  }

  public get tierConfig(): PerformanceTierConfig {
    return this._tierConfig;
  }

  public get isContextLost(): boolean {
    return this._isContextLost;
  }

  private initRenderer(options: RendererBootstrapOptions): void {
    if (typeof document === 'undefined') {
      // In headless node environment without DOM, renderer cannot initialize WebGL context
      return;
    }

    const canvas = options.canvas ?? document.createElement('canvas');

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this._tierConfig.antialias,
      alpha: options.alpha ?? false,
      powerPreference: this._tierConfig.powerPreference,
      precision: 'highp'
    });

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    if (this._tierConfig.shadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
      renderer.shadowMap.enabled = false;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, this._tierConfig.maxPixelRatio);
    renderer.setPixelRatio(dpr);

    // Context loss listeners
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this._isContextLost = true;
      console.warn('WebGL context lost. Rendering halted.');
    });

    canvas.addEventListener('webglcontextrestored', () => {
      this._isContextLost = false;
      console.info('WebGL context restored.');
    });

    this._renderer = renderer;
  }

  public setTier(tier: PerformanceTier): void {
    this._tierConfig = TIER_CONFIGS[tier];
    if (!this._renderer || typeof window === 'undefined') return;

    const dpr = Math.min(window.devicePixelRatio || 1, this._tierConfig.maxPixelRatio);
    this._renderer.setPixelRatio(dpr);

    if (this._tierConfig.shadows) {
      this._renderer.shadowMap.enabled = true;
      this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
      this._renderer.shadowMap.enabled = false;
    }
  }

  public setSize(width: number, height: number, updateStyle?: boolean): void {
    if (this._renderer) {
      this._renderer.setSize(width, height, updateStyle);
    }
  }

  public dispose(): void {
    if (this._renderer) {
      this._renderer.dispose();
      this._renderer = null;
    }
  }
}
