# ADR-006: Bounded Circular Sample Ring Buffer with Power-of-Two Indexing and Explicit Policies

- **Status**: ACCEPTED
- **Date**: 2026-09-06
- **Wave**: Wave 9 — Ring Buffer
- **Deciders**: Digital Twin Core Architecture Team

---

## 1. Context & Problem Statement

High-frequency oscilloscope acquisition pipelines (1–5 MSPS) stream millions of samples per second between worker threads, trigger detection, and display render targets. Storing and buffering these sample streams in unbounded arrays or recreating `Float32Array` instances every frame violates **GEMINI.md Rule 2 (Never allocate new samples every frame)**, **Rule 12 (Zero dynamic allocation in high-frequency loops)**, and **Rule 18 (Evidence-based performance)**.

To support continuous streaming, trigger lookback, decimation, and display buffering, the Digital Twin requires a dedicated, high-performance circular storage mechanism satisfying:
1. **Zero heap allocation** during continuous write and read operations.
2. **Explicit overflow and underflow policies** (`OVERWRITE`, `DROP`, `ERROR` and `PARTIAL`, `ZERO_FILL`, `ERROR`).
3. **Branchless bitwise index calculations** without costly modulo divisions (`%`).
4. **Non-destructive random access** for trigger detection (`peek`, `readLatest`, `readWindow`).
5. **Soak-tested stability** under long-running bursts (> 10,000,000 samples) without sequence corruption or memory creep.

---

## 2. Options Considered

### Option A: Standard Array with `.push()` and `.shift()` / `.slice()`
- Use JavaScript arrays or small chunks.
- *Pros*: Simple idiomatic JS.
- *Cons*: Reallocates heap continuously; `Array.prototype.shift()` has $O(N)$ complexity; causes severe GC pauses (> 20 ms) leading to dropped frames.

### Option B: Arbitrary-Capacity Float32Array with Modulo Arithmetic
- Allocate a fixed-size `Float32Array` of arbitrary user-defined capacity $C$; use `idx % C` for addressing.
- *Pros*: Supports arbitrary capacity numbers (e.g. 50,000).
- *Cons*: Integer division and modulo `%` in V8 prevents loop vectorization and costs 5–10 CPU cycles per sample; slower than bitwise masking.

### Option C: Power-of-Two Capacity with Bitwise Masking & Monotonic Pointers (Chosen)
- Round capacity upward to the next power of two ($C = 2^K$); compute indices via branchless bitwise AND: `idx & (C - 1)`.
- Use 64-bit monotonic cumulative write/read counters.
- *Pros*:
  - Peak throughput exceeding **400–600 Mops/sec** in V8.
  - Branchless index wrapping.
  - Zero heap allocation during write/read.
  - Seamless support for overflow policies (`OVERWRITE`, `DROP`, `ERROR`) and underflow policies (`PARTIAL`, `ZERO_FILL`, `ERROR`).
  - Monotonic counters prevent wrap ambiguity and support global sample indexing for up to 57,000 years of continuous 5 MSPS operation.
- *Cons*:
  - Buffer sizes are powers of two, requiring slightly more memory padding (e.g., requested 50,000 rounds to 65,536 samples, which is 256 KB of RAM). This is completely negligible on modern systems.

---

## 3. Decision

We adopt **Option C**:
1. **`BoundedRingBuffer` Implementation**:
   - Underlying buffer: single pre-allocated `Float32Array`.
   - Power-of-two capacity: rounded using `1 << (32 - Math.clz32(capacity - 1))`.
   - Branchless wrap: `slot = index & mask`.
2. **Configurable Policies**:
   - Overflow: `OVERWRITE` (default), `DROP`, `ERROR`.
   - Underflow: `PARTIAL` (default), `ZERO_FILL`, `ERROR`.
3. **Non-Destructive Inspections**:
   - `peek(offsetFromRead)`: inspect single samples without advancing read pointer.
   - `readLatest(destination, count)`: retrieve the most recent $N$ samples for trigger search and display decimation.
   - `readWindow(destination, globalStartIndex, count)`: sample window retrieval by absolute acquisition index.
4. **Backward Compatibility**:
   - `SampleRingBuffer` extends `BoundedRingBuffer` with legacy signatures (`size`, `push`, `getChronological`) to preserve existing Wave 7 and Wave 8 code.

---

## 4. Consequences & Trade-offs

### Positive
- **Extreme Throughput**: Benchmarked at **> 430 Mops/sec** (> 300 MSPS sustained throughput).
- **Absolute Zero Heap Allocation**: 0 bytes allocated during write, read, peek, readLatest, readWindow operations.
- **Stable Long-Running Soak**: Verified through 10,000,000 samples with randomized burst sizes without sequence drift ($V_k == V_{k-1} + 1$).
- **Trigger & Display Friendly**: Allows trigger scanners to inspect backwards without advancing reader pointers needed by DSP pipelines.

### Negative / Trade-offs
- Internal capacity is padded to powers of two (e.g., 65,536 vs 50,000 samples). Memory impact is negligible (256 KB vs 200 KB per channel).

---

## 5. Benchmark Evidence

- **Platform**: Chrome V8 / Node.js 22 (Windows x64)
- **Zero-Allocation Benchmark**: 1,000,000 samples written & read in **2.32 ms** (**431.03 Mops/sec**), 0 heap allocations.
- **10M Sample Soak Test**: 10,000,000 samples streamed in randomized bursts in **32.25 ms** (**310.11 MSPS**).
- **All 17 ring buffer tests & 148 global tests passing**.
