# Virtual Oscilloscope Display Architecture

## 1. Overview & Core Philosophy

The oscilloscope display is a specialized, embedded rendering subsystem inside the 3D digital twin. In compliance with **GEMINI.md Rule 5** and **Rule 2.6**:
* The oscilloscope screen is rendered **directly inside the 3D mesh**, not via HTML/DOM overlays.
* The high-frequency waveform and display buffer are separated from React state.
* The display subsystem renders to an off-screen GPU frame buffer / render target and maps the resulting texture directly onto the screen geometry of the 3D model.

```
┌─────────────────────────────────────────────────────────────┐
│                       Display Engine                        │
├──────────────────────────────┬──────────────────────────────┤
│        Static Layer          │        Dynamic Layer         │
│  - Background & Graticule    │  - Waveform (CH1, CH2)       │
│  - Center axes & tick marks  │  - Trigger marker & level    │
│  - Channel readouts (V/div)  │  - Status indicators         │
│  - Timebase readout (T/div)  │  - Measurements table        │
└──────────────────────────────┴──────────────────────────────┘
                               │
                               ▼
               GPU Render Target / Offscreen Canvas
                     (1024 x 640 Texture)
                               │
                               ▼
               Three.js CanvasTexture / Mesh Material
                 (screenMesh.material.map / emissive)
                               │
                               ▼
                 3D Lab Scene (Perspective Projection)
```

---

## 2. Coordinate Systems

To avoid ambiguity and ensure accurate positioning across physical 3D space and virtual screen pixels, three coordinate spaces are formally defined:

### 2.1. Display Coordinates (`DisplayCoord`)
- **Origin**: Top-left corner `(0, 0)` in pixels.
- **Range**: `[0, width]` horizontal, `[0, height]` vertical. Standard default is `1024 x 640`.
- **Use Case**: Graticule layout, text readouts, status badges, and sample-to-pixel mapping.

### 2.2. Screen-Local Coordinates (`ScreenLocalCoord`)
- **Origin**: Geometric center `(0, 0, 0)` of the physical display quad in the 3D model.
- **Range**: `[-w/2, +w/2]` on X-axis, `[-h/2, +h/2]` on Y-axis (meters/scene units).
- **Use Case**: Mapping UV coordinates `(u, v) ∈ [0, 1]` to the local 3D planar surface of the screen mesh.

### 2.3. World Coordinates (`Vector3`)
- **Origin**: World origin `(0, 0, 0)` of the lab room.
- **Computation**: Local coordinate transformed by `screenMesh.matrixWorld`.
- **Use Case**: Raycasting from the user's cursor/pointer through the main 3D camera to interact with on-screen softkeys or probe connection terminals.

### Coordinate Transform Equations:
$$\text{UV}_x = \frac{x_{\text{display}}}{W_{\text{display}}}, \quad \text{UV}_y = 1.0 - \frac{y_{\text{display}}}{H_{\text{display}}}$$
$$x_{\text{local}} = \left(\text{UV}_x - 0.5\right) \cdot W_{\text{mesh}}, \quad y_{\text{local}} = \left(\text{UV}_y - 0.5\right) \cdot H_{\text{mesh}}$$

---

## 3. Render Pipeline (`DisplayRenderTarget`)

The display texture pipeline operates independently of the main scene camera:

1. **Offscreen Buffer**: A canvas / render target buffer of fixed dimensions ($1024 \times 640$, aspect ratio 1.6:1).
2. **Double Buffering / Direct Texture Upload**:
   - The display engine renders static and dynamic elements into the buffer.
   - A `THREE.CanvasTexture` with `minFilter = THREE.LinearFilter`, `magFilter = THREE.LinearFilter`, and `colorSpace = THREE.SRGBColorSpace` holds the active frame.
   - `texture.needsUpdate = true` is invoked only when dynamic elements update or state changes.
3. **Screen Mesh Material Binding**:
   - The screen mesh material (`MeshStandardMaterial`) uses the texture for both `map` (diffuse) and `emissiveMap` (self-illumination).
   - `emissive = 0xffffff`, `emissiveIntensity = 0.85`, `roughness = 0.15`, `metalness = 0.05` to realistically simulate an active backlit LCD display under laboratory lighting.
4. **Camera Invariance**:
   - Because the texture is mapped directly to the UVs of the 3D quad, the display remains fully integrated and distortion-free regardless of orbit, pan, or zoom of the main scene camera.

---

## 4. Graticule & Visual Structure

The screen follows the standard IEEE/IEC oscilloscope graticule format:
* **Grid**: 10 horizontal divisions $\times$ 8 vertical divisions.
* **Division Pitch**:
  - Horizontal pitch: $\Delta X = W / 10 = 102.4\text{ px}$.
  - Vertical pitch: $\Delta Y = H / 8 = 80.0\text{ px}$.
* **Crosshairs & Sub-divisions**:
  - Center horizontal and vertical axes feature 5 sub-divisions per major division.
  - Tick mark height: 4 px (sub-ticks) and 8 px (major axis markers).
* **Color Scheme**:
  - Background: Dark CRT/LCD phosphor tint (`#0a0f14`).
  - Grid lines: Subdued cyan-gray (`rgba(38, 64, 80, 0.45)`).
  - Center axes: High-contrast dotted line (`rgba(56, 120, 150, 0.75)`).

---

## 5. Waveform & Diagnostic Test Pattern

In Wave 4, prior to the high-frequency DSP pipeline (Wave 5+), a calibrated diagnostic test pattern is embedded to verify rendering fidelity, zero-allocation cycles, and state responsiveness:

1. **Center Test Line**: Reference zero-volt ground line.
2. **Dynamic Signal Simulation**:
   $$V(t, x) = A \cdot \sin(2\pi f x + \phi(t)) + A_{\text{harm}} \cdot \cos(4\pi f x - \phi(t))$$
   - Animated phase $\phi(t)$ running at 60 FPS.
   - Displays real-time status in `RUN` mode, and freezes immediately when `STOP` command is dispatched.
3. **Trigger Marker**:
   - Displays a dynamic trigger level arrow (`T ▶`) on the right graticule edge.
   - Real-time readout of trigger mode (`AUTO / NORM / SINGLE`), state badge (`RUN` in `#00e676` / `STOP` in `#ff1744`), timebase (`1.00 ms`), and CH1 sensitivity (`1.00 V/div`).

---

## 6. Performance Characteristics

- **Zero Per-Frame Allocations**: Line buffers, strings, and path objects are reused.
- **Draw Call Overhead**: Adds exactly 0 additional 3D scene draw calls for the display itself; it updates the bound texture of the existing `oscilloscope_screen` mesh.
- **GPU Fill Rate**: Single $1024 \times 640$ 2D surface blit to VRAM.
