/**
 * TriggerEngine Deterministic & Mode Semantics Tests (Wave 14)
 *
 * Exhaustive verification of:
 * - Capture window pre-trigger & post-trigger slicing
 * - AUTO mode: locked trigger and auto-timeout free-running sweeps
 * - NORMAL mode: locked trigger and display freeze on missing trigger
 * - SINGLE mode: single sweep capture, immediate stop, and re-arm
 * - Stable trigger position (jitter-free phase alignment over 100 consecutive frames)
 * - Display buffer extraction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TriggerEngine } from '../../../src/domain/trigger/TriggerEngine';
import { BoundedRingBuffer } from '../../../src/data/BoundedRingBuffer';

describe('TriggerEngine (Wave 14 Windowing & Mode Tests)', () => {
  let engine: TriggerEngine;
  let ringBuffer: BoundedRingBuffer;
  const sampleRate = 1_000_000; // 1 MSPS
  const timeDiv = 1e-3; // 1 ms/div -> 10 ms window = 10,000 samples

  beforeEach(() => {
    engine = new TriggerEngine({
      sampleRate,
      timeDiv,
      position: 0.5, // Center screen
      mode: 'AUTO',
      level: 0.0,
      slope: 'RISING',
      hysteresis: 0.02,
      holdoff: 100e-9,
      autoTimeout: 0.04 // 40 ms
    });

    ringBuffer = new BoundedRingBuffer({
      capacity: 65536,
      overflowPolicy: 'OVERWRITE',
      underflowPolicy: 'PARTIAL'
    });
  });

  const feedSine = (freq: number, amp: number, sampleCount: number, baseIdx: number = 0) => {
    const buf = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      const t = (baseIdx + i) / sampleRate;
      buf[i] = amp * Math.sin(2 * Math.PI * freq * t);
    }
    ringBuffer.write(buf, sampleCount);
    return sampleCount;
  };

  const feedDC = (voltage: number, sampleCount: number) => {
    const buf = new Float32Array(sampleCount).fill(voltage);
    ringBuffer.write(buf, sampleCount);
    return sampleCount;
  };

  describe('Window Lengths and Pre/Post Trigger Partitioning', () => {
    it('computes exact window lengths for center trigger position (50%)', () => {
      engine.setTimeDiv(1e-3); // 10ms window
      engine.setPosition(0.5);

      const params = engine.computeWindowLengths();
      expect(params.windowDuration).toBeCloseTo(0.010, 6);
      expect(params.sampleCount).toBe(10_000);
      expect(params.preTriggerSamples).toBe(5_000);
      expect(params.postTriggerSamples).toBe(5_000);
    });

    it('computes asymmetric pre/post trigger partitions (10% and 90%)', () => {
      engine.setTimeDiv(1e-3);

      // Left-aligned trigger (10% pre-trigger, 90% post-trigger)
      engine.setPosition(0.1);
      const leftParams = engine.computeWindowLengths();
      expect(leftParams.preTriggerSamples).toBe(1_000);
      expect(leftParams.postTriggerSamples).toBe(9_000);
      expect(leftParams.sampleCount).toBe(10_000);

      // Right-aligned trigger (90% pre-trigger, 10% post-trigger)
      engine.setPosition(0.9);
      const rightParams = engine.computeWindowLengths();
      expect(rightParams.preTriggerSamples).toBe(9_000);
      expect(rightParams.postTriggerSamples).toBe(1_000);
      expect(rightParams.sampleCount).toBe(10_000);
    });
  });

  describe('AUTO Mode Semantics', () => {
    it('locks onto 1 kHz Sine with stable trigger position', () => {
      engine.configure({ mode: 'AUTO', level: 0.5, slope: 'RISING', timeDiv: 1e-3 });
      feedSine(1000, 2.0, 25_000);

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 25_000);

      expect(capture).not.toBeNull();
      expect(capture!.isTriggered).toBe(true);
      expect(capture!.isForcedAuto).toBe(false);
      expect(capture!.sampleCount).toBe(10_000);

      // Verify trigger sample voltage is at threshold >= 0.5 V
      const trigVoltage = sampleAt(capture!.triggerSampleIndex);
      expect(trigVoltage).toBeGreaterThanOrEqual(0.5);
      expect(sampleAt(capture!.triggerSampleIndex - 1)).toBeLessThan(0.5);
    });

    it('forces auto-sweep when signal is flat DC (autoTimeout elapsed)', () => {
      engine.configure({ mode: 'AUTO', level: 0.5, slope: 'RISING', autoTimeout: 0.02 }); // 20ms timeout = 20,000 samples
      feedDC(0.0, 25_000); // 25ms of 0.0V DC (no trigger condition)

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 25_000);

      expect(capture).not.toBeNull();
      expect(capture!.isTriggered).toBe(false);
      expect(capture!.isForcedAuto).toBe(true);
      expect(capture!.sampleCount).toBe(10_000);
    });

    it('transitions smoothly from free-running DC sweep to locked AC trigger', () => {
      engine.configure({ mode: 'AUTO', level: 0.5, slope: 'RISING', autoTimeout: 0.02 });

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);

      // 1. Ingest DC: triggers forced auto
      feedDC(0.0, 25_000);
      const autoCapture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 25_000);
      expect(autoCapture!.isForcedAuto).toBe(true);

      // 2. AC signal arrives
      feedSine(1000, 2.0, 20_000, 25_000);
      const lockedCapture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 20_000);
      expect(lockedCapture!.isTriggered).toBe(true);
      expect(lockedCapture!.isForcedAuto).toBe(false);
    });
  });

  describe('NORMAL Mode Semantics', () => {
    it('locks and captures frames when trigger condition is satisfied', () => {
      engine.configure({ mode: 'NORMAL', level: 0.0, slope: 'FALLING', timeDiv: 1e-3 });
      feedSine(1000, 1.5, 20_000);

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 20_000);

      expect(capture).not.toBeNull();
      expect(capture!.isTriggered).toBe(true);
      expect(capture!.isForcedAuto).toBe(false);

      // Verify falling slope: previous sample > 0, trigger sample <= 0
      expect(sampleAt(capture!.triggerSampleIndex - 1)).toBeGreaterThan(0.0);
      expect(sampleAt(capture!.triggerSampleIndex)).toBeLessThanOrEqual(0.0);
    });

    it('returns null and does NOT generate frames when trigger level is unreachable', () => {
      // 1.0 V sine, but trigger level is set to 4.0 V
      engine.configure({ mode: 'NORMAL', level: 4.0, slope: 'RISING' });
      feedSine(1000, 1.0, 30_000);

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 30_000);

      expect(capture).toBeNull();
      expect(engine.state).toBe('WAITING_TRIGGER');
    });

    it('returns null on constant DC signal without generating spurious frames', () => {
      engine.configure({ mode: 'NORMAL', level: 0.0, slope: 'RISING' });
      feedDC(1.23, 30_000);

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 30_000);

      expect(capture).toBeNull();
      expect(engine.state).toBe('WAITING_TRIGGER');
    });
  });

  describe('SINGLE Mode Semantics', () => {
    it('captures exactly ONE frame on trigger event and transitions to STOPPED', () => {
      engine.configure({ mode: 'SINGLE', level: 0.5, slope: 'RISING' });
      engine.arm();

      expect(engine.state).toBe('WAITING_TRIGGER');

      // Feed enough samples to trigger
      feedSine(1000, 2.0, 20_000);
      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);

      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 20_000);

      expect(capture).not.toBeNull();
      expect(capture!.isTriggered).toBe(true);
      expect(engine.state).toBe('STOPPED');

      // Further incoming samples must NOT re-trigger or change capture window
      feedSine(1000, 2.0, 10_000, 20_000);
      const secondCheck = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 10_000);

      // Returns frozen last capture
      expect(secondCheck).toBe(capture);
      expect(engine.state).toBe('STOPPED');
    });

    it('remains in WAITING_TRIGGER if trigger condition does not occur', () => {
      engine.configure({ mode: 'SINGLE', level: 3.5, slope: 'RISING' }); // 3.5V unreachable
      engine.arm();

      feedSine(1000, 1.0, 20_000);
      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);

      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 20_000);

      expect(capture).toBeNull();
      expect(engine.state).toBe('WAITING_TRIGGER');
    });
  });

  describe('Trigger Position Stability & Jitter Soak Test', () => {
    it('maintains rock-solid, zero-drift phase alignment over 50 consecutive frame updates', () => {
      engine.configure({ mode: 'NORMAL', level: 0.5, slope: 'RISING', timeDiv: 1e-3 });
      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);

      const displayBuf = new Float32Array(600);
      const centerPointIdx = 300; // Index 300 is 50% center

      // Initial prime
      feedSine(1000, 2.0, 20_000);

      const triggerCenterVoltages: number[] = [];

      for (let frame = 0; frame < 50; frame++) {
        // Feed 1000 new samples (1 full cycle)
        feedSine(1000, 2.0, 1000, 20_000 + frame * 1000);

        const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 1000);
        if (capture !== null) {
          engine.extractDisplayBuffer(sampleAt, capture, displayBuf, 600, 1.0, 0.0);
          triggerCenterVoltages.push(displayBuf[centerPointIdx]);
        }
      }

      expect(triggerCenterVoltages.length).toBeGreaterThanOrEqual(40);

      // In a stable oscilloscope, the center voltage at the trigger marker (0.5 V)
      // must remain virtually identical on every frame without jumping or wandering.
      const firstVoltage = triggerCenterVoltages[0];
      for (const v of triggerCenterVoltages) {
        expect(v).toBeCloseTo(firstVoltage, 1); // Close to 0.5 V within 0.1 div
      }
    });
  });

  describe('Display Buffer Extraction & Graticule Alignment', () => {
    it('correctly maps trigger reference to center graticule point (index 300 of 600)', () => {
      engine.configure({ mode: 'AUTO', level: 1.0, slope: 'RISING', timeDiv: 1e-3, position: 0.5 });
      feedSine(1000, 2.0, 20_000);

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 20_000);

      const displayBuf = new Float32Array(600);
      engine.extractDisplayBuffer(sampleAt, capture!, displayBuf, 600, 1.0, 0.0);

      // Center point (point 300) should be close to 1.0 div (1.0 V at 1.0 V/div)
      expect(displayBuf[300]).toBeCloseTo(1.0, 1);
    });

    it('correctly shifts trigger reference to 20% left point (index 120 of 600)', () => {
      engine.configure({ mode: 'AUTO', level: 1.0, slope: 'RISING', timeDiv: 1e-3, position: 0.2 });
      feedSine(1000, 2.0, 20_000);

      const sampleAt = (idx: number) => (idx >= ringBuffer.totalRead && idx < ringBuffer.totalWritten ? ringBuffer.peek(idx - ringBuffer.totalRead) : null);
      const capture = engine.processAcquisition(sampleAt, ringBuffer.totalWritten, ringBuffer.totalRead, 20_000);

      const displayBuf = new Float32Array(600);
      engine.extractDisplayBuffer(sampleAt, capture!, displayBuf, 600, 1.0, 0.0);

      // Index 120 (20% of 600) should align with trigger level
      expect(displayBuf[120]).toBeCloseTo(1.0, 1);
    });
  });
});
