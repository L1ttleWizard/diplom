import { describe, it, expect } from 'vitest';
import { FirFilter } from '../../src/dsp/fir';
import { DspError, DspErrorCode } from '../../src/dsp/types';

describe('FIR Filter Reference Implementation (Wave 12)', () => {
  describe('Fundamental Properties & Golden Vectors', () => {
    it('reproduces filter coefficients on unit impulse input (h[n] = b[n])', () => {
      const coeffs = [0.1, 0.2, 0.4, 0.2, 0.1];
      const fir = new FirFilter(coeffs);

      const impulse = new Float32Array([1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
      const response = fir.processBlock(impulse);

      for (let k = 0; k < coeffs.length; k++) {
        expect(response[k]).toBeCloseTo(coeffs[k], 6);
      }
      expect(response[5]).toBeCloseTo(0.0, 6);
    });

    it('converges to exact DC gain on unit step input (y[n] -> sum(b))', () => {
      const coeffs = [0.15, 0.35, 0.35, 0.15];
      const expectedDcGain = 1.0; // 0.15 + 0.35 + 0.35 + 0.15 = 1.0
      const fir = new FirFilter(coeffs);

      const step = new Float32Array(10).fill(1.0);
      const out = fir.processBlock(step);

      // Once all taps are filled (index >= taps - 1 = 3), output must equal DC gain
      for (let i = 3; i < 10; i++) {
        expect(out[i]).toBeCloseTo(expectedDcGain, 6);
      }
    });

    it('matches manual arithmetic for 4-tap Moving Average filter', () => {
      const ma = FirFilter.createMovingAverage(4);
      const input = new Float32Array([10.0, 20.0, 30.0, 40.0, 50.0]);
      const out = ma.processBlock(input);

      expect(out[0]).toBeCloseTo(2.5, 5);  // 10 / 4
      expect(out[1]).toBeCloseTo(7.5, 5);  // (10 + 20) / 4
      expect(out[2]).toBeCloseTo(15.0, 5); // (10 + 20 + 30) / 4
      expect(out[3]).toBeCloseTo(25.0, 5); // (10 + 20 + 30 + 40) / 4
      expect(out[4]).toBeCloseTo(35.0, 5); // (20 + 30 + 40 + 50) / 4
    });

    it('attenuates high-frequency stopband signals in Windowed-Sinc Low-Pass design', () => {
      const sampleRate = 100_000;
      const cutoff = 5_000; // 5 kHz cutoff
      const taps = 31;
      const lowPass = FirFilter.createLowPass(sampleRate, cutoff, taps, 'HANN');

      // 1. Passband test: 1 kHz Sine (far below 5 kHz cutoff)
      const passCount = 1000;
      const passSignal = new Float32Array(passCount);
      for (let i = 0; i < passCount; i++) {
        passSignal[i] = Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      }
      const passFiltered = lowPass.filterBatch(passSignal);
      // In steady state (after initial transient), passband amplitude should be ~1.0
      let maxPass = 0;
      for (let i = 50; i < passCount; i++) {
        const v = Math.abs(passFiltered[i]);
        if (v > maxPass) maxPass = v;
      }
      expect(maxPass).toBeCloseTo(1.0, 1); // < 10% attenuation in deep passband

      // 2. Stopband test: 35 kHz Sine (far above 5 kHz cutoff)
      const stopSignal = new Float32Array(passCount);
      for (let i = 0; i < passCount; i++) {
        stopSignal[i] = Math.sin((2 * Math.PI * 35_000 * i) / sampleRate);
      }
      const stopFiltered = lowPass.filterBatch(stopSignal);
      let maxStop = 0;
      for (let i = 50; i < passCount; i++) {
        const v = Math.abs(stopFiltered[i]);
        if (v > maxStop) maxStop = v;
      }
      // Stopband attenuation > 30 dB (amplitude < 0.05)
      expect(maxStop).toBeLessThan(0.05);
    });
  });

  describe('Streaming State Continuity & Reset', () => {
    it('produces identical output whether processed in one batch or across split blocks', () => {
      const firBatch = FirFilter.createMovingAverage(5);
      const firStream = FirFilter.createMovingAverage(5);

      const count = 100;
      const input = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        input[i] = Math.sin(i * 0.1);
      }

      // 1. Full batch
      const fullOut = firBatch.processBlock(input);

      // 2. Split into two 50-sample blocks
      const block1 = input.subarray(0, 50);
      const block2 = input.subarray(50, 100);
      const streamOut1 = firStream.processBlock(block1);
      const streamOut2 = firStream.processBlock(block2);

      for (let i = 0; i < 50; i++) {
        expect(streamOut1[i]).toBeCloseTo(fullOut[i], 6);
        expect(streamOut2[i]).toBeCloseTo(fullOut[50 + i], 6);
      }
    });

    it('clears state on reset()', () => {
      const fir = FirFilter.createMovingAverage(3);
      fir.processSample(10.0);
      fir.reset();

      // After reset, process 0.0 must yield 0.0 (previous state cleared)
      expect(fir.processSample(0.0)).toBe(0.0);
    });
  });

  describe('Edge Cases & Validation', () => {
    it('throws DspError(INVALID_COEFFICIENTS) on empty coefficients', () => {
      expect(() => new FirFilter([])).toThrowError(DspError);
      try {
        new FirFilter([]);
      } catch (e: unknown) {
        expect((e as DspError).code).toBe(DspErrorCode.INVALID_COEFFICIENTS);
      }
    });

    it('handles single-tap filter correctly (trivial scaling)', () => {
      const fir = new FirFilter([2.5]);
      expect(fir.processSample(4.0)).toBe(10.0);
    });

    it('throws DspError(INVALID_PARAMETER) when cutoff >= Nyquist', () => {
      expect(() => FirFilter.createLowPass(1000, 500)).toThrowError(DspError);
      expect(() => FirFilter.createLowPass(1000, 600)).toThrowError(DspError);
    });
  });
});
