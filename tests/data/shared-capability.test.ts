import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SharedMemoryCapability } from '../../src/data/shared/SharedMemoryCapability';

describe('SharedMemoryCapability (Wave 10)', () => {
  beforeEach(() => {
    SharedMemoryCapability.resetCache();
  });

  afterEach(() => {
    SharedMemoryCapability.resetCache();
  });

  it('detects SharedArrayBuffer and Atomics support in current test environment', () => {
    const report = SharedMemoryCapability.check();

    expect(report.hasAtomics).toBe(true);
    expect(report.canAllocateSAB).toBe(true);
    // In Node.js test environment, SAB is available and permitted
    expect(report.isSupported).toBe(true);
    expect(report.reason).toContain('fully supported');
  });

  it('caches capability report after initial execution', () => {
    const r1 = SharedMemoryCapability.check();
    const r2 = SharedMemoryCapability.check();
    expect(r1).toBe(r2);

    const r3 = SharedMemoryCapability.check(true); // force refresh
    expect(r3).not.toBe(r1);
    expect(r3.isSupported).toBe(r1.isSupported);
  });

  it('isSupported helper returns boolean consistent with check()', () => {
    expect(SharedMemoryCapability.isSupported()).toBe(SharedMemoryCapability.check().isSupported);
  });

  it('detects disabled cross-origin isolation when simulated', () => {
    // Temporarily mock crossOriginIsolated as false
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crossOriginIsolated');
    Object.defineProperty(globalThis, 'crossOriginIsolated', {
      value: false,
      configurable: true,
      writable: true
    });

    SharedMemoryCapability.resetCache();
    const report = SharedMemoryCapability.check();

    expect(report.isSupported).toBe(false);
    expect(report.crossOriginIsolated).toBe(false);
    expect(report.reason).toContain('Cross-Origin-Opener-Policy');

    // Restore original property
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'crossOriginIsolated', originalDescriptor);
    } else {
      delete (globalThis as unknown as { crossOriginIsolated?: unknown }).crossOriginIsolated;
    }
  });
});
