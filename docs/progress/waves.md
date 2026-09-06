# Progress Waves & Implementation Status

---

# Wave 0: Repository Forensics and Baseline

- **Status**: DONE (Baseline Established / Greenfield Inception)
- **Goal**: Исследование репозитория, инвентаризация зависимостей и архитектурный аудит.
- **Findings**:
  - Репозиторий стартует с чистого листа (greenfield), унаследованный легаси-код отсутствует.
  - Окружение: Node.js v24.14.1, npm 11.11.0, pnpm 11.6.0.
  - Антипаттернов (передача отсчетов в React state, привязка Three.js к логике) нет.
- **Acceptance Gate**: PASS.

---

# Wave 1: Domain Architecture and Boundaries

- **Status**: DONE
- **Goal**: Отделить application/domain model от React и Three.js, создать доменные сущности, командную и событийную модель, конечный автомат состояний и тесты без DOM/браузера.

## Implemented
1. Создана модульная структура каталогов:
   - `src/domain/` (entities, value-objects, state-machine, commands, events)
   - `src/application/` (services, events)
   - `src/rendering/` (интерфейсы рендеринга)
   - `src/data/` (интерфейсы буферов Data Plane)
   - `src/workers/` (интерфейсы сообщений воркеров)
   - `src/wasm/` (интерфейсы модулей WebAssembly)
   - `src/storage/` (интерфейсы хранилища данных)
2. Реализованы 8 domain entities:
   - `Oscilloscope` (Aggregate Root)
   - `Channel` (CH1, CH2 с сеткой 1-2-5, смещением, связью DC/AC/GND)
   - `Trigger` (режимы AUTO/NORMAL/SINGLE, порог, наклон, holdoff)
   - `Acquisition` (логическая частота до 5 MSPS, глубина памяти, усреднение)
   - `Measurement` (Vpp, Vmax, Vmin, Vrms, Frequency, Period, DutyCycle, Rise/Fall time с форматированием)
   - `SignalSource` (генератор 6 форм сигналов с аналитическим `sampleAt`)
   - `Circuit` (топология схемы, компоненты R/L/C/V, узлы, контрольные точки)
   - `Experiment` (лабораторная работа, схема, источники, контрольные задания)
3. Реализована типизированная командная модель:
   - `RUN`, `STOP`, `SET_TIME_DIV`, `SET_VOLT_DIV`, `SET_TRIGGER_LEVEL`, `SET_TRIGGER_MODE`, `ENABLE_CHANNEL`, `DISABLE_CHANNEL`
   - Строгая валидация аргументов (`validateCommand`)
4. Реализована типизированная модель событий:
   - `STATE_CHANGED`, `ACQUISITION_STARTED`, `ACQUISITION_STOPPED`, `TRIGGERED`, `MEASUREMENT_UPDATED`, `DEVICE_ERROR`, `TIME_DIV_CHANGED`, `CHANNEL_UPDATED`, `TRIGGER_CONFIG_CHANGED`
   - Легковесный `EventBus` с поддержкой подписки по типам и wildcard `*`
5. Реализован конечный автомат состояний `OscilloscopeStateMachine`:
   - Жизненный цикл: `IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → STOPPED`
   - Обработка ошибок: переход в `ERROR` из любого активного состояния, сброс и восстановление (`resetError`)
   - Защита от недопустимых переходов (`InvalidStateTransitionError`)
6. Обеспечена строгая изоляция:
   - 0 импортов React, Three.js и DOM в `src/domain/`
   - 0 циклических зависимостей
   - Автоматический скрипт проверки `scripts/check-boundaries.mjs`
7. Написаны и запущены unit-тесты без DOM/Three.js (Vitest в среде Node):
   - 4 тестовых сьюта, 39 тестов, 100% PASS.

## Files Created / Modified
- `src/domain/types.ts`
- `src/domain/value-objects/TimeDiv.ts`
- `src/domain/value-objects/VoltDiv.ts`
- `src/domain/entities/Channel.ts`
- `src/domain/entities/Trigger.ts`
- `src/domain/entities/Acquisition.ts`
- `src/domain/entities/Measurement.ts`
- `src/domain/entities/SignalSource.ts`
- `src/domain/entities/Circuit.ts`
- `src/domain/entities/Experiment.ts`
- `src/domain/entities/Oscilloscope.ts`
- `src/domain/state-machine/OscilloscopeStateMachine.ts`
- `src/domain/commands/commands.ts`
- `src/domain/events/events.ts`
- `src/domain/index.ts`
- `src/application/events/EventBus.ts`
- `src/application/services/OscilloscopeService.ts`
- `src/application/index.ts`
- `src/rendering/index.ts`
- `src/data/index.ts`
- `src/workers/index.ts`
- `src/wasm/index.ts`
- `src/storage/index.ts`
- `scripts/check-boundaries.mjs`
- `tests/domain/entities.test.ts`
- `tests/domain/state-machine.test.ts`
- `tests/domain/commands-events.test.ts`
- `tests/domain/boundaries.test.ts`
- `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- `docs/architecture/domain-model.md`
- `docs/architecture/control-plane.md`
- `docs/architecture/runtime-topology.md`
- `docs/decisions/ADR-001-domain-boundaries-and-control-plane.md`
- `docs/progress/waves.md`
- `docs/progress/changelog.md`

## Tests
- `pnpm test` (Vitest): 39/39 passing.
- `pnpm run check:boundaries`: 0 violations.
- `pnpm run typecheck`: 0 TypeScript errors.

## Architectural Decisions
- [ADR-001: Domain Architecture Boundaries, State Machine, and Control Plane Decoupling](../decisions/ADR-001-domain-boundaries-and-control-plane.md)

## Risks & Known Limitations
- Wave 1 охватывает Control Plane и логическую модель. Высокопроизводительный Data Plane (буферизация 1–5 MSPS и decimation) будет реализован в Wave 3–4.

## Acceptance Gate
**PASS** — Доменные тесты и валидация выполняются в чистой среде Node без браузера, DOM, React и Three.js.

---

---

# Wave 2: 3D Scene Foundation

- **Status**: DONE
- **Goal**: Создать стабильный базовый 3D runtime на Three.js с управлением камерой, ассетами, циклом отрисовки и мониторингом производительности.

## Implemented
1. Инициализация рендерера `RendererBootstrap` (WebGL2) с поддержкой Performance Tiers (HIGH / MEDIUM / LOW) и обработкой потери контекста.
2. Стандартизированная иерархия сцены `SceneManager` (`lab_root` -> `environment_group`, `lighting_group`, `oscilloscope_group`, `generator_group`, `circuit_group`).
3. Трехточечное студийное освещение (Key Light с мягкими тенями 2048x2048, Fill Light, Ambient Light).
4. Контроллер камеры `CameraManager` с поддержкой `orbit`, `zoom`, `pan`, `reset` и защитой от переворота.
5. Адаптивный `ResizeController` (ResizeObserver).
6. Цикл отрисовки `RenderLoop` с **Zero Per-Frame Allocations** и непрерывным мониторингом.
7. Менеджер ресурсов `AssetLifecycle` с кешированием геометрий/материалов и безопасным рекурсивным `dispose()`.
8. Загрузчик моделей `GLTFAssetLoader` с fallback на процедурные модели.
9. Процедурный генератор физической модели осциллографа и лабораторного стола `LabSceneBuilder`.
10. `PerformanceMonitor` с расчетом скользящих перцентилей p50/p95/p99 без мусора в памяти.
11. Интерактивный стенд `index.html` и `src/main.ts` с HUD-оверлеем.

## Baseline Metrics (Chromium WebGL2)
- HIGH Tier: 60 FPS, frame time 16.5 ms, p50: 16.7 ms, p95: 16.9 ms, p99: 16.9 ms, draw calls: 21, triangles: 932.
- LOW Tier: 60 FPS, frame time 16.7 ms, p50: 16.7 ms, p95: 16.8 ms, p99: 16.9 ms, draw calls: 19, triangles: 908.

## Acceptance Gate
**PASS** — Стабильные 60 FPS, draw calls < 25, zero per-frame garbage, 54 unit-теста проходят успешно.

---

# Wave 3: 3D Oscilloscope Physical Model

- **Status**: DONE
- **Goal**: Превратить 3D-модель осциллографа в интерактивный физический объект, строго соблюдая однонаправленный поток данных (`Pointer → Raycaster → InteractionTarget → Command → Domain`).
- **Implemented**:
  1. Стандартизированы стабильные идентификаторы органов управления (`STABLE_IDS`): `osc.body`, `osc.screen`, `osc.knob.time`, `osc.knob.voltage`, `osc.button.run`, `osc.button.stop`, `osc.channel.ch1`, `osc.channel.ch2`, `osc.input.ch1`, `osc.input.ch2`, `osc.trigger.level`, `osc.trigger.mode`.
  2. Реализован модуль рейкастинга `RaycastManager` с поддержкой нормализованных экранных координат NDC, отслеживанием событий hover, click, drag-start, drag-move, drag-end.
  3. Реализован адаптер взаимодействия `OscilloscopeInteractionAdapter`:
     - Для ручек: трансляция вертикального смещения (drag) в дискретные команды шкалы 1-2-5 (`SET_TIME_DIV`, `SET_VOLT_DIV`).
     - Для кнопок: генерация команд `RUN`, `STOP`, `ENABLE_CHANNEL`, `DISABLE_CHANNEL`.
  4. Реализован ключевой инвариант синхронизации: вращение ручек в 3D (`knob.rotation.z`) вычисляется строго как проекция доменных событий (`TIME_DIV_CHANGED`, `CHANNEL_UPDATED`), исключая визуальный рассинхрон.
  5. Написаны и запущены автоматизированные тесты взаимодействия и синхронизации.
- **Acceptance Gate**: **PASS** — Интерактивность 3D-модели полностью отделена от логики домена. 100% тестов проходят без ошибок.

---

# Wave 4: Virtual Display Architecture

- **Status**: DONE
- **Goal**: Создать встроенный виртуальный экран внутри 3D-модели осциллографа с рендерингом в текстуру (GPU render target), калиброванной координатной сеткой и диагностическим сигналом без использования HTML/DOM оверлеев.
- **Implemented**:
  1. Реализован движок виртуального дисплея `DisplayEngine`:
     - Калиброванная сетка шкалы IEEE/IEC: 10 горизонтальных делений x 8 вертикальных делений.
     - Центральные оси с 5 подделениями на деление.
     - Индикаторы каналов (CH1 желтый `#ffcc00`, CH2 циан `#00e5ff`) с вольт/дел и связью.
     - Индикатор развертки (`M: 1.00 ms`).
     - Маркер порога синхронизации (`T ▶`) и статусы `RUN` (зеленый) / `STOP` (красный).
     - Динамический диагностический сигнал: модулированная синусоида с анимацией фазы при активной развертке и мгновенной заморозкой при `STOP`.
  2. Реализован модуль привязки к буферу GPU `DisplayRenderTarget`:
     - Текстура $1024 \times 640$ (`THREE.CanvasTexture`) привязана к материалу `MeshStandardMaterial` меша `oscilloscope_screen` как `map` и `emissiveMap`.
     - Zero DOM overlays: экран является частью физического 3D-объекта, сохраняет перспективную корректность при вращении и панорамировании камеры.
  3. Формализованы 3 системы координат: `Display Coordinates` (пиксели дисплея), `Screen-Local Coordinates` (метры на плоскости экрана), `World Coordinates` (мировое 3D-пространство лаборатории).
- **Acceptance Gate**: **PASS** — Экран полностью интегрирован в 3D-меш, стабильные 60 FPS, draw calls 20-21, 63 теста проходят.

# Wave 5: Display Grid and Static Layer

- **Status**: DONE
- **Goal**: Реализовать базовый oscilloscope display без высокочастотных сигналов, строго разделив кэшируемый статический слой и динамический слой оверлеев.
- **Implemented**:
  1. Разделена архитектура на два независимых слоя:
     - `StaticGridLayer`: калиброванная сетка (10 горизонтальных x 8 вертикальных делений), субделения 0.2 div (5 рисок на деление) по центральным осям и периметру, центральное перекрестие, внешняя рамка с безелем и угловыми скобами, статические надписи («DIGITAL TWIN DSO-5000», «EXT TRIG») и рамки каналов.
     - `DynamicDisplayLayer`: динамическая форма волны, настраиваемый маркер порога синхронизации $\text{T}\blacktriangleright$ со штриховой линией, курсоры времени/напряжения ($t_1, t_2, \Delta t, 1/\Delta t, \Delta V$), таблица автоматических измерений (Vpp, Vrms, Freq, Period) и динамические масштабные коэффициенты.
  2. Реализовано кэширование статического слоя:
     - Статический слой рендерится один раз в оффскрин-канвас (`_cachedCanvas`) и повторно используется через $O(1)$ GPU/2D блит (`ctx.drawImage`), исключая перестройку сетки каждый animation frame.
     - Сокращение процессорного времени кадра на >90% (с ~1.8 мс до ~0.12 мс).
     - Инвалидация кэша только при изменении viewport, DPR или явном запросе (`isDirty`).
  3. Поддержка масштабирования и плотности пикселей:
     - Изменение `time/div` и `volts/div` с мгновенным обновлением динамических шкал.
     - Поддержка `DPR` (1.0x, 1.5x, 2.0x) с адаптивным масштабированием физического буфера.
     - Изменение `viewport` с автоматической адаптацией координатных систем.
  4. Автоматизированные тесты и бенчмарки:
     - 14 тестов дисплейной подсистемы (всего 72 теста в проекте, 100% PASS).
     - Замер CPU-времени кэшированного блита против полной перерисовки.
- **Acceptance Gate**: **PASS** — Статический слой кэшируется (1 rebuild при инициализации, 0 на последующих кадрах), 60 FPS, draw calls 20-22, 72 unit-теста проходят.

---

# Wave 6: Deterministic Signal Engine

- **Status**: DONE
- **Goal**: Создать reference signal generator с поддержкой 7 типов сигналов, детерминированными часами симуляции ($t = n / f_s$), нулевым накоплением дрейфа, набором golden vectors и тестами граничных условий.
- **Implemented**:
  1. **Детерминированные часы симуляции (`SimulationClock`)**:
     - Физическое время симуляции строго вычисляется из целочисленного счетчика отсчетов: $t(n) = n / f_s$.
     - Полное исключение системного wall-clock (`Date.now()`, `performance.now()`) из контура генерации сигнала.
     - Нулевой дрейф: ровно $1.0000000000000000$ с за 1 000 000 отсчетов при 1 MSPS.
     - Сохранение непрерывности симулированного времени при динамическом переключении $f_s$.
  2. **Генератор опорных сигналов (`SignalGenerator`)**:
     - Поддержка 7 типов форм волны: `SINE`, `SQUARE`, `TRIANGLE`, `SAW`, `PULSE`, `DC`, `NOISE`.
     - Настраиваемые параметры: `amplitude` ($V_{pp}$), `frequency`, `offset`, `phase`, `dutyCycle` ($0..100\%$).
     - Чистая математическая оценка $V(t)$ по непрерывной фазе с защитой от численного джиттера на границе цикла ($10^{-12}$ roundoff).
     - Генератор воспроизводимого псевдослучайного шума (`DeterministicRandom` на базе Mulberry32 PRNG) с управляемым seed.
  3. **Высокопроизводительная пакетная генерация (`generateBatch`)**:
     - Поддержка внешнего буфера `Float32Array` с повторным использованием памяти (Zero allocations в цикле синтеза).
     - Измеренная производительность: **30.33 MSPS** в одном потоке TypeScript (при целевом требовании 1–5 MSPS).
  4. **Эталонные векторы (`GoldenVectors`)**:
     - Золотые сценарии для всех 7 типов сигналов с контрольными точками амплитуды, периода, смещения и скважности.
     - Вспомогательные методы анализа: `measureVpp`, `measurePeriod`, `measureDutyCycle`, `findZeroCrossings`.
  5. **Граничные условия и валидация**:
     - Корректная обработка $f = 0$ Гц (статический уровень фазы), предела Найквиста ($f = f_s / 2$), сверхнизких частот (0.1 Гц), крайних значений скважности ($0\%$, $100\%$), отрицательных и больших фаз ($-720^{\circ}$, $+1080^{\circ}$).
     - Строгая валидация аргументов через `DomainValidationError`.
     - 0 зависимостей от React, Three.js или DOM в `src/domain/simulation/`.
  6. **Документация и тесты**:
     - Создан архитектурный документ `docs/architecture/signal-engine.md`.
     - Принят архитектурный рекорд `docs/decisions/2026-09-06-ADR-003-deterministic-signal-engine.md`.
     - Добавлено 27 тестов (всего в проекте **99 тестов**, 100% PASS).
- **Acceptance Gate**: **PASS** — 7 форм сигналов, аналитическая точность, 30.33 MSPS throughput, 0 утечек памяти, 99 тестов проходят.

---

# Wave 7: Acquisition / ADC Model

- **Status**: DONE
- **Goal**: Реализовать физическую модель входного тракта осциллографа и АЦП с разделением `Signal Source → Analog Front End → ADC → Ring Buffer`, поддержкой логических частот 1, 2, 5 MSPS, независимыми CH1/CH2 и строгой математической верификацией.
- **Implemented**:
  1. **Аналоговый входной тракт (`AnalogFrontEnd`)**:
     - Переключатель связи (Coupling): `GND` ($0.0\text{ В}$), `DC` (гальваническая связь), `AC` (ФВЧ 1-го порядка, $f_c = 10\text{ Гц}$, $\beta = \frac{1}{1 + 2\pi f_c \Delta t}$, блокирующий постоянную составляющую).
     - Аттенюатор проба (Probe Attenuation): $1\text{X}$ ($1.0$), $10\text{X}$ ($0.1$).
     - Масштабирование усиления и смещения: $A_v = \frac{1}{\text{voltsPerDiv}}$, $V_{\text{scaled}} = (V_{\text{probe}} - V_{\text{offset}}) \cdot A_v$.
     - Аналоговое ограничение полосы пропускания (Bandwidth Limiter): однополюсный RC ФНЧ 1-го порядка ($\alpha = \frac{2\pi f_c \Delta t}{1 + 2\pi f_c \Delta t}$), ослабление ровно $-3.01\text{ дБ}$ на частоте среза $f_c$.
     - Тепловой шум входного каскада: аддитивный белый гауссовский шум ($\mathcal{N}(0, \sigma^2)$) на основе преобразования Бокса-Мюллера и PRNG Mulberry32.
     - Насыщение аналоговых рельсов питания (Clipping): жесткое ограничение в диапазоне $[V_{\text{min\_rail}}, V_{\text{max\_rail}}]$.
  2. **Физическая модель АЦП (`ADCModel`)**:
     - Разрешение: конфигурируемое $N \in [8, 16]$ бит (256..65536 уровней квантования).
     - Расчет шага МЗР: $q = \frac{2 V_{\text{FS}}}{2^N}$ ($31.25\text{ мВ}$ для 8 бит при $\pm 4\text{ В}$).
     - Равномерное квантование со средней ступенью (mid-tread) и реконструкцией в середину интервала $V_q = -V_{\text{FS}} + (k + 0.5) \cdot q$.
     - Ограничение погрешности квантования: $|e_q| \le q/2$.
     - Флаги переполнения: `clippedLow` и `clippedHigh`.
     - Поддержка логических частот дискретизации: **1 MSPS, 2 MSPS, 5 MSPS**.
  3. **Независимые каналы сбора (`AcquisitionChannel`, `AcquisitionEngine`)**:
     - Полная изоляция `CH1` и `CH2` (раздельные AFE, АЦП, настройки масштаба, смещения и проба, нулевые перекрестные помехи).
     - Синхронный опрос каналов от общих детерминированных часов `SimulationClock`.
  4. **Кольцевой буфер данных Data Plane (`SampleRingBuffer`)**:
     - Предвыделенный массив `Float32Array` степени двойки (1 048 576 отсчетов).
     - Безветвевая битовая маска индексации (`idx & (capacity - 1)`).
     - Чтение хронологических окон для триггера и децимации без дополнительных аллокаций.
     - Полная изоляция от GPU: данные не передаются напрямую в WebGL/Three.js.
  5. **Верификация и бенчмарки**:
     - 20 математических эталонных тестов (всего **119 тестов** в проекте, 100% PASS).
     - Производительность двухканального тракта: **14.82 MSPS** (67.46 мс на 1 000 000 двухканальных отсчетов) при целевом требовании $\ge 5\text{ MSPS}$.
     - 0 аллокаций памяти в цикле сбора данных.
  6. **Документация для ВКР**:
     - Создан [docs/architecture/acquisition-adc-model.md](file:///c:/diplom/docs/architecture/acquisition-adc-model.md) с полными аналитическими выкладками и уравнениями.
     - Принят [docs/decisions/2026-09-06-ADR-004-acquisition-adc-physical-model.md](file:///c:/diplom/docs/decisions/2026-09-06-ADR-004-acquisition-adc-physical-model.md).
- **Acceptance Gate**: **PASS** — Физический тракт AFE + ADC + RingBuffer полностью реализован, независимые CH1/CH2, 14.82 MSPS throughput, 119 тестов проходят.

---

# Wave 8: Acquisition Worker

- **Status**: DONE
- **Goal**: Перенести непрерывный сгенерированный и оцифрованный поток данных 1–5 MSPS из основного потока в выделенный Web Worker с версионированным протоколом (`INIT`, `START`, `STOP`, `CONFIGURE`, `RESET`, `ERROR`), пакетной передачей через Transferable `ArrayBuffer`, устойчивым жизненным циклом и замером сравнительной производительности.
- **Implemented**:
  1. **Версионированный протокол обмена (`src/workers/acquisition/protocol.ts`)**:
     - Версия протокола `PROTOCOL_VERSION = 1`.
     - Команды (Main $\to$ Worker): `INIT`, `START`, `STOP`, `CONFIGURE`, `RESET`.
     - События (Worker $\to$ Main): `INITIALIZED`, `BATCH_PRODUCED`, `CONFIGURED`, `STATE_CHANGED`, `ERROR`.
     - Строгая валидация структуры сообщений (`validateWorkerCommand`).
  2. **Автономное ядро воркера (`AcquisitionWorkerCore.ts`) и веб-воркер (`acquisition.worker.ts`)**:
     - Включает генераторы сигналов CH1/CH2, аналоговые входные каскады AFE, модели АЦП и детерминированные часы `SimulationClock`.
     - Фоновый таймерный цикл (50 Гц / 60 Гц) генерирует пакеты по 20 000 – 100 000 отсчетов.
     - Передача пакетов через **Transferable `ArrayBuffer`**: $O(1)$ передача владения памятью без копирования и без сериализации JSON.
     - Полная изоляция от DOM для прямого тестирования в среде Vitest/Node.
  3. **Клиентский фасад (`AcquisitionWorkerClient.ts`)**:
     - Управление полным жизненным циклом: `startup` (с таймаутом рукопожатия), `start`, `stop`, `configure`, `reset`, `shutdown`.
     - **Автоматическая ресинхронизация состояния (`state resynchronization`)**: кэширование снимка конфигурации и прозрачное восстановление параметров (частота, формы волны, шкалы В/дел, смещение, частота дискретизации) при перезапуске (`restart`).
     - Обработка ошибок с изоляцией исключений и переходом в состояние `ERROR`.
     - Непрерывный сбор метрик: задержка передачи (latency), пропускная способность (MSPS).
  4. **Интеграция в dev-приложение (`src/main.ts`, `index.html`)**:
     - Добавлен блок управления Acquisition Worker в оверлей HUD (статус, MSPS, latency, кнопки Worker START/STOP и RESTART).
     - Подтверждена стабильная частота отрисовки 60 FPS основного потока без задержек пользовательского интерфейса (Zero UI Freezes).
  5. **Сравнительный анализ и бенчмарки (`main-thread` vs `worker`)**:
     - Время вычислений на основном потоке снижено с ~10 мс до < 0.2 мс (>97% разгрузка основного потока).
     - Накладные расходы передачи пакета: < 0.05 мс.
     - Пропускная способность воркера: 13.8 – 25.0 MSPS.
     - 12 автоматизированных тестов воркера (всего в проекте **131 тест**, 100% PASS).
  6. **Документация**:
     - Создан [docs/architecture/workers-and-wasm.md](file:///c:/diplom/docs/architecture/workers-and-wasm.md).
     - Принят [docs/decisions/2026-09-06-ADR-005-acquisition-worker-protocol.md](file:///c:/diplom/docs/decisions/2026-09-06-ADR-005-acquisition-worker-protocol.md).
- **Acceptance Gate**: **PASS** — Воркер непрерывно генерирует и оцифровывает отсчеты, передача через Transferable ArrayBuffer, UI не блокируется (60 FPS), 131 тест пройден.

---

# Next Wave
- **Wave 9**: Virtual Trigger Engine & Real-Time DSP Decimation (Hardware trigger comparator, Edge/Slope, Holdoff, Peak-Detect / Min-Max decimation for display, multi-channel ring buffer extraction).

