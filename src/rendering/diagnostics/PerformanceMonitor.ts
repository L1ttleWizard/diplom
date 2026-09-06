import type * as THREE from 'three';
import { PerformanceMetrics } from '../types';

export class PerformanceMonitor {
  private readonly _sampleCapacity: number;
  private readonly _frameTimes: Float64Array;
  private _sampleIndex: number = 0;
  private _sampleCount: number = 0;

  private _lastFrameTimestamp: number = 0;
  private _frameTimeMs: number = 16.67;
  private _fps: number = 60;
  private _fpsFrameCount: number = 0;
  private _fpsTimer: number = 0;

  // Cached scratch array for percentile calculation to avoid per-frame allocation
  private readonly _sortScratch: Float64Array;

  constructor(sampleCapacity: number = 120) {
    this._sampleCapacity = sampleCapacity;
    this._frameTimes = new Float64Array(sampleCapacity);
    this._sortScratch = new Float64Array(sampleCapacity);
  }

  public recordFrame(deltaMs: number): void {
    this._frameTimeMs = deltaMs;
    this._frameTimes[this._sampleIndex] = deltaMs;
    this._sampleIndex = (this._sampleIndex + 1) % this._sampleCapacity;
    if (this._sampleCount < this._sampleCapacity) {
      this._sampleCount++;
    }

    // FPS calculation
    this._fpsFrameCount++;
    this._fpsTimer += deltaMs;
    if (this._fpsTimer >= 1000) {
      this._fps = Math.round((this._fpsFrameCount * 1000) / this._fpsTimer);
      this._fpsFrameCount = 0;
      this._fpsTimer = 0;
    }
  }

  public getPercentiles(): { p50: number; p95: number; p99: number } {
    const count = this._sampleCount;
    if (count === 0) {
      return { p50: 16.67, p95: 16.67, p99: 16.67 };
    }

    // Copy into scratch and sort
    for (let i = 0; i < count; i++) {
      this._sortScratch[i] = this._frameTimes[i];
    }

    // Sort subarray [0, count)
    const view = this._sortScratch.subarray(0, count);
    view.sort();

    const idx50 = Math.min(Math.floor(count * 0.50), count - 1);
    const idx95 = Math.min(Math.floor(count * 0.95), count - 1);
    const idx99 = Math.min(Math.floor(count * 0.99), count - 1);

    return {
      p50: Number(view[idx50].toFixed(2)),
      p95: Number(view[idx95].toFixed(2)),
      p99: Number(view[idx99].toFixed(2))
    };
  }

  public getMetrics(renderer?: THREE.WebGLRenderer): PerformanceMetrics {
    const percentiles = this.getPercentiles();

    let drawCalls = 0;
    let triangles = 0;
    let geometries = 0;
    let textures = 0;

    if (renderer && renderer.info) {
      drawCalls = renderer.info.render.calls;
      triangles = renderer.info.render.triangles;
      geometries = renderer.info.memory.geometries;
      textures = renderer.info.memory.textures;
    }

    let memoryMb: number | null = null;
    if (typeof performance !== 'undefined' && (performance as any).memory?.usedJSHeapSize) {
      memoryMb = Number(
        ((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)
      );
    }

    return {
      fps: this._fps,
      frameTimeMs: Number(this._frameTimeMs.toFixed(2)),
      frameTimeP50: percentiles.p50,
      frameTimeP95: percentiles.p95,
      frameTimeP99: percentiles.p99,
      drawCalls,
      triangles,
      geometries,
      textures,
      memoryMb
    };
  }

  public reset(): void {
    this._sampleIndex = 0;
    this._sampleCount = 0;
    this._fpsFrameCount = 0;
    this._fpsTimer = 0;
  }
}
