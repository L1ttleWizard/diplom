import { describe, it, expect } from 'vitest';
import { PerformanceMonitor } from '../../src/rendering/diagnostics/PerformanceMonitor';

describe('PerformanceMonitor', () => {
  it('records frame times and computes p50, p95, p99 percentiles', () => {
    const monitor = new PerformanceMonitor(100);

    // Feed 100 frame times ranging from 10ms to 20ms
    for (let i = 1; i <= 100; i++) {
      monitor.recordFrame(10 + i * 0.1); // 10.1 to 20.0
    }

    const { p50, p95, p99 } = monitor.getPercentiles();
    expect(p50).toBeCloseTo(15.1, 1);
    expect(p95).toBeCloseTo(19.6, 1);
    expect(p99).toBeCloseTo(20.0, 1);
  });

  it('calculates average FPS over 1 second window', () => {
    const monitor = new PerformanceMonitor(120);

    // 60 frames of 16.67ms = ~1000ms
    for (let i = 0; i < 60; i++) {
      monitor.recordFrame(16.67);
    }

    const metrics = monitor.getMetrics();
    expect(metrics.fps).toBe(60);
    expect(metrics.frameTimeMs).toBe(16.67);
  });

  it('resets metrics cleanly', () => {
    const monitor = new PerformanceMonitor();
    monitor.recordFrame(33.3);
    monitor.reset();

    const metrics = monitor.getMetrics();
    expect(metrics.frameTimeP50).toBe(16.67);
  });
});
