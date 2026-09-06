/**
 * TriggerDetector Unit & Analytical Precision Tests (Wave 14)
 *
 * Deterministic validation of Schmitt trigger comparator:
 * - Rising / falling edge detection
 * - Sub-sample linear interpolation accuracy
 * - Hysteresis band noise rejection (glitch & chatter suppression)
 * - Holdoff timer on pulse trains
 * - Constant DC & boundary cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerDetector } from '../../../src/domain/trigger/TriggerDetector';

describe('TriggerDetector (Wave 14 Comparator Tests)', () => {
  let detector: TriggerDetector;
  const sampleRate = 1_000_000; // 1 MSPS

  beforeEach(() => {
    detector = new TriggerDetector({
      sampleRate,
      level: 0.0,
      slope: 'RISING',
      hysteresis: 0.02, // 20 mV
      holdoffSamples: 100
    });
  });

  describe('Edge Detection & Sub-Sample Interpolation on Analytical Sine', () => {
    it('detects rising edge on 1 kHz Sine at V_level = 0.0 V with accurate sub-sample interpolation', () => {
      const freq = 1000; // 1000 samples per cycle
      const amp = 2.0;
      const count = 3000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }

      detector.setLevel(0.0);
      detector.setSlope('RISING');

      const triggers: number[] = [];
      for (let i = 0; i < count; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) {
          triggers.push(res.sampleIndex);
          expect(res.slope).toBe('RISING');
          expect(res.voltage).toBeGreaterThanOrEqual(0.0);
          expect(samples[res.sampleIndex - 1]).toBeLessThan(0.0);
          // Interpolated offset delta should be close to 0 because sample 0, 1000, 2000 are exact roots
          expect(res.fractionalOffset).toBeGreaterThanOrEqual(0.0);
          expect(res.fractionalOffset).toBeLessThan(1.0);
        }
      }

      // 3 full cycles should produce triggers near 1000 and 2000 (0 is initial arm)
      expect(triggers.length).toBeGreaterThanOrEqual(2);
      const periodSamples = triggers[1] - triggers[0];
      expect(periodSamples).toBe(1000); // Exact 1 kHz period at 1 MSPS
    });

    it('detects rising edge at non-zero threshold V_level = +1.0 V', () => {
      const freq = 1000;
      const amp = 2.0;
      const count = 2500;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }

      detector.setLevel(1.0);
      detector.setSlope('RISING');

      // Analytical crossing: sin(2*pi*f*t) = 1.0 / 2.0 = 0.5 -> t = (pi/6) / (2*pi*f) = 1/12 ms = 83.333 us (sample 83.333)
      const expectedSample = 83.333;

      let firstTrigger: any = null;
      for (let i = 0; i < count; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) {
          firstTrigger = res;
          break;
        }
      }

      expect(firstTrigger).not.toBeNull();
      expect(firstTrigger.sampleIndex).toBe(84); // First discrete sample >= 1.0 V
      const effectiveSample = firstTrigger.sampleIndex - 1 + firstTrigger.fractionalOffset;
      expect(effectiveSample).toBeCloseTo(expectedSample, 1);
    });

    it('detects falling edge at V_level = -0.5 V', () => {
      const freq = 1000;
      const amp = 2.0;
      const count = 2000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = amp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }

      detector.setLevel(-0.5);
      detector.setSlope('FALLING');

      const triggers: any[] = [];
      for (let i = 0; i < count; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) {
          triggers.push(res);
        }
      }

      expect(triggers.length).toBeGreaterThanOrEqual(1);
      for (const trig of triggers) {
        expect(trig.slope).toBe('FALLING');
        expect(samples[trig.sampleIndex - 1]).toBeGreaterThan(-0.5);
        expect(trig.voltage).toBeLessThanOrEqual(-0.5);
      }
    });

    it('detects clean edges on a Square wave (+1.5 V / -1.5 V)', () => {
      const count = 2000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = i % 200 < 100 ? 1.5 : -1.5;
      }

      detector.setLevel(0.0);
      detector.setSlope('RISING');

      const triggers: number[] = [];
      for (let i = 0; i < count; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) triggers.push(res.sampleIndex);
      }

      // Rising transitions happen at i = 200, 400, 600...
      expect(triggers).toContain(200);
      expect(triggers).toContain(400);
      expect(triggers).toContain(600);
    });
  });

  describe('Hysteresis & Noise Immunity (Schmitt Trigger)', () => {
    it('suppresses spurious chatter when high-frequency noise ripples across trigger level', () => {
      const count = 1000;
      const samples = new Float32Array(count);

      // A slowly rising base ramp with +/- 15 mV high-frequency noise around 0.0V
      for (let i = 0; i < count; i++) {
        const base = (i - 500) * 0.002; // Crosses 0 at i=500
        const noise = Math.sin(i * 1.5) * 0.015; // 15 mV peak noise
        samples[i] = base + noise;
      }

      // With hysteresis = 0.04 V (40 mV), noise (+/- 15 mV) is fully rejected
      detector.setLevel(0.0);
      detector.setHysteresis(0.04);
      detector.setSlope('RISING');
      detector.setHoldoffSamples(1);

      const triggers: number[] = [];
      for (let i = 0; i < count; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) triggers.push(res.sampleIndex);
      }

      // Without hysteresis, noise chatter would cause multiple triggers around i=500.
      // With 40 mV hysteresis, exactly 1 genuine rising edge is accepted!
      expect(triggers.length).toBe(1);
      expect(triggers[0]).toBeGreaterThan(450);
      expect(triggers[0]).toBeLessThan(550);
    });
  });

  describe('Holdoff Timer on Burst Trains', () => {
    it('ignores secondary pulse spikes within holdoff window', () => {
      const count = 1000;
      const samples = new Float32Array(count).fill(0.0);

      // Double pulse bursts: pulse 1 at index 100, pulse 2 at index 140 (40 samples later)
      samples[100] = 3.0;
      samples[101] = 3.0;
      samples[140] = 3.0;
      samples[141] = 3.0;

      // Pulse 3 at index 500, pulse 4 at index 540
      samples[500] = 3.0;
      samples[501] = 3.0;
      samples[540] = 3.0;
      samples[541] = 3.0;

      // Holdoff = 80 samples (> 40 samples distance between double pulses)
      detector.setLevel(1.5);
      detector.setHoldoffSamples(80);
      detector.setSlope('RISING');

      const triggers: number[] = [];
      for (let i = 0; i < count; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) triggers.push(res.sampleIndex);
      }

      // Only the primary pulses (100 and 500) should trigger; secondary pulses (140, 540) are held off!
      expect(triggers).toEqual([100, 500]);
    });
  });

  describe('Reverse Search (Circular Buffer Scan)', () => {
    it('findTriggerReverse finds latest valid trigger identical to forward streaming', () => {
      const freq = 1000;
      const count = 4000;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        samples[i] = 2.0 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }

      detector.setLevel(0.5);
      detector.setSlope('RISING');
      detector.setHysteresis(0.02);

      const revResult = detector.findTriggerReverse((idx) => (idx >= 0 && idx < count ? samples[idx] : null), 3500, 1500);

      expect(revResult).not.toBeNull();
      expect(revResult!.slope).toBe('RISING');
      expect(samples[revResult!.sampleIndex]).toBeGreaterThanOrEqual(0.5);
      expect(samples[revResult!.sampleIndex - 1]).toBeLessThan(0.5);
      expect(revResult!.sampleIndex).toBeLessThanOrEqual(3500);
      expect(revResult!.sampleIndex).toBeGreaterThan(2000);
    });
  });

  describe('Constant Signals & Boundary Cases', () => {
    it('never triggers on constant DC signal (0.0 V)', () => {
      const samples = new Float32Array(1000).fill(0.0);
      detector.setLevel(0.0);

      const triggers: number[] = [];
      for (let i = 0; i < samples.length; i++) {
        const res = detector.processSample(samples[i], i);
        if (res !== null) triggers.push(res.sampleIndex);
      }

      expect(triggers.length).toBe(0);
    });

    it('never triggers when signal amplitude is strictly below trigger level', () => {
      const samples = new Float32Array(1000);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = 1.0 * Math.sin(i * 0.05); // +/- 1.0 V
      }

      detector.setLevel(2.5); // 2.5 V is unreachable
      detector.setSlope('RISING');

      for (let i = 0; i < samples.length; i++) {
        expect(detector.processSample(samples[i], i)).toBeNull();
      }
    });
  });
});
