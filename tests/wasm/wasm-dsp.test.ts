import { describe, it, expect, beforeEach } from 'vitest';
import { WasmDspEngine } from '../../src/wasm/WasmDspEngine';
import { JsDspEngine } from '../../src/wasm/JsDspEngine';
import { WasmDspError, WASM_ERR_INVALID_COUNT, WASM_ERR_INVALID_BUCKETS } from '../../src/wasm/types';

describe('WasmDspEngine (Wave 11 Core Unit Tests)', () => {
  let wasmEngine: WasmDspEngine;
  let jsEngine: JsDspEngine;

  beforeEach(async () => {
    wasmEngine = new WasmDspEngine();
    await wasmEngine.init();
    jsEngine = new JsDspEngine();
  });

  describe('Initialization & Lifecycle', () => {
    it('initializes successfully and reports correct initial memory', () => {
      expect(wasmEngine.isInitialized).toBe(true);
      // 16 pages * 65536 bytes = 1,048,576 bytes (1 MB)
      expect(wasmEngine.memoryByteSize).toBe(1048576);
    });

    it('throws if methods called before init', () => {
      const uninitEngine = new WasmDspEngine();
      expect(() => uninitEngine.computeStats(new Float32Array([1, 2, 3]))).toThrow(
        'WasmDspEngine has not been initialized'
      );
      expect(() => uninitEngine.peakDetectDecimate(new Float32Array([1, 2, 3]), 2)).toThrow(
        'WasmDspEngine has not been initialized'
      );
    });

    it('idempotent init() does not reallocate memory or fail', async () => {
      const initialSize = wasmEngine.memoryByteSize;
      await wasmEngine.init();
      expect(wasmEngine.memoryByteSize).toBe(initialSize);
    });
  });

  describe('Validation & Error Handling', () => {
    it('throws WasmDspError on empty sample buffer', () => {
      expect(() => wasmEngine.computeStats(new Float32Array(0))).toThrow(WasmDspError);
      try {
        wasmEngine.computeStats(new Float32Array(0));
      } catch (err: unknown) {
        expect((err as WasmDspError).code).toBe(WASM_ERR_INVALID_COUNT);
      }
    });

    it('throws WasmDspError on invalid bucket counts', () => {
      const samples = new Float32Array(100);
      expect(() => wasmEngine.peakDetectDecimate(samples, 0)).toThrow(WasmDspError);
      expect(() => wasmEngine.peakDetectDecimate(samples, -5)).toThrow(WasmDspError);
      expect(() => wasmEngine.peakDetectDecimate(samples, 101)).toThrow(WasmDspError);

      try {
        wasmEngine.peakDetectDecimate(samples, 200);
      } catch (err: unknown) {
        expect((err as WasmDspError).code).toBe(WASM_ERR_INVALID_BUCKETS);
      }
    });
  });

  describe('Analytical Accuracy on Reference Signals', () => {
    it('computes exact statistics for a DC constant signal (2.5V)', () => {
      const samples = new Float32Array(1000).fill(2.5);
      const stats = wasmEngine.computeStats(samples);

      expect(stats.min).toBeCloseTo(2.5, 4);
      expect(stats.max).toBeCloseTo(2.5, 4);
      expect(stats.vpp).toBeCloseTo(0.0, 4);
      expect(stats.mean).toBeCloseTo(2.5, 4);
      expect(stats.rms).toBeCloseTo(2.5, 4);
      expect(stats.sampleCount).toBe(1000);
    });

    it('computes exact statistics for a 1 kHz Sine wave (2V amp, 1 MSPS)', () => {
      const sampleRate = 1_000_000;
      const freq = 1_000;
      const amp = 2.0;
      const count = 10_000; // Exactly 10 full cycles

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const t = i / sampleRate;
        samples[i] = amp * Math.sin(2 * Math.PI * freq * t);
      }

      const stats = wasmEngine.computeStats(samples);
      const expectedRms = amp / Math.SQRT2; // 2 / 1.41421356 = 1.41421356

      expect(stats.min).toBeCloseTo(-amp, 3);
      expect(stats.max).toBeCloseTo(amp, 3);
      expect(stats.vpp).toBeCloseTo(2 * amp, 3);
      expect(stats.mean).toBeCloseTo(0.0, 3);
      expect(stats.rms).toBeCloseTo(expectedRms, 3);
      expect(stats.sampleCount).toBe(count);
    });

    it('computes exact statistics for a Square wave (+1V / -1V)', () => {
      const count = 1000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = i % 20 < 10 ? 1.0 : -1.0;
      }

      const stats = wasmEngine.computeStats(samples);
      expect(stats.min).toBe(-1.0);
      expect(stats.max).toBe(1.0);
      expect(stats.vpp).toBe(2.0);
      expect(stats.mean).toBeCloseTo(0.0, 4);
      expect(stats.rms).toBeCloseTo(1.0, 4);
    });

    it('matches Pure JS reference implementation across random samples', () => {
      const count = 25_000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = Math.sin(i * 0.05) * 3.5 + (Math.random() - 0.5) * 0.4;
      }

      const wasmStats = wasmEngine.computeStats(samples);
      const jsStats = jsEngine.computeStats(samples);

      expect(wasmStats.min).toBeCloseTo(jsStats.min, 4);
      expect(wasmStats.max).toBeCloseTo(jsStats.max, 4);
      expect(wasmStats.vpp).toBeCloseTo(jsStats.vpp, 4);
      expect(wasmStats.rms).toBeCloseTo(jsStats.rms, 4);
      expect(wasmStats.mean).toBeCloseTo(jsStats.mean, 4);
      expect(wasmStats.sampleCount).toBe(jsStats.sampleCount);
    });
  });

  describe('Peak-Detect Decimation', () => {
    it('preserves extreme narrow impulse spikes that sub-sampling would miss', () => {
      const inCount = 10_000;
      const bucketCount = 100; // 100 samples per bucket
      const samples = new Float32Array(inCount).fill(0.0);

      // Inject a single-sample spike in bucket 42 (sample index 4250)
      const spikeIndex = 4250;
      samples[spikeIndex] = 9.87;

      const result = wasmEngine.peakDetectDecimate(samples, bucketCount);

      expect(result.max.length).toBe(bucketCount);
      expect(result.min.length).toBe(bucketCount);

      // The spike must be captured in bucket 42
      expect(result.max[42]).toBeCloseTo(9.87, 4);

      // Other buckets should have max 0.0
      expect(result.max[41]).toBe(0.0);
      expect(result.max[43]).toBe(0.0);
    });

    it('matches Pure JS reference decimation output byte-for-byte', () => {
      const inCount = 20_000;
      const bucketCount = 500;
      const samples = new Float32Array(inCount);
      for (let i = 0; i < inCount; i++) {
        samples[i] = Math.sin(i * 0.02) * 5.0 + Math.cos(i * 0.1) * 2.0;
      }

      const wasmRes = wasmEngine.peakDetectDecimate(samples, bucketCount);
      const jsRes = jsEngine.peakDetectDecimate(samples, bucketCount);

      for (let b = 0; b < bucketCount; b++) {
        expect(wasmRes.min[b]).toBeCloseTo(jsRes.min[b], 5);
        expect(wasmRes.max[b]).toBeCloseTo(jsRes.max[b], 5);
      }
    });

    it('reuses preallocated output buffers without allocation', () => {
      const inCount = 1000;
      const bucketCount = 50;
      const samples = new Float32Array(inCount).fill(1.23);

      const preMin = new Float32Array(bucketCount);
      const preMax = new Float32Array(bucketCount);

      const returned = wasmEngine.peakDetectDecimate(samples, bucketCount, preMin, preMax);

      expect(returned.min).toBe(preMin);
      expect(returned.max).toBe(preMax);
      expect(preMin[0]).toBeCloseTo(1.23, 4);
      expect(preMax[0]).toBeCloseTo(1.23, 4);
    });
  });

  describe('Dynamic Linear Memory Growth', () => {
    it('grows linear memory dynamically when processing massive sample buffers (> 300,000 samples)', () => {
      const massiveCount = 300_000; // 300,000 * 4 bytes = 1,200,000 bytes > 1 MB initial memory
      const samples = new Float32Array(massiveCount);
      for (let i = 0; i < massiveCount; i++) {
        samples[i] = 1.0;
      }

      const initialMemory = wasmEngine.memoryByteSize;
      const stats = wasmEngine.computeStats(samples);

      expect(wasmEngine.memoryByteSize).toBeGreaterThan(initialMemory);
      expect(stats.sampleCount).toBe(massiveCount);
      expect(stats.mean).toBeCloseTo(1.0, 4);
      expect(stats.rms).toBeCloseTo(1.0, 4);
    });
  });
});
