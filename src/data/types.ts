export type OverflowPolicy = 'OVERWRITE' | 'DROP' | 'ERROR';

export type UnderflowPolicy = 'PARTIAL' | 'ZERO_FILL' | 'ERROR';

export interface RingBufferOptions {
  capacity?: number;
  overflowPolicy?: OverflowPolicy;
  underflowPolicy?: UnderflowPolicy;
}

export interface RingBufferStats {
  capacity: number;
  size: number;
  available: number;
  freeSpace: number;
  totalWritten: number;
  totalRead: number;
  overflowCount: number;
  underflowCount: number;
  wrapCount: number;
  wraparound: boolean;
}

export class RingBufferOverflowError extends Error {
  public readonly requestedCount: number;
  public readonly freeSpace: number;

  constructor(requestedCount: number, freeSpace: number) {
    super(
      `RingBuffer overflow: cannot write ${requestedCount} samples with only ${freeSpace} free slots available`
    );
    this.name = 'RingBufferOverflowError';
    this.requestedCount = requestedCount;
    this.freeSpace = freeSpace;
  }
}

export class RingBufferUnderflowError extends Error {
  public readonly requestedCount: number;
  public readonly available: number;

  constructor(requestedCount: number, available: number) {
    super(
      `RingBuffer underflow: cannot read ${requestedCount} samples with only ${available} samples available`
    );
    this.name = 'RingBufferUnderflowError';
    this.requestedCount = requestedCount;
    this.available = available;
  }
}
