# 3D Rendering Architecture & Scene Foundation

## 1. Overview

Подсистема 3D-рендеринга цифрового двойника измерительного стенда построена на базе Three.js (WebGL2 с возможностью расширения до WebGPU). Подсистема полностью изолирована от доменной модели осциллографа (`src/domain/`) и взаимодействует только через слои адаптеров.

```mermaid
graph TD
    subgraph "Application & Adaptation Layer"
        APP[Application / OscilloscopeService]
        ADAPTER[OscilloscopeRendererAdapter]
    end

    subgraph "3D Rendering Engine (src/rendering)"
        RT[Oscilloscope3DRuntime]
        BOOT[RendererBootstrap (WebGL2 / Tiers)]
        SCENE[SceneManager (lab_root)]
        CAM[CameraManager (Orbit/Pan/Zoom/Reset)]
        LOOP[RenderLoop (Zero Per-Frame Allocation)]
        ASSETS[AssetLifecycle (Geometry/Material Cache & Disposal)]
        PERF[PerformanceMonitor (p50/p95/p99, DrawCalls)]
    end

    APP -.-> ADAPTER
    ADAPTER --> RT
    RT --> BOOT
    RT --> SCENE
    RT --> CAM
    RT --> LOOP
    RT --> ASSETS
    RT --> PERF
```

---

## 2. Standardized Scene Graph Hierarchy

Все визуальные элементы лабораторного стенда организованы в стандартизированное дерево сцены с предсказуемыми именами узлов:

```text
lab_root (THREE.Group)
├── environment_group
│   ├── floor_mesh (Floor plane, receiveShadow)
│   ├── desk_mesh (Workbench top, receiveShadow)
│   └── desk_legs (Leg cylinders)
│
├── lighting_group
│   ├── light_ambient (Soft ambient fill #d8e0eb)
│   ├── light_key (DirectionalLight, 2048x2048 shadow map, castShadow)
│   └── light_fill (Cool fill light #9bc4e2)
│
├── oscilloscope_group
│   └── oscilloscope_root
│       ├── oscilloscope_body (Main chassis box, castShadow, receiveShadow)
│       ├── front_panel (Bezel dark graphite panel)
│       ├── oscilloscope_screen (7" 16:9 display surface for texture blitting)
│       ├── knob_time_div (Timebase rotary encoder)
│       ├── knob_volt_div_ch1 (Channel 1 vertical scale knob)
│       ├── knob_volt_div_ch2 (Channel 2 vertical scale knob)
│       ├── knob_trigger_level (Trigger level rotary encoder)
│       ├── bnc_ch1 (BNC input connector with yellow ring)
│       ├── bnc_ch2 (BNC input connector with cyan ring)
│       ├── bnc_ext_trig (External trigger connector with grey ring)
│       ├── btn_run_stop (Run/Stop toggle push button)
│       ├── btn_autoset (Autoset push button)
│       └── btn_power (Power push button)
│
├── generator_group
│   └── generator_mesh (Signal generator physical body)
│
└── circuit_group
    └── (Components and virtual probe leads)
```

---

## 3. Renderer Bootstrap & Performance Tiers

Класс `RendererBootstrap` управляет инициализацией контекста WebGL2 и динамической деградацией качества:

| Параметр | HIGH Tier | MEDIUM Tier | LOW Tier |
|---|---|---|---|
| **Max DPR** | 2.0 (Retina/High-DPI) | 1.5 | 1.0 (или 0.75 на мобильных) |
| **Shadows** | `PCFSoftShadowMap` (2048x2048) | Basic Shadows (1024x1024) | Отключены (`castShadow = false`) |
| **Antialiasing** | Включен (MSAA) | Включен | Отключен |
| **Power Preference** | `high-performance` | `default` | `low-power` |
| **Draw Calls (измерено)** | 21 | 21 | 19 |
| **Triangles (измерено)** | 932 | 932 | 908 |

### Обработка потери контекста GPU
При возникновении события `webglcontextlost` на элементе canvas:
1. Вызывается `e.preventDefault()`, предотвращающий краш страницы браузера;
2. `RenderLoop` приостанавливает вызовы отрисовки;
3. При наступлении `webglcontextrestored` флаг контекста сбрасывается и цикл возобновляется.

---

## 4. Camera Controls & Navigation

Класс `CameraManager` реализует навигацию вокруг целевого объекта:
- **Orbit**: сферическое вращение ($\theta, \phi$) левой кнопкой мыши с ограничением полярного угла $\phi \in [0.05, \pi/2 - 0.02]$ рад (предотвращает переворот через зенит и падение под стол);
- **Zoom**: изменение радиуса сферы колесиком мыши с жесткими границами $[0.3, 10.0]$ м;
- **Pan**: панорамирование правой кнопкой мыши или `Shift` + левый клик в плоскости вида камеры;
- **Reset**: мгновенный возврат к канонической точке обзора лицевой панели осциллографа.

---

## 5. Memory & Asset Lifecycle Management

В соответствии с правилами `GEMINI.md`:
1. **Zero Per-Frame Allocations**:
   - Никаких вызовов `new THREE.Vector3()`, `new THREE.Matrix4()`, `new Float32Array()` в цикле `RenderLoop.tick()`.
   - Вспомогательные векторы предвыделены как scratch-буферы (`_scratchOffset`, `_scratchRight`, `_scratchUp`).
2. **Asset Deduplication & Caching (`AssetLifecycle`)**:
   - Однотипные геометрии (например, ножки стола, энкодеры, разъемы BNC) используют общий разделяемый экземпляр `THREE.BufferGeometry`.
   - Материалы кешируются по ключам.
3. **Recursive VRAM Cleanup (`disposeObject`)**:
   - При удалении узла рекурсивно вызывается `geometry.dispose()`, `material.dispose()` и очищаются привязанные текстуры во избежание утечек видеопамяти.

---

## 6. Realtime Performance Monitor

Класс `PerformanceMonitor` фиксирует метрики каждого кадра в циклическом буфере (`Float64Array(120)`):
- **FPS**: вычисляется скользящим окном за 1 секунду;
- **Frame Time**: время выполнения текущего кадра;
- **p50 / p95 / p99**: перцентили времени кадра, сортируемые без аллокаций через предвыделенный scratch-массив;
- **Three.js Counters**: чтение счетчиков `renderer.info.render.calls` и `renderer.info.render.triangles`.
