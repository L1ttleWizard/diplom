/**
 * Workers Layer (Wave 8+)
 *
 * Dedicated web workers for continuous signal simulation, acquisition,
 * DSP filtering, and numerical processing.
 */

export interface IWorkerMessage<T = unknown> {
  readonly type: string;
  readonly payload: T;
  readonly timestamp: number;
}

export * from './acquisition/protocol';
export * from './acquisition/AcquisitionWorkerCore';
export * from './acquisition/AcquisitionWorkerClient';
