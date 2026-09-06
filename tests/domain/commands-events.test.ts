import { describe, it, expect, vi } from 'vitest';
import { OscilloscopeService } from '../../src/application/services/OscilloscopeService';
import { EventBus } from '../../src/application/events/EventBus';
import { DomainValidationError } from '../../src/domain/types';
import {
  AcquisitionStartedEvent,
  AcquisitionStoppedEvent,
  ChannelUpdatedEvent,
  TimeDivChangedEvent,
  TriggerConfigChangedEvent,
  OscilloscopeEvent
} from '../../src/domain/events/events';

describe('Commands & Events Model (Control Plane)', () => {
  it('executes RUN command and publishes AcquisitionStarted and StateChanged events', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    const onAcqStarted = vi.fn();
    const onStateChanged = vi.fn();

    eventBus.subscribe<AcquisitionStartedEvent>('ACQUISITION_STARTED', onAcqStarted);
    eventBus.subscribe('STATE_CHANGED', onStateChanged);

    service.execute({ type: 'RUN' });

    expect(service.getState()).toBe('RUNNING');
    expect(onAcqStarted).toHaveBeenCalledOnce();
    expect(onStateChanged).toHaveBeenCalled();
  });

  it('executes STOP command and publishes AcquisitionStopped event', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    service.execute({ type: 'RUN' });

    const onAcqStopped = vi.fn();
    eventBus.subscribe<AcquisitionStoppedEvent>('ACQUISITION_STOPPED', onAcqStopped);

    service.execute({ type: 'STOP' });

    expect(service.getState()).toBe('STOPPED');
    expect(onAcqStopped).toHaveBeenCalledOnce();
  });

  it('executes SET_TIME_DIV command and publishes TimeDivChanged event', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    const onTimeDivChanged = vi.fn();
    eventBus.subscribe<TimeDivChangedEvent>('TIME_DIV_CHANGED', onTimeDivChanged);

    service.execute({ type: 'SET_TIME_DIV', timeDiv: 50e-6 });

    expect(service.oscilloscope.timeDiv.value).toBe(50e-6);
    expect(onTimeDivChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TIME_DIV_CHANGED',
        timeDiv: 50e-6
      })
    );
  });

  it('rejects non-standard time/div value in SET_TIME_DIV', () => {
    const service = new OscilloscopeService();
    expect(() => service.execute({ type: 'SET_TIME_DIV', timeDiv: 3.14 })).toThrow(
      DomainValidationError
    );
  });

  it('executes SET_VOLT_DIV command and updates channel', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    const onChannelUpdated = vi.fn();
    eventBus.subscribe<ChannelUpdatedEvent>('CHANNEL_UPDATED', onChannelUpdated);

    service.execute({ type: 'SET_VOLT_DIV', channelId: 'CH1', voltDiv: 0.5 });

    expect(service.oscilloscope.getChannel('CH1').voltsPerDiv.value).toBe(0.5);
    expect(onChannelUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'CHANNEL_UPDATED',
        channelId: 'CH1',
        voltsPerDiv: 0.5
      })
    );
  });

  it('executes SET_TRIGGER_LEVEL and SET_TRIGGER_MODE commands', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    const onTriggerUpdated = vi.fn();
    eventBus.subscribe<TriggerConfigChangedEvent>('TRIGGER_CONFIG_CHANGED', onTriggerUpdated);

    service.execute({ type: 'SET_TRIGGER_LEVEL', level: 1.25 });
    expect(service.oscilloscope.trigger.level).toBe(1.25);

    service.execute({ type: 'SET_TRIGGER_MODE', mode: 'SINGLE' });
    expect(service.oscilloscope.trigger.mode).toBe('SINGLE');

    expect(onTriggerUpdated).toHaveBeenCalledTimes(2);
  });

  it('executes ENABLE_CHANNEL and DISABLE_CHANNEL commands', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    service.execute({ type: 'ENABLE_CHANNEL', channelId: 'CH2' });
    expect(service.oscilloscope.getChannel('CH2').enabled).toBe(true);

    service.execute({ type: 'DISABLE_CHANNEL', channelId: 'CH1' });
    expect(service.oscilloscope.getChannel('CH1').enabled).toBe(false);

    // Invariant check: cannot disable last remaining channel
    expect(() => service.execute({ type: 'DISABLE_CHANNEL', channelId: 'CH2' })).toThrow(
      DomainValidationError
    );
  });

  it('supports wildcard subscription on EventBus', () => {
    const eventBus = new EventBus();
    const service = new OscilloscopeService(undefined, eventBus);

    const allEvents: OscilloscopeEvent[] = [];
    eventBus.subscribe('*', (evt) => {
      allEvents.push(evt);
    });

    service.execute({ type: 'RUN' });
    service.execute({ type: 'SET_TIME_DIV', timeDiv: 10e-3 });
    service.execute({ type: 'STOP' });

    expect(allEvents.length).toBeGreaterThanOrEqual(3);
  });
});
