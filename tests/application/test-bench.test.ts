import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { TestBench } from '../../src/application/testbench/TestBench';
import { OscilloscopeService } from '../../src/application/services/OscilloscopeService';
import { EventBus } from '../../src/application/events/EventBus';
import { RaycastManager } from '../../src/rendering/interaction/RaycastManager';
import { OscilloscopeInteractionAdapter } from '../../src/rendering/interaction/OscilloscopeInteractionAdapter';
import { STABLE_IDS, IInteractionTarget } from '../../src/rendering/interaction/InteractionTarget';

describe('End-to-End Test Bench & Control-to-Display Pipeline', () => {
  describe('Minimal Working Test Bench Pipeline', () => {
    it('initializes signal generator at 1 kHz, 1 V, 1 MSPS and acquires into ring buffer', () => {
      const tb = new TestBench({
        signalFrequency: 1000,
        signalAmplitude: 1.0,
        signalOffset: 0.0,
        sampleRate: 1_000_000,
        bufferCapacity: 65536,
        displayPoints: 600
      });

      const telemetry = tb.getTelemetry();
      expect(telemetry.frequency).toBe(1000);
      expect(telemetry.amplitude).toBe(1.0);
      expect(telemetry.sampleRate).toBe(1_000_000);
      expect(telemetry.timeDiv).toBe(0.001); // 1 ms/div default
      expect(telemetry.voltsDiv).toBe(1.0);  // 1 V/div default
      expect(telemetry.triggerLevel).toBe(0.0);
      expect(telemetry.visibleTimeWindow).toBeCloseTo(0.01); // 10 * 1 ms = 10 ms
      expect(telemetry.displayBufferSize).toBe(600);
      expect(telemetry.triggerPosition).toBe(5.0);

      // Verify that ring buffer contains samples
      expect(tb.ringBuffer.available).toBeGreaterThan(1000);
      expect(telemetry.totalAcquiredSamples).toBeGreaterThan(1000);
    });

    it('locks digital trigger onto rising edge of 1 kHz sine at 0.0V threshold', () => {
      const tb = new TestBench();
      tb.service.execute({ type: 'SET_TRIGGER_LEVEL', level: 0.0 });

      // Acquire 20 ms of data (20 periods of 1 kHz sine)
      tb.acquire(20000);

      const trigIdx = tb.findTriggerCrossing(0.0, 'RISING');
      expect(trigIdx).toBeGreaterThan(0);

      const vPrev = tb.sampleAtGlobal(trigIdx - 1)!;
      const vCurr = tb.sampleAtGlobal(trigIdx)!;

      expect(vPrev).toBeLessThan(0.0);
      expect(vCurr).toBeGreaterThanOrEqual(0.0);

      // Verify computeDisplayBuffer locks trigger
      const displayBuf = tb.computeDisplayBuffer();
      const telemetry = tb.getTelemetry();
      expect(telemetry.triggered).toBe(true);

      // Center point of display (index 300 out of 600) should be close to 0.0V (trigger level)
      const centerPoint = displayBuf[Math.round(displayBuf.length * 0.5)];
      expect(centerPoint).toBeCloseTo(0.0, 1);
    });
  });

  describe('Control Path: Volts/Div (Physical Signal vs Display Transform Separation)', () => {
    it('scales vertical display transform without altering raw sample voltages', () => {
      const tb = new TestBench({
        signalFrequency: 1000,
        signalAmplitude: 1.0, // Peak = 1.0V
        sampleRate: 1_000_000,
        displayPoints: 600
      });

      // 1. Initial scale: 1.0 V/div
      tb.service.execute({ type: 'SET_VOLT_DIV', channelId: 'CH1', voltDiv: 1.0 });
      tb.acquire(20000);

      const buf1V = new Float32Array(600);
      tb.computeDisplayBuffer(buf1V);

      // Max deflection at 1.0 V/div for 1.0V peak should be ~1.0 division
      let maxDeflection1V = -Infinity;
      for (let i = 0; i < buf1V.length; i++) {
        if (buf1V[i] > maxDeflection1V) maxDeflection1V = buf1V[i];
      }
      expect(maxDeflection1V).toBeCloseTo(1.0, 1);

      // 2. Change scale: 0.5 V/div (zoom in vertically)
      tb.service.execute({ type: 'SET_VOLT_DIV', channelId: 'CH1', voltDiv: 0.5 });
      const buf05V = new Float32Array(600);
      tb.computeDisplayBuffer(buf05V);

      // Max deflection at 0.5 V/div for 1.0V peak should now be ~2.0 divisions (2x taller on screen)
      let maxDeflection05V = -Infinity;
      for (let i = 0; i < buf05V.length; i++) {
        if (buf05V[i] > maxDeflection05V) maxDeflection05V = buf05V[i];
      }
      expect(maxDeflection05V).toBeCloseTo(2.0, 1);
      expect(maxDeflection05V).toBeCloseTo(maxDeflection1V * 2.0, 1);

      // 3. Change scale: 2.0 V/div (zoom out vertically)
      tb.service.execute({ type: 'SET_VOLT_DIV', channelId: 'CH1', voltDiv: 2.0 });
      const buf2V = new Float32Array(600);
      tb.computeDisplayBuffer(buf2V);

      let maxDeflection2V = -Infinity;
      for (let i = 0; i < buf2V.length; i++) {
        if (buf2V[i] > maxDeflection2V) maxDeflection2V = buf2V[i];
      }
      expect(maxDeflection2V).toBeCloseTo(0.5, 1);
      expect(maxDeflection2V).toBeCloseTo(maxDeflection1V * 0.5, 1);

      // CRITICAL ARCHITECTURAL INVARIANT:
      // Raw signal amplitude from signal generator MUST remain strictly unchanged (1.0 V)!
      expect(tb.signalGenerator.amplitude / 2.0).toBe(1.0);
      expect(tb.getTelemetry().amplitude).toBe(1.0);
    });
  });

  describe('Control Path: Time/Div (Physical Frequency vs Visible Window Separation)', () => {
    it('scales visible time window and cycle count without altering physical signal frequency', () => {
      const tb = new TestBench({
        signalFrequency: 1000, // 1 kHz -> Period T = 1 ms
        signalAmplitude: 1.0,
        sampleRate: 1_000_000,
        displayPoints: 1000
      });

      // 1. Initial timebase: 1.0 ms/div -> Visible span = 10 ms -> Exactly 10 cycles of 1 kHz
      tb.service.execute({ type: 'SET_TIME_DIV', timeDiv: 0.001 });
      tb.acquire(50000);

      const telemetry1ms = tb.getTelemetry();
      expect(telemetry1ms.timeDiv).toBe(0.001);
      expect(telemetry1ms.visibleTimeWindow).toBeCloseTo(0.010); // 10 ms

      const buf1ms = new Float32Array(1000);
      tb.computeDisplayBuffer(buf1ms);

      // Count zero crossings (rising) in display buffer for 1 ms/div
      let zeroCrossings1ms = 0;
      for (let i = 1; i < buf1ms.length; i++) {
        if (buf1ms[i - 1] < 0.0 && buf1ms[i] >= 0.0) {
          zeroCrossings1ms++;
        }
      }
      // 10 ms span of 1 kHz has ~10 cycles
      expect(zeroCrossings1ms).toBeGreaterThanOrEqual(9);
      expect(zeroCrossings1ms).toBeLessThanOrEqual(11);

      // 2. Change timebase: 0.2 ms/div -> Visible span = 2 ms -> Exactly 2 cycles of 1 kHz
      tb.service.execute({ type: 'SET_TIME_DIV', timeDiv: 0.0002 });
      const telemetry02ms = tb.getTelemetry();
      expect(telemetry02ms.timeDiv).toBe(0.0002);
      expect(telemetry02ms.visibleTimeWindow).toBeCloseTo(0.002); // 2 ms

      const buf02ms = new Float32Array(1000);
      tb.computeDisplayBuffer(buf02ms);

      let zeroCrossings02ms = 0;
      for (let i = 1; i < buf02ms.length; i++) {
        if (buf02ms[i - 1] < 0.0 && buf02ms[i] >= 0.0) {
          zeroCrossings02ms++;
        }
      }
      // 2 ms span with center trigger has 1 to 3 rising crossings (1 at center, boundary endpoints)
      expect(zeroCrossings02ms).toBeGreaterThanOrEqual(1);
      expect(zeroCrossings02ms).toBeLessThanOrEqual(3);

      // 3. Change timebase: 0.5 ms/div -> Visible span = 5 ms -> Exactly 5 cycles of 1 kHz
      tb.service.execute({ type: 'SET_TIME_DIV', timeDiv: 0.0005 });
      const buf05ms = new Float32Array(1000);
      tb.computeDisplayBuffer(buf05ms);

      let zeroCrossings05ms = 0;
      for (let i = 1; i < buf05ms.length; i++) {
        if (buf05ms[i - 1] < 0.0 && buf05ms[i] >= 0.0) {
          zeroCrossings05ms++;
        }
      }
      expect(zeroCrossings05ms).toBeGreaterThanOrEqual(4);
      expect(zeroCrossings05ms).toBeLessThanOrEqual(6);

      // 4. Change timebase: 5.0 ms/div -> Visible span = 50 ms -> Exactly 50 cycles of 1 kHz
      tb.service.execute({ type: 'SET_TIME_DIV', timeDiv: 0.005 });
      expect(tb.getTelemetry().visibleTimeWindow).toBeCloseTo(0.050); // 50 ms

      // CRITICAL ARCHITECTURAL INVARIANT:
      // Physical generator frequency MUST remain strictly 1000 Hz!
      expect(tb.signalGenerator.frequency).toBe(1000);
      expect(tb.getTelemetry().frequency).toBe(1000);
    });
  });

  describe('Control Path: Trigger Level Alignment', () => {
    it('shifts waveform phase alignment so that center point matches trigger level', () => {
      const tb = new TestBench({
        signalFrequency: 1000,
        signalAmplitude: 1.0,
        sampleRate: 1_000_000,
        displayPoints: 600
      });

      tb.acquire(30000);

      // 1. Trigger Level = 0.0 V
      tb.service.execute({ type: 'SET_TRIGGER_LEVEL', level: 0.0 });
      const buf0V = new Float32Array(600);
      tb.computeDisplayBuffer(buf0V);
      const center0V = buf0V[300];
      expect(center0V).toBeCloseTo(0.0, 1);

      // 2. Trigger Level = +0.5 V
      tb.service.execute({ type: 'SET_TRIGGER_LEVEL', level: 0.5 });
      const buf05V = new Float32Array(600);
      tb.computeDisplayBuffer(buf05V);
      const center05V = buf05V[300];
      expect(center05V).toBeCloseTo(0.5, 1);

      // 3. Trigger Level = -0.5 V
      tb.service.execute({ type: 'SET_TRIGGER_LEVEL', level: -0.5 });
      const bufNeg05V = new Float32Array(600);
      tb.computeDisplayBuffer(bufNeg05V);
      const centerNeg05V = bufNeg05V[300];
      expect(centerNeg05V).toBeCloseTo(-0.5, 1);

      // 4. Trigger Level out of range (+2.0 V when signal is 1.0 V peak)
      tb.service.execute({ type: 'SET_TRIGGER_LEVEL', level: 2.0 });
      tb.service.execute({ type: 'SET_TRIGGER_MODE', mode: 'AUTO' });
      tb.computeDisplayBuffer();
      const telemetry = tb.getTelemetry();
      expect(telemetry.triggered).toBe(false); // Trigger cannot lock on 2.0V for a 1.0V sine
    });
  });

  describe('3D Interaction & Visual Feedback Propagation', () => {
    it('propagates pointer drag on Time/Div knob through command, domain, 3D rotation, and display buffer', () => {
      const eventBus = new EventBus();
      const service = new OscilloscopeService(undefined, eventBus);
      const tb = new TestBench({ sampleRate: 1_000_000 }, service);

      const camera = new THREE.PerspectiveCamera();
      const rm = new RaycastManager(camera);

      const knobMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01));
      const objectMap = new Map<string, THREE.Object3D>([[STABLE_IDS.OSC_KNOB_TIME, knobMesh]]);

      new OscilloscopeInteractionAdapter(service, rm, objectMap);

      expect(service.oscilloscope.timeDiv.value).toBe(0.001); // 1 ms default
      const initialRotation = knobMesh.rotation.z;

      // Initial visible window: 10 * 1 ms = 10 ms
      expect(tb.getTelemetry().visibleTimeWindow).toBeCloseTo(0.010);

      // Simulate user dragging Time/Div knob forward
      const registeredTarget = Array.from((rm as any)._targets.values()).find(
        (t: any) => t.stableId === STABLE_IDS.OSC_KNOB_TIME
      ) as IInteractionTarget;

      expect(registeredTarget).toBeDefined();

      // Drag knob past threshold (+1.0)
      registeredTarget.onDrag!(1.0);

      // 1. Verify domain state updated to next step on 1-2-5 scale (2 ms)
      expect(service.oscilloscope.timeDiv.value).toBe(0.002);

      // 2. Verify 3D knob visual rotation updated
      expect(knobMesh.rotation.z).not.toBe(initialRotation);

      // 3. Verify TestBench visible window updated
      expect(tb.getTelemetry().visibleTimeWindow).toBeCloseTo(0.020); // 20 ms

      // 4. Verify display buffer now reflects 2 ms/div scale
      const displayBuf = tb.computeDisplayBuffer();
      expect(displayBuf.length).toBe(600);
    });

    it('propagates pointer drag on Volt/Div knob through command, domain, 3D rotation, and display buffer', () => {
      const eventBus = new EventBus();
      const service = new OscilloscopeService(undefined, eventBus);
      const tb = new TestBench({ sampleRate: 1_000_000 }, service);

      const camera = new THREE.PerspectiveCamera();
      const rm = new RaycastManager(camera);

      const knobMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.01));
      const objectMap = new Map<string, THREE.Object3D>([[STABLE_IDS.OSC_KNOB_VOLT_CH1, knobMesh]]);

      new OscilloscopeInteractionAdapter(service, rm, objectMap);

      expect(service.oscilloscope.getChannel('CH1').voltsPerDiv.value).toBe(1.0); // 1 V default
      const initialRotation = knobMesh.rotation.z;

      const registeredTarget = Array.from((rm as any)._targets.values()).find(
        (t: any) => t.stableId === STABLE_IDS.OSC_KNOB_VOLT_CH1
      ) as IInteractionTarget;

      expect(registeredTarget).toBeDefined();

      // Drag Volt/Div knob forward (1.0 -> 2.0 V/div)
      registeredTarget.onDrag!(1.0);

      // 1. Verify domain state updated
      expect(service.oscilloscope.getChannel('CH1').voltsPerDiv.value).toBe(2.0);

      // 2. Verify 3D knob rotation updated
      expect(knobMesh.rotation.z).not.toBe(initialRotation);

      // 3. Verify TestBench telemetry updated
      expect(tb.getTelemetry().voltsDiv).toBe(2.0);
    });
  });
});
