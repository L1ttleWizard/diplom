import { SharedMemoryCapability } from './SharedMemoryCapability';
import { SharedRingBufferLayout } from './SharedRingBufferLayout';
import { SharedRingBufferProducer } from './SharedRingBufferProducer';
import { SharedRingBufferConsumer } from './SharedRingBufferConsumer';
import { BoundedRingBuffer } from '../BoundedRingBuffer';
import {
  IDataPlaneTransport,
  DataPlaneTransportMode,
  SharedBatchMetadata,
  SharedRingBufferStats
} from './types';

/**
 * SharedArrayBuffer-backed Data Plane Transport.
 */
export class SharedArrayBufferTransport implements IDataPlaneTransport {
  public readonly mode: DataPlaneTransportMode = 'SHARED_ARRAY_BUFFER';
  public readonly capacity: number;
  private readonly _producer: SharedRingBufferProducer;
  private readonly _consumer: SharedRingBufferConsumer;

  constructor(buffer: SharedArrayBuffer) {
    this._producer = new SharedRingBufferProducer(buffer);
    this._consumer = new SharedRingBufferConsumer(buffer);
    this.capacity = this._producer.capacity;
  }

  public get buffer(): SharedArrayBuffer {
    return this._producer.buffer;
  }

  public get producer(): SharedRingBufferProducer {
    return this._producer;
  }

  public get consumer(): SharedRingBufferConsumer {
    return this._consumer;
  }

  public writeBatch(
    ch1: Float32Array,
    ch2: Float32Array,
    count: number,
    metadata?: Partial<SharedBatchMetadata>
  ): void {
    this._producer.writeBatch(ch1, ch2, count, metadata);
  }

  public readAvailable(
    ch1Out: Float32Array,
    ch2Out: Float32Array,
    maxCount?: number
  ): number {
    return this._consumer.readAvailable(ch1Out, ch2Out, maxCount);
  }

  public peekLatest(
    ch1Out: Float32Array,
    ch2Out: Float32Array,
    count: number
  ): number {
    return this._consumer.peekLatest(ch1Out, ch2Out, count);
  }

  public getStats(): SharedRingBufferStats {
    return this._consumer.getStats();
  }

  public reset(): void {
    this._producer.reset();
  }

  public dispose(): void {
    this._producer.setState('STOPPED');
  }
}

/**
 * Message-Passing / In-Memory Fallback Transport.
 *
 * Utilized when cross-origin isolation is not active or SharedArrayBuffer is unavailable.
 * Employs two pre-allocated BoundedRingBuffers for CH1 and CH2.
 */
export class MessagePassingTransport implements IDataPlaneTransport {
  public readonly mode: DataPlaneTransportMode = 'MESSAGE_PASSING';
  public readonly capacity: number;
  private readonly _ringCh1: BoundedRingBuffer;
  private readonly _ringCh2: BoundedRingBuffer;
  private _sequence: number = 0;
  private _ch1Clipped: boolean = false;
  private _ch2Clipped: boolean = false;
  private _producedTimestamp: number = 0;

  constructor(capacity: number = 65_536) {
    this.capacity = capacity;
    this._ringCh1 = new BoundedRingBuffer({ capacity, overflowPolicy: 'OVERWRITE' });
    this._ringCh2 = new BoundedRingBuffer({ capacity, overflowPolicy: 'OVERWRITE' });
  }

  public writeBatch(
    ch1: Float32Array,
    ch2: Float32Array,
    count: number,
    metadata?: Partial<SharedBatchMetadata>
  ): void {
    if (count <= 0) return;
    this._ringCh1.write(ch1, count);
    this._ringCh2.write(ch2, count);
    this._sequence++;

    if (metadata) {
      if (metadata.ch1Clipped !== undefined) this._ch1Clipped = metadata.ch1Clipped;
      if (metadata.ch2Clipped !== undefined) this._ch2Clipped = metadata.ch2Clipped;
      if (metadata.producedTimestamp !== undefined) this._producedTimestamp = metadata.producedTimestamp;
    } else {
      this._producedTimestamp = performance.now();
    }
  }

  public readAvailable(
    ch1Out: Float32Array,
    ch2Out: Float32Array,
    maxCount?: number
  ): number {
    const available = Math.min(this._ringCh1.available, this._ringCh2.available);
    if (available === 0) return 0;

    const countToRead = maxCount !== undefined ? Math.min(available, maxCount) : available;
    const actual1 = this._ringCh1.read(ch1Out, countToRead);
    const actual2 = this._ringCh2.read(ch2Out, countToRead);

    return Math.min(actual1, actual2);
  }

  public peekLatest(
    ch1Out: Float32Array,
    ch2Out: Float32Array,
    count: number
  ): number {
    const actual1 = this._ringCh1.readLatest(ch1Out, count);
    const actual2 = this._ringCh2.readLatest(ch2Out, count);
    return Math.min(actual1, actual2);
  }

  public getStats(): SharedRingBufferStats {
    const r1 = this._ringCh1;
    return {
      writeIndex: r1.totalWritten,
      readIndex: r1.totalRead,
      sequence: this._sequence,
      available: r1.available,
      freeSpace: r1.freeSpace,
      capacity: this.capacity,
      overflowCount: r1.overflowCount,
      underrunCount: r1.underflowCount,
      ch1Clipped: this._ch1Clipped,
      ch2Clipped: this._ch2Clipped,
      producedTimestamp: this._producedTimestamp
    };
  }

  public reset(): void {
    this._ringCh1.reset();
    this._ringCh2.reset();
    this._sequence = 0;
    this._ch1Clipped = false;
    this._ch2Clipped = false;
    this._producedTimestamp = 0;
  }

  public dispose(): void {
    this.reset();
  }
}

/**
 * DataPlaneTransport Factory
 *
 * Automatically inspects runtime capabilities and provisions the optimal
 * transport: SharedArrayBuffer when permitted, or graceful MessagePassing fallback.
 */
export class DataPlaneTransport {
  public static create(
    capacity: number = 65_536,
    options?: { forceFallback?: boolean; sampleRate?: number }
  ): IDataPlaneTransport {
    const capability = SharedMemoryCapability.check();

    if (capability.isSupported && !options?.forceFallback) {
      const sab = SharedRingBufferLayout.createBuffer(capacity, options?.sampleRate);
      return new SharedArrayBufferTransport(sab);
    }

    return new MessagePassingTransport(capacity);
  }
}
