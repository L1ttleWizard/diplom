/**
 * Trigger Engine Type Definitions (Wave 14)
 *
 * Sample-domain trigger detection, hysteresis comparator, and capture window types.
 */

import { TriggerMode, TriggerSlope, TriggerSource } from '../types';

export type TriggerDetectorState = 'UNARMED' | 'ARMED' | 'TRIGGERED' | 'HOLDOFF';

export type TriggerEngineState =
  | 'IDLE'
  | 'ARMED'
  | 'WAITING_TRIGGER'
  | 'TRIGGERED'
  | 'CAPTURED'
  | 'STOPPED';

/**
 * Result of a successful trigger event detected in sample domain.
 */
export interface TriggerDetectionResult {
  /** Global monotonic sample index where trigger threshold was crossed */
  readonly sampleIndex: number;
  /** Sub-sample linear fractional offset delta in [0.0, 1.0) */
  readonly fractionalOffset: number;
  /** Physical simulation time in seconds corresponding to crossing */
  readonly timestamp: number;
  /** Slope of the trigger crossing */
  readonly slope: TriggerSlope;
  /** Threshold voltage (V) */
  readonly level: number;
  /** Actual sample voltage at discrete sampleIndex (V) */
  readonly voltage: number;
}

/**
 * Capture window record extracted from continuous sample stream.
 */
export interface CaptureWindow {
  /** Start sample index in global sample coordinates (k_trig - N_pre) */
  readonly startSampleIndex: number;
  /** Monotonic sample index of the trigger event (k_trig) */
  readonly triggerSampleIndex: number;
  /** Sub-sample fractional root delta in [0.0, 1.0) for zero-jitter rendering */
  readonly fractionalOffset: number;
  /** Total number of samples in the capture window (N_window = 10 * timeDiv * sampleRate) */
  readonly sampleCount: number;
  /** Number of pre-trigger samples before triggerSampleIndex */
  readonly preTriggerSamples: number;
  /** Number of post-trigger samples after triggerSampleIndex */
  readonly postTriggerSamples: number;
  /** Whether the capture was triggered by an authentic signal condition */
  readonly isTriggered: boolean;
  /** Whether the capture was forced by auto-timeout in AUTO mode */
  readonly isForcedAuto: boolean;
  /** Active trigger mode during capture */
  readonly mode: TriggerMode;
  /** Simulation timestamp of the window trigger reference point */
  readonly timestamp: number;
}

/**
 * Configuration options for TriggerEngine
 */
export interface TriggerEngineConfig {
  sampleRate?: number;
  timeDiv?: number;
  level?: number;
  slope?: TriggerSlope;
  mode?: TriggerMode;
  source?: TriggerSource;
  holdoff?: number;
  position?: number;
  hysteresis?: number;
  autoTimeout?: number;
}
