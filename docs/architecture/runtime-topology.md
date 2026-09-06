# Runtime Topology & Process Model

## 1. Subsystem Frequencies & Rate Decoupling

Главный фундаментальный принцип системы (согласно `GEMINI.md`):

$$\text{Sample Rate} \neq \text{Render Rate}$$

Система функционирует в мультичастотном режиме:

| Подсистема | Режим выполнения / Частота | Поток / Контекст | Ответственность |
|---|---|---|---|
| **Simulation** | 1–5 MSPS (logical rate) | Simulation Worker / WASM | Генерация сигнатур сигналов, численное интегрирование цепей |
| **Acquisition** | Потоковый / пачками (batching) | Worker / Data Plane | Буферизация, пред/пост-триггерная выборка, Ring Buffer |
| **Trigger Engine** | Sample-driven | Worker / WASM | Анализ переходов через уровень, гистерезис, holdoff |
| **DSP & FFT** | Блочный (10–60 Гц) | DSP Worker / WASM | Фильтрация, спектральный анализ (FFT), усреднение |
| **Measurements** | Блочный (10–30 Гц) | DSP Worker / Domain | Вычисление амплитудных и частотных параметров ($V_{pp}, f, \dots$) |
| **Decimation** | По запросу рендера (~60 Гц) | Data Plane / Worker | Min-Max прореживание миллионов отсчетов до размера дисплея |
| **3D Rendering** | 60 FPS (16.67 мс/кадр) | Main Thread / GPU | Three.js сцена, виртуальная комната, корпус и кнопки прибора |
| **Display Overlay** | ~60 FPS | Main Thread / Canvas/GPU | Отрисовка развернутой осциллограммы, сетки и интерфейса экрана |
| **Control Plane** | Событийный (Event-Driven) | Main Thread / Application | Обработка кликов, вращения энкодеров, валидация команд |

---

## 2. Multi-Thread Topology

```mermaid
flowchart TB
    subgraph MT["Main Thread (Browser / UI Loop ~60 FPS)"]
        UI_CTL["UI & 3D User Interaction"]
        APP_SVC["OscilloscopeService & EventBus"]
        THREE_SCENE["Three.js Scene & 3D Lab Mesh"]
        SCREEN_TEX["Oscilloscope Screen Texture Engine"]
    end

    subgraph SW["Simulation Worker (High-Frequency Loop)"]
        SIG_GEN["Signal Generators"]
        SOLVER["Circuit ODE / MNA Solver"]
    end

    subgraph DW["DSP & Acquisition Worker"]
        TRIG_DET["Trigger Detection"]
        DECIM["Decimation / Peak-Detect"]
        MEAS_ENG["Measurements & FFT Engine"]
    end

    subgraph MEM["Shared Data Transport"]
        SAB["SharedArrayBuffer / Ring Buffer"]
    end

    UI_CTL -->|Commands: RUN, STOP, SET_DIV| APP_SVC
    APP_SVC -->|Control Messages| SW
    APP_SVC -->|Control Messages| DW

    SW -->|High-throughput samples 1-5 MSPS| SAB
    SAB -->|Sample Batches| DW
    DW -->|Decimated Display Points (1000-2000 pts)| SCREEN_TEX
    DW -->|Measurements (Vpp, Freq)| APP_SVC

    SCREEN_TEX -->|Canvas / Texture Update| THREE_SCENE
```

---

## 3. Boundary Rules Between Layers

1. **Main Thread Protection**:
   - Никаких вычислений спектров, численного интегрирования или перебора миллионов отсчетов в основном потоке.
   - Главный поток ориентирован исключительно на плавность анимации (целевые 60 FPS, frame budget 16.67 мс).

2. **Zero Large JSON Serialization**:
   - Передача отсчетов между потоками выполняется через типизированные структуры в `SharedArrayBuffer` (с fallback на `transferable ArrayBuffer`).
   - Использование `JSON.stringify` для потоков отсчетов строго запрещено.

3. **Domain Independence**:
   - Доменный агрегат `Oscilloscope` и его сущности не знают о потоках, Web Workers, Three.js или React. Они представляют чистую логику поведения прибора.
   - Адаптеры приложения (`src/application`) координируют домен с транспортным слоем.
