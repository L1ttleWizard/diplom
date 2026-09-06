import { DisplayStateSnapshot, CursorState, MeasurementItem } from './types';

export class DynamicDisplayLayer {
  private _animTime: number = 0;

  // Default measurement set if none provided
  private readonly _defaultMeasurements: MeasurementItem[] = [
    { name: 'Vpp(1)', value: '3.24 V', channel: 'CH1' },
    { name: 'Vrms(1)', value: '1.15 V', channel: 'CH1' },
    { name: 'Freq(1)', value: '1.00 kHz', channel: 'CH1' },
    { name: 'Period(1)', value: '1.00 ms', channel: 'CH1' }
  ];

  public render(
    ctx: CanvasRenderingContext2D,
    state: DisplayStateSnapshot | undefined,
    bounds: { left: number; top: number; width: number; height: number },
    viewportWidth: number,
    viewportHeight: number,
    deltaMs: number = 16.67
  ): void {
    const isRunning =
      !state ||
      state.state === 'RUNNING' ||
      state.state === 'WAITING_TRIGGER' ||
      state.state === 'ARMED';

    if (isRunning) {
      this._animTime += deltaMs * 0.001;
    }

    const { left, top, width: gw, height: gh } = bounds;

    // 1. Dynamic Waveform (Diagnostic test signal or channel waveform)
    this.renderWaveform(ctx, state, left, top, gw, gh);

    // 2. Trigger level marker & threshold line
    this.renderTrigger(ctx, state, left, top, gw, gh);

    // 3. Time & Voltage Cursors
    if (state?.cursors) {
      this.renderCursors(ctx, state.cursors, left, top, gw, gh);
    }

    // 4. Measurements HUD Overlay
    this.renderMeasurements(ctx, state?.measurements ?? this._defaultMeasurements, left, top, gw, gh);

    // 5. Header Dynamic Badges & Readouts
    this.renderHeader(ctx, state, left, top, viewportWidth);

    // 6. Footer Dynamic Channel Values
    this.renderFooter(ctx, state, left, top + gh, viewportWidth);
  }

  private renderWaveform(
    ctx: CanvasRenderingContext2D,
    _state: DisplayStateSnapshot | undefined,
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    const centerY = top + gh / 2;
    const divY = gh / 8;

    // Reference calibrated line
    const refY = centerY - divY * 2;
    ctx.strokeStyle = 'rgba(230, 126, 34, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(left, refY);
    ctx.lineTo(left + gw, refY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(230, 126, 34, 0.85)';
    ctx.font = '11px monospace';
    ctx.fillText('REF CALIB +2.0V', left + 10, refY - 6);

    // Dynamic sine wave
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const points = 240;
    const speed = this._animTime * 2.5;

    for (let i = 0; i <= points; i++) {
      const frac = i / points;
      const x = left + frac * gw;
      const y = centerY - Math.sin(frac * Math.PI * 6 - speed) * divY * 2.5;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Moving test indicator
    const markerFrac = (this._animTime * 0.3) % 1.0;
    const markerX = left + markerFrac * gw;
    const markerY = centerY - Math.sin(markerFrac * Math.PI * 6 - speed) * divY * 2.5;

    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(markerX, markerY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  private renderTrigger(
    ctx: CanvasRenderingContext2D,
    state: DisplayStateSnapshot | undefined,
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    const centerY = top + gh / 2;
    const divY = gh / 8;

    // Trigger level position (in divisions: 8 divisions total, range ±4 divisions)
    const voltDiv = state?.ch1VoltDivValue ?? 1.0;
    const trigLevel = state?.triggerLevelValue ?? 0.0;
    const divOffset = trigLevel / voltDiv; // how many divisions above/below center
    const clampedOffset = Math.max(-4, Math.min(4, divOffset));
    const trigY = centerY - clampedOffset * divY;

    // Dashed trigger threshold line across graticule
    ctx.strokeStyle = 'rgba(255, 179, 0, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(left, trigY);
    ctx.lineTo(left + gw, trigY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Trigger marker arrow on right edge: 'T ▶'
    const rightX = left + gw;
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(rightX + 1, trigY);
    ctx.lineTo(rightX + 8, trigY - 5);
    ctx.lineTo(rightX + 8, trigY + 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('T', rightX + 10, trigY + 4);
  }

  private renderCursors(
    ctx: CanvasRenderingContext2D,
    cursors: Partial<CursorState>,
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    const timeCursor = cursors.timeCursor;
    const voltCursor = cursors.voltageCursor;

    // 1. Time Cursors (Vertical Lines A & B)
    if (timeCursor && timeCursor.enabled) {
      const fracA = Math.max(0, Math.min(1, timeCursor.timeA));
      const fracB = Math.max(0, Math.min(1, timeCursor.timeB));
      const xA = left + fracA * gw;
      const xB = left + fracB * gw;

      ctx.lineWidth = 1.0;
      ctx.setLineDash([4, 2]);

      // Cursor A
      ctx.strokeStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(xA, top);
      ctx.lineTo(xA, top + gh);
      ctx.stroke();

      // Cursor B
      ctx.strokeStyle = '#e040fb';
      ctx.beginPath();
      ctx.moveTo(xB, top);
      ctx.lineTo(xB, top + gh);
      ctx.stroke();

      ctx.setLineDash([]);

      // Readout badge for time cursors
      const deltaFrac = Math.abs(fracB - fracA);
      // Assuming 10 divisions across screen, e.g. 1.00 ms/div -> total 10.0 ms
      const deltaStr = `${(deltaFrac * 10).toFixed(2)} div`;

      ctx.fillStyle = 'rgba(10, 20, 30, 0.85)';
      ctx.fillRect(left + 8, top + 8, 160, 42);
      ctx.strokeStyle = '#00e5ff';
      ctx.strokeRect(left + 8, top + 8, 160, 42);

      ctx.fillStyle = '#00e5ff';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`Cur A: ${(fracA * 10).toFixed(2)} div`, left + 14, top + 22);
      ctx.fillStyle = '#e040fb';
      ctx.fillText(`Cur B: ${(fracB * 10).toFixed(2)} div`, left + 14, top + 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Δt: ${deltaStr}`, left + 14, top + 46);
    }

    // 2. Voltage Cursors (Horizontal Lines 1 & 2)
    if (voltCursor && voltCursor.enabled) {
      const centerY = top + gh / 2;
      const divY = gh / 8;
      const y1 = centerY - voltCursor.voltageA * divY;
      const y2 = centerY - voltCursor.voltageB * divY;

      ctx.lineWidth = 1.0;
      ctx.setLineDash([4, 2]);

      ctx.strokeStyle = '#ffeb3b';
      ctx.beginPath();
      ctx.moveTo(left, y1);
      ctx.lineTo(left + gw, y1);
      ctx.stroke();

      ctx.strokeStyle = '#ff9800';
      ctx.beginPath();
      ctx.moveTo(left, y2);
      ctx.lineTo(left + gw, y2);
      ctx.stroke();

      ctx.setLineDash([]);

      const deltaV = Math.abs(voltCursor.voltageB - voltCursor.voltageA);
      ctx.fillStyle = 'rgba(10, 20, 30, 0.85)';
      ctx.fillRect(left + gw - 150, top + 8, 142, 42);
      ctx.strokeStyle = '#ffeb3b';
      ctx.strokeRect(left + gw - 150, top + 8, 142, 42);

      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`V1: ${voltCursor.voltageA.toFixed(2)} V`, left + gw - 144, top + 22);
      ctx.fillStyle = '#ff9800';
      ctx.fillText(`V2: ${voltCursor.voltageB.toFixed(2)} V`, left + gw - 144, top + 34);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`ΔV: ${deltaV.toFixed(2)} V`, left + gw - 144, top + 46);
    }
  }

  private renderMeasurements(
    ctx: CanvasRenderingContext2D,
    measurements: MeasurementItem[],
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    if (!measurements || measurements.length === 0) return;

    // Measurement table HUD in bottom-left corner of graticule
    const boxW = 340;
    const boxH = 26;
    const boxX = left + 6;
    const boxY = top + gh - boxH - 6;

    ctx.fillStyle = 'rgba(8, 16, 24, 0.85)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = 'rgba(40, 80, 110, 0.7)';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.font = '11px monospace';
    let offsetX = boxX + 8;

    for (const m of measurements) {
      ctx.fillStyle = m.channel === 'CH1' ? '#f1c40f' : '#00d2d3';
      ctx.fillText(`${m.name}: `, offsetX, boxY + 17);
      offsetX += ctx.measureText(`${m.name}: `).width;

      ctx.fillStyle = '#ffffff';
      ctx.fillText(`${m.value}  `, offsetX, boxY + 17);
      offsetX += ctx.measureText(`${m.value}  `).width;
    }
  }

  private renderHeader(
    ctx: CanvasRenderingContext2D,
    state: DisplayStateSnapshot | undefined,
    left: number,
    _top: number,
    _viewportWidth: number
  ): void {
    const oscState = state?.state ?? 'RUNNING';
    const isRunning = oscState === 'RUNNING' || oscState === 'WAITING_TRIGGER' || oscState === 'ARMED';

    // State Badge (RUN / STOP)
    const badgeColor = isRunning ? '#27ae60' : '#c0392b';
    ctx.fillStyle = badgeColor;
    ctx.fillRect(left, 12, 60, 24);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isRunning ? 'RUN' : 'STOP', left + 30, 29);
    ctx.textAlign = 'left';

    // Trigger Mode
    ctx.fillStyle = '#8fa0b3';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Trig: ${state?.triggerMode ?? 'AUTO'}`, left + 75, 29);

    // Timebase Readout
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`M: ${state?.timeDivStr ?? '1.00ms'}`, left + 220, 29);

    // Sample Rate Readout
    ctx.fillStyle = '#8fa0b3';
    ctx.font = '12px monospace';
    ctx.fillText(`Rate: ${state?.sampleRateStr ?? '2.00 MS/s'}`, left + 420, 29);
  }

  private renderFooter(
    ctx: CanvasRenderingContext2D,
    state: DisplayStateSnapshot | undefined,
    left: number,
    footerTop: number,
    _viewportWidth: number
  ): void {
    const bottom = footerTop + 10;

    // CH1 Readout Badge
    const ch1Active = state?.ch1Enabled ?? true;
    ctx.fillStyle = ch1Active ? '#f1c40f' : '#555555';
    ctx.fillRect(left, bottom, 20, 22);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('1', left + 6, bottom + 16);

    ctx.fillStyle = ch1Active ? '#f1c40f' : '#666666';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${state?.ch1VoltDivStr ?? '1.00V'} DC`, left + 26, bottom + 16);

    // CH2 Readout Badge
    const ch2Active = state?.ch2Enabled ?? false;
    const ch2Left = left + 160;
    ctx.fillStyle = ch2Active ? '#00d2d3' : '#333333';
    ctx.fillRect(ch2Left, bottom, 20, 22);

    ctx.fillStyle = ch2Active ? '#000000' : '#888888';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('2', ch2Left + 6, bottom + 16);

    ctx.fillStyle = ch2Active ? '#00d2d3' : '#555555';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${state?.ch2VoltDivStr ?? '1.00V'} DC`, ch2Left + 26, bottom + 16);

    // Trigger level readout
    ctx.fillStyle = '#8fa0b3';
    ctx.font = '12px monospace';
    ctx.fillText(`Trigger: ${state?.triggerLevelStr ?? 'CH1 0.00V'}`, left + 340, bottom + 16);
  }
}
