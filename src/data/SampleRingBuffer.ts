import { ISampleRingBuffer } from './index';

/**
 * High-performance circular sample ring buffer for Data Plane.
 *
 * Characteristics:
 * - Preallocated contiguous Float32Array backing memory.
 * - Power-of-two capacity allowing branchless bitwise index wrapping (idx & mask).
 * - Zero per-write and zero per-read memory allocations.
 * - Supports extracting latest contiguous window for trigger search and display decimation.
 */
export class SampleRingBuffer implements ISampleRingBuffer {
  private readonly _buffer: Float32Array;
  private readonly _capacity: number;
  private readonly _mask: number;

  private _writeIndex: number = 0; // Monotonically increasing 64-bit integer
  private _size: number = 0;

  constructor(capacity: number = 1_048_576) { // 1 MSamples default (power of 2)
    // Ensure capacity is a power of 2
    let pow2 = 1;
    while (pow2 < capacity) {
      pow2 <<= 1;
    }
    this._capacity = pow2;
    this._mask = pow2 - 1;
    this._buffer = new Float32Array(this._capacity);
  }

  public get capacity(): number {
    return this._capacity;
  }

  public get size(): number {
    return this._size;
  }

  public get totalWritten(): number {
    return this._writeIndex;
  }

  /**
   * Writes a batch of samples into the circular buffer.
   * If capacity is exceeded, oldest samples are overwritten seamlessly.
   *
   * @param samples Source sample array.
   * @param count Optional count to write (defaults to samples.length).
   * @returns Number of samples written.
   */
  public write(samples: Float32Array, count?: number): number {
    const n = count !== undefined ? Math.min(count, samples.length) : samples.length;
    if (n <= 0) return 0;

    const mask = this._mask;
    const buf = this._buffer;
    let writeIdx = this._writeIndex;

    for (let i = 0; i < n; i++) {
      buf[writeIdx & mask] = samples[i];
      writeIdx++;
    }

    this._writeIndex = writeIdx;
    this._size = Math.min(this._capacity, this._size + n);
    return n;
  }

  /**
   * Reads the oldest available samples into destination buffer.
   */
  public read(destination: Float32Array, count: number): number {
    const n = Math.min(count, this._size, destination.length);
    if (n <= 0) return 0;

    const startIdx = this._writeIndex - this._size;
    const mask = this._mask;
    const buf = this._buffer;

    for (let i = 0; i < n; i++) {
      destination[i] = buf[(startIdx + i) & mask];
    }

    this._size -= n;
    return n;
  }

  /**
   * Reads the latest N samples written to the buffer in chronological order.
   * Does NOT consume/remove the samples from the buffer (ideal for display / trigger).
   * Zero memory allocations.
   */
  public readLatest(destination: Float32Array, count: number): number {
    const n = Math.min(count, this._size, destination.length);
    if (n <= 0) return 0;

    const startIdx = this._writeIndex - n;
    const mask = this._mask;
    const buf = this._buffer;

    for (let i = 0; i < n; i++) {
      destination[i] = buf[(startIdx + i) & mask];
    }

    return n;
  }

  /**
   * Reads an arbitrary chronological window of samples by global sample index.
   */
  public readWindow(destination: Float32Array, globalStartIndex: number, count: number): number {
    const oldestGlobal = this._writeIndex - this._size;
    if (globalStartIndex < oldestGlobal) {
      // Requested data has already been overwritten
      return 0;
    }

    const n = Math.min(count, destination.length, this._writeIndex - globalStartIndex);
    if (n <= 0) return 0;

    const mask = this._mask;
    const buf = this._buffer;

    for (let i = 0; i < n; i++) {
      destination[i] = buf[(globalStartIndex + i) & mask];
    }

    return n;
  }

  /**
   * Resets buffer pointers to empty state without reallocating underlying memory.
   */
  public clear(): void {
    this._writeIndex = 0;
    this._size = 0;
  }
}
