import { describe, it, expect } from 'vitest';
import { findZeroCrossings } from '../../src/dsp/zeroCrossing';

describe('Zero Crossing Detection with Sub-Sample Interpolation (Wave 12)', () => {
  describe('Mathematical Precision & Interpolation', () => {
    it('computes exact sub-sample fractional index on a linear ramp', () => {
      // Ramp crosses 0.0 exactly between index 2 (-0.4) and index 3 (+0.6)
      // Exact crossing = 2 + (0 - (-0.4)) / (0.6 - (-0.4)) = 2 + 0.4 / 1.0 = 2.4
      const samples = new Float32Array([-1.4, -0.9, -0.4, 0.6, 1.1]);
      const crossings = findZeroCrossings(samples, { threshold: 0.0 });

      expect(crossings.length).toBe(1);
      expect(crossings[0].direction).toBe('RISING');
      expect(crossings[0].index).toBeCloseTo(2.4, 6);
      expect(crossings[0].slope).toBeCloseTo(1.0, 6);
    });

    it('interpolates zero crossings of an analytical Sine wave with sub-sample accuracy', () => {
      const sampleRate = 100_000;
      const freq = 1_000; // Period = 100 samples
      const count = 500; // 5 full cycles
      const samples = new Float32Array(count);

      for (let i = 0; i < count; i++) {
        samples[i] = Math.sin((2.0 * Math.PI * freq * i) / sampleRate);
      }

      // Rising crossings occur at indices: 0, 100, 200, 300, 400
      const rising = findZeroCrossings(samples, { direction: 'RISING' });

      expect(rising.length).toBe(5);
      // Expected crossings: 0.0, 100.0, 200.0, 300.0, 400.0
      for (let k = 0; k < rising.length; k++) {
        const expectedIndex = k * 100.0;
        expect(rising[k].index).toBeCloseTo(expectedIndex, 2);
        expect(rising[k].direction).toBe('RISING');
      }
    });

    it('filters direction strictly (RISING vs FALLING vs BOTH)', () => {
      // Wave with 2 cycles
      const samples = new Float32Array([
        -1.0, 1.0, -1.0, 1.0, -1.0, 1.0 // 3 rising, 2 falling
      ]);

      const both = findZeroCrossings(samples, { direction: 'BOTH' });
      const rising = findZeroCrossings(samples, { direction: 'RISING' });
      const falling = findZeroCrossings(samples, { direction: 'FALLING' });

      expect(both.length).toBe(5);
      expect(rising.length).toBe(3);
      expect(falling.length).toBe(2);

      expect(rising.every((c) => c.direction === 'RISING')).toBe(true);
      expect(falling.every((c) => c.direction === 'FALLING')).toBe(true);
    });

    it('detects crossings at non-zero arbitrary threshold levels', () => {
      // Crosses +2.0V between index 1 (1.0) and index 2 (3.0) -> index = 1.5
      const samples = new Float32Array([0.0, 1.0, 3.0, 4.0]);
      const crossings = findZeroCrossings(samples, { threshold: 2.0 });

      expect(crossings.length).toBe(1);
      expect(crossings[0].index).toBeCloseTo(1.5, 6);
    });
  });

  describe('Hysteresis & Noise Rejection', () => {
    it('suppresses false trigger glitches around zero using hysteresis band', () => {
      // Signal hovers around 0.0 with noise spikes of +/- 0.1V before a real transition to +2.0V
      const samples = new Float32Array([
        -1.0, -0.05, 0.05, -0.05, 0.05, -0.05, 2.0
      ]);

      // Without hysteresis: multiple spurious crossings
      const noHyst = findZeroCrossings(samples, { hysteresis: 0.0 });
      expect(noHyst.length).toBeGreaterThan(1);

      // With hysteresis of 0.3V (exceeds the 0.1V noise amplitude):
      const withHyst = findZeroCrossings(samples, { hysteresis: 0.3, direction: 'RISING' });
      expect(withHyst.length).toBe(1);
      // The single true rising crossing occurs from -0.05 to 2.0
      expect(withHyst[0].direction).toBe('RISING');
    });
  });

  describe('Edge Cases', () => {
    it('returns empty array when buffer length is < 2', () => {
      expect(findZeroCrossings(new Float32Array(0))).toEqual([]);
      expect(findZeroCrossings(new Float32Array([1.0]))).toEqual([]);
    });

    it('returns empty array when signal never crosses threshold (DC levels)', () => {
      const positiveDc = new Float32Array([1.0, 2.0, 1.5, 3.0]);
      expect(findZeroCrossings(positiveDc, { threshold: 0.0 })).toEqual([]);

      const negativeDc = new Float32Array([-1.0, -2.0, -1.5, -3.0]);
      expect(findZeroCrossings(negativeDc, { threshold: 0.0 })).toEqual([]);
    });

    it('does not register crossings when signal touches threshold tangentially without crossing', () => {
      // Signal dips to 0.0 at index 2 and bounces back up
      const tangent = new Float32Array([2.0, 1.0, 0.0, 1.0, 2.0]);
      const crossings = findZeroCrossings(tangent, { threshold: 0.0 });
      expect(crossings.length).toBe(0);
    });
  });
});
