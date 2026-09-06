import { WaveformType } from '../../domain/simulation/types';
import { AFEConfig, ADCConfig, LogicalSampleRate } from '../../domain/acquisition/types';

export const PROTOCOL_VERSION = 1;

export type WorkerState = 'UNINITIALIZED' | 'IDLE' | 'RUNNING' | 'STOPPED' | 'ERROR';

// --- MAIN THREAD -> WORKER COMMANDS ---

export interface WorkerInitPayload {
  sampleRate?: LogicalSampleRate | number;
  batchSize?: number;
  intervalMs?: number;
  sharedBuffer?: SharedArrayBuffer; // WAVE 10: SharedArrayBuffer Data Plane
  ch1?: {
    waveform?: WaveformType;
    frequency?: number;
    amplitude?: number;
    offset?: number;
    phase?: number;
    dutyCycle?: number;
    afe?: AFEConfig;
    adc?: ADCConfig;
  };
  ch2?: {
    waveform?: WaveformType;
    frequency?: number;
    amplitude?: number;
    offset?: number;
    phase?: number;
    dutyCycle?: number;
    afe?: AFEConfig;
    adc?: ADCConfig;
  };
}

export interface WorkerConfigurePayload {
  sampleRate?: LogicalSampleRate | number;
  batchSize?: number;
  intervalMs?: number;
  channelId?: 'CH1' | 'CH2';
  signal?: {
    waveform?: WaveformType;
    frequency?: number;
    amplitude?: number;
    offset?: number;
    phase?: number;
    dutyCycle?: number;
  };
  afe?: Partial<AFEConfig>;
  adc?: Partial<ADCConfig>;
}

export interface WorkerStartPayload {
  intervalMs?: number;
}

export interface WorkerStopPayload {}
export interface WorkerResetPayload {}

export type WorkerCommandType = 'INIT' | 'START' | 'STOP' | 'CONFIGURE' | 'RESET';

export interface WorkerCommandMessage<T = unknown> {
  version: number;
  id: string;
  type: WorkerCommandType;
  timestamp: number;
  payload: T;
}

// --- WORKER -> MAIN THREAD EVENTS ---

export interface WorkerInitializedPayload {
  protocolVersion: number;
  sampleRate: number;
  batchSize: number;
  workerTimestamp: number;
  dataPlaneMode: 'SHARED_ARRAY_BUFFER' | 'MESSAGE_PASSING';
}

export interface WorkerBatchPayload {
  batchIndex: number;
  sampleCount: number;
  sampleRate: number;
  simulationTimeStart: number;
  simulationTimeEnd: number;
  ch1Clipped: boolean;
  ch2Clipped: boolean;
  ch1Samples?: Float32Array; // Transferable when in MESSAGE_PASSING mode
  ch2Samples?: Float32Array; // Transferable when in MESSAGE_PASSING mode
  producedAt: number;
  generationDurationMs: number;
  mode?: 'SHARED_ARRAY_BUFFER' | 'MESSAGE_PASSING';
}

export interface WorkerConfiguredPayload {
  appliedConfig: Record<string, unknown>;
}

export interface WorkerStateChangedPayload {
  previous: WorkerState;
  current: WorkerState;
}

export interface WorkerErrorPayload {
  code: string;
  message: string;
  recoverable: boolean;
  timestamp: number;
}

export type WorkerEventType =
  | 'INITIALIZED'
  | 'BATCH_PRODUCED'
  | 'CONFIGURED'
  | 'STATE_CHANGED'
  | 'ERROR';

export interface WorkerEventMessage<T = unknown> {
  version: number;
  id: string;
  type: WorkerEventType;
  timestamp: number;
  payload: T;
}

export function validateWorkerCommand(msg: unknown): WorkerCommandMessage {
  if (!msg || typeof msg !== 'object') {
    throw new Error('Malformed worker command: message must be an object');
  }
  const cmd = msg as Partial<WorkerCommandMessage>;
  if (cmd.version !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${cmd.version}`
    );
  }
  if (!cmd.type || !['INIT', 'START', 'STOP', 'CONFIGURE', 'RESET'].includes(cmd.type)) {
    throw new Error(`Unsupported worker command type: ${cmd.type}`);
  }
  if (typeof cmd.id !== 'string') {
    throw new Error('Worker command must have string id');
  }
  return cmd as WorkerCommandMessage;
}
