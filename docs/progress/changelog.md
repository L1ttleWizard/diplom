# Project Changelog

## [Wave 1] - 2026-09-06
### Added
- Greenfield repository initialization with Git, TypeScript, and Vitest.
- Layered directory structure: `domain`, `application`, `rendering`, `data`, `workers`, `wasm`, `storage`.
- 8 core domain entities: `Oscilloscope`, `Channel`, `Trigger`, `Acquisition`, `Measurement`, `SignalSource`, `Circuit`, `Experiment`.
- 1-2-5 scale value objects: `TimeDiv` (10ns..5s), `VoltDiv` (1mV..10V).
- Finite State Machine: `OscilloscopeStateMachine` with transitions `IDLE → ARMED → RUNNING → WAITING_TRIGGER → CAPTURED → STOPPED` and `ERROR` handling.
- Typed command model: `RUN`, `STOP`, `SET_TIME_DIV`, `SET_VOLT_DIV`, `SET_TRIGGER_LEVEL`, `SET_TRIGGER_MODE`, `ENABLE_CHANNEL`, `DISABLE_CHANNEL`.
- Domain events and `EventBus` pub/sub implementation.
- Application facade `OscilloscopeService` for command execution and event publishing.
- Architectural boundary checking script `scripts/check-boundaries.mjs`.
- 39 automated unit tests running in pure Node environment without DOM or Three.js.
- Architectural documentation: `domain-model.md`, `control-plane.md`, `runtime-topology.md`.
- Architectural Decision Record: `ADR-001`.
