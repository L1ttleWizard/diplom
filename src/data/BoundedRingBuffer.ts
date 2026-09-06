import {
  OverflowPolicy,
  UnderflowPolicy,
  RingBufferOptions,
  RingBufferStats,
  RingBufferOverflowError,
  RingBufferUnderflowError
} from './types';

/**
 * Bounded High-Performance Circular Ring Buffer for Numeric Sample Streams.
 *
 * Characteristics:
 * - Preallocated contiguous Float32Array backing memory.
 * - Power-of-two capacity allowing branchless bitwise index wrapping (idx & mask).
 * - Zero dynamic memory allocations on write, read, and inspection operations.
 * - Configurable Overflow policies: OVERWRITE (default for oscilloscopes), DROP, ERROR.
 * - Configurable Underflow policies: PARTIAL (default), ZERO_FILL, ERROR.
 * - High-speed bulk and single-sample operations.
 * - Monotonically increasing 64-bit integer index counters.
 */
export class BoundedRingBuffer {
  private readonly _buffer: Float32Array;
  private readonly _capacity: number;
  private readonly _mask: number;
  private readonly _overflowPolicy: OverflowPolicy;
  private readonly _underflowPolicy: UnderflowPolicy;

  private _writeIndex: number = 0;
  private _readIndex: number = 0;
  private _overflowCount: number = 0;
  private _underflowCount: number = 0;

  constructor(options: RingBufferOptions | number = {}) {
    const opts: RingBufferOptions = typeof options === 'number' ? { capacity: options } : options;
    const requestedCap = opts.capacity ?? 1_048_576; // 1 MSamples default

    if (!Number.isFinite(requestedCap) || requestedCap <= 0) {
      throw new Error(`RingBuffer capacity must be a positive number, got ${requestedCap}`);
    }

    // Round up to next power of 2
    let pow2 = 1;
    while (pow2 < requestedCap) {
      pow2 <<= 1;
    }

    this._capacity = pow2;
    this._mask = pow2 - 1;
    this._buffer = new Float32Array(this._capacity);
    this._overflowPolicy = opts.overflowPolicy ?? 'OVERWRITE';
    this._underflowPolicy = opts.underflowPolicy ?? 'PARTIAL';
  }

  public get capacity(): number {
    return this._capacity;
  }

  public get overflowPolicy(): OverflowPolicy {
    return this._overflowPolicy;
  }

  public get underflowPolicy(): UnderflowPolicy {
    return this._underflowPolicy;
  }

  /**
   * Number of samples currently stored and available for reading.
   */
  public get available(): number {
    return this._writeIndex - this._readIndex;
  }

  /**
   * Alias for available (for compatibility).
   */
  public get size(): number {
    return this.available;
  }

  /**
   * Remaining capacity before the buffer is considered full.
   */
  public get freeSpace(): number {
    return this._capacity - this.available;
  }

  /**
   * Cumulative number of samples written since creation or last reset.
   */
  public get totalWritten(): number {
    return this._writeIndex;
  }

  /**
   * Cumulative number of samples consumed by readers since creation or last reset.
   */
  public get totalRead(): number {
    return this._readIndex;
  }

  /**
   * Whether the write pointer has wrapped around the physical array at least once.
   */
  public get wraparound(): boolean {
    return this._writeIndex >= this._capacity;
  }

  /**
   * Number of complete revolutions around the physical array.
   */
  public get wrapCount(): number {
    return Math.floor(this._writeIndex / this._capacity);
  }

  public get overflowCount(): number {
    return this._overflowCount;
  }

  public get underflowCount(): number {
    return this._underflowCount;
  }

  /**
   * Writes a batch of samples into the ring buffer.
   *
   * @param samples Source samples array.
   * @param count Optional limit on samples to write.
   * @returns Number of samples successfully written.
   */
  public write(samples: Float32Array | number[], count?: number): number {
    const requested = count !== undefined ? Math.min(count, samples.length) : samples.length;
    if (requested <= 0) return 0;

    const free = this.freeSpace;

    if (requested > free) {
      if (this._overflowPolicy === 'ERROR') {
        throw new RingBufferOverflowError(requested, free);
      }

      if (this._overflowPolicy === 'DROP') {
        const writable = free;
        this._overflowCount += requested - writable;
        if (writable <= 0) return 0;
        return this.writeInternal(samples, 0, writable);
      }

      // OVERWRITE policy
      const overflowSamples = requested - free;
      this._overflowCount += overflowSamples;

      if (requested >= this._capacity) {
        // Source exceeds entire buffer capacity: retain only the latest `capacity` samples
        const skip = requested - this._capacity;
        this._writeIndex += requested;
        this._readIndex = this._writeIndex - this._capacity;

        const mask = this._mask;
        const buf = this._buffer;
        let wIdx = this._readIndex;
        for (let i = 0; i < this._capacity; i++) {
          buf[wIdx & mask] = samples[skip + i];
          wIdx++;
        }
        return requested;
      } else {
        // Advance read index to discard overwritten samples
        this._readIndex += overflowSamples;
        return this.writeInternal(samples, 0, requested);
      }
    }

    return this.writeInternal(samples, 0, requested);
  }

  private writeInternal(samples: Float32Array | number[], offset: number, count: number): number {
    const mask = this._mask;
    const buf = this._buffer;
    let wIdx = this._writeIndex;

    for (let i = 0; i < count; i++) {
      buf[wIdx & mask] = samples[offset + i];
      wIdx++;
    }

    this._writeIndex = wIdx;
    return count;
  }

  /**
   * Writes a single numeric sample into the buffer.
   *
   * @param sample Value to write.
   * @returns True if written, false if dropped.
   */
  public writeOne(sample: number): boolean {
    if (this.freeSpace === 0) {
      if (this._overflowPolicy === 'ERROR') {
        throw new RingBufferOverflowError(1, 0);
      }
      if (this._overflowPolicy === 'DROP') {
        this._overflowCount++;
        return false;
      }
      // OVERWRITE
      this._overflowCount++;
      this._readIndex++;
    }

    this._buffer[this._writeIndex & this._mask] = sample;
    this._writeIndex++;
    return true;
  }

  /**
   * Reads available samples into destination buffer.
   *
   * @param destination Target array to fill.
   * @param count Optional maximum samples to read.
   * @returns Number of samples read.
   */
  public read(destination: Float32Array, count?: number): number {
    const requested = count !== undefined ? Math.min(count, destination.length) : destination.length;
    if (requested <= 0) return 0;

    const avail = this.available;

    if (requested > avail) {
      if (this._underflowPolicy === 'ERROR') {
        throw new RingBufferUnderflowError(requested, avail);
      }

      if (this._underflowPolicy === 'ZERO_FILL') {
        const actual = avail;
        this._underflowCount += requested - actual;

        // Read available samples
        this.readInternal(destination, actual);

        // Zero-pad remainder
        for (let i = actual; i < requested; i++) {
          destination[i] = 0.0;
        }

        return actual;
      }

      // PARTIAL policy
      const actual = avail;
      if (actual < requested) {
        this._underflowCount += requested - actual;
      }
      return this.readInternal(destination, actual);
    }

    return this.readInternal(destination, requested);
  }

  private readInternal(destination: Float32Array, count: number): number {
    if (count <= 0) return 0;

    const mask = this._mask;
    const buf = this._buffer;
    let rIdx = this._readIndex;

    for (let i = 0; i < count; i++) {
      destination[i] = buf[rIdx & mask];
      rIdx++;
    }

    this._readIndex = rIdx;
    return count;
  }

  /**
   * Reads a single sample from the buffer, advancing the read index.
   *
   * @returns Sample value, or null on underflow.
   */
  public readOne(): number | null {
    if (this.available === 0) {
      if (this._underflowPolicy === 'ERROR') {
        throw new RingBufferUnderflowError(1, 0);
      }
      this._underflowCount++;
      return null;
    }

    const val = this._buffer[this._readIndex & this._mask];
    this._readIndex++;
    return val;
  }

  /**
   * Non-destructive peek at a sample offset relative to current read index.
   * Does NOT advance read pointer.
   */
  public peek(offsetFromRead: number = 0): number | null {
    if (offsetFromRead < 0 || offsetFromRead >= this.available) {
      return null;
    }
    return this._buffer[(this._readIndex + offsetFromRead) & this._mask];
  }

  /**
   * Reads latest N written samples without consuming them (non-destructive).
   * Ideal for trigger search and display decimation.
   */
  public readLatest(destination: Float32Array, count: number): number {
    const n = Math.min(count, this.available, destination.length);
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
   * Does NOT consume samples (non-destructive).
   */
  public readWindow(destination: Float32Array, globalStartIndex: number, count: number): number {
    const oldestGlobal = this._readIndex;
    if (globalStartIndex < oldestGlobal) {
      // Requested data has already been discarded
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
   * Resets read and write pointers to 0 without reallocating underlying memory.
   */
  public reset(): void {
    this._writeIndex = 0;
    this._readIndex = 0;
    this._overflowCount = 0;
    this._underflowCount = 0;
  }

  /**
   * Alias for reset() (backwards compatibility).
   */
  public clear(): void {
    this.reset();
  }

  /**
   * Returns complete telemetry and diagnostic statistics.
   */
  public stats(): RingBufferStats {
    return {
      capacity: this._capacity,
      size: this.available,
      available: this.available,
      freeSpace: this.freeSpace,
      totalWritten: this._writeIndex,
      totalRead: this._readIndex,
      overflowCount: this._overflowCount,
      underflowCount: this._underflowCount,
      wrapCount: this.wrapCount,
      wraparound: this.wraparound
    };
  }
}
