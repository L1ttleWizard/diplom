# IMPLEMENTATION_PLAN.md

# Browser Digital Twin
## Wave-Based Implementation Plan

---

# 0. Mission

Создать production-grade браузерный цифровой двойник лабораторного измерительного стенда с интерактивной 3D-моделью цифрового осциллографа.

Система должна объединять:

- 3D laboratory environment;
- 3D oscilloscope;
- интерактивные органы управления;
- виртуальный signal source;
- virtual acquisition;
- цифровую обработку сигналов;
- trigger;
- measurements;
- waveform rendering;
- FFT;
- circuit simulation;
- recording/playback;
- adaptive rendering;
- работу на средних и слабых системах;
- воспроизводимые performance benchmarks;
- документацию архитектуры.

Основной технический критерий:

```text
5 MSPS logical signal processing
+
interactive 3D scene
+
target ~60 FPS
+
controlled degradation on weaker hardware
```

Важно:

```text
sample rate != render rate
```

---

# 1. Global Agent Execution Protocol

Агент выполняет каждую Wave по одинаковому циклу:

```text
PRE-CHECK
    ↓
ARCHITECTURE REVIEW
    ↓
IMPLEMENT
    ↓
UNIT TEST
    ↓
INTEGRATION TEST
    ↓
BENCHMARK
    ↓
REGRESSION CHECK
    ↓
DOCUMENTATION UPDATE
    ↓
ADR UPDATE
    ↓
ACCEPTANCE GATE
    ↓
MARK WAVE COMPLETE
```

Следующая Wave запрещена, если текущая не прошла acceptance gate.

Исключение:

если Wave блокирована инфраструктурной проблемой, агент обязан:

1. зафиксировать blocker;
2. определить его влияние;
3. создать workaround только при сохранении архитектурной целостности;
4. записать технический долг.

---

# 2. Documentation Synchronization Protocol

После каждой Wave обязательно обновить:

```text
docs/architecture/
docs/requirements/
docs/testing/
docs/decisions/
docs/progress/
```

Минимум:

```text
docs/progress/waves.md
docs/progress/changelog.md
docs/testing/benchmark-history.md
```

Если архитектура изменилась:

```text
docs/decisions/ADR-XXX-*.md
```

Если изменение меняет существующее описание — старое описание исправляется.

Не допускается:

```text
code != documentation
```

Документация является частью implementation.

---

# 3. Standard Wave Report

После каждой Wave агент должен добавить:

```md
# Wave N

Status: DONE

## Goal

...

## Implemented

...

## Files Changed

...

## Tests

...

## Benchmark

...

## Architectural Decisions

...

## Risks

...

## Known Limitations

...

## Documentation Updated

...

## Acceptance Gate

PASS

## Next Wave

...
```

---

# WAVE 0
# Repository Forensics and Baseline

## Goal

Понять существующую систему до изменения архитектуры.

## Preconditions

Нет.

## Tasks

### 0.1 Repository inventory

Исследовать:

```text
package.json
lockfile
vite/webpack config
tsconfig
src
public
assets
models
workers
wasm
tests
docs
CI/CD
```

### 0.2 Runtime inventory

Найти:

- application entrypoint;
- React tree;
- state management;
- rendering initialization;
- Three.js scenes;
- existing animation loop;
- signal generators;
- waveform components;
- DSP;
- workers;
- storage;
- API calls;
- configuration.

### 0.3 Dependency inventory

Составить таблицу:

```text
dependency
version
purpose
runtime cost
criticality
replaceable?
```

### 0.4 Anti-pattern scan

Искать:

```text
large allocations
render-loop allocations
React state with high-frequency values
synchronous DSP
tight loops on main thread
duplicate state
global mutable state
Three.js-dependent domain logic
DOM waveform rendering
unbounded buffers
```

### 0.5 Current performance baseline

Измерить существующий:

```text
FPS
frame time
memory
main-thread time
draw calls
triangles
```

## Required outputs

```text
docs/architecture/current-state.md
docs/architecture/current-runtime.md
docs/technical-debt.md
docs/progress/waves.md
```

## Tests

Build:

```text
development
production
```

must work.

## Acceptance Gate

PASS only if:

- существующий runtime описан;
- основные зависимости известны;
- текущий rendering path известен;
- current signal path известен;
- performance baseline существует;
- known technical debt documented.

---

# WAVE 1
# Domain Architecture and Boundaries

## Goal

Отделить application/domain model от React и Three.js.

## Preconditions

Wave 0 complete.

## Tasks

Создать:

```text
src/domain/
src/application/
src/rendering/
src/data/
src/workers/
src/wasm/
src/storage/
```

### 1.1 Domain entities

Создать:

```text
Oscilloscope
Channel
Trigger
Acquisition
Measurement
SignalSource
Circuit
Experiment
```

### 1.2 Commands

Определить:

```text
RUN
STOP
SET_TIME_DIV
SET_VOLT_DIV
SET_TRIGGER_LEVEL
SET_TRIGGER_MODE
ENABLE_CHANNEL
DISABLE_CHANNEL
```

### 1.3 Events

Определить:

```text
ACQUISITION_STARTED
ACQUISITION_STOPPED
TRIGGERED
MEASUREMENT_UPDATED
DEVICE_ERROR
```

### 1.4 State model

Создать строгие TypeScript types.

### 1.5 State machine

Определить состояния:

```text
IDLE
ARMED
RUNNING
WAITING_TRIGGER
CAPTURED
STOPPED
ERROR
```

## Tests

Unit tests для:

- state transitions;
- illegal transitions;
- command validation;
- domain invariants.

## Benchmark

Нет производительного gate.

## Documentation

Создать:

```text
docs/architecture/domain-model.md
docs/architecture/control-plane.md
docs/architecture/runtime-topology.md
```

## Acceptance Gate

PASS if:

```text
Domain tests work without browser
Domain tests work without Three.js
Domain tests work without React
```

---

# WAVE 2
# 3D Scene Foundation

## Goal

Получить устойчивую 3D-сцену.

## Tasks

### 2.1 Renderer bootstrap

Создать:

```text
Renderer
Scene
Camera
Lighting
ResizeController
```

### 2.2 glTF/GLB pipeline

Добавить загрузку 3D assets.

### 2.3 Scene hierarchy

Стандартизировать:

```text
lab
├── oscilloscope
├── generator
├── circuit
└── environment
```

### 2.4 Camera

Реализовать:

- orbit;
- zoom;
- pan;
- reset.

### 2.5 Render loop

```text
requestAnimationFrame
```

без allocation-heavy operations.

## Tests

- model loading;
- missing asset handling;
- camera reset;
- resize.

## Benchmark

Measure:

```text
FPS
frame p50
frame p95
frame p99
draw calls
triangles
memory
```

## Acceptance Gate

Сцена работает на baseline machine без major frame spikes.

---

# WAVE 3
# 3D Oscilloscope Physical Model

## Goal

Превратить 3D-модель в интерактивный физический объект.

## Tasks

Подготовить/проверить:

```text
body
screen
power
run
stop
time/div
volt/div
trigger
CH1
CH2
inputs
```

### 3.1 Node identity

Каждый интерактивный объект должен иметь стабильный ID.

### 3.2 Interaction targets

Создать:

```text
InteractionTarget
```

### 3.3 Raycasting

Pipeline:

```text
pointer
→ raycast
→ target
→ command
→ domain
```

### 3.4 Knobs

Реализовать:

```text
drag
→ virtual rotation
→ domain parameter
```

Не связывать mesh rotation с domain state напрямую.

## Tests

- target detection;
- click;
- drag;
- knob boundaries;
- state synchronization.

## Acceptance Gate

3D interaction меняет domain state, а domain state не зависит от Three.js.

---

# WAVE 4
# Virtual Display Architecture

## Goal

Доказать работу отдельного виртуального дисплея внутри 3D-модели.

## Tasks

Создать:

```text
DisplayEngine
DisplayViewport
DisplayRenderTarget
DisplayLayer
```

### 4.1 Coordinate system

Определить:

```text
display coordinates
screen coordinates
3D screen coordinates
```

### 4.2 Display mesh

Создать отдельную screen surface.

### 4.3 Render target

Создать offscreen render target / framebuffer.

### 4.4 Composition

Pipeline:

```text
Display Engine
      ↓
GPU render target
      ↓
texture
      ↓
3D screen mesh
```

## Render layers

```text
background
grid
waveform
trigger
cursors
UI
```

## Acceptance Gate

Пользователь может вращать камеру вокруг прибора, а display сохраняет физическое положение внутри модели.

Никакого DOM-overlay для самого waveform.

---

# WAVE 5
# Display Grid and Static Layer

## Goal

Создать статическую часть экрана.

## Tasks

Реализовать:

- grid;
- axes;
- center lines;
- divisions;
- edge markers;
- static labels;
- screen border.

### Static/dynamic split

Static:

```text
grid
frame
division marks
static UI
```

Dynamic:

```text
waveform
trigger
cursor
measurements
```

## Optimization

Static layer кэшировать.

Не перерисовывать её каждый frame без необходимости.

## Tests

Проверить:

- resize;
- time/div changes;
- volt/div changes;
- DPR changes.

## Acceptance Gate

Изменение waveform не приводит к rebuild static layer.

---

# WAVE 6
# Deterministic Signal Engine

## Goal

Создать эталонный signal generator.

## Tasks

Реализовать:

```text
sine
square
triangle
saw
pulse
DC
noise
```

Параметры:

```text
frequency
amplitude
offset
phase
dutyCycle
```

## Simulation clock

Создать:

```text
sampleIndex
sampleRate
simulationTime
```

Формула времени определяется sample index.

## Tests

Golden vectors:

```text
1 kHz sine
2 kHz square
DC
known phase
known offset
```

Проверить:

- amplitude;
- period;
- zero crossings;
- offset.

## Acceptance Gate

Одинаковая конфигурация → одинаковый sample stream.

---

# WAVE 7
# Acquisition / ADC Model

## Goal

Отделить analog signal source от digital measurement.

## Pipeline

```text
source
 ↓
analog front-end
 ↓
gain
 ↓
bandwidth
 ↓
noise
 ↓
clipping
 ↓
quantization
 ↓
ADC sample
```

## Tasks

### 7.1 Sample rate

Поддержать:

```text
1 MSPS
2 MSPS
5 MSPS
```

### 7.2 ADC parameters

Определить:

```text
resolution
range
gain
offset
```

### 7.3 Channel model

Создать:

```text
CH1
CH2
```

## Tests

Проверить:

- DC;
- sine;
- clipped sine;
- quantization;
- noise;
- gain.

## Acceptance Gate

Известный analog input преобразуется в предсказуемый digital output.

---

# WAVE 8
# Acquisition Worker

## Goal

Вынести continuous simulation из main thread.

## Architecture

```text
Main Thread
    ↓ command
Simulation Worker
    ↓
Acquisition
```

## Tasks

### 8.1 Worker protocol

Создать versioned messages:

```text
INIT
START
STOP
CONFIGURE
RESET
ERROR
```

### 8.2 Batching

Не отправлять каждый sample отдельным message.

Передавать blocks.

### 8.3 Worker lifecycle

Реализовать:

```text
start
stop
restart
failure recovery
```

## Tests

- startup;
- restart;
- rapid config;
- malformed command;
- worker failure.

## Benchmark

Сравнить:

```text
main-thread simulation
vs
worker simulation
```

Metrics:

```text
main-thread utilization
simulation throughput
latency
```

## Acceptance Gate

Simulation больше не блокирует UI.

---

# WAVE 9
# Ring Buffer

## Goal

Создать bounded continuous stream storage.

## Tasks

Реализовать:

```text
CircularBuffer<T>
```

и отдельную numeric implementation.

### Required operations

```text
write
read
available
freeSpace
reset
wrap
```

### Policies

Определить:

```text
overflow
underflow
overwrite
drop
```

## Tests

Обязательно:

```text
empty
full
one element
wraparound
multiple wraparound
writer faster
reader faster
reset
```

## Benchmark

Измерить:

```text
writes/sec
reads/sec
allocations
memory
```

## Acceptance Gate

10+ минут continuous streaming без corruption и unbounded memory growth.

---

# WAVE 10
# SharedArrayBuffer Data Plane

## Goal

Убрать unnecessary data copies между worker contexts.

## Tasks

### 10.1 Shared memory layout

Определить ABI:

```text
header
control fields
indices
sample storage
metadata
```

### 10.2 Atomics

Определить synchronization semantics.

### 10.3 Capability check

Создать:

```text
SharedMemoryCapability
```

## Fallback

Если SAB недоступен:

```text
message-based buffered transport
```

## Tests

- cross-worker write/read;
- wraparound;
- overflow;
- stale data detection;
- sequence integrity.

## Benchmark

Сравнить:

```text
postMessage
vs
SharedArrayBuffer
```

## Acceptance Gate

Data plane работает без corruption.

Fallback также работает.

---

# WAVE 11
# WASM Toolchain and DSP Core

## Goal

Создать независимое вычислительное ядро.

## Tasks

Выбрать:

```text
Rust → WASM
```

или

```text
C/C++ → WASM
```

Решение зафиксировать ADR после benchmark.

### 11.1 C ABI / WASM API

Не использовать сложный object-oriented ABI через JS.

Предпочтительно:

```text
pointer
length
configuration
result
```

### 11.2 Memory ownership

Документировать.

### 11.3 Build pipeline

Создать reproducible WASM build.

## Reference implementation

Каждый алгоритм сначала существует в JS reference form.

## Acceptance Gate

WASM module:

- buildable;
- loadable;
- callable;
- testable;
- versioned.

---

# WAVE 12
# DSP Reference Algorithms

## Goal

Создать математически корректную reference layer.

## Реализовать

Минимум:

```text
mean
min
max
RMS
peak-to-peak
zero-crossing
frequency estimate
```

Затем:

```text
FIR
IIR
```

## Tests

Использовать golden vectors.

### Например

```text
sine amplitude=1
expected RMS ≈ 1/sqrt(2)
```

Проверять с tolerance.

## Acceptance Gate

Reference implementation считается mathematical oracle для последующей WASM реализации.

---

# WAVE 13
# WASM DSP Implementation

## Goal

Перенести computational kernels в WASM.

## Tasks

Перенести только то, что оправдано benchmark:

```text
filters
RMS
measurement kernels
decimation
FFT preparations
```

## Optimization

Рассмотреть:

```text
contiguous memory
typed arrays
SIMD
batch processing
```

Не использовать premature micro-optimization.

## Tests

```text
JS result
vs
WASM result
```

с tolerance.

## Benchmark

На каждой test machine:

```text
JS
WASM
speedup
input size
```

## Acceptance Gate

Каждый WASM kernel:

```text
correct
benchmarked
documented
```

---

# WAVE 14
# Trigger Engine

## Goal

Получить поведение реального oscilloscope acquisition.

## Modes

```text
AUTO
NORMAL
SINGLE
```

## Conditions

```text
rising edge
falling edge
trigger level
```

## Pipeline

```text
raw samples
 ↓
trigger detector
 ↓
capture window
 ↓
waveform frame
```

## Tasks

Определить:

```text
pre-trigger
post-trigger
trigger position
hysteresis
```

## Tests

Проверить:

- noisy signal;
- constant signal;
- rising edge;
- falling edge;
- no trigger.

## Acceptance Gate

Trigger behavior deterministic and stable.

---

# WAVE 15
# Waveform Decimation

## Goal

Показать MSPS-scale data без отправки millions of vertices в GPU.

## Core Principle

```text
5,000,000 samples
        ↓
display viewport
        ↓
pixel-aware reduction
        ↓
~display-width data
```

## Implement

Минимум:

```text
min/max per bucket
```

### Не использовать только:

```text
sample[i * N]
```

потому что это может потерять narrow peaks.

## Output

Создать:

```text
DisplaySampleBuffer
```

С возможностью:

```text
min
max
```

по каждому display bin.

## Tests

Special signals:

```text
narrow pulse
spike
square wave
high frequency sine
noise
```

Проверить peak preservation.

## Benchmark

Измерить:

```text
input samples/sec
output points
processing time
memory
```

## Acceptance Gate

Visual representation preserves important extrema while reducing sample volume by orders of magnitude.

---

# WAVE 16
# GPU Waveform Renderer

## Goal

Рендерить waveform непосредственно GPU-oriented pipeline.

## Tasks

Создать:

```text
WaveformRenderer
WaveformBuffer
WaveformShader
```

## Requirements

Не создавать geometry заново каждый frame.

Использовать:

```text
persistent GPU buffers
buffer update
draw
```

## Rendering strategy

Рассмотреть:

```text
line segments
instanced segment quads
shader-based thick lines
```

Выбрать после benchmark.

## Tests

Проверить:

- 1 channel;
- 2 channels;
- dense signal;
- sparse signal;
- clipping.

## Benchmark

```text
points
draw calls
frame time
GPU time where available
```

## Acceptance Gate

Waveform rendering не становится bottleneck для 60 FPS target.

---

# WAVE 17
# Display Composite Pipeline

## Goal

Собрать:

```text
grid
+
waveform
+
trigger
+
UI
```

в единый display внутри 3D-модели.

## Pipeline

```text
Static layer
      +
Dynamic waveform
      +
Markers
      +
Text
      ↓
Display Render Target
      ↓
3D screen material
```

## Tasks

Добавить:

- channel labels;
- time/div;
- volts/div;
- trigger status;
- run/stop;
- measurements area.

## Acceptance Gate

Полноценный functional display находится внутри физической 3D-модели.

---

# WAVE 18
# Text and Instrument UI Rendering

## Goal

Создать читаемый instrument-style UI.

## Tasks

Подготовить:

```text
font atlas
glyph rendering
numbers
units
labels
```

или гибридный raster texture approach.

## Optimize

Text updates only when state changes.

## Avoid

```text
DOM text inside 3D screen
```

как основной механизм.

## Tests

Проверить:

- scaling;
- DPR;
- different display resolutions;
- small screen.

## Acceptance Gate

Text readable and does not generate significant per-frame CPU work.

---

# WAVE 19
# Oscilloscope Measurements

## Goal

Добавить automatic measurements.

## Implement

```text
Vmin
Vmax
Vpp
mean
RMS
frequency
period
duty cycle
```

## Architecture

```text
Acquisition
 ↓
Measurement Engine
 ↓
MeasurementSnapshot
 ↓
Display
```

## Update policy

Measurements не обновляются на каждый sample UI-level.

## Tests

Golden vectors:

```text
sine
square
triangle
DC
noise
```

## Acceptance Gate

Measurements match mathematical expectations within defined tolerance.

---

# WAVE 20
# Multi-Channel Processing

## Goal

Поддержать два полноценных канала.

## Tasks

Создать независимые:

```text
acquisition buffers
trigger source
vertical configuration
display buffer
measurement state
```

## Mathematical operations

Добавить:

```text
CH1 + CH2
CH1 - CH2
```

## Tests

- independent frequencies;
- independent amplitudes;
- phase differences;
- disabled channel;
- simultaneous activity.

## Benchmark

Compare:

```text
1 channel
vs
2 channels
```

## Acceptance Gate

2-channel mode не вызывает catastrophic performance regression.

---

# WAVE 21
# Cursors and Manual Measurements

## Goal

Добавить user-driven measurements.

## Implement

### Vertical cursors

```text
time difference
frequency
```

### Horizontal cursors

```text
voltage difference
```

## Interaction

Курсоры могут двигаться мышью.

Но их state остаётся domain-owned.

## Tests

Проверить conversion:

```text
pixel
→ display coordinate
→ time
→ voltage
```

## Acceptance Gate

Cursor measurement mathematically corresponds to displayed scales.

---

# WAVE 22
# Persistence and Visual History

## Goal

Добавить oscilloscope persistence.

## Tasks

Поддержать:

```text
OFF
SHORT
MEDIUM
LONG
```

или эквивалентную configurable history.

## Strategy

Не хранить огромный набор full raw frames без необходимости.

Рассмотреть:

```text
GPU accumulation
compressed history
decayed intensity
```

## Performance

Persistence не должна приводить к unbounded memory growth.

## Acceptance Gate

Waveform history выглядит корректно и остаётся bounded.

---

# WAVE 23
# FFT / Spectrum Engine

## Goal

Добавить frequency-domain visualization.

## Architecture

```text
acquisition
 ↓
FFT worker
 ↓
spectrum buffer
 ↓
display
```

## Tasks

Реализовать:

```text
window function
FFT
magnitude
frequency axis
peak
```

## Optional

```text
dB scale
```

## Tests

Use known tones:

```text
1 kHz
5 kHz
10 kHz
```

## Acceptance Gate

Peak appears at expected frequency within defined bin/tolerance.

---

# WAVE 24
# Adaptive Quality Manager

## Goal

Сделать систему устойчивой на слабых ПК.

## Create

```text
QualityManager
PerformanceMonitor
CapabilityProfile
```

## Tiers

```text
LOW
MEDIUM
HIGH
```

## Parameters

Adaptive controls:

```text
pixel ratio
shadow quality
texture resolution
post-processing
display resolution
waveform complexity
3D quality
```

## IMPORTANT

Не снижать logical acquisition rate первым шагом.

Сначала деградирует visualization.

## Decision policy

```text
measure
→ detect degradation
→ reduce visual load
→ observe
```

## Acceptance Gate

LOW profile сохраняет функциональность прибора при существенно меньшей rendering load.

---

# WAVE 25
# Low-End Performance Lab

## Goal

Получить объективные данные о работе системы на слабых устройствах.

## Prepare test classes

Минимум:

```text
LOW
MEDIUM
HIGH
```

Реальные hardware profiles должны быть зафиксированы.

## Test scenarios

```text
idle
3D only
3D + display
1 MSPS
5 MSPS
2 channels
trigger
measurements
FFT
worst case
```

## Metrics

```text
FPS
frame p50
frame p95
frame p99
long frame count
main-thread time
worker time
memory
CPU
sample throughput
latency
```

## Acceptance Gate

Проект имеет documented performance envelope.

Не утверждать универсальные 60 FPS для "любого ПК".

---

# WAVE 26
# WebGL2 Production Backend

## Goal

Зафиксировать основной совместимый graphics backend.

## Tasks

- production WebGL2 renderer;
- context validation;
- limits inspection;
- texture lifecycle;
- buffer lifecycle;
- context loss strategy.

## Benchmark

Record:

```text
draw calls
triangles
frame time
FPS
memory
```

## Acceptance Gate

WebGL2 является полностью рабочим backend для всего функционального продукта.

---

# WAVE 27
# WebGPU Progressive Backend

## Goal

Добавить WebGPU без зависимости application logic от него.

## Architecture

```text
RendererBackend
├── WebGL2Backend
└── WebGPUBackend
```

## Tasks

Перенести только:

```text
waveform rendering
display composition
potential compute workloads
```

которые дают реальную выгоду.

## Capability detection

Никакого UA sniffing как основного механизма.

## Fallback

```text
WebGPU unavailable
        ↓
WebGL2
```

## Benchmark

Сравнить:

```text
WebGL2
vs
WebGPU
```

## Acceptance Gate

Выбор backend прозрачен для domain/application layer.

---

# WAVE 28
# Circuit Simulation Core

## Goal

Добавить математическую модель исследуемых электрических схем.

## Phase 1

Поддержать:

```text
R
C
L
voltage source
```

## Simulation model

Создать:

```text
Circuit
Node
Component
Solver
SimulationTime
```

## Numerical method

Определить:

```text
Euler / trapezoidal / RK
```

по требованиям конкретной модели.

Решение оформить ADR.

## Tests

Known circuits:

```text
RC charging
RC discharging
RL response
RLC response
```

## Acceptance Gate

Результаты solver согласуются с analytical/reference solutions в определённом tolerance.

---

# WAVE 29
# Circuit + Oscilloscope Integration

## Goal

Получить настоящий digital laboratory flow.

## Pipeline

```text
Generator
 ↓
Circuit
 ↓
Probe Point
 ↓
Oscilloscope Acquisition
 ↓
DSP
 ↓
Display
```

## Tasks

Добавить:

- probe;
- nodes;
- connection model;
- signal routing;
- measurement points.

## Critical rule

Circuit solver не знает о Three.js.

Three.js не знает о numerical solver.

## Acceptance Gate

Пользователь меняет circuit, а oscilloscope показывает соответствующий результат.

---

# WAVE 30
# Laboratory Stand Assembly

## Goal

Объединить компоненты в единый digital twin.

## Scene

```text
Laboratory
├── Generator
├── Oscilloscope
├── Circuit
├── Instruments
└── Connections
```

## Interaction

Пользователь должен понимать:

```text
что является источником
что является схемой
где измерение
куда подключён канал
```

## Acceptance Gate

Полный end-to-end laboratory scenario работает без manual developer intervention.

---

# WAVE 31
# Experiment Model and Storage

## Goal

Сделать эксперименты воспроизводимыми.

## Storage

Поддержать:

```text
experiment
preset
device configuration
circuit configuration
display settings
```

Использовать browser storage appropriate to data size.

## Important

Не писать continuous raw samples в storage по каждому frame.

## Tests

- save;
- load;
- overwrite;
- invalid data;
- schema migration.

## Acceptance Gate

Эксперимент можно сохранить и воспроизвести.

---

# WAVE 32
# Recording and Playback

## Goal

Сделать recording subsystem.

## Architecture

```text
Live Source
     \
      → AcquisitionSource
     /
Playback Source
```

## Operations

```text
record
stop
pause
resume
seek
replay
```

## Data format

Определить versioned format.

## Tests

Recording должен давать тот же waveform при replay.

## Acceptance Gate

Playback использует downstream pipeline без отдельной копии oscilloscope logic.

---

# WAVE 33
# Worker Resilience

## Goal

Предотвратить зависание всего приложения из-за worker failure.

## Test failures

```text
simulation worker crash
DSP worker crash
WASM init failure
malformed message
buffer corruption
```

## Recovery

```text
detect
→ stop
→ recreate worker
→ restore configuration
→ resume safely
```

## Acceptance Gate

Ошибка worker не приводит к silent corruption или permanent UI freeze.

---

# WAVE 34
# GPU Failure and Context Recovery

## Goal

Сделать rendering subsystem fault tolerant.

## Test

Проверить:

```text
WebGL context loss
GPU resource invalidation
renderer recreation
```

## Recovery

```text
detect
→ pause rendering
→ recreate GPU resources
→ restore scene
→ restore display
```

## Acceptance Gate

Renderer can recover where browser/platform permits recovery.

---

# WAVE 35
# Browser Capability Matrix

## Goal

Подтвердить реальную совместимость.

## Browsers

Минимум:

```text
Chromium
Firefox
Safari
```

## Features

Проверить:

```text
WebGL2
WebGPU
WASM
Workers
SharedArrayBuffer
OffscreenCanvas if used
IndexedDB
OPFS if used
AudioWorklet if used
```

## Output

```text
docs/testing/browser-matrix.md
```

## Acceptance Gate

Никаких undocumented browser assumptions.

---

# WAVE 36
# Security and Cross-Origin Isolation

## Goal

Подготовить production deployment.

## Tasks

Проверить:

```text
HTTPS
CSP
COOP
COEP
cross-origin isolation
worker loading
WASM loading
asset loading
```

## Security review

Проверить:

- unsafe eval;
- uncontrolled external resources;
- dynamic script injection;
- untrusted experiment data;
- malformed saved state.

## Acceptance Gate

Production deployment configuration documented and reproducible.

---

# WAVE 37
# E2E Application Tests

## Goal

Проверить пользовательские workflows.

## Scenarios

### Scenario A

```text
open application
→ load lab
→ interact with oscilloscope
→ run
→ stop
```

### Scenario B

```text
change frequency
→ observe waveform
```

### Scenario C

```text
change time/div
→ verify scaling
```

### Scenario D

```text
change trigger
→ verify waveform positioning
```

### Scenario E

```text
change circuit
→ verify oscilloscope response
```

### Scenario F

```text
save experiment
→ reload
→ reproduce
```

## Acceptance Gate

Critical workflows stable across supported browsers.

---

# WAVE 38
# Performance Regression Framework

## Goal

Сделать performance частью CI/engineering process.

## Benchmarks

Минимум:

```text
render
waveform
decimator
DSP
ring buffer
acquisition
```

## Regression thresholds

Определить допустимое ухудшение.

Например:

```text
frame p95 regression
throughput regression
memory regression
```

Порог фиксируется после baseline.

## Acceptance Gate

Следующая архитектурная оптимизация должна иметь before/after measurement.

---

# WAVE 39
# Full Stress Test

## Goal

Прогнать систему в worst-case сценарии.

## Scenario

```text
3D active
+
2 channels
+
5 MSPS
+
trigger
+
measurements
+
FFT
+
persistence
+
camera movement
+
UI interaction
```

## Duration

Не менее длительного soak test, достаточного для обнаружения:

```text
memory leak
buffer instability
worker crash
GPU resource leak
```

## Metrics

Record:

```text
FPS
frame p95
memory start
memory end
buffer health
worker health
errors
```

## Acceptance Gate

Нет роста ресурсов без объяснимой bounded policy.

---

# WAVE 40
# VКР Experimental Validation

## Goal

Превратить архитектуру в доказуемый научно-технический результат.

## Experiment 1

```text
single-thread
vs
worker
```

## Experiment 2

```text
ArrayBuffer/message passing
vs
SharedArrayBuffer
```

## Experiment 3

```text
JavaScript DSP
vs
WASM DSP
```

## Experiment 4

```text
naive waveform rendering
vs
decimated rendering
```

## Experiment 5

```text
CPU-heavy display
vs
GPU display
```

## Experiment 6

```text
WebGL2
vs
WebGPU
```

## Experiment 7

```text
HIGH
MEDIUM
LOW
```

## Each experiment must document

```text
hypothesis
method
hardware
browser
dataset
iterations
metrics
result
conclusion
limitations
```

## Acceptance Gate

Каждое утверждение о производительности имеет измерительную базу.

---

# WAVE 41
# Documentation Freeze

## Goal

Сделать документацию полностью соответствующей исходному коду.

## Review every document

Проверить:

```text
architecture
data flow
threading
rendering
DSP
storage
security
performance
browser support
```

## Critical diagrams

Обязательно иметь:

```text
system architecture
runtime topology
control plane
data plane
signal pipeline
display pipeline
worker topology
3D rendering pipeline
circuit simulation pipeline
```

## Acceptance Gate

Technical reviewer может восстановить архитектуру по documentation без чтения всего исходного кода.

---

# WAVE 42
# Production Hardening

## Goal

Подготовить приложение к реальной эксплуатации.

## Tasks

Проверить:

```text
production build
asset caching
lazy loading
code splitting
WASM loading
error pages
logging
telemetry hooks
```

## Important

Не добавлять telemetry, нарушающую privacy.

## Acceptance Gate

Production build reproducibly launches and performs expected critical workflows.

---

# WAVE 43
# Final Quality and UX Pass

## Goal

Только теперь улучшать визуальную fidelity.

## Possible additions

```text
bloom
glow
glass
reflections
better shadows
knob animation
button feedback
device LEDs
sound
```

## Rule

Каждый visual effect проходит performance benchmark.

## Acceptance Gate

UX improvements do not violate performance budget.

---

# WAVE 44
# Final Release Candidate

## Goal

Создать release candidate.

## Checklist

```text
functional tests
unit tests
integration tests
E2E
performance
browser matrix
security
recovery
documentation
```

## Build

Создать:

```text
production build
```

## Acceptance Gate

No known P0/P1 defects.

---

# WAVE 45
# ВКР Final Validation Package

## Goal

Сформировать пакет материалов для защиты ВКР.

## Prepare

### Architecture

```text
final architecture diagram
```

### Technology rationale

```text
why TypeScript
why React
why Three.js
why WebGL2
why WebGPU
why WASM
why Workers
why SharedArrayBuffer
```

### Performance

```text
benchmark tables
graphs
hardware profiles
browser matrix
```

### DSP correctness

```text
reference vectors
comparison tables
```

### Digital twin demonstration

```text
generator
circuit
oscilloscope
measurement
trigger
FFT
```

### Limitations

Честно описать:

```text
browser-dependent features
GPU limitations
low-end limitations
numerical limitations
simulation scope
```

## Final Acceptance Gate

Проект считается RELEASE COMPLETE только при одновременном выполнении:

```text
CORRECT
+
TESTED
+
BENCHMARKED
+
DOCUMENTED
+
RECOVERABLE
+
CROSS-BROWSER VERIFIED
```

---

# 4. Global Definition of Done

Для любой Wave:

```text
Implementation
      +
Tests
      +
Benchmark
      +
Documentation
      +
Architecture consistency
      =
DONE
```

---

# 5. Priority Model

Если объём становится чрезмерным:

## P0

```text
domain architecture
3D scene
virtual display
signal engine
acquisition
workers
ring buffer
DSP
trigger
decimation
GPU waveform
measurements
performance
```

## P1

```text
multi-channel
cursors
FFT
circuit simulation
persistence
recording
```

## P2

```text
WebGPU
advanced persistence
advanced circuit elements
```

## P3

```text
bloom
advanced materials
visual effects
cosmetic fidelity
```

Нельзя жертвовать P0 ради P3.

---

# 6. Critical Architecture Invariants

Эти правила не могут быть нарушены без нового ADR.

## Invariant 1

```text
React does not own high-frequency sample data.
```

## Invariant 2

```text
Three.js does not own oscilloscope domain state.
```

## Invariant 3

```text
Simulation does not depend on rendering.
```

## Invariant 4

```text
Rendering does not determine simulation time.
```

## Invariant 5

```text
Raw sample rate and display rate are independent.
```

## Invariant 6

```text
Raw samples are not rendered directly.
```

## Invariant 7

```text
DSP does not block the main thread.
```

## Invariant 8

```text
Memory is bounded.
```

## Invariant 9

```text
WebGL2 remains a valid rendering fallback.
```

## Invariant 10

```text
Every major architecture decision is documented.
```

---

# 7. Final Target Architecture

```text
                             BROWSER
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                     MAIN THREAD                             │
│                                                             │
│  React UI                                                  │
│      │                                                      │
│      ▼                                                      │
│  Application / Domain                                      │
│      │                                                      │
│      ├─────────────── Control Plane ───────────────┐       │
│      │                                             │       │
│      ▼                                             ▼       │
│  Interaction                                   Storage     │
│      │                                                     │
│      ▼                                                     │
│  Three.js / Renderer                                      │
│      │                                                     │
│      ├── 3D World                                          │
│      ├── Oscilloscope                                     │
│      └── Display Texture                                  │
│                                                             │
│                       DATA PLANE                            │
│                                                             │
│  Simulation Worker                                        │
│       │                                                     │
│       ▼                                                     │
│  Signal / Circuit Engine                                  │
│       │                                                     │
│       ▼                                                     │
│  Acquisition                                               │
│       │                                                     │
│       ▼                                                     │
│  Shared Ring Buffer                                        │
│       │                                                     │
│       ▼                                                     │
│  DSP Worker                                                │
│       │                                                     │
│       ├── Trigger                                          │
│       ├── Measurements                                     │
│       ├── FFT                                              │
│       └── Decimation                                       │
│       │                                                     │
│       ▼                                                     │
│  Display Buffer                                            │
│       │                                                     │
│       ▼                                                     │
│  GPU Waveform Renderer                                    │
│       │                                                     │
│       ▼                                                     │
│  Virtual Display                                           │
│       │                                                     │
│       ▼                                                     │
│  3D Oscilloscope Screen                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 8. Final Engineering Principle

The final system must not be designed as:

```text
"3D web application with an oscilloscope-looking UI"
```

It must be implemented as:

```text
browser-native
real-time
multi-threaded
data-oriented
GPU-assisted
signal-processing
digital-twin system
```

The 3D model is the presentation of the instrument.

The domain model is the instrument.

The acquisition/DSP pipeline is its computational core.

The GPU display is its measurement surface.

The documentation and benchmarks are the evidence that the architecture works.