import { ChannelId, Coupling, ProbeAttenuation } from '../types';

export type ADCResolution = 8 | 10 | 12 | 14 | 16;

export type LogicalSampleRate = 1_000_000 | 2_000_000 | 5_000_000;

export interface AFEConfig {
  coupling?: Coupling;
  probeAttenuation?: ProbeAttenuation;
  voltsPerDiv?: number;
  offset?: number;
  bandwidthLimit?: boolean;
  cutoffFrequency?: number; // In Hz, e.g. 20 MHz or custom limit
  noiseRms?: number;         // Analog input noise standard deviation in Volts
  noiseSeed?: number;        // Seed for reproducible analog noise
  minRailVoltage?: number;   // Analog negative rail in Volts
  maxRailVoltage?: number;   // Analog positive rail in Volts
  fullScaleReference?: number; // Voltage corresponding to full scale display (default 4.0V = 4 div)
}

export interface ADCConfig {
  resolution?: ADCResolution; // 8, 10, 12, 14, 16 bits (default 8)
  fullScaleVoltage?: number;  // Full scale peak range: [-VFS, +VFS], default 4.0 V
  sampleRate?: LogicalSampleRate | number; // Default 1 MSPS
}

export interface ADCConversionResult {
  sampleCount: number;
  clippedLowCount: number;
  clippedHighCount: number;
  isClipped: boolean;
}

export interface QuantizationMetrics {
  lsbVoltage: number;       // q = 2 * VFS / 2^N
  totalLevels: number;      // 2^N
  minVoltage: number;       // -VFS
  maxVoltage: number;       // +VFS
  theoreticalSnrDb: number; // 6.02 * N + 1.76 dB
}
