import { describe, it, expect } from 'vitest';
import { Channel } from '../../src/domain/entities/Channel';
import { Trigger } from '../../src/domain/entities/Trigger';
import { Acquisition } from '../../src/domain/entities/Acquisition';
import { Measurement } from '../../src/domain/entities/Measurement';
import { SignalSource } from '../../src/domain/entities/SignalSource';
import { Circuit } from '../../src/domain/entities/Circuit';
import { Experiment } from '../../src/domain/entities/Experiment';
import { Oscilloscope } from '../../src/domain/entities/Oscilloscope';
import { DomainValidationError } from '../../src/domain/types';

describe('Domain Entities', () => {
  describe('Channel', () => {
    it('creates channel with defaults and validates 1-2-5 scale', () => {
      const ch = new Channel({ id: 'CH1' });
      expect(ch.id).toBe('CH1');
      expect(ch.enabled).toBe(true);
      expect(ch.voltsPerDiv.value).toBe(1.0);
      expect(ch.offset).toBe(0.0);
      expect(ch.coupling).toBe('DC');
      expect(ch.probeAttenuation).toBe('1X');
    });

    it('rejects invalid volts/div', () => {
      expect(() => new Channel({ id: 'CH1', voltsPerDiv: 3.5 })).toThrow(DomainValidationError);
    });

    it('enforces offset invariant based on volts/div', () => {
      const ch = new Channel({ id: 'CH1', voltsPerDiv: 0.1 }); // 100mV/div -> max offset ±1V
      expect(() => ch.setOffset(1.5)).toThrow(DomainValidationError);
      ch.setOffset(0.5);
      expect(ch.offset).toBe(0.5);
    });

    it('allows enable, disable and clone', () => {
      const ch = new Channel({ id: 'CH2', enabled: true });
      ch.disable();
      expect(ch.enabled).toBe(false);
      ch.enable();
      expect(ch.enabled).toBe(true);

      const clone = ch.clone();
      expect(clone.id).toBe('CH2');
      expect(clone.enabled).toBe(true);
    });
  });

  describe('Trigger', () => {
    it('initializes with default auto mode and rising slope', () => {
      const trigger = new Trigger();
      expect(trigger.mode).toBe('AUTO');
      expect(trigger.source).toBe('CH1');
      expect(trigger.level).toBe(0.0);
      expect(trigger.slope).toBe('RISING');
    });

    it('validates level and holdoff', () => {
      const trigger = new Trigger();
      expect(() => trigger.setLevel(NaN)).toThrow(DomainValidationError);
      expect(() => trigger.setHoldoff(-1)).toThrow(DomainValidationError);

      trigger.setLevel(1.65);
      trigger.setMode('SINGLE');
      trigger.setSlope('FALLING');
      expect(trigger.level).toBe(1.65);
      expect(trigger.mode).toBe('SINGLE');
      expect(trigger.slope).toBe('FALLING');
    });
  });

  describe('Acquisition', () => {
    it('validates logical sample rate up to 5 MSPS', () => {
      const acq = new Acquisition({ sampleRate: 5_000_000 });
      expect(acq.sampleRate).toBe(5_000_000);

      expect(() => acq.setSampleRate(10_000_000)).toThrow(DomainValidationError);
      expect(() => acq.setSampleRate(10)).toThrow(DomainValidationError);
    });

    it('enforces record length <= memory depth', () => {
      const acq = new Acquisition({ memoryDepth: 50_000, recordLength: 10_000 });
      expect(acq.recordLength).toBe(10_000);
      expect(() => acq.setRecordLength(100_000)).toThrow(DomainValidationError);
    });

    it('validates averages count to be power of 2 >= 2', () => {
      const acq = new Acquisition({ mode: 'AVERAGE', averagesCount: 8 });
      expect(acq.averagesCount).toBe(8);
      expect(() => acq.setAveragesCount(7)).toThrow(DomainValidationError);
      expect(() => acq.setAveragesCount(1)).toThrow(DomainValidationError);
    });
  });

  describe('Measurement', () => {
    it('creates and formats voltage and frequency measurements', () => {
      const vpp = new Measurement({ type: 'Vpp', channelId: 'CH1', value: 3.3 });
      expect(vpp.format()).toBe('3.300 V');
      expect(vpp.unit).toBe('V');

      const freq = new Measurement({ type: 'Frequency', channelId: 'CH1', value: 25000 });
      expect(freq.format()).toBe('25.000 kHz');

      const mHz = new Measurement({ type: 'Frequency', channelId: 'CH1', value: 2.5e6 });
      expect(mHz.format()).toBe('2.500 MHz');

      const duty = new Measurement({ type: 'DutyCycle', channelId: 'CH2', value: 49.8 });
      expect(duty.format()).toBe('49.8 %');
    });

    it('handles computing and no-signal states', () => {
      const m = new Measurement({ type: 'Vrms', channelId: 'CH1' });
      expect(m.format()).toBe('...');
      m.update(null);
      expect(m.format()).toBe('No Signal');
    });
  });

  describe('SignalSource', () => {
    it('initializes signal generator with parameters', () => {
      const src = new SignalSource({
        id: 'GEN1',
        waveform: 'SINE',
        frequency: 1000,
        amplitude: 2.0
      });
      expect(src.waveform).toBe('SINE');
      expect(src.frequency).toBe(1000);
      expect(src.amplitude).toBe(2.0);
    });

    it('mathematically evaluates waveforms at sample time t', () => {
      const src = new SignalSource({
        id: 'GEN1',
        waveform: 'SINE',
        frequency: 1000, // Period = 1ms
        amplitude: 2.0,  // ±1V peak
        offset: 0.0
      });

      // t = 0 -> sin(0) = 0
      expect(src.sampleAt(0)).toBeCloseTo(0, 4);
      // t = 0.25ms -> sin(pi/2) = 1 -> output = 1.0V
      expect(src.sampleAt(0.25e-3)).toBeCloseTo(1.0, 4);
      // t = 0.75ms -> sin(3pi/2) = -1 -> output = -1.0V
      expect(src.sampleAt(0.75e-3)).toBeCloseTo(-1.0, 4);
    });

    it('evaluates square wave with duty cycle', () => {
      const sq = new SignalSource({
        id: 'SQ1',
        waveform: 'SQUARE',
        frequency: 1000,
        amplitude: 4.0, // ±2V
        offset: 2.0,    // 0V to 4V
        dutyCycle: 25   // 25% high
      });

      // First quarter should be HIGH (4V)
      expect(sq.sampleAt(0.1e-3)).toBe(4.0);
      // After 25% should be LOW (0V)
      expect(sq.sampleAt(0.5e-3)).toBe(0.0);
    });
  });

  describe('Circuit', () => {
    it('manages components and probe points', () => {
      const circuit = new Circuit({ id: 'RC_FILTER', name: 'Low-Pass RC Filter' });
      circuit.addComponent({
        id: 'R1',
        type: 'RESISTOR',
        value: 1000,
        unit: 'Ω',
        nodeA: 'IN',
        nodeB: 'OUT'
      });
      circuit.addComponent({
        id: 'C1',
        type: 'CAPACITOR',
        value: 100e-9,
        unit: 'F',
        nodeA: 'OUT',
        nodeB: 'GND'
      });
      circuit.addProbePoint({ id: 'TP1', label: 'V_OUT', nodeId: 'OUT' });

      expect(circuit.components.length).toBe(2);
      expect(circuit.probePoints.length).toBe(1);
      expect(circuit.getProbePoint('TP1')?.nodeId).toBe('OUT');
    });
  });

  describe('Experiment', () => {
    it('assembles a lab experiment', () => {
      const circuit = new Circuit({ id: 'CIRCUIT1', name: 'Test Bench' });
      const exp = new Experiment({
        id: 'LAB1',
        title: 'RC Circuit Frequency Response',
        description: 'Study amplitude and phase response of first-order RC filter',
        circuit
      });

      const gen = new SignalSource({ id: 'GEN1', frequency: 1000 });
      exp.addSignalSource(gen);

      expect(exp.circuit?.id).toBe('CIRCUIT1');
      expect(exp.signalSources.length).toBe(1);
      expect(exp.completed).toBe(false);

      exp.markCompleted();
      expect(exp.completed).toBe(true);
    });
  });

  describe('Oscilloscope Aggregate Root', () => {
    it('initializes aggregate with channels, timebase and trigger', () => {
      const scope = new Oscilloscope();
      expect(scope.state).toBe('IDLE');
      expect(scope.getChannels().length).toBe(2);
      expect(scope.getChannel('CH1').enabled).toBe(true);
      expect(scope.getChannel('CH2').enabled).toBe(false);
      expect(scope.timeDiv.value).toBe(1e-3);
    });

    it('manages channel parameters and prevents disabling all channels', () => {
      const scope = new Oscilloscope();
      scope.enableChannel('CH2');
      expect(scope.getChannel('CH2').enabled).toBe(true);

      scope.disableChannel('CH1');
      expect(scope.getChannel('CH1').enabled).toBe(false);

      // Now only CH2 is enabled, disabling CH2 must throw DomainValidationError
      expect(() => scope.disableChannel('CH2')).toThrow(DomainValidationError);
    });

    it('collects uncommitted events and flushes them on pullEvents()', () => {
      const scope = new Oscilloscope();
      scope.setTimeDiv(200e-6);
      scope.setTriggerLevel(1.5);

      const events = scope.pullEvents();
      expect(events.length).toBe(2);
      expect(events[0].type).toBe('TIME_DIV_CHANGED');
      expect(events[1].type).toBe('TRIGGER_CONFIG_CHANGED');

      // Second pull should be empty
      expect(scope.pullEvents().length).toBe(0);
    });
  });
});
