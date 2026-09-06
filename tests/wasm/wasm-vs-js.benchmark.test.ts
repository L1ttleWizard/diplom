import { describe, it, expect, beforeAll } from 'vitest';
import { WasmDspEngine } from '../../src/wasm/WasmDspEngine';
import { JsDspEngine } from '../../src/wasm/JsDspEngine';

describe('WebAssembly vs. JavaScript DSP Performance Benchmark (Wave 11)', () => {
  let wasmEngine: WasmDspEngine;
  let jsEngine: JsDspEngine;

  beforeAll(async () => {
    wasmEngine = new WasmDspEngine();
    await wasmEngine.init();
    jsEngine = new JsDspEngine();
  });

  it('benchmarks computeStats: WASM vs Pure JS across 100,000 samples', () => {
    const sampleCount = 100_000;
    const samples = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      samples[i] = Math.sin(i * 0.01) * 2.5 + Math.cos(i * 0.05) * 1.2;
    }

    const iterations = 200;

    // Warm up
    for (let i = 0; i < 20; i++) {
      jsEngine.computeStats(samples);
      wasmEngine.computeStats(samples);
    }

    // Benchmark Pure JS
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.computeStats(samples);
    }
    const jsTotal = performance.now() - jsStart;
    const jsPerCallMs = jsTotal / iterations;
    const jsThroughputMsps = (sampleCount * iterations) / (jsTotal * 1000);

    // Benchmark WASM (including Float32Array memory copy)
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.computeStats(samples);
    }
    const wasmTotal = performance.now() - wasmStart;
    const wasmPerCallMs = wasmTotal / iterations;
    const wasmThroughputMsps = (sampleCount * iterations) / (wasmTotal * 1000);

    const speedup = jsPerCallMs / wasmPerCallMs;

    console.log('\n--- BENCHMARK: computeStats (100k samples, 200 iterations) ---');
    console.log(`Pure JS: ${jsPerCallMs.toFixed(3)} ms/call | Throughput: ${jsThroughputMsps.toFixed(1)} MSPS`);
    console.log(`WASM:    ${wasmPerCallMs.toFixed(3)} ms/call | Throughput: ${wasmThroughputMsps.toFixed(1)} MSPS`);
    console.log(`Speedup (WASM vs JS): ${speedup.toFixed(2)}x`);

    expect(wasmPerCallMs).toBeLessThan(10.0); // Strict sanity threshold
    expect(speedup).toBeGreaterThan(0.5); // WASM must be competitive
  });

  it('benchmarks peakDetectDecimate: WASM vs Pure JS (100,000 samples -> 1,000 buckets)', () => {
    const inCount = 100_000;
    const bucketCount = 1_000;
    const samples = new Float32Array(inCount);
    for (let i = 0; i < inCount; i++) {
      samples[i] = Math.sin(i * 0.03) * 4.0;
    }

    const outMin = new Float32Array(bucketCount);
    const outMax = new Float32Array(bucketCount);
    const iterations = 200;

    // Warm up
    for (let i = 0; i < 20; i++) {
      jsEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
      wasmEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
    }

    // Benchmark Pure JS
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
    }
    const jsTotal = performance.now() - jsStart;
    const jsPerCallMs = jsTotal / iterations;
    const jsThroughputMsps = (inCount * iterations) / (jsTotal * 1000);

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
    }
    const wasmTotal = performance.now() - wasmStart;
    const wasmPerCallMs = wasmTotal / iterations;
    const wasmThroughputMsps = (inCount * iterations) / (wasmTotal * 1000);

    const speedup = jsPerCallMs / wasmPerCallMs;

    console.log('\n--- BENCHMARK: peakDetectDecimate (100k -> 1k buckets, 200 iterations) ---');
    console.log(`Pure JS: ${jsPerCallMs.toFixed(3)} ms/call | Throughput: ${jsThroughputMsps.toFixed(1)} MSPS`);
    console.log(`WASM:    ${wasmPerCallMs.toFixed(3)} ms/call | Throughput: ${wasmThroughputMsps.toFixed(1)} MSPS`);
    console.log(`Speedup (WASM vs JS): ${speedup.toFixed(2)}x`);

    expect(wasmPerCallMs).toBeLessThan(10.0);
    expect(speedup).toBeGreaterThan(0.5);
  });

  it('benchmarks peakDetectDecimate at 5 MSPS scale (500,000 samples -> 2,000 buckets)', () => {
    const inCount = 500_000;
    const bucketCount = 2_000;
    const samples = new Float32Array(inCount);
    for (let i = 0; i < inCount; i++) {
      samples[i] = Math.sin(i * 0.005) * 3.0;
    }

    const outMin = new Float32Array(bucketCount);
    const outMax = new Float32Array(bucketCount);
    const iterations = 50;

    // Warm up
    for (let i = 0; i < 5; i++) {
      jsEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
      wasmEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
    }

    // Benchmark Pure JS
    const jsStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      jsEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
    }
    const jsTotal = performance.now() - jsStart;
    const jsPerCallMs = jsTotal / iterations;
    const jsThroughputMsps = (inCount * iterations) / (jsTotal * 1000);

    // Benchmark WASM
    const wasmStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      wasmEngine.peakDetectDecimate(samples, bucketCount, outMin, outMax);
    }
    const wasmTotal = performance.now() - wasmStart;
    const wasmPerCallMs = wasmTotal / iterations;
    const wasmThroughputMsps = (inCount * iterations) / (wasmTotal * 1000);

    const speedup = jsPerCallMs / wasmPerCallMs;

    console.log('\n--- BENCHMARK: 5 MSPS Scale Decimation (500k -> 2k buckets, 50 iterations) ---');
    console.log(`Pure JS: ${jsPerCallMs.toFixed(3)} ms/call | Throughput: ${jsThroughputMsps.toFixed(1)} MSPS`);
    console.log(`WASM:    ${wasmPerCallMs.toFixed(3)} ms/call | Throughput: ${wasmThroughputMsps.toFixed(1)} MSPS`);
    console.log(`Speedup (WASM vs JS): ${speedup.toFixed(2)}x`);

    expect(wasmPerCallMs).toBeLessThan(20.0);
  });
});
