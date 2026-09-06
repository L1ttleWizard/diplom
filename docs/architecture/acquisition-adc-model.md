# Architecture: Acquisition & ADC Physical Model

## 1. Overview & Place in Data Plane

In a physical digital storage oscilloscope (DSO), high-frequency signals do not pass directly from input probes to the display. They traverse a multi-stage electronic hardware chain:

$$\text{Signal Source} \longrightarrow \text{Analog Front End (AFE)} \longrightarrow \text{Analog-to-Digital Converter (ADC)} \longrightarrow \text{Circular Ring Buffer}$$

In accordance with **GEMINI.md Rule 1, Rule 2, & Rule 4**, the acquisition model:
1. Runs entirely in the **Data Plane**, separated from the Control Plane (UI / React) and Presentation Layer (Three.js / WebGL2).
2. Uses **zero per-sample or per-batch heap memory allocations** (`Float32Array` buffer reuse).
3. **Never connects raw ADC samples directly to the GPU**. Raw and quantized data are held in circular sample buffers (`SampleRingBuffer`) ready for downstream trigger detection, DSP, and decimation.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   DATA PLANE                                           │
│                                                                                        │
│   ┌───────────────────┐                                                                │
│   │   Signal Source   │  V_in(t)                                                       │
│   └─────────┬─────────┘                                                                │
│             ▼                                                                          │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                        ANALOG FRONT END (AFE)                                  │   │
│   │  ┌──────────────┐   ┌─────────────┐   ┌───────────────┐   ┌─────────────────┐  │   │
│   │  │   Coupling   │──▶│    Probe    │──▶│ Gain & Offset │──▶│ Bandwidth Limit │  │   │
│   │  │ (DC/AC/GND)  │   │  (1X / 10X) │   │ (Av = 1/Vdiv) │   │  (1st-order RC) │  │   │
│   │  └──────────────┘   └─────────────┘   └───────┬───────┘   └────────┬────────┘  │   │
│   │                                               │                    │           │   │
│   │                                               ▼                    ▼           │   │
│   │                                       ┌───────────────┐   ┌─────────────────┐  │   │
│   │                                       │ Thermal Noise │──▶│  Rail Saturation│  │   │
│   │                                       │ (Box-Muller)  │   │ (Vmin..Vmax)    │  │   │
│   │                                       └───────────────┘   └────────┬────────┘  │   │
│   └────────────────────────────────────────────────────────────────────┼───────────┘   │
│                                                                        │ V_analog      │
│                                                                        ▼               │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                       ANALOG-TO-DIGITAL CONVERTER (ADC)                        │   │
│   │  • Sample Rate: 1 MSPS / 2 MSPS / 5 MSPS (clock-driven)                        │   │
│   │  • Full-Scale Range: [-V_FS, +V_FS]                                            │   │
│   │  • Resolution: N in [8, 16] bits                                               │   │
│   │  • Uniform Quantization: q = 2*V_FS / 2^N                                      │   │
│   │  • Saturation Flags: clippedLow, clippedHigh                                   │   │
│   └────────────────────────────────────┬───────────────────────────────────────────┘   │
│                                        │ Quantized Float32Array & Digital Codes        │
│                                        ▼                                               │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │                        SAMPLE RING BUFFER (DATA PLANE)                         │   │
│   │  • Preallocated Power-of-2 Memory (1,048,576 samples)                          │   │
│   │  • Zero GC allocation, branchless bitwise masking                              │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Physical & Mathematical Model of the Analog Front End (AFE)

The `AnalogFrontEnd` class models the analog conditioning circuitry of each oscilloscope channel.

### 2.1 Input Coupling Switch
The input coupling selector controls how the input signal enters the preamplifier:
- **`GND`**: Disconnects the input signal and grounds the amplifier input:
  $$V_{\text{coupled}}(t) = 0.0\text{ V}$$
- **`DC`**: Direct galvanic connection with zero attenuation of low frequencies:
  $$V_{\text{coupled}}(t) = V_{\text{in}}(t)$$
- **`AC`**: Inserts a series DC-blocking capacitor, forming a single-pole high-pass filter:
  $$H_{\text{AC}}(s) = \frac{s}{s + \omega_c}, \quad \omega_c = 2\pi f_c \quad (f_c = 10.0\text{ Hz})$$
  Discretized using backward difference / bilinear mapping with time step $\Delta t = 1/f_s$:
  $$\beta = \frac{1}{1 + 2\pi f_c \Delta t}$$
  $$y[n] = \beta \cdot (y[n-1] + x[n] - x[n-1])$$
  This blocks any DC offset and allows only time-varying AC fluctuations to pass.

### 2.2 Probe Attenuation
Oscilloscope probes typically include a passive $9\text{ M}\Omega$ attenuator resistor in series with the oscilloscope's $1\text{ M}\Omega$ input impedance:
$$K_{\text{probe}} = \begin{cases} 1.0, & \text{mode } 1\text{X} \\ 0.1, & \text{mode } 10\text{X} \end{cases}$$
$$V_{\text{probe}} = V_{\text{coupled}} \cdot K_{\text{probe}}$$

### 2.3 Offset Subtraction & Vertical Gain
The oscilloscope user adjusts two primary vertical controls:
1. **Volts per Division** ($\text{voltsPerDiv} \in [1\text{ mV}, 10\text{ V}]$).
2. **Channel Offset** ($V_{\text{offset}} \in \mathbb{R}$).

In an analog oscilloscope, the preamplifier injects an adjustable reference offset and applies a variable gain $A_v$ to scale the signal onto the screen graticule:
$$A_v = \frac{1.0}{\text{voltsPerDiv}}$$
$$V_{\text{scaled}} = (V_{\text{probe}} - V_{\text{offset}}) \cdot A_v$$

For example, with $V/\text{div} = 0.5\text{ V}$, a $1\text{ V}$ input produces $2\text{ divisions}$ of deflection ($2.0\text{ V}$ internal signal).

### 2.4 Bandwidth Limiting (Preamplifier Low-Pass Filter)
Physical preamplifiers have finite frequency response. DSO front-ends feature a switchable analog low-pass filter (typically $20\text{ MHz}$) to eliminate out-of-band high-frequency noise and aliasing:
$$H_{\text{LP}}(s) = \frac{1}{1 + s/\omega_{\text{cut}}}, \quad \omega_{\text{cut}} = 2\pi f_{\text{cut}}$$

The continuous first-order differential equation:
$$\tau \frac{dy}{dt} + y(t) = x(t), \quad \tau = \frac{1}{2\pi f_{\text{cut}}}$$

Discretized using exponential Euler / impulse invariant mapping:
$$\alpha = \frac{\Delta t}{\tau + \Delta t} = \frac{2\pi f_{\text{cut}} \Delta t}{1 + 2\pi f_{\text{cut}} \Delta t}$$
$$y[n] = y[n-1] + \alpha \cdot (x[n] - y[n-1])$$

At $f = f_{\text{cut}}$, the magnitude response attenuates by exactly $-3.01\text{ dB}$:
$$|H(j 2\pi f_{\text{cut}})| = \frac{1}{\sqrt{1 + 1^2}} = \frac{1}{\sqrt{2}} \approx 0.7071$$

### 2.5 Analog Thermal Noise
Thermal Johnson-Nyquist noise generated by front-end input resistors and active transistors is modeled as additive white Gaussian noise (AWGN):
$$V_{\text{noise}} \sim \mathcal{N}(0, \sigma^2), \quad \sigma = \text{noiseRms}$$

Generated deterministically via the Box-Muller transform using the seeded Mulberry32 PRNG:
$$z = \sigma \cdot \sqrt{-2 \ln u_1} \cdot \cos(2\pi u_2), \quad u_1, u_2 \sim U(0, 1)$$

### 2.6 Analog Rail Saturation (Clipping)
Analog operational amplifiers are constrained by their physical power supply voltages:
$$V_{\text{clipped}} = \text{clamp}(V, V_{\text{min\_rail}}, V_{\text{max\_rail}})$$
Default linear operational range is $[-5.0\text{ V}, +5.0\text{ V}]$.

---

## 3. Physical & Mathematical Model of the ADC

The `ADCModel` represents a high-speed flash or pipelined Analog-to-Digital Converter.

### 3.1 Quantizer Parameters & Dynamic Range
- **Full-Scale Input Range**: $[-V_{\text{FS}}, +V_{\text{FS}}]$ (default $\pm 4.0\text{ V}$).
- **Total Span**: $\Delta V = 2 V_{\text{FS}} = 8.0\text{ V}$.
- **Resolution**: $N \in [8, 16]$ bits (default $N=8$, yielding $M = 2^8 = 256$ discrete levels).
- **Least Significant Bit (LSB) Step Size ($q$)**:
  $$q = \frac{2 V_{\text{FS}}}{2^N}$$

| Resolution ($N$) | Total Levels ($M$) | LSB Voltage ($q$) at $V_{\text{FS}} = 4.0\text{ V}$ | Theoretical SQNR ($6.02N + 1.76\text{ dB}$) |
| :---: | :---: | :---: | :---: |
| **8-bit** | 256 | $31.250\text{ mV}$ ($0.03125\text{ V}$) | **49.92 dB** |
| **10-bit** | 1024 | $7.8125\text{ mV}$ ($0.0078125\text{ V}$) | **61.96 dB** |
| **12-bit** | 4096 | $1.9531\text{ mV}$ ($0.0019531\text{ V}$) | **74.00 dB** |
| **14-bit** | 16384 | $0.4883\text{ mV}$ ($0.0004883\text{ V}$) | **86.04 dB** |
| **16-bit** | 65536 | $0.1221\text{ mV}$ ($0.0001221\text{ V}$) | **98.08 dB** |

### 3.2 Uniform Mid-Tread Quantization Function
For any continuous analog input voltage $V \in \mathbb{R}$:
1. **Raw Code Index Calculation**:
   $$k_{\text{raw}} = \left\lfloor \frac{V - (-V_{\text{FS}})}{q} \right\rfloor$$
2. **Saturation Clamping**:
   $$k = \begin{cases} 0, & k_{\text{raw}} \le 0 \quad (\text{clippedLow}) \\ 2^N - 1, & k_{\text{raw}} \ge 2^N - 1 \quad (\text{clippedHigh}) \\ k_{\text{raw}}, & 0 < k_{\text{raw}} < 2^N - 1 \end{cases}$$
3. **Mid-Interval Voltage Reconstruction**:
   $$V_q = -V_{\text{FS}} + (k + 0.5) \cdot q$$

### 3.3 Quantization Error & Noise Statistics
Within the unclipped region, quantization error $e_q = V - V_q$ is bounded strictly:
$$|e_q| \le \frac{q}{2}$$

Assuming uniform error distribution over $\left[-\frac{q}{2}, +\frac{q}{2}\right]$:
- Expected error: $\mathbb{E}[e_q] = 0$.
- Quantization noise variance: $\sigma_q^2 = \frac{q^2}{12}$.
- Signal-to-Quantization-Noise Ratio (SQNR) for full-scale sinusoid $A = V_{\text{FS}}$:
  $$P_{\text{signal}} = \frac{V_{\text{FS}}^2}{2}, \quad P_{\text{noise}} = \frac{q^2}{12} = \frac{(2 V_{\text{FS}} / 2^N)^2}{12} = \frac{V_{\text{FS}}^2}{3 \cdot 2^{2N}}$$
  $$\text{SQNR} = \frac{P_{\text{signal}}}{P_{\text{noise}}} = \frac{3}{2} \cdot 2^{2N}$$
  $$\text{SQNR}_{\text{dB}} = 10 \log_{10}\left(\frac{3}{2}\right) + 20 N \log_{10}(2) \approx 1.76 + 6.02 N\text{ dB}$$

---

## 4. Multi-Rate Clocking Support

The acquisition pipeline supports three standardized **Logical Sample Rates**:
- **1 MSPS** ($f_s = 1\,000\,000\text{ SPS}, \Delta t = 1.0\text{ }\mu\text{s}$)
- **2 MSPS** ($f_s = 2\,000\,000\text{ SPS}, \Delta t = 0.5\text{ }\mu\text{s}$)
- **5 MSPS** ($f_s = 5\,000\,000\text{ SPS}, \Delta t = 0.2\text{ }\mu\text{s}$)

The `SimulationClock` orchestrates sampling intervals across both channels simultaneously, guaranteeing zero relative phase jitter between CH1 and CH2.

---

## 5. Dual Channel Independence & Zero Crosstalk

`AcquisitionChannel` encapsulates:
- Dedicated `AnalogFrontEnd` (isolated coupling, gain, offset, and filters).
- Dedicated `ADCModel` (isolated quantizer and clipping counters).
- Independent signal source binding.

```typescript
const engine = new AcquisitionEngine({ sampleRate: 1_000_000 });
engine.ch1.setSignalSource(genSine1kHz);
engine.ch1.afe.setVoltsPerDiv(1.0);

engine.ch2.setSignalSource(genSquare10kHz);
engine.ch2.afe.setVoltsPerDiv(2.0);

// Synchronous acquisition with zero mutual interference
engine.acquire(1000);
```

---

## 6. Circular Memory Ring Buffer (`SampleRingBuffer`)

High-frequency samples (1–5 MSPS) cannot be stored in dynamically growing JavaScript arrays without causing crippling garbage collection pauses.

The `SampleRingBuffer` class implements:
1. **Power-of-Two Allocation**: Capacity $C = 2^K$ (default $C = 1\,048\,576 = 1\text{ MSamples}$).
2. **Branchless Ring Indexing**: Fast bitwise modulo $i \ \& \ (C - 1)$.
3. **Contiguous Window Reads**:
   - `readLatest(destination, count)`: Extracts latest $N$ samples in chronological order without reallocations.
   - `readWindow(destination, globalStartIndex, count)`: Extracts arbitrary trigger-aligned frames for display decimation.
4. **Zero GC Allocations**: All operations operate in-place into caller-supplied `Float32Array` buffers.

---

## 7. Performance Benchmarks

- **Dual-Channel Throughput**: **14.82 MSPS** (67.46 ms for 1,000,000 dual-channel samples through AFE + ADC + RingBuffer).
- **Single-Channel Throughput**: **> 30 MSPS**.
- **Memory Allocation Rate**: **0 bytes/frame** in steady-state loop.
- **Unit Test Coverage**: 20 dedicated reference tests (119 total across repository), 100% PASS.
