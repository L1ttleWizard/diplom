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

  describe('Wave 13 — 128-bit SIMD Vector Statistics (dsp_compute_stats_simd)', () => {
    it('executes callNoop boundary function without error', () => {
      expect(wasmEngine.callNoop()).toBe(0);
      expect(jsEngine.callNoop()).toBe(0);
    });

    it('computes exact SIMD statistics for a DC signal (2.5V)', () => {
      const samples = new Float32Array(1024).fill(2.5);
      const simdStats = wasmEngine.computeStats(samples, true);
      const scalarStats = wasmEngine.computeStats(samples, false);

      expect(simdStats.min).toBeCloseTo(2.5, 4);
      expect(simdStats.max).toBeCloseTo(2.5, 4);
      expect(simdStats.vpp).toBeCloseTo(0.0, 4);
      expect(simdStats.mean).toBeCloseTo(2.5, 4);
      expect(simdStats.rms).toBeCloseTo(2.5, 4);
      expect(simdStats.sampleCount).toBe(1024);

      expect(simdStats.min).toBeCloseTo(scalarStats.min, 5);
      expect(simdStats.max).toBeCloseTo(scalarStats.max, 5);
      expect(simdStats.vpp).toBeCloseTo(scalarStats.vpp, 5);
      expect(simdStats.mean).toBeCloseTo(scalarStats.mean, 5);
      expect(simdStats.rms).toBeCloseTo(scalarStats.rms, 5);
    });

    it('computes exact SIMD statistics for a 1 kHz Sine wave', () => {
      const sampleRate = 1_000_000;
      const freq = 1_000;
      const amp = 2.0;
      const count = 10_000;

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const t = i / sampleRate;
        samples[i] = amp * Math.sin(2 * Math.PI * freq * t);
      }

      const simdStats = wasmEngine.computeStats(samples, true);
      const jsStats = jsEngine.computeStats(samples);

      expect(simdStats.min).toBeCloseTo(jsStats.min, 3);
      expect(simdStats.max).toBeCloseTo(jsStats.max, 3);
      expect(simdStats.vpp).toBeCloseTo(jsStats.vpp, 3);
      expect(simdStats.mean).toBeCloseTo(jsStats.mean, 3);
      expect(simdStats.rms).toBeCloseTo(jsStats.rms, 3);
    });

    it('handles buffer lengths not divisible by 4 correctly via tail scalar loop', () => {
      // Test various non-multiple-of-4 counts: 1, 3, 5, 7, 13, 101, 1003
      const testCounts = [1, 3, 5, 7, 13, 101, 1003];
      for (const count of testCounts) {
        const samples = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          samples[i] = Math.sin(i * 0.1) * 3.0 + i * 0.01;
        }

        const simdStats = wasmEngine.computeStats(samples, true);
        const scalarStats = wasmEngine.computeStats(samples, false);
        const jsStats = jsEngine.computeStats(samples);

        expect(simdStats.min).toBeCloseTo(scalarStats.min, 4);
        expect(simdStats.max).toBeCloseTo(scalarStats.max, 4);
        expect(simdStats.vpp).toBeCloseTo(scalarStats.vpp, 4);
        expect(simdStats.mean).toBeCloseTo(scalarStats.mean, 4);
        expect(simdStats.rms).toBeCloseTo(scalarStats.rms, 4);

        expect(simdStats.min).toBeCloseTo(jsStats.min, 4);
        expect(simdStats.max).toBeCloseTo(jsStats.max, 4);
        expect(simdStats.mean).toBeCloseTo(jsStats.mean, 4);
        expect(simdStats.rms).toBeCloseTo(jsStats.rms, 4);
      }
    });
  });

  describe('Wave 13 — Dedicated True RMS Kernel (dsp_compute_rms_scalar)', () => {
    it('computes RMS for DC, Sine, and Square signals', () => {
      const count = 10_000;
      // DC
      const dcSamples = new Float32Array(count).fill(3.3);
      expect(wasmEngine.computeRms(dcSamples)).toBeCloseTo(3.3, 4);
      expect(jsEngine.computeRms(dcSamples)).toBeCloseTo(3.3, 4);

      // Sine
      const sineSamples = new Float32Array(count);
      const amp = 5.0;
      for (let i = 0; i < count; i++) {
        sineSamples[i] = amp * Math.sin((2 * Math.PI * 10 * i) / count);
      }
      const expectedSineRms = amp / Math.SQRT2;
      expect(wasmEngine.computeRms(sineSamples)).toBeCloseTo(expectedSineRms, 3);
      expect(jsEngine.computeRms(sineSamples)).toBeCloseTo(expectedSineRms, 3);

      // Square
      const squareSamples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        squareSamples[i] = i % 20 < 10 ? 2.5 : -2.5;
      }
      expect(wasmEngine.computeRms(squareSamples)).toBeCloseTo(2.5, 4);
      expect(jsEngine.computeRms(squareSamples)).toBeCloseTo(2.5, 4);
    });

    it('matches computeStats.rms exactly', () => {
      const count = 2048;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = Math.sin(i * 0.05) * 4.0;
      }

      const standaloneRms = wasmEngine.computeRms(samples);
      const statsRms = wasmEngine.computeStats(samples).rms;
      expect(standaloneRms).toBeCloseTo(statsRms, 5);
    });

    it('throws on empty sample buffer', () => {
      expect(() => wasmEngine.computeRms(new Float32Array(0))).toThrow(WasmDspError);
    });
  });

  describe('Wave 13 — FIR Direct Convolution Filter (dsp_fir_filter)', () => {
    it('verifies impulse response of a 3-tap FIR filter matches coefficients', () => {
      const coeffs = new Float32Array([0.2, 0.5, 0.3]);
      const samples = new Float32Array(10);
      samples[0] = 1.0; // Delta impulse

      const wasmOut = wasmEngine.filterFir(samples, coeffs);
      const jsOut = jsEngine.filterFir(samples, coeffs);

      expect(wasmOut[0]).toBeCloseTo(0.2, 5);
      expect(wasmOut[1]).toBeCloseTo(0.5, 5);
      expect(wasmOut[2]).toBeCloseTo(0.3, 5);
      expect(wasmOut[3]).toBeCloseTo(0.0, 5);

      for (let i = 0; i < samples.length; i++) {
        expect(wasmOut[i]).toBeCloseTo(jsOut[i], 5);
      }
    });

    it('computes 5-tap moving average correctly', () => {
      const coeffs = new Float32Array(5).fill(0.2);
      const samples = new Float32Array(20).fill(1.0); // Step input

      const wasmOut = wasmEngine.filterFir(samples, coeffs);

      // n=0: 0.2*1 = 0.2
      // n=1: 0.2*2 = 0.4
      // n=2: 0.2*3 = 0.6
      // n=3: 0.2*4 = 0.8
      // n>=4: 0.2*5 = 1.0
      expect(wasmOut[0]).toBeCloseTo(0.2, 5);
      expect(wasmOut[1]).toBeCloseTo(0.4, 5);
      expect(wasmOut[2]).toBeCloseTo(0.6, 5);
      expect(wasmOut[3]).toBeCloseTo(0.8, 5);
      expect(wasmOut[4]).toBeCloseTo(1.0, 5);
      expect(wasmOut[10]).toBeCloseTo(1.0, 5);
    });

    it('matches Pure JS FIR filter across arbitrary input stream', () => {
      const count = 1000;
      const coeffs = new Float32Array([0.05, 0.1, 0.2, 0.3, 0.2, 0.1, 0.05]);
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = Math.sin(i * 0.03) * 2.0 + (Math.random() - 0.5) * 0.5;
      }

      const wasmOut = wasmEngine.filterFir(samples, coeffs);
      const jsOut = jsEngine.filterFir(samples, coeffs);

      for (let i = 0; i < count; i++) {
        expect(wasmOut[i]).toBeCloseTo(jsOut[i], 4);
      }
    });

    it('throws error when samples or coefficients are empty', () => {
      expect(() => wasmEngine.filterFir(new Float32Array(0), new Float32Array([1]))).toThrow(WasmDspError);
      expect(() => wasmEngine.filterFir(new Float32Array([1]), new Float32Array(0))).toThrow(WasmDspError);
    });
  });

  describe('Wave 13 — IIR Biquad Filter (dsp_iir_biquad)', () => {
    // 2nd-order Butterworth lowpass filter coefficients (normalized)
    const biquadCoeffs = {
      b0: 0.06745527,
      b1: 0.13491054,
      b2: 0.06745527,
      a1: -1.1429805,
      a2: 0.4128016,
    };

    it('filters step input and reaches unit steady-state gain', () => {
      const count = 200;
      const samples = new Float32Array(count).fill(1.0);

      const wasmOut = wasmEngine.filterIirBiquad(samples, biquadCoeffs);
      const jsOut = jsEngine.filterIirBiquad(samples, biquadCoeffs);

      // Verify steady state gain: H(0) = (b0 + b1 + b2) / (1 + a1 + a2) = 0.26982 / (1 - 1.14298 + 0.4128) = 1.0
      expect(wasmOut[count - 1]).toBeCloseTo(1.0, 3);
      expect(jsOut[count - 1]).toBeCloseTo(1.0, 3);

      for (let i = 0; i < count; i++) {
        expect(wasmOut[i]).toBeCloseTo(jsOut[i], 4);
      }
    });

    it('matches Pure JS IIR filter across multi-frequency signal', () => {
      const count = 2000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = Math.sin(i * 0.05) + 0.5 * Math.sin(i * 0.8);
      }

      const wasmOut = wasmEngine.filterIirBiquad(samples, biquadCoeffs);
      const jsOut = jsEngine.filterIirBiquad(samples, biquadCoeffs);

      for (let i = 0; i < count; i++) {
        expect(wasmOut[i]).toBeCloseTo(jsOut[i], 4);
      }
    });

    it('throws error when samples array is empty', () => {
      expect(() => wasmEngine.filterIirBiquad(new Float32Array(0), biquadCoeffs)).toThrow(WasmDspError);
    });
  });
});
