import {
  ChannelId,
  TriggerMode,
  TriggerSource,
  TriggerSlope,
  OscilloscopeStateEnum,
  DomainValidationError
} from '../types';
import { Channel } from './Channel';
import { Trigger } from './Trigger';
import { Acquisition } from './Acquisition';
import { Measurement } from './Measurement';
import { TimeDiv } from '../value-objects/TimeDiv';
import { VoltDiv } from '../value-objects/VoltDiv';
import { OscilloscopeStateMachine } from '../state-machine/OscilloscopeStateMachine';
import {
  OscilloscopeEvent,
  createEventId,
  StateChangedEvent,
  AcquisitionStartedEvent,
  AcquisitionStoppedEvent,
  TriggeredEvent,
  TimeDivChangedEvent,
  ChannelUpdatedEvent,
  TriggerConfigChangedEvent,
  DeviceErrorEvent
} from '../events/events';

export interface OscilloscopeConfig {
  id?: string;
  model?: string;
  initialTimeDiv?: number | TimeDiv;
  channels?: Channel[];
  trigger?: Trigger;
  acquisition?: Acquisition;
}

export class Oscilloscope {
  public readonly id: string;
  public readonly model: string;
  private _timeDiv: TimeDiv;
  private readonly _channels: Map<ChannelId, Channel>;
  private readonly _trigger: Trigger;
  private readonly _acquisition: Acquisition;
  private readonly _measurements: Map<string, Measurement>;
  private readonly _stateMachine: OscilloscopeStateMachine;
  private readonly _uncommittedEvents: OscilloscopeEvent[];

  constructor(config: OscilloscopeConfig = {}) {
    this.id = config.id ?? 'OSC-MAIN';
    this.model = config.model ?? 'DSO-5000-VIRTUAL';
    this._timeDiv =
      config.initialTimeDiv instanceof TimeDiv
        ? config.initialTimeDiv
        : new TimeDiv(config.initialTimeDiv ?? 1e-3); // 1ms default

    this._channels = new Map();
    if (config.channels && config.channels.length > 0) {
      for (const ch of config.channels) {
        this._channels.set(ch.id, ch);
      }
    } else {
      // Default 2 channels
      this._channels.set('CH1', new Channel({ id: 'CH1', enabled: true, voltsPerDiv: 1.0 }));
      this._channels.set('CH2', new Channel({ id: 'CH2', enabled: false, voltsPerDiv: 1.0 }));
    }

    this._trigger = config.trigger ?? new Trigger();
    this._acquisition = config.acquisition ?? new Acquisition();
    this._measurements = new Map();
    this._stateMachine = new OscilloscopeStateMachine('IDLE');
    this._uncommittedEvents = [];
  }

  public get state(): OscilloscopeStateEnum {
    return this._stateMachine.state;
  }

  public get timeDiv(): TimeDiv {
    return this._timeDiv;
  }

  public get trigger(): Trigger {
    return this._trigger;
  }

  public get acquisition(): Acquisition {
    return this._acquisition;
  }

  public getChannel(id: ChannelId): Channel {
    const ch = this._channels.get(id);
    if (!ch) {
      throw new DomainValidationError('channelId', `Channel ${id} does not exist`);
    }
    return ch;
  }

  public getChannels(): Channel[] {
    return Array.from(this._channels.values());
  }

  public getMeasurements(): Measurement[] {
    return Array.from(this._measurements.values());
  }

  public setMeasurement(measurement: Measurement): void {
    this._measurements.set(measurement.id, measurement);
  }

  /**
   * Start or resume signal acquisition
   */
  public run(): void {
    const prevState = this._stateMachine.state;

    if (prevState === 'RUNNING' || prevState === 'WAITING_TRIGGER') {
      return; // Already active
    }

    if (prevState === 'IDLE' || prevState === 'STOPPED') {
      this._stateMachine.transitionTo('ARMED', 'Run requested');
      this._stateMachine.transitionTo('RUNNING', 'Acquisition armed and active');
    } else if (prevState === 'ARMED') {
      this._stateMachine.transitionTo('RUNNING', 'Acquisition active');
    } else if (prevState === 'CAPTURED') {
      this._stateMachine.transitionTo('RUNNING', 'Run re-triggered');
    }

    this.recordEvent<StateChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'STATE_CHANGED',
      fromState: prevState,
      toState: this._stateMachine.state
    });

    this.recordEvent<AcquisitionStartedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'ACQUISITION_STARTED',
      sampleRate: this._acquisition.sampleRate,
      recordLength: this._acquisition.recordLength
    });
  }

  /**
   * Stop signal acquisition
   */
  public stop(): void {
    const prevState = this._stateMachine.state;
    if (prevState === 'STOPPED') {
      return;
    }

    this._stateMachine.transitionTo('STOPPED', 'Stop requested');

    this.recordEvent<StateChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'STATE_CHANGED',
      fromState: prevState,
      toState: 'STOPPED'
    });

    this.recordEvent<AcquisitionStoppedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'ACQUISITION_STOPPED'
    });
  }

  /**
   * Change horizontal timebase
   */
  public setTimeDiv(value: number | TimeDiv): void {
    const newTimeDiv = value instanceof TimeDiv ? value : new TimeDiv(value);
    this._timeDiv = newTimeDiv;

    this.recordEvent<TimeDivChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'TIME_DIV_CHANGED',
      timeDiv: this._timeDiv.value
    });
  }

  /**
   * Change vertical scale for a specific channel
   */
  public setVoltDiv(channelId: ChannelId, value: number | VoltDiv): void {
    const channel = this.getChannel(channelId);
    channel.setVoltsPerDiv(value);

    this.recordEvent<ChannelUpdatedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'CHANNEL_UPDATED',
      channelId,
      enabled: channel.enabled,
      voltsPerDiv: channel.voltsPerDiv.value,
      offset: channel.offset
    });
  }

  /**
   * Enable a specific channel
   */
  public enableChannel(channelId: ChannelId): void {
    const channel = this.getChannel(channelId);
    channel.enable();

    this.recordEvent<ChannelUpdatedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'CHANNEL_UPDATED',
      channelId,
      enabled: true,
      voltsPerDiv: channel.voltsPerDiv.value,
      offset: channel.offset
    });
  }

  /**
   * Disable a specific channel (at least one channel must remain enabled)
   */
  public disableChannel(channelId: ChannelId): void {
    const channel = this.getChannel(channelId);
    
    // Check invariant: at least one channel enabled
    const enabledCount = Array.from(this._channels.values()).filter((c) => c.enabled).length;
    if (channel.enabled && enabledCount <= 1) {
      throw new DomainValidationError(
        'channels',
        'Cannot disable all channels. At least one channel must remain active.'
      );
    }

    channel.disable();

    this.recordEvent<ChannelUpdatedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'CHANNEL_UPDATED',
      channelId,
      enabled: false,
      voltsPerDiv: channel.voltsPerDiv.value,
      offset: channel.offset
    });
  }

  /**
   * Configure trigger level
   */
  public setTriggerLevel(level: number): void {
    this._trigger.setLevel(level);
    this.recordTriggerConfigChanged();
  }

  /**
   * Configure trigger mode
   */
  public setTriggerMode(mode: TriggerMode): void {
    this._trigger.setMode(mode);
    this.recordTriggerConfigChanged();
  }

  /**
   * Configure trigger slope
   */
  public setTriggerSlope(slope: TriggerSlope): void {
    this._trigger.setSlope(slope);
    this.recordTriggerConfigChanged();
  }

  /**
   * Configure trigger source
   */
  public setTriggerSource(source: TriggerSource): void {
    this._trigger.setSource(source);
    this.recordTriggerConfigChanged();
  }

  /**
   * Configure horizontal trigger position (0.0 to 1.0)
   */
  public setTriggerPosition(position: number): void {
    this._trigger.setPosition(position);
    this.recordTriggerConfigChanged();
  }

  /**
   * Configure trigger holdoff time in seconds
   */
  public setTriggerHoldoff(holdoff: number): void {
    this._trigger.setHoldoff(holdoff);
    this.recordTriggerConfigChanged();
  }

  /**
   * Configure trigger hysteresis noise rejection in Volts
   */
  public setTriggerHysteresis(hysteresis: number): void {
    this._trigger.setHysteresis(hysteresis);
    this.recordTriggerConfigChanged();
  }

  private recordTriggerConfigChanged(): void {
    this.recordEvent<TriggerConfigChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'TRIGGER_CONFIG_CHANGED',
      mode: this._trigger.mode,
      source: this._trigger.source,
      level: this._trigger.level,
      slope: this._trigger.slope,
      position: this._trigger.position,
      holdoff: this._trigger.holdoff,
      hysteresis: this._trigger.hysteresis
    });
  }

  /**
   * Signal that hardware/simulation triggered
   */
  public notifyTriggerFired(
    triggerIndex?: number,
    fractionalOffset?: number,
    isForcedAuto?: boolean
  ): void {
    if (this._stateMachine.state !== 'RUNNING' && this._stateMachine.state !== 'WAITING_TRIGGER') {
      return;
    }

    const prevState = this._stateMachine.state;
    this._stateMachine.transitionTo('CAPTURED', 'Trigger fired');

    this.recordEvent<StateChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'STATE_CHANGED',
      fromState: prevState,
      toState: 'CAPTURED'
    });

    this.recordEvent<TriggeredEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'TRIGGERED',
      source: this._trigger.source,
      level: this._trigger.level,
      triggerIndex,
      fractionalOffset,
      isForcedAuto
    });

    // In SINGLE mode, complete acquisition and stop.
    // In AUTO or NORMAL mode, return to RUNNING.
    if (this._trigger.mode === 'SINGLE') {
      this.stop();
    } else {
      this._stateMachine.transitionTo('RUNNING', 'Continuing continuous acquisition');
    }
  }

  /**
   * Raise a domain or hardware fault
   */
  public raiseError(message: string): void {
    const prevState = this._stateMachine.state;
    this._stateMachine.raiseError(message);

    this.recordEvent<DeviceErrorEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'DEVICE_ERROR',
      errorMessage: message,
      previousState: prevState
    });

    this.recordEvent<StateChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'STATE_CHANGED',
      fromState: prevState,
      toState: 'ERROR'
    });
  }

  /**
   * Reset from ERROR back to STOPPED
   */
  public resetError(): void {
    this._stateMachine.resetError('STOPPED');

    this.recordEvent<StateChangedEvent>({
      id: createEventId(),
      timestamp: Date.now(),
      type: 'STATE_CHANGED',
      fromState: 'ERROR',
      toState: 'STOPPED'
    });
  }

  /**
   * Extract and clear queued events
   */
  public pullEvents(): OscilloscopeEvent[] {
    const events = [...this._uncommittedEvents];
    this._uncommittedEvents.length = 0;
    return events;
  }

  private recordEvent<T extends OscilloscopeEvent>(event: T): void {
    this._uncommittedEvents.push(event);
  }
}
