import { describe, it, expect } from 'vitest';
import { IirBiquadFilter } from '../../src/dsp/iir';
import { DspError, DspErrorCode } from '../../src/dsp/types';

describe('IIR Biquad Filter Reference Implementation (Wave 12)', () => {
  describe('Mathematical Properties & Golden Vectors', () => {
    it('achieves exact unity DC gain on constant step input (H(0) = 1.0)', () => {
      const sampleRate = 100_000;
      const cutoff = 1_000;
      const iir = IirBiquadFilter.createButterworthLowPass(sampleRate, cutoff);

      const stepVal = 5.0;
      const count = 500;
      const step = new Float32Array(count).fill(stepVal);
      const out = iir.processBlock(step);

      // Settle time for 1 kHz at 100 kHz is ~50 samples
      const steadyState = out[count - 1];
      expect(steadyState).toBeCloseTo(stepVal, 4);
    });

    it('attenuates signal by exactly -3.01 dB (1 / sqrt(2) approx 0.7071) at cutoff frequency', () => {
      const sampleRate = 100_000;
      const cutoff = 2_000; // 2 kHz cutoff
      const iir = IirBiquadFilter.createButterworthLowPass(sampleRate, cutoff);

      // Signal at exactly cutoff frequency (amplitude = 1.0)
      const count = 2000;
      const cutoffSignal = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        cutoffSignal[i] = Math.sin((2.0 * Math.PI * cutoff * i) / sampleRate);
      }

      const out = iir.processBlock(cutoffSignal);

      // Measure amplitude in steady state (last 500 samples)
      let maxAmp = 0;
      for (let i = count - 500; i < count; i++) {
        const v = Math.abs(out[i]);
        if (v > maxAmp) maxAmp = v;
      }

      const expectedCutoffAmp = 1.0 / Math.SQRT2; // ~0.70710678
      expect(maxAmp).toBeCloseTo(expectedCutoffAmp, 2);
    });

    it('steeply rolls off stopband frequencies (f = 5 * fc) according to 2nd-order Butterworth (-40 dB/dec)', () => {
      const sampleRate = 100_000;
      const cutoff = 2_000;
      const stopFreq = 10_000; // 5 * cutoff
      const iir = IirBiquadFilter.createButterworthLowPass(sampleRate, cutoff);

      const count = 2000;
      const stopSignal = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        stopSignal[i] = Math.sin((2.0 * Math.PI * stopFreq * i) / sampleRate);
      }

      const out = iir.processBlock(stopSignal);

      let maxStop = 0;
      for (let i = count - 500; i < count; i++) {
        const v = Math.abs(out[i]);
        if (v > maxStop) maxStop = v;
      }

      // Theoretical 2nd order attenuation at 5*fc is ~1/25 = 0.04 (-28 dB)
      expect(maxStop).toBeLessThan(0.05);
    });

    it('verifies 1st-Order Low-Pass filter step response and exponential decay', () => {
      const sampleRate = 10_000;
      const cutoff = 100;
      const rcFilter = IirBiquadFilter.createFirstOrderLowPass(sampleRate, cutoff);

      const count = 300;
      const step = new Float32Array(count).fill(2.0);
      const out = rcFilter.processBlock(step);

      expect(out[count - 1]).toBeCloseTo(2.0, 3);
    });
  });

  describe('Stability Verification (Jury Criterion)', () => {
    it('accepts stable filters and validates isStable = true', () => {
      const butter = IirBiquadFilter.createButterworthLowPass(10000, 1000);
      expect(butter.isStable).toBe(true);
    });

    it('rejects unstable filters with poles outside the unit circle', () => {
      // Unstable: a2 = 1.2 >= 1.0
      const unstableCoeffs = {
        b0: 1,
        b1: 0,
        b2: 0,
        a0: 1,
        a1: -0.5,
        a2: 1.2,
      };

      expect(IirBiquadFilter.checkStability(unstableCoeffs.a1, unstableCoeffs.a2)).toBe(false);

      expect(() => new IirBiquadFilter(unstableCoeffs, true)).toThrowError(DspError);

      try {
        new IirBiquadFilter(unstableCoeffs, true);
      } catch (e: unknown) {
        expect((e as DspError).code).toBe(DspErrorCode.UNSTABLE_FILTER);
      }
    });
  });

  describe('Edge Cases & Parameter Validation', () => {
    it('throws DspError(INVALID_COEFFICIENTS) when a0 is zero', () => {
      const bad = { b0: 1, b1: 0, b2: 0, a0: 0, a1: 1, a2: 0 };
      expect(() => new IirBiquadFilter(bad)).toThrowError(DspError);
    });

    it('throws DspError(INVALID_PARAMETER) when cutoff >= Nyquist', () => {
      expect(() => IirBiquadFilter.createButterworthLowPass(1000, 500)).toThrowError(DspError);
      expect(() => IirBiquadFilter.createFirstOrderLowPass(1000, 550)).toThrowError(DspError);
    });

    it('clears state upon reset()', () => {
      const iir = IirBiquadFilter.createButterworthLowPass(10000, 1000);
      iir.processSample(10.0);
      iir.reset();

      // Immediately processing 0.0 after reset should give 0.0
      expect(iir.processSample(0.0)).toBe(0.0);
    });
  });
});
