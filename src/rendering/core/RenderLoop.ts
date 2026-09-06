import * as THREE from 'three';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';

export type FrameCallback = (deltaMs: number, timestamp: number) => void;

export class RenderLoop {
  private _renderer: THREE.WebGLRenderer | null;
  private _scene: THREE.Scene;
  private _camera: THREE.Camera;
  private _performanceMonitor: PerformanceMonitor;

  private _rafId: number | null = null;
  private _isRunning: boolean = false;
  private _isPaused: boolean = false;
  private _lastTimestamp: number = 0;

  private readonly _callbacks: Set<FrameCallback> = new Set();

  constructor(
    renderer: THREE.WebGLRenderer | null,
    scene: THREE.Scene,
    camera: THREE.Camera,
    performanceMonitor?: PerformanceMonitor
  ) {
    this._renderer = renderer;
    this._scene = scene;
    this._camera = camera;
    this._performanceMonitor = performanceMonitor ?? new PerformanceMonitor();

    this.tick = this.tick.bind(this);
  }

  public get isRunning(): boolean {
    return this._isRunning;
  }

  public get isPaused(): boolean {
    return this._isPaused;
  }

  public get performanceMonitor(): PerformanceMonitor {
    return this._performanceMonitor;
  }

  public addCallback(callback: FrameCallback): void {
    this._callbacks.add(callback);
  }

  public removeCallback(callback: FrameCallback): void {
    this._callbacks.delete(callback);
  }

  public start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._isPaused = false;
    this._lastTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();

    if (typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(this.tick);
    }
  }

  public stop(): void {
    if (!this._isRunning) return;
    this._isRunning = false;
    if (this._rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  public pause(): void {
    this._isPaused = true;
  }

  public resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this._lastTimestamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public tick(timestamp: number): void {
    if (!this._isRunning) return;

    if (typeof requestAnimationFrame !== 'undefined') {
      this._rafId = requestAnimationFrame(this.tick);
    }

    if (this._isPaused) return;

    const deltaMs = Math.max(0, timestamp - this._lastTimestamp);
    this._lastTimestamp = timestamp;

    // Execute per-frame updates
    for (const cb of this._callbacks) {
      cb(deltaMs, timestamp);
    }

    // Render 3D Scene
    if (this._renderer) {
      this._renderer.render(this._scene, this._camera);
    }

    // Record performance metrics
    this._performanceMonitor.recordFrame(deltaMs);
  }
}
