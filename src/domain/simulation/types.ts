export type WaveformType =
  | 'SINE'
  | 'SQUARE'
  | 'TRIANGLE'
  | 'SAW'
  | 'PULSE'
  | 'DC'
  | 'NOISE';

export interface SignalGeneratorOptions {
  waveform?: WaveformType;
  frequency?: number;     // Frequency in Hz (e.g. 1000 = 1 kHz)
  amplitude?: number;     // Peak-to-Peak amplitude Vpp in Volts (e.g. 2.0 = -1.0V to +1.0V if offset=0)
  offset?: number;        // DC offset in Volts
  phase?: number;         // Phase in degrees (0 to 360, supports negative and wrap-around)
  dutyCycle?: number;     // Duty cycle in percentage (0 to 100, standard square = 50%)
  noiseSeed?: number;     // Initial seed for deterministic pseudo-random noise
}

export interface ClockState {
  sampleIndex: number;
  sampleRate: number;
  simulationTime: number;
  timeStep: number;
}
