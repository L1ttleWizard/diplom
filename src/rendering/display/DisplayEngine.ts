import { DisplayRenderTarget } from './DisplayRenderTarget';
import { DisplayCoordinates } from './DisplayCoordinates';

export interface DisplayStateSnapshot {
  state: 'IDLE' | 'ARMED' | 'RUNNING' | 'WAITING_TRIGGER' | 'CAPTURED' | 'STOPPED' | 'ERROR';
  timeDivStr: string;
  ch1Enabled: boolean;
  ch1VoltDivStr: string;
  ch2Enabled: boolean;
  ch2VoltDivStr: string;
  triggerMode: string;
  triggerLevelStr: string;
  sampleRateStr: string;
}

export class DisplayEngine {
  public readonly renderTarget: DisplayRenderTarget;
  public readonly coordinates: DisplayCoordinates;

  private _testPatternTime: number = 0;

  // Grid margins in pixels
  private readonly _gridLeft: number = 40;
  private readonly _gridTop: number = 48;
  private readonly _gridWidth: number;
  private readonly _gridHeight: number;

  constructor(renderTarget?: DisplayRenderTarget) {
    this.renderTarget = renderTarget ?? new DisplayRenderTarget({ width: 1024, height: 640 });
    this.coordinates = new DisplayCoordinates(this.renderTarget.width, this.renderTarget.height);

    this._gridWidth = this.renderTarget.width - this._gridLeft * 2;
    this._gridHeight = this.renderTarget.height - this._gridTop - 48;
  }

  public render(state?: DisplayStateSnapshot, deltaMs: number = 16.67): void {
    const ctx = this.renderTarget.ctx;
    if (!ctx || !ctx.fillRect) return; // In headless tests where ctx is mocked

    const w = this.renderTarget.width;
    const h = this.renderTarget.height;
    this._testPatternTime += deltaMs * 0.001;

    // 1. Background
    ctx.fillStyle = '#060a0f';
    ctx.fillRect(0, 0, w, h);

    // 2. Graticule Grid (10x8 divisions)
    this.renderGrid(ctx);

    // 3. Diagnostic Test Pattern
    this.renderDiagnosticTestPattern(ctx);

    // 4. Header Bar
    this.renderHeader(ctx, state);

    // 5. Footer Bar (Channels and Trigger)
    this.renderFooter(ctx, state);

    // 6. Mark render target dirty for GPU upload
    this.renderTarget.markDirty();
    this.renderTarget.updateTexture();
  }

  private renderGrid(ctx: CanvasRenderingContext2D): void {
    const left = this._gridLeft;
    const top = this._gridTop;
    const gw = this._gridWidth;
    const gh = this._gridHeight;

    // Grid background
    ctx.fillStyle = '#080e14';
    ctx.fillRect(left, top, gw, gh);

    // Grid outer border
    ctx.strokeStyle = '#1e384d';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(left, top, gw, gh);

    // Internal divisions: 10 horizontal divisions, 8 vertical divisions
    const divX = gw / 10;
    const divY = gh / 8;

    ctx.strokeStyle = 'rgba(25, 65, 90, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]); // Dotted grid lines

    // Vertical grid lines
    for (let i = 1; i < 10; i++) {
      const x = left + i * divX;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + gh);
      ctx.stroke();
    }

    // Horizontal grid lines
    for (let j = 1; j < 8; j++) {
      const y = top + j * divY;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + gw, y);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset line dash

    // Center Crosshairs (Subdivided with 0.2 div calibration ticks)
    const centerX = left + gw / 2;
    const centerY = top + gh / 2;

    ctx.strokeStyle = '#2b587a';
    ctx.lineWidth = 1;

    // Center vertical axis
    ctx.beginPath();
    ctx.moveTo(centerX, top);
    ctx.lineTo(centerX, top + gh);
    ctx.stroke();

    // Center horizontal axis
    ctx.beginPath();
    ctx.moveTo(left, centerY);
    ctx.lineTo(left + gw, centerY);
    ctx.stroke();

    // Sub-ticks on center axes (5 ticks per division = 0.2 div)
    const tickLen = 4;
    ctx.strokeStyle = 'rgba(50, 110, 150, 0.7)';

    for (let i = 0; i <= 50; i++) {
      const x = left + (i * gw) / 50;
      ctx.beginPath();
      ctx.moveTo(x, centerY - tickLen);
      ctx.lineTo(x, centerY + tickLen);
      ctx.stroke();
    }

    for (let j = 0; j <= 40; j++) {
      const y = top + (j * gh) / 40;
      ctx.beginPath();
      ctx.moveTo(centerX - tickLen, y);
      ctx.lineTo(centerX + tickLen, y);
      ctx.stroke();
    }
  }

  private renderDiagnosticTestPattern(ctx: CanvasRenderingContext2D): void {
    const left = this._gridLeft;
    const top = this._gridTop;
    const gw = this._gridWidth;
    const gh = this._gridHeight;
    const centerY = top + gh / 2;

    // 1. Static calibrated reference line (at +2 divisions = 0.5 amplitude)
    const divY = gh / 8;
    const refY = centerY - divY * 2;
    ctx.strokeStyle = 'rgba(230, 126, 34, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(left, refY);
    ctx.lineTo(left + gw, refY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(230, 126, 34, 0.8)';
    ctx.font = '11px monospace';
    ctx.fillText('REF CALIB +2.0V', left + 10, refY - 6);

    // 2. Dynamic test waveform (synthetic test sine sweeping across graticule)
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 2.0;
    ctx.beginPath();

    const points = 200;
    const speed = this._testPatternTime * 2.5;

    for (let i = 0; i <= points; i++) {
      const frac = i / points;
      const x = left + frac * gw;
      // 3 cycles of sine across screen
      const y = centerY - Math.sin(frac * Math.PI * 6 - speed) * divY * 2.5;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // 3. Moving test object (pulsing indicator circle along the test wave)
    const markerFrac = (this._testPatternTime * 0.3) % 1.0;
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

  private renderHeader(ctx: CanvasRenderingContext2D, state?: DisplayStateSnapshot): void {
    const oscState = state?.state ?? 'RUNNING';
    const isRunning = oscState === 'RUNNING' || oscState === 'WAITING_TRIGGER' || oscState === 'ARMED';

    // Top status background
    ctx.fillStyle = '#0d131a';
    ctx.fillRect(0, 0, this.renderTarget.width, this._gridTop);

    // State Badge (RUN / STOP)
    const badgeColor = isRunning ? '#27ae60' : '#c0392b';
    ctx.fillStyle = badgeColor;
    ctx.fillRect(this._gridLeft, 12, 60, 24);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isRunning ? 'RUN' : 'STOP', this._gridLeft + 30, 29);
    ctx.textAlign = 'left';

    // Trigger Mode
    ctx.fillStyle = '#8fa0b3';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Trig: ${state?.triggerMode ?? 'AUTO'}`, this._gridLeft + 75, 29);

    // Timebase Readout
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`M: ${state?.timeDivStr ?? '1.00ms'}`, this._gridLeft + 220, 29);

    // Sample Rate Readout
    ctx.fillStyle = '#8fa0b3';
    ctx.font = '12px monospace';
    ctx.fillText(`Rate: ${state?.sampleRateStr ?? '2.00 MS/s'}`, this._gridLeft + 420, 29);

    // Virtual Bench Brand watermark
    ctx.fillStyle = '#4a5d70';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('DIGITAL TWIN DSO-5000', this.renderTarget.width - this._gridLeft, 29);
    ctx.textAlign = 'left';
  }

  private renderFooter(ctx: CanvasRenderingContext2D, state?: DisplayStateSnapshot): void {
    const bottom = this.renderTarget.height - 40;

    ctx.fillStyle = '#0d131a';
    ctx.fillRect(0, this.renderTarget.height - 44, this.renderTarget.width, 44);

    // CH1 Readout Badge
    const ch1Active = state?.ch1Enabled ?? true;
    ctx.fillStyle = ch1Active ? '#f1c40f' : '#555555';
    ctx.fillRect(this._gridLeft, bottom, 20, 22);

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('1', this._gridLeft + 6, bottom + 16);

    ctx.fillStyle = ch1Active ? '#f1c40f' : '#666666';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${state?.ch1VoltDivStr ?? '1.00V'} DC`, this._gridLeft + 26, bottom + 16);

    // CH2 Readout Badge
    const ch2Active = state?.ch2Enabled ?? false;
    const ch2Left = this._gridLeft + 150;
    ctx.fillStyle = ch2Active ? '#00d2d3' : '#333333';
    ctx.fillRect(ch2Left, bottom, 20, 22);

    ctx.fillStyle = ch2Active ? '#000000' : '#888888';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('2', ch2Left + 6, bottom + 16);

    ctx.fillStyle = ch2Active ? '#00d2d3' : '#555555';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${state?.ch2VoltDivStr ?? '1.00V'} DC`, ch2Left + 26, bottom + 16);

    // Trigger level
    ctx.fillStyle = '#8fa0b3';
    ctx.font = '12px monospace';
    ctx.fillText(`Trigger: ${state?.triggerLevelStr ?? 'CH1 0.00V'}`, this._gridLeft + 340, bottom + 16);
  }
}
