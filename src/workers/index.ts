/**
 * Workers Layer (Wave 4+)
 *
 * Dedicated web workers for continuous signal simulation, numerical circuit
 * integration, DSP filtering, and FFT computations.
 */

export interface IWorkerMessage<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly timestamp: number;
}
