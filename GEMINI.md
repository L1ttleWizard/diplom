# GEMINI.md — Engineering Rules for the Browser Digital Twin

## 0. Назначение проекта

Проект — браузерный цифровой двойник лабораторного измерительного стенда с интерактивной 3D-моделью цифрового осциллографа.

Основные цели:

* интерактивная 3D-модель лабораторного стенда;
* 3D-модель цифрового осциллографа;
* экран осциллографа, встроенный непосредственно в 3D-модель;
* виртуальный acquisition pipeline;
* виртуальная частота дискретизации до 1–5 MSPS;
* DSP в реальном времени;
* стабильная визуализация с целевыми 60 FPS;
* работоспособность не только на мощных ПК, но и на средних/слабых системах;
* архитектурная пригодность для ВКР;
* воспроизводимые тесты и измеряемая производительность.

---

# 1. Основной архитектурный принцип

## 1.1. Control Plane и Data Plane должны быть разделены

Control Plane:

```text
UI
  ↓
commands
  ↓
domain/device state
```

Data Plane:

```text
signal source
  ↓
simulation
  ↓
acquisition
  ↓
DSP
  ↓
ring buffer
  ↓
display buffer
  ↓
GPU
```

Большие массивы samples не должны проходить через React state.

React не является частью high-frequency processing loop.

---

# 2. Запрещённые архитектурные решения

Нельзя:

1. передавать millions of samples через React state;
2. создавать новый массив samples каждый animation frame;
3. делать JSON serialization для высокочастотного sample stream;
4. передавать 1–5 MSPS напрямую в GPU;
5. создавать тысячи Three.js objects для одной waveform;
6. использовать DOM/HTML для отрисовки самого waveform;
7. блокировать main thread DSP-вычислениями;
8. использовать AudioWorklet как обязательный механизм виртуального ADC 1–5 MSPS;
9. связывать simulation logic напрямую с React components;
10. привязывать бизнес-логику к Three.js objects;
11. делать WebGPU единственной обязательной графической платформой;
12. добавлять оптимизации без benchmark;
13. менять API/архитектуру без обновления документации;
14. удалять существующую функциональность только ради упрощения без документированного архитектурного решения.

---

# 3. Частоты выполнения разных подсистем

Нельзя считать, что вся система должна работать с одной частотой.

Ожидаемое разделение:

```text
Simulation       1–5 MSPS logical rate
Acquisition      sample-driven / batched
DSP              sample-driven / block-driven
Trigger          sample-driven
Measurements     block-driven
Waveform         display-driven
3D renderer      ~60 FPS
UI               event-driven
Static display   change-driven
```

Ключевой принцип:

```text
sample rate != render rate
```

---

# 4. 3D-модель осциллографа

3D-модель должна быть отделена от его функциональной модели.

```text
OscilloscopeDomain
        │
        ▼
OscilloscopeRendererAdapter
        │
        ▼
Three.js objects
```

Three.js не должен определять состояние осциллографа.

3D-модель должна позволять идентифицировать:

* корпус;
* дисплей;
* ручку time/div;
* ручку volts/div;
* trigger controls;
* channel controls;
* power;
* input connectors;
* другие интерактивные элементы.

Желательный формат модели:

```text
GLB / glTF
```

---

# 5. Архитектура дисплея осциллографа

Экран осциллографа является отдельным rendering subsystem.

Логическая структура:

```text
Display Engine
├── Background
├── Grid
├── Waveform CH1
├── Waveform CH2
├── Trigger marker
├── Cursors
├── Measurements
├── Status
├── Channel indicators
└── Menu
```

Static и dynamic части должны быть разделены.

Waveform должен рендериться GPU-oriented способом.

Нельзя передавать исходные 1–5 MSPS данные напрямую в 3D renderer.

Между acquisition и GPU обязательно существует visualization/decimation stage.

---

# 6. Производительность

Бюджет кадра для 60 FPS:

```text
16.67 ms/frame
```

Агент обязан измерять:

* FPS;
* frame time;
* p50 frame time;
* p95 frame time;
* p99 frame time;
* long frames;
* main-thread time;
* worker time;
* GPU time, если доступен;
* memory;
* allocation rate;
* количество draw calls;
* количество triangles;
* waveform points;
* acquisition throughput;
* DSP processing time;
* end-to-end display latency.

Нельзя считать систему "быстрой" только по субъективному ощущению.

---

# 7. Performance tiers

Система должна иметь capability-based degradation.

Минимум:

```text
HIGH
MEDIUM
LOW
```

А также automatic profile.

Пример деградации:

```text
HIGH:
high DPR
full 3D quality
shadows
post-processing
large waveform buffer

MEDIUM:
reduced DPR
reduced shadows
simplified post-processing

LOW:
low DPR
low-poly scene
reduced texture resolution
minimal post-processing
smaller display buffer
```

Функциональность осциллографа должна сохраняться даже при ухудшении визуального качества.

---

# 8. WebGL/WebGPU

WebGL2 является обязательным основным fallback.

WebGPU должен рассматриваться как progressive enhancement.

Архитектура должна позволять:

```text
Renderer API
   ├── WebGL2 backend
   └── WebGPU backend
```

Application/domain logic не должна знать о конкретном graphics backend.

---

# 9. WASM

WASM используется только там, где benchmark подтверждает необходимость.

Основные кандидаты:

* DSP;
* signal generation;
* circuit calculations;
* decimation;
* FFT;
* measurements;
* numerical integration.

Не переносить в WASM:

* простой UI;
* обычную application state logic;
* мелкие операции с высокой boundary-crossing cost.

Нельзя утверждать "WASM быстрее JavaScript" без benchmark конкретного алгоритма.

---

# 10. Workers

Workers предназначены для долгоживущей тяжёлой работы.

Рекомендуемое разделение:

```text
Main Thread
    UI
    interaction
    3D orchestration

Simulation Worker
    signal generation
    circuit simulation

DSP Worker
    filters
    measurements
    trigger
    decimation
    FFT

Optional Render Worker
    только после benchmark
```

Количество workers должно определяться профилированием.

Не создавать worker на каждый маленький task.

---

# 11. SharedArrayBuffer

SharedArrayBuffer допустим для потоковых данных.

Использование должно быть ограничено большими и часто обновляемыми структурами.

Предпочтительно:

```text
SAB
 ├── control/header
 ├── ring buffer
 ├── metadata
 └── synchronization fields
```

Редкие control commands должны использовать обычный message passing.

Для SAB архитектура должна учитывать cross-origin isolation.

---

# 12. Memory rules

Запрещено:

```ts
new Float32Array(...)
```

каждый frame.

Запрещено:

```ts
samples.map(...)
samples.slice(...)
samples.filter(...)
```

в high-frequency loop.

Нужно:

* preallocation;
* buffer reuse;
* typed arrays;
* ring buffers;
* object pooling там, где это реально необходимо;
* bounded memory.

---

# 13. Error handling

Каждый worker должен иметь:

* startup validation;
* protocol validation;
* error boundary;
* recovery path;
* worker restart strategy;
* state resynchronization.

GPU subsystem должен уметь:

* сообщить о недоступности WebGPU;
* fallback на WebGL2;
* восстановиться после context loss, если это возможно.

---

# 14. Documentation synchronization rule

Каждое существенное изменение должно синхронно отражаться в документации.

Минимальный набор:

```text
docs/
├── architecture/
│   ├── overview.md
│   ├── runtime-topology.md
│   ├── data-plane.md
│   ├── control-plane.md
│   ├── rendering.md
│   ├── oscilloscope-display.md
│   └── workers-and-wasm.md
│
├── requirements/
│   ├── functional.md
│   ├── non-functional.md
│   └── performance.md
│
├── decisions/
│   ├── ADR-001-...
│   ├── ADR-002-...
│   └── ...
│
├── testing/
│   ├── strategy.md
│   ├── performance.md
│   └── compatibility.md
│
└── progress/
    ├── waves.md
    ├── changelog.md
    └── benchmark-history.md
```

После каждой wave агент обязан обновить:

1. архитектуру;
2. требования;
3. ADR при изменении архитектурного решения;
4. benchmark history;
5. progress/changelog;
6. known issues;
7. следующие ограничения/риски.

---

# 15. ADR rule

Архитектурное решение обязательно оформляется ADR, если оно:

* меняет technology choice;
* меняет threading model;
* меняет data transport;
* меняет rendering pipeline;
* меняет storage;
* меняет performance strategy;
* убирает существующий механизм.

ADR должен содержать:

```text
Context
Problem
Options
Decision
Why
Trade-offs
Consequences
Benchmark evidence
```

---

# 16. Documentation is part of Definition of Done

Feature считается незавершённой, если:

* код работает;
* но архитектура не описана;
* benchmark не зафиксирован;
* тесты не добавлены;
* documentation не обновлена.

Для каждой wave:

```text
implementation
+
tests
+
benchmark
+
documentation
+
review
=
DONE
```

---

# 17. Evidence rule

Агент не должен писать:

> "производительность хорошая"

Нужно писать:

```text
Chrome XX
CPU ...
GPU ...
resolution ...
FPS p95 ...
frame p95 ...
memory ...
MSPS ...
```

Экспериментальные характеристики должны явно маркироваться как:

```text
measured
estimated
browser-dependent
hardware-dependent
```

---

# 18. No premature optimization

Сначала:

```text
measure
→ identify bottleneck
→ optimize
→ measure again
```

Не:

```text
guess
→ optimize
→ hope
```

---

# 19. Compatibility

Минимальный target:

* Chromium;
* Firefox;
* Safari, где технически возможно.

Feature detection обязателен.

Нельзя определять capability только по user-agent.

---

# 20. Regression protection

После каждой significant performance change нужно сравнить:

```text
before
vs
after
```

и сохранить результат в:

```text
docs/testing/benchmark-history.md
```

Если производительность ухудшилась — агент обязан указать причину или откатить изменение.

---

# 21. Agent workflow

Для каждой wave:

```text
1. Inspect
2. Plan
3. Implement
4. Test
5. Benchmark
6. Review
7. Update docs
8. Record decision
9. Verify gate
10. Proceed
```

Нельзя переходить к следующей wave, если acceptance gate текущей wave не выполнен, кроме случаев, когда blocker документирован.

---

# 22. Основное правило проекта

Работа должна привести не просто к приложению, которое "выглядит как осциллограф".

Необходимо построить:

```text
correct
+
measurable
+
modular
+
browser-compatible
+
performance-aware
+
documented
digital twin architecture
```

Все решения должны быть объяснимы с инженерной и научной точки зрения и пригодны для включения в ВКР.
