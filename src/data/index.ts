/**
 * Data Plane Layer (Wave 9)
 *
 * Manages bounded circular sample ring buffers, shared memory,
 * zero-allocation sample streaming, and decimation structures.
 * Never routed through React or UI state.
 */

export * from './types';
export * from './BoundedRingBuffer';
export * from './SampleRingBuffer';

export interface ISampleRingBuffer {
  readonly capacity: number;
  readonly size: number;
  readonly available: number;
  readonly freeSpace: number;
  readonly totalWritten: number;
  readonly totalRead: number;
  readonly wraparound: boolean;
  readonly wrapCount: number;
  write(samples: Float32Array | number[], count?: number): number;
  writeOne(sample: number): boolean;
  read(destination: Float32Array, count?: number): number;
  readOne(): number | null;
  readLatest(destination: Float32Array, count: number): number;
  readWindow(destination: Float32Array, globalStartIndex: number, count: number): number;
  reset(): void;
  clear(): void;
}
