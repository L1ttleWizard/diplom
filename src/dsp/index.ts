/**
 * DSP Reference Library (Wave 12)
 *
 * Ground truth mathematical implementations for digital signal processing:
 * - Statistical metrics (Mean, Min, Max, Peak-to-Peak, RMS, SignalStats)
 * - Zero Crossing Detection with sub-sample linear interpolation & hysteresis
 * - Frequency, Period, and Duty Cycle estimation
 * - Finite Impulse Response (FIR) filtering & Windowed-Sinc design
 * - Infinite Impulse Response (IIR) Biquad filtering (Direct Form II Transposed)
 */

export * from './types';
export * from './statistics';
export * from './zeroCrossing';
export * from './frequency';
export * from './fir';
export * from './iir';
