import {
  OscilloscopeStateEnum,
  ChannelId,
  TriggerMode,
  TriggerSource,
  TriggerSlope,
  MeasurementType
} from '../types';

export interface BaseDomainEvent {
  readonly id: string;
  readonly timestamp: number;
}

export interface StateChangedEvent extends BaseDomainEvent {
  readonly type: 'STATE_CHANGED';
  readonly fromState: OscilloscopeStateEnum;
  readonly toState: OscilloscopeStateEnum;
}

export interface AcquisitionStartedEvent extends BaseDomainEvent {
  readonly type: 'ACQUISITION_STARTED';
  readonly sampleRate: number;
  readonly recordLength: number;
}

export interface AcquisitionStoppedEvent extends BaseDomainEvent {
  readonly type: 'ACQUISITION_STOPPED';
}

export interface TriggeredEvent extends BaseDomainEvent {
  readonly type: 'TRIGGERED';
  readonly source: TriggerSource;
  readonly level: number;
  readonly triggerIndex?: number;
  readonly fractionalOffset?: number;
  readonly isForcedAuto?: boolean;
}

export interface MeasurementUpdatedEvent extends BaseDomainEvent {
  readonly type: 'MEASUREMENT_UPDATED';
  readonly channelId: ChannelId;
  readonly measurementType: MeasurementType;
  readonly value: number | null;
  readonly unit: string;
}

export interface DeviceErrorEvent extends BaseDomainEvent {
  readonly type: 'DEVICE_ERROR';
  readonly errorMessage: string;
  readonly previousState: OscilloscopeStateEnum;
}

export interface TimeDivChangedEvent extends BaseDomainEvent {
  readonly type: 'TIME_DIV_CHANGED';
  readonly timeDiv: number;
}

export interface ChannelUpdatedEvent extends BaseDomainEvent {
  readonly type: 'CHANNEL_UPDATED';
  readonly channelId: ChannelId;
  readonly enabled: boolean;
  readonly voltsPerDiv: number;
  readonly offset: number;
}

export interface TriggerConfigChangedEvent extends BaseDomainEvent {
  readonly type: 'TRIGGER_CONFIG_CHANGED';
  readonly mode: TriggerMode;
  readonly source: TriggerSource;
  readonly level: number;
  readonly slope?: TriggerSlope;
  readonly position?: number;
  readonly holdoff?: number;
  readonly hysteresis?: number;
}


export type OscilloscopeEvent =
  | StateChangedEvent
  | AcquisitionStartedEvent
  | AcquisitionStoppedEvent
  | TriggeredEvent
  | MeasurementUpdatedEvent
  | DeviceErrorEvent
  | TimeDivChangedEvent
  | ChannelUpdatedEvent
  | TriggerConfigChangedEvent;

let eventCounter = 0;

export function createEventId(): string {
  return `evt_${Date.now()}_${++eventCounter}`;
}
