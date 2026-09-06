import { Oscilloscope3DRuntime } from './rendering/core/Oscilloscope3DRuntime';
import { PerformanceTier } from './rendering/types';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('render-canvas') as HTMLCanvasElement;
  const container = document.getElementById('canvas-container') as HTMLElement;

  if (!canvas || !container) {
    console.error('Canvas or container not found!');
    return;
  }

  // Initialize 3D Runtime
  const runtime = new Oscilloscope3DRuntime({
    canvas,
    container,
    tier: 'HIGH'
  });

  (window as any).__RUNTIME__ = runtime;

  runtime.start();

  // Bind UI Controls
  const btnResetCam = document.getElementById('btn-reset-cam');
  btnResetCam?.addEventListener('click', () => {
    runtime.resetCamera();
  });

  const btnHigh = document.getElementById('btn-tier-high');
  const btnMed = document.getElementById('btn-tier-med');
  const btnLow = document.getElementById('btn-tier-low');

  const setTier = (tier: PerformanceTier) => {
    runtime.setTier(tier);
    btnHigh?.classList.toggle('active', tier === 'HIGH');
    btnMed?.classList.toggle('active', tier === 'MEDIUM');
    btnLow?.classList.toggle('active', tier === 'LOW');
  };

  btnHigh?.addEventListener('click', () => setTier('HIGH'));
  btnMed?.addEventListener('click', () => setTier('MEDIUM'));
  btnLow?.addEventListener('click', () => setTier('LOW'));

  // DPR Controls (Wave 5)
  const btnDpr1 = document.getElementById('btn-dpr-1');
  const btnDpr15 = document.getElementById('btn-dpr-15');
  const btnDpr2 = document.getElementById('btn-dpr-2');

  const setDpr = (dpr: number) => {
    runtime.setDisplayDpr(dpr);
    btnDpr1?.classList.toggle('active', dpr === 1.0);
    btnDpr15?.classList.toggle('active', dpr === 1.5);
    btnDpr2?.classList.toggle('active', dpr === 2.0);
  };

  btnDpr1?.addEventListener('click', () => setDpr(1.0));
  btnDpr15?.addEventListener('click', () => setDpr(1.5));
  btnDpr2?.addEventListener('click', () => setDpr(2.0));

  // Dynamic Layer Toggles (Wave 5)
  let cursorsEnabled = false;
  const btnToggleCursors = document.getElementById('btn-toggle-cursors');
  btnToggleCursors?.addEventListener('click', () => {
    cursorsEnabled = !cursorsEnabled;
    runtime.toggleCursors(cursorsEnabled);
    if (btnToggleCursors) {
      btnToggleCursors.textContent = `Cursors: ${cursorsEnabled ? 'ON' : 'OFF'}`;
      btnToggleCursors.classList.toggle('active', cursorsEnabled);
    }
  });

  let measEnabled = true;
  const btnToggleMeas = document.getElementById('btn-toggle-meas');
  btnToggleMeas?.addEventListener('click', () => {
    measEnabled = !measEnabled;
    runtime.toggleMeasurements(measEnabled);
    if (btnToggleMeas) {
      btnToggleMeas.textContent = `Measure: ${measEnabled ? 'ON' : 'OFF'}`;
      btnToggleMeas.classList.toggle('active', measEnabled);
    }
  });

  // RUN / STOP Toggle Button
  const btnRunStop = document.getElementById('btn-run-stop');
  btnRunStop?.addEventListener('click', () => {
    const currentState = runtime.service.getState();
    if (currentState === 'STOPPED' || currentState === 'IDLE') {
      runtime.service.executeCommand({ type: 'RUN' });
      if (btnRunStop) {
        btnRunStop.style.background = '#238636';
      }
    } else {
      runtime.service.executeCommand({ type: 'STOP' });
      if (btnRunStop) {
        btnRunStop.style.background = '#da3633';
      }
    }
  });

  // Metrics HUD updater (every 250ms)
  const valFps = document.getElementById('val-fps');
  const valFrameTime = document.getElementById('val-frame-time');
  const valPercentiles = document.getElementById('val-percentiles');
  const valDrawCalls = document.getElementById('val-draw-calls');
  const valTriangles = document.getElementById('val-triangles');

  setInterval(() => {
    const metrics = runtime.getMetrics();
    if (valFps) valFps.textContent = `${metrics.fps}`;
    if (valFrameTime) valFrameTime.textContent = `${metrics.frameTimeMs} ms`;
    if (valPercentiles) {
      valPercentiles.textContent = `${metrics.frameTimeP50} / ${metrics.frameTimeP95} / ${metrics.frameTimeP99} ms`;
    }
    if (valDrawCalls) valDrawCalls.textContent = `${metrics.drawCalls}`;
    if (valTriangles) valTriangles.textContent = `${metrics.triangles.toLocaleString()}`;
  }, 250);
});
