# 3D Oscilloscope Physical Interaction Architecture

## 1. Overview & Core Philosophy

In compliance with **GEMINI.md Rule 1, 4, 10**:
1. **Separation of Concerns**: The 3D model is purely a visual and interactive representation (adapter) of the underlying domain model.
2. **Three.js is NOT the Source of Truth**: The domain (`Oscilloscope`, `Channel`, `Trigger`) owns all operational state. Three.js meshes reflect state changes broadcast by domain events.
3. **No Direct Mutation**: User interactions (clicks, drags) do not directly mutate 3D object transforms or domain properties. They generate strongly-typed **Commands** sent to the `OscilloscopeService`.

```
 User Pointer (Mouse / Touch)
             │
             ▼
      RaycastManager
             │ (NDC raycasting against targets)
             ▼
     InteractionTarget (STABLE_IDS: osc.knob.time, osc.button.run, ...)
             │
             ▼
OscilloscopeInteractionAdapter
             │
             ▼ (Dispatches typed command)
    OscilloscopeService
             │
             ▼ (Validates & mutates aggregate root)
     Domain State Machine & Entities
             │
             ▼ (Publishes domain event)
         EventBus
             │
             ▼ (Subscribed by adapter)
3D Mesh Transform Update (e.g. knob.rotation.z = calculateAngle(event))
```

---

## 2. Stable Identifiers (`STABLE_IDS`)

To isolate interaction logic from arbitrary 3D asset naming or hierarchy restructuring, all interactive components are assigned stable semantic identifiers:

| Stable ID | Component Type | Physical Description | Domain Command Generated |
| :--- | :--- | :--- | :--- |
| `osc.body` | Structural | Main oscilloscope chassis | None (passive collision) |
| `osc.screen` | Display | Embedded LCD display surface | Optional touch cursor/markers |
| `osc.knob.time` | Rotary Knob | Horizontal timebase scale | `SET_TIME_DIV` |
| `osc.knob.voltage` | Rotary Knob | Vertical sensitivity (CH1) | `SET_VOLT_DIV` |
| `osc.button.run` | Momentary Button | RUN acquisition trigger | `RUN` |
| `osc.button.stop` | Momentary Button | STOP acquisition trigger | `STOP` |
| `osc.channel.ch1` | Toggle Button | CH1 enable/disable toggle | `ENABLE_CHANNEL` / `DISABLE_CHANNEL` |
| `osc.channel.ch2` | Toggle Button | CH2 enable/disable toggle | `ENABLE_CHANNEL` / `DISABLE_CHANNEL` |
| `osc.input.ch1` | BNC Terminal | CH1 physical probe connector | Circuit probe connection |
| `osc.input.ch2` | BNC Terminal | CH2 physical probe connector | Circuit probe connection |
| `osc.trigger.level`| Rotary Knob | Trigger threshold potentiometer | `SET_TRIGGER_LEVEL` |
| `osc.trigger.mode` | Selector Button| Trigger mode cycler | `SET_TRIGGER_MODE` |

---

## 3. Interaction Pipeline

### 3.1. Raycasting & Hit Testing (`RaycastManager`)
- Normalizes pointer coordinates to Normalized Device Coordinates (NDC):
  $$x_{\text{ndc}} = \frac{2 \cdot x_{\text{clientX}}}{\text{viewportWidth}} - 1, \quad y_{\text{ndc}} = 1 - \frac{2 \cdot y_{\text{clientY}}}{\text{viewportHeight}}$$
- Casts a ray using `THREE.Raycaster` against registered `InteractionTarget` bounding volumes.
- Emits high-level lifecycle events: `hover-enter`, `hover-exit`, `click`, `drag-start`, `drag-move`, `drag-end`.

### 3.2. Rotary Knobs: Drag to Command Translation
Rotary knobs use normalized vertical pointer motion:
1. `drag-start`: Records pointer start position and locks interaction target.
2. `drag-move`: Computes accumulated vertical delta:
   $$\Delta_{\text{norm}} = \frac{\Delta y}{\text{dragSensitivity}}$$
3. When accumulated delta crosses a discrete step threshold, the adapter computes the next valid 1-2-5 scale value (via `TimeDiv.next()` / `TimeDiv.previous()` or `VoltDiv.next()` / `VoltDiv.previous()`).
4. Dispatches the corresponding command:
   ```typescript
   service.executeCommand({
     type: 'SET_TIME_DIV',
     timeDiv: nextTimeDiv.value
   });
   ```

### 3.3. Button Interactions
Push buttons detect `pointerup` on the same target that received `pointerdown` (click). Upon click:
1. Momentary visual depression animation (handled locally in adapter).
2. Immediate dispatch of the typed command (`RUN`, `STOP`, `ENABLE_CHANNEL`, etc.).

---

## 4. Unidirectional State Synchronization (The Invariant)

**Fundamental Rule**: Dragging a knob does **NOT** rotate the knob.

The rotation angle $\theta$ of a knob is computed strictly upon receiving a domain event:
$$\theta_{\text{time}} = \frac{\text{index}(\text{TimeDiv})}{\text{totalSteps}} \cdot \theta_{\text{range}} - \frac{\theta_{\text{range}}}{2}$$

```typescript
eventBus.subscribe('TIME_DIV_CHANGED', (event) => {
  const index = TimeDiv.STANDARD_VALUES.indexOf(event.timeDiv);
  if (index >= 0) {
    const angle = (index / (TimeDiv.STANDARD_VALUES.length - 1) - 0.5) * Math.PI * 1.5;
    knobMesh.rotation.z = angle;
  }
});
```

Benefits:
- If the domain rejects an invalid transition or value, the 3D knob cannot move.
- External command sources (scripts, automation, remote workers) automatically update the 3D visual state without custom glue code.
- Zero state desynchronization between 3D scene and domain logic.
