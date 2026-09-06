import { describe, it, expect } from 'vitest';
import {
  computeMean,
  computeMin,
  computeMax,
  computePeakToPeak,
  computeRms,
  computeSignalStats,
} from '../../src/dsp/statistics';
import { DspError, DspErrorCode } from '../../src/dsp/types';

describe('DSP Reference Statistics (Wave 12)', () => {
  describe('Mathematical Golden Vectors', () => {
    it('computes exact statistics for a constant DC signal (3.3V)', () => {
      const count = 1000;
      const samples = new Float32Array(count).fill(3.3);

      expect(computeMean(samples)).toBeCloseTo(3.3, 5);
      expect(computeMin(samples)).toBeCloseTo(3.3, 5);
      expect(computeMax(samples)).toBeCloseTo(3.3, 5);
      expect(computePeakToPeak(samples)).toBeCloseTo(0.0, 5);
      expect(computeRms(samples)).toBeCloseTo(3.3, 5);

      const stats = computeSignalStats(samples);
      expect(stats.mean).toBeCloseTo(3.3, 5);
      expect(stats.min).toBeCloseTo(3.3, 5);
      expect(stats.max).toBeCloseTo(3.3, 5);
      expect(stats.vpp).toBeCloseTo(0.0, 5);
      expect(stats.rms).toBeCloseTo(3.3, 5);
      expect(stats.sampleCount).toBe(count);
    });

    it('computes exact analytical values for a pure Sine wave (A = 2.0 V, 1 kHz, 1 MSPS)', () => {
      const sampleRate = 1_000_000;
      const freq = 1_000;
      const amp = 2.0;
      const count = 10_000; // Exactly 10 complete periods

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = amp * Math.sin((2.0 * Math.PI * freq * i) / sampleRate);
      }

      const expectedRms = amp / Math.SQRT2; // 2.0 / 1.41421356 = 1.41421356

      expect(computeMin(samples)).toBeCloseTo(-amp, 4);
      expect(computeMax(samples)).toBeCloseTo(amp, 4);
      expect(computePeakToPeak(samples)).toBeCloseTo(2.0 * amp, 4);
      expect(computeMean(samples)).toBeCloseTo(0.0, 5);
      expect(computeRms(samples)).toBeCloseTo(expectedRms, 4);
    });

    it('computes exact analytical values for a Square wave (A = 1.5 V, 50% duty)', () => {
      const count = 2000;
      const amp = 1.5;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = i % 20 < 10 ? amp : -amp;
      }

      expect(computeMin(samples)).toBe(-amp);
      expect(computeMax(samples)).toBe(amp);
      expect(computePeakToPeak(samples)).toBe(2.0 * amp);
      expect(computeMean(samples)).toBeCloseTo(0.0, 6);
      expect(computeRms(samples)).toBeCloseTo(amp, 6); // RMS of square wave = A
    });

    it('computes exact analytical values for a Triangle wave (A = 3.0 V, RMS = A / sqrt(3))', () => {
      const period = 1000;
      const cycles = 10;
      const count = period * cycles;
      const amp = 3.0;
      const samples = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        const phase = (i % period) / period; // 0 to 1
        // Symmetrical triangle: rises from -A to +A in first half, falls in second half
        if (phase < 0.5) {
          samples[i] = -amp + 4.0 * amp * phase;
        } else {
          samples[i] = 3.0 * amp - 4.0 * amp * phase;
        }
      }

      const expectedRms = amp / Math.sqrt(3.0); // 3.0 / 1.7320508 = 1.7320508

      expect(computeMean(samples)).toBeCloseTo(0.0, 3);
      expect(computeMin(samples)).toBeCloseTo(-amp, 3);
      expect(computeMax(samples)).toBeCloseTo(amp, 3);
      expect(computePeakToPeak(samples)).toBeCloseTo(2.0 * amp, 3);
      expect(computeRms(samples)).toBeCloseTo(expectedRms, 3);
    });

    it('computes composite RMS for combined DC + AC signal (V_rms = sqrt(V_dc^2 + V_ac,rms^2))', () => {
      const sampleRate = 1_000_000;
      const freq = 1_000;
      const vDc = 1.5;
      const vAcPeak = 2.0;
      const count = 10_000;

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = vDc + vAcPeak * Math.sin((2.0 * Math.PI * freq * i) / sampleRate);
      }

      const expectedAcRms = vAcPeak / Math.SQRT2;
      const expectedTotalRms = Math.sqrt(vDc * vDc + expectedAcRms * expectedAcRms);

      expect(computeMean(samples)).toBeCloseTo(vDc, 4);
      expect(computeMin(samples)).toBeCloseTo(vDc - vAcPeak, 4);
      expect(computeMax(samples)).toBeCloseTo(vDc + vAcPeak, 4);
      expect(computeRms(samples)).toBeCloseTo(expectedTotalRms, 4);
    });
  });

  describe('Edge Cases & Boundary Conditions', () => {
    it('throws DspError(EMPTY_BUFFER) on empty arrays', () => {
      const empty = new Float32Array(0);
      expect(() => computeMean(empty)).toThrowError(DspError);
      expect(() => computeMin(empty)).toThrowError(DspError);
      expect(() => computeMax(empty)).toThrowError(DspError);
      expect(() => computePeakToPeak(empty)).toThrowError(DspError);
      expect(() => computeRms(empty)).toThrowError(DspError);
      expect(() => computeSignalStats(empty)).toThrowError(DspError);

      try {
        computeMean(empty);
      } catch (e: unknown) {
        expect((e as DspError).code).toBe(DspErrorCode.EMPTY_BUFFER);
      }
    });

    it('handles single-sample buffer correctly (N = 1)', () => {
      const single = new Float32Array([-4.25]);

      expect(computeMean(single)).toBe(-4.25);
      expect(computeMin(single)).toBe(-4.25);
      expect(computeMax(single)).toBe(-4.25);
      expect(computePeakToPeak(single)).toBe(0.0);
      expect(computeRms(single)).toBe(4.25);

      const stats = computeSignalStats(single);
      expect(stats.sampleCount).toBe(1);
      expect(stats.min).toBe(-4.25);
      expect(stats.max).toBe(-4.25);
      expect(stats.vpp).toBe(0.0);
    });

    it('maintains double-precision accuracy over 1,000,000 samples with Float64 accumulator', () => {
      const count = 1_000_000;
      const samples = new Float32Array(count);
      // Small offset added to alternating values: should sum exactly to count * 0.001
      const tinyOffset = 0.001;
      for (let i = 0; i < count; i++) {
        samples[i] = (i % 2 === 0 ? 1.0 : -1.0) + tinyOffset;
      }

      const mean = computeMean(samples);
      expect(mean).toBeCloseTo(tinyOffset, 6);
    });
  });
});
