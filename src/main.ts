import { Oscilloscope3DRuntime } from './rendering/core/Oscilloscope3DRuntime';
import { PerformanceTier } from './rendering/types';
import { AcquisitionWorkerClient } from './workers';
import { SharedMemoryCapability } from './data/shared/SharedMemoryCapability';

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

  // Wave 8: Acquisition Worker Client Integration
  const workerClient = new AcquisitionWorkerClient();
  (window as any).__WORKER_CLIENT__ = workerClient;

  const valWorkerStatus = document.getElementById('val-worker-status');
  const valWorkerMsps = document.getElementById('val-worker-msps');
  const valWorkerLatency = document.getElementById('val-worker-latency');
  const btnWorkerToggle = document.getElementById('btn-worker-toggle');
  const btnWorkerRestart = document.getElementById('btn-worker-restart');

  workerClient
    .startup({
      sampleRate: 2_000_000,
      batchSize: 20_000,
      intervalMs: 20,
      ch1: { waveform: 'SINE', frequency: 1000, amplitude: 2.0 },
      ch2: { waveform: 'SQUARE', frequency: 5000, amplitude: 3.0 }
    })
    .then(() => {
      console.log('[Main] Acquisition Worker successfully initialized.');
      if (valWorkerStatus) valWorkerStatus.textContent = 'IDLE';
    })
    .catch((err) => {
      console.error('[Main] Failed to initialize worker:', err);
      if (valWorkerStatus) valWorkerStatus.textContent = 'ERROR';
    });

  workerClient.onStateChange((state) => {
    if (valWorkerStatus) valWorkerStatus.textContent = state;
    if (btnWorkerToggle) {
      if (state === 'RUNNING') {
        btnWorkerToggle.textContent = 'Worker: STOP';
        btnWorkerToggle.style.background = '#da3633';
      } else {
        btnWorkerToggle.textContent = 'Worker: START';
        btnWorkerToggle.style.background = '#1f6feb';
      }
    }
  });

  btnWorkerToggle?.addEventListener('click', () => {
    if (workerClient.state === 'RUNNING') {
      workerClient.stop();
    } else {
      workerClient.start();
    }
  });

  btnWorkerRestart?.addEventListener('click', async () => {
    if (valWorkerStatus) valWorkerStatus.textContent = 'RESTARTING...';
    await workerClient.restart();
  });

  // Wave 10 HUD Elements
  const valTransportMode = document.getElementById('val-transport-mode');
  const valCoopStatus = document.getElementById('val-coop-status');
  const capability = SharedMemoryCapability.check();
  if (valCoopStatus) {
    valCoopStatus.textContent = capability.crossOriginIsolated ? 'ISOLATED' : 'NON-ISOLATED';
    valCoopStatus.style.color = capability.crossOriginIsolated ? '#3fb950' : '#d29922';
  }

  // Metrics HUD elements
  const valFps = document.getElementById('val-fps');
  const valFrameTime = document.getElementById('val-frame-time');
  const valPercentiles = document.getElementById('val-percentiles');
  const valDrawCalls = document.getElementById('val-draw-calls');
  const valTriangles = document.getElementById('val-triangles');

  // Test Bench HUD Elements
  const valTbSignal = document.getElementById('val-tb-signal');
  const valTbScales = document.getElementById('val-tb-scales');
  const valTbWindow = document.getElementById('val-tb-window');
  const valTbTrigger = document.getElementById('val-tb-trigger');

  setInterval(() => {
    const metrics = runtime.getMetrics();
    if (valFps) valFps.textContent = `${metrics.fps}`;
    if (valFrameTime) valFrameTime.textContent = `${metrics.frameTimeMs} ms`;
    if (valPercentiles) {
      valPercentiles.textContent = `${metrics.frameTimeP50} / ${metrics.frameTimeP95} / ${metrics.frameTimeP99} ms`;
    }
    if (valDrawCalls) valDrawCalls.textContent = `${metrics.drawCalls}`;
    if (valTriangles) valTriangles.textContent = `${metrics.triangles.toLocaleString()}`;

    if (valTransportMode) {
      if (workerClient.dataPlaneMode === 'SHARED_ARRAY_BUFFER') {
        valTransportMode.textContent = 'SharedArrayBuffer (Zero-GC)';
        valTransportMode.style.color = '#3fb950';
      } else {
        valTransportMode.textContent = 'Message-Passing (Fallback)';
        valTransportMode.style.color = '#58a6ff';
      }
    }

    if (valWorkerMsps) {
      const msps = workerClient.rollingThroughputMsps;
      valWorkerMsps.textContent = msps > 0 ? `${msps.toFixed(2)} MSPS` : '--';
    }
    if (valWorkerLatency) {
      const lat = workerClient.latestLatencyMs;
      valWorkerLatency.textContent = lat > 0 ? `${lat.toFixed(2)} ms` : '--';
    }

    // Test Bench Telemetry
    const tb = runtime.getTestBenchTelemetry();
    if (valTbSignal) {
      valTbSignal.textContent = `${(tb.frequency / 1000).toFixed(2)} kHz / ${tb.amplitude.toFixed(2)} V`;
    }
    if (valTbScales) {
      const tStr = tb.timeDiv >= 1 ? `${tb.timeDiv.toFixed(1)}s` : tb.timeDiv >= 1e-3 ? `${(tb.timeDiv * 1e3).toFixed(1)}ms` : `${(tb.timeDiv * 1e6).toFixed(0)}µs`;
      const vStr = tb.voltsDiv >= 1 ? `${tb.voltsDiv.toFixed(1)}V` : `${(tb.voltsDiv * 1e3).toFixed(0)}mV`;
      valTbScales.textContent = `${tStr}/div | ${vStr}/div`;
    }
    if (valTbWindow) {
      const wMs = tb.visibleTimeWindow * 1e3;
      const wPts = Math.round(tb.visibleTimeWindow * tb.sampleRate);
      valTbWindow.textContent = `${wMs >= 1 ? wMs.toFixed(2) + ' ms' : (wMs * 1e3).toFixed(1) + ' µs'} (${wPts.toLocaleString()} pts)`;
    }
    if (valTbTrigger) {
      valTbTrigger.textContent = `CH1 @ ${tb.triggerLevel >= 0 ? '+' : ''}${tb.triggerLevel.toFixed(2)}V [${tb.triggered ? 'LOCK' : 'AUTO'}]`;
      valTbTrigger.style.color = tb.triggered ? '#3fb950' : '#d29922';
    }
  }, 250);
});

