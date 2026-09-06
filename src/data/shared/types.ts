/**
 * SharedArrayBuffer Data Plane Types & Interfaces.
 */

export interface SharedMemoryCapabilityReport {
  /** True if SharedArrayBuffer, Atomics, and allocation are fully supported and allowed */
  isSupported: boolean;
  /** True if window/worker context has cross-origin isolation enabled */
  crossOriginIsolated: boolean;
  /** True if Atomics API is defined in global scope */
  hasAtomics: boolean;
  /** True if new SharedArrayBuffer(size) succeeds without security exception */
  canAllocateSAB: boolean;
  /** Human-readable explanation of capability status */
  reason: string;
}

export type SharedBufferState = 'IDLE' | 'RUNNING' | 'STOPPED' | 'ERROR';

export interface SharedBatchMetadata {
  batchIndex: number;
  sampleCount: number;
  sampleRate: number;
  simulationTimeStart: number;
  simulationTimeEnd: number;
  ch1Clipped: boolean;
  ch2Clipped: boolean;
  producedTimestamp: number;
}

export interface SharedRingBufferStats {
  writeIndex: number;
  readIndex: number;
  sequence: number;
  available: number;
  freeSpace: number;
  capacity: number;
  overflowCount: number;
  underrunCount: number;
  ch1Clipped: boolean;
  ch2Clipped: boolean;
  producedTimestamp: number;
}

export type DataPlaneTransportMode = 'SHARED_ARRAY_BUFFER' | 'MESSAGE_PASSING';

export interface IDataPlaneTransport {
  readonly mode: DataPlaneTransportMode;
  readonly capacity: number;
  writeBatch(
    ch1: Float32Array,
    ch2: Float32Array,
    count: number,
    metadata?: Partial<SharedBatchMetadata>
  ): void;
  readAvailable(ch1Out: Float32Array, ch2Out: Float32Array, maxCount: number): number;
  peekLatest(ch1Out: Float32Array, ch2Out: Float32Array, count: number): number;
  getStats(): SharedRingBufferStats;
  reset(): void;
  dispose(): void;
}
