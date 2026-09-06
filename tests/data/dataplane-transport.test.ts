import { describe, it, expect } from 'vitest';
import { DataPlaneTransport } from '../../src/data/shared/DataPlaneTransport';

describe('DataPlaneTransport & Transparent Fallback (Wave 10)', () => {
  it('instantiates SharedArrayBufferTransport when capabilities allow', () => {
    const transport = DataPlaneTransport.create(1024);
    expect(transport.mode).toBe('SHARED_ARRAY_BUFFER');
    expect(transport.capacity).toBe(1024);

    const ch1 = new Float32Array([1.0, 2.0, 3.0]);
    const ch2 = new Float32Array([10.0, 20.0, 30.0]);
    transport.writeBatch(ch1, ch2, 3);

    const out1 = new Float32Array(3);
    const out2 = new Float32Array(3);
    const read = transport.readAvailable(out1, out2, out1.length);

    expect(read).toBe(3);
    expect(out1[0]).toBe(1.0);
    expect(out2[0]).toBe(10.0);
    expect(transport.getStats().available).toBe(0);

    transport.dispose();
  });

  it('instantiates MessagePassingTransport when fallback is forced or isolation is absent', () => {
    const transport = DataPlaneTransport.create(1024, { forceFallback: true });
    expect(transport.mode).toBe('MESSAGE_PASSING');
    expect(transport.capacity).toBe(1024);

    const ch1 = new Float32Array([5.5, 6.5, 7.5]);
    const ch2 = new Float32Array([55.0, 65.0, 75.0]);
    transport.writeBatch(ch1, ch2, 3);

    const out1 = new Float32Array(3);
    const out2 = new Float32Array(3);
    const read = transport.readAvailable(out1, out2, out1.length);

    expect(read).toBe(3);
    expect(out1[0]).toBe(5.5);
    expect(out2[0]).toBe(55.0);

    transport.dispose();
  });

  it('provides identical peekLatest behavior across both transport modes', () => {
    const sabTransport = DataPlaneTransport.create(512);
    const msgTransport = DataPlaneTransport.create(512, { forceFallback: true });

    const input1 = new Float32Array(20);
    const input2 = new Float32Array(20);
    for (let i = 0; i < 20; i++) {
      input1[i] = i;
      input2[i] = i * 10;
    }

    sabTransport.writeBatch(input1, input2, 20);
    msgTransport.writeBatch(input1, input2, 20);

    const peek1SAB = new Float32Array(5);
    const peek2SAB = new Float32Array(5);
    const peek1Msg = new Float32Array(5);
    const peek2Msg = new Float32Array(5);

    sabTransport.peekLatest(peek1SAB, peek2SAB, 5);
    msgTransport.peekLatest(peek1Msg, peek2Msg, 5);

    // Both should yield the last 5 items (15..19 and 150..190)
    for (let i = 0; i < 5; i++) {
      expect(peek1SAB[i]).toBe(peek1Msg[i]);
      expect(peek2SAB[i]).toBe(peek2Msg[i]);
      expect(peek1SAB[i]).toBe(15 + i);
      expect(peek2SAB[i]).toBe((15 + i) * 10);
    }

    expect(sabTransport.getStats().available).toBe(20);
    expect(msgTransport.getStats().available).toBe(20);

    sabTransport.dispose();
    msgTransport.dispose();
  });
});
