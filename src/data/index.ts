/**
 * Data Plane Layer (Wave 3+)
 *
 * This layer manages high-throughput ring buffers, shared memory (SharedArrayBuffer),
 * decimation, and streaming waveform data (1-5 MSPS).
 * Never routed through React or UI state.
 */

export interface ISampleRingBuffer {
  readonly capacity: number;
  readonly size: number;
  readonly totalWritten: number;
  write(samples: Float32Array, count?: number): number;
  read(destination: Float32Array, count: number): number;
  readLatest(destination: Float32Array, count: number): number;
  readWindow(destination: Float32Array, globalStartIndex: number, count: number): number;
  clear(): void;
}

export { SampleRingBuffer } from './SampleRingBuffer';
