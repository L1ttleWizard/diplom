import { describe, it, expect } from 'vitest';
import { estimateFrequency } from '../../src/dsp/frequency';
import { DspError, DspErrorCode } from '../../src/dsp/types';

describe('Frequency & Period Estimation (Wave 12)', () => {
  describe('Analytical Accuracy on Reference Signals', () => {
    it('estimates exact frequency of 1 kHz Sine wave at 1 MSPS (< 0.05% error)', () => {
      const sampleRate = 1_000_000;
      const targetFreq = 1_000.0;
      const count = 10_000; // 10 complete cycles

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = Math.sin((2.0 * Math.PI * targetFreq * i) / sampleRate);
      }

      const res = estimateFrequency(samples, sampleRate);

      expect(res.valid).toBe(true);
      expect(res.cycleCount).toBe(9); // 10 rising crossings = 9 cycles
      expect(res.frequency).toBeCloseTo(targetFreq, 1);
      expect(Math.abs(res.frequency - targetFreq) / targetFreq).toBeLessThan(0.0005); // < 0.05% error
      expect(res.period).toBeCloseTo(1.0 / targetFreq, 5);
      expect(res.dutyCycle).toBeCloseTo(0.5, 2);
      expect(res.confidence).toBeGreaterThan(0.95);
    });

    it('estimates arbitrary non-integer frequency with sub-sample precision (f = 1234.56 Hz)', () => {
      const sampleRate = 1_000_000;
      const targetFreq = 1234.56;
      const count = 20_000;

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = 2.5 * Math.sin((2.0 * Math.PI * targetFreq * i) / sampleRate);
      }

      const res = estimateFrequency(samples, sampleRate);

      expect(res.valid).toBe(true);
      expect(Math.abs(res.frequency - targetFreq) / targetFreq).toBeLessThan(0.001); // < 0.1% error
    });

    it('estimates high frequency at 5 MSPS rate (f = 100 kHz at 5 MSPS)', () => {
      const sampleRate = 5_000_000;
      const targetFreq = 100_000.0; // 50 samples per period
      const count = 2_500; // 50 cycles

      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = 1.0 * Math.sin((2.0 * Math.PI * targetFreq * i) / sampleRate);
      }

      const res = estimateFrequency(samples, sampleRate);

      expect(res.valid).toBe(true);
      expect(res.frequency).toBeCloseTo(targetFreq, 0);
      expect(res.period).toBeCloseTo(1e-5, 8);
    });

    it('accurately estimates asymmetric Duty Cycle for rectangular pulses (25% and 75%)', () => {
      const sampleRate = 100_000;
      const periodSamples = 100;
      const cycles = 10;
      const count = periodSamples * cycles;

      // 1. 25% Duty cycle pulse
      const pulse25 = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pulse25[i] = i % periodSamples < 25 ? 1.0 : -1.0;
      }

      const res25 = estimateFrequency(pulse25, sampleRate);
      expect(res25.valid).toBe(true);
      expect(res25.dutyCycle).toBeCloseTo(0.25, 2);

      // 2. 75% Duty cycle pulse
      const pulse75 = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        pulse75[i] = i % periodSamples < 75 ? 1.0 : -1.0;
      }

      const res75 = estimateFrequency(pulse75, sampleRate);
      expect(res75.valid).toBe(true);
      expect(res75.dutyCycle).toBeCloseTo(0.75, 2);
    });
  });

  describe('Edge Cases & Validation', () => {
    it('throws DspError(INVALID_SAMPLE_RATE) when sample rate is non-positive', () => {
      const samples = new Float32Array([0, 1, 0, 1]);
      expect(() => estimateFrequency(samples, 0)).toThrowError(DspError);
      expect(() => estimateFrequency(samples, -100)).toThrowError(DspError);

      try {
        estimateFrequency(samples, 0);
      } catch (err: unknown) {
        expect((err as DspError).code).toBe(DspErrorCode.INVALID_SAMPLE_RATE);
      }
    });

    it('returns unmeasurable result (valid = false) for constant DC signals', () => {
      const dc = new Float32Array(1000).fill(5.0);
      const res = estimateFrequency(dc, 1_000_000);

      expect(res.valid).toBe(false);
      expect(res.frequency).toBe(0);
      expect(res.cycleCount).toBe(0);
    });

    it('returns unmeasurable result when buffer contains less than 1 full cycle', () => {
      // Quarter of a sine cycle
      const quarterCycle = new Float32Array([0.0, 0.5, 0.8, 1.0]);
      const res = estimateFrequency(quarterCycle, 1_000_000);

      expect(res.valid).toBe(false);
      expect(res.frequency).toBe(0);
    });

    it('returns unmeasurable result for buffer length < 3', () => {
      const tiny = new Float32Array([0.1, 0.2]);
      const res = estimateFrequency(tiny, 1000);
      expect(res.valid).toBe(false);
    });
  });
});
