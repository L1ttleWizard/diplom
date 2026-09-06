/**
 * Core Domain Errors
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class DomainValidationError extends DomainError {
  constructor(public readonly field: string, message: string) {
    super(`Validation failed for ${field}: ${message}`);
    this.name = 'DomainValidationError';
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(
    public readonly fromState: OscilloscopeStateEnum,
    public readonly toState: OscilloscopeStateEnum,
    reason?: string
  ) {
    super(
      `Invalid state transition from '${fromState}' to '${toState}'${reason ? `: ${reason}` : ''}`
    );
    this.name = 'InvalidStateTransitionError';
  }
}

/**
 * Oscilloscope Lifecycle States
 * IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → STOPPED (and ERROR)
 */
export type OscilloscopeStateEnum =
  | 'IDLE'
  | 'ARMED'
  | 'RUNNING'
  | 'WAITING_TRIGGER'
  | 'CAPTURED'
  | 'STOPPED'
  | 'ERROR';

/**
 * Channel Identifiers and Configurations
 */
export type ChannelId = 'CH1' | 'CH2';

export type Coupling = 'DC' | 'AC' | 'GND';

export type ProbeAttenuation = '1X' | '10X' | '100X';

/**
 * Trigger System Types
 */
export type TriggerMode = 'AUTO' | 'NORMAL' | 'SINGLE';

export type TriggerSource = 'CH1' | 'CH2' | 'EXT';

export type TriggerSlope = 'RISING' | 'FALLING';

/**
 * Acquisition System Types
 */
export type AcquisitionMode = 'SAMPLE' | 'PEAK_DETECT' | 'AVERAGE';

/**
 * Automated Measurements Types
 */
export type MeasurementType =
  | 'Vpp'
  | 'Vmax'
  | 'Vmin'
  | 'Vrms'
  | 'Frequency'
  | 'Period'
  | 'DutyCycle'
  | 'RiseTime'
  | 'FallTime';

export type MeasurementStatus = 'VALID' | 'CLIPPED' | 'NO_SIGNAL' | 'COMPUTING';

/**
 * Signal Source Waveforms
 */
export type SignalWaveform =
  | 'SINE'
  | 'SQUARE'
  | 'TRIANGLE'
  | 'SAWTOOTH'
  | 'NOISE'
  | 'PWM';

/**
 * Circuit Simulation Element Types
 */
export type CircuitComponentType =
  | 'RESISTOR'
  | 'CAPACITOR'
  | 'INDUCTOR'
  | 'VOLTAGE_SOURCE'
  | 'GROUND';
