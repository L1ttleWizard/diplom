import { GridConfig } from './types';

export const DEFAULT_GRID_CONFIG: GridConfig = {
  horizontalDivisions: 10,
  verticalDivisions: 8,
  subTicksPerDivision: 5,
  marginLeft: 40,
  marginTop: 48,
  marginRight: 40,
  marginBottom: 44,
  gridColor: 'rgba(25, 65, 90, 0.45)',
  axisColor: '#2b587a',
  subTickColor: 'rgba(50, 110, 150, 0.75)',
  backgroundColor: '#080e14',
  frameColor: '#1e384d'
};

export class StaticGridLayer {
  public config: GridConfig;
  private _cachedCanvas: HTMLCanvasElement | null = null;
  private _cachedCtx: CanvasRenderingContext2D | null = null;
  private _isDirty: boolean = true;
  private _rebuildCount: number = 0;

  private _width: number = 1024;
  private _height: number = 640;
  private _dpr: number = 1.0;

  constructor(config: Partial<GridConfig> = {}) {
    this.config = { ...DEFAULT_GRID_CONFIG, ...config };
  }

  public get isDirty(): boolean {
    return this._isDirty;
  }

  public get rebuildCount(): number {
    return this._rebuildCount;
  }

  public get cachedCanvas(): HTMLCanvasElement | null {
    return this._cachedCanvas;
  }

  public markDirty(): void {
    this._isDirty = true;
  }

  public getGridBounds(): { left: number; top: number; width: number; height: number } {
    const left = this.config.marginLeft;
    const top = this.config.marginTop;
    const width = this._width - this.config.marginLeft - this.config.marginRight;
    const height = this._height - this.config.marginTop - this.config.marginBottom;
    return { left, top, width, height };
  }

  /**
   * Rebuilds the static grid layer into an offscreen canvas if marked dirty.
   * If not dirty, returns immediately without re-drawing (O(1)).
   */
  public rebuildIfDirty(width: number, height: number, dpr: number = 1.0): void {
    if (this._width !== width || this._height !== height || this._dpr !== dpr) {
      this._width = width;
      this._height = height;
      this._dpr = dpr;
      this._isDirty = true;
    }

    if (!this._isDirty && this._cachedCanvas) {
      return;
    }

    this.rebuild(width, height, dpr);
  }

  /**
   * Explicitly renders the complete static layer onto the offscreen canvas.
   */
  public rebuild(width: number, height: number, dpr: number = 1.0): void {
    this._width = width;
    this._height = height;
    this._dpr = dpr;

    const physicalWidth = Math.round(width * dpr);
    const physicalHeight = Math.round(height * dpr);

    if (typeof document !== 'undefined') {
      if (!this._cachedCanvas) {
        this._cachedCanvas = document.createElement('canvas');
      }
      this._cachedCanvas.width = physicalWidth;
      this._cachedCanvas.height = physicalHeight;
      this._cachedCtx = this._cachedCanvas.getContext('2d', { alpha: false });
    } else {
      // Headless test mock
      this._cachedCanvas = { width: physicalWidth, height: physicalHeight } as any;
      this._cachedCtx = {} as any;
    }

    const ctx = this._cachedCtx;
    if (ctx && ctx.fillRect) {
      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Overall screen background
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(0, 0, width, height);

      // 2. Graticule bounds
      const { left, top, width: gw, height: gh } = this.getGridBounds();

      // 3. Screen frame & Bezel styling
      this.drawScreenFrame(ctx, left, top, gw, gh, width, height);

      // 4. Grid background
      ctx.fillStyle = this.config.backgroundColor;
      ctx.fillRect(left, top, gw, gh);

      // 5. Major grid divisions (10x8)
      this.drawMajorDivisions(ctx, left, top, gw, gh);

      // 6. Center axes and minor sub-ticks (0.2 div)
      this.drawCenterAxesAndSubTicks(ctx, left, top, gw, gh);

      // 7. Perimeter division markers
      this.drawPerimeterMarkers(ctx, left, top, gw, gh);

      // 8. Static labels & Brand watermark
      this.drawStaticLabels(ctx, left, top, gw, gh, width, height);

      ctx.restore();
    }

    this._isDirty = false;
    this._rebuildCount++;
  }

  private drawScreenFrame(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    gw: number,
    gh: number,
    w: number,
    h: number
  ): void {
    // Header & Footer dark background bars
    ctx.fillStyle = '#0d131a';
    ctx.fillRect(0, 0, w, top);
    ctx.fillRect(0, top + gh, w, h - (top + gh));

    // Outer graticule border
    ctx.strokeStyle = this.config.frameColor;
    ctx.lineWidth = 2.0;
    ctx.strokeRect(left - 1, top - 1, gw + 2, gh + 2);

    // Corner bracket accents
    const cornerLen = 14;
    ctx.strokeStyle = '#3875a3';
    ctx.lineWidth = 3.0;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(left - 4, top + cornerLen);
    ctx.lineTo(left - 4, top - 4);
    ctx.lineTo(left + cornerLen, top - 4);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(left + gw + 4 - cornerLen, top - 4);
    ctx.lineTo(left + gw + 4, top - 4);
    ctx.lineTo(left + gw + 4, top + cornerLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(left - 4, top + gh - cornerLen);
    ctx.lineTo(left - 4, top + gh + 4);
    ctx.lineTo(left + cornerLen, top + gh + 4);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(left + gw + 4 - cornerLen, top + gh + 4);
    ctx.lineTo(left + gw + 4, top + gh + 4);
    ctx.lineTo(left + gw + 4, top + gh + 4 - cornerLen);
    ctx.stroke();
  }

  private drawMajorDivisions(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    const numH = this.config.horizontalDivisions;
    const numV = this.config.verticalDivisions;
    const divX = gw / numH;
    const divY = gh / numV;

    ctx.strokeStyle = this.config.gridColor;
    ctx.lineWidth = 1.0;
    ctx.setLineDash([2, 4]); // Dotted grid lines

    // Vertical grid lines (1 to numH - 1)
    for (let i = 1; i < numH; i++) {
      const x = left + i * divX;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + gh);
      ctx.stroke();
    }

    // Horizontal grid lines (1 to numV - 1)
    for (let j = 1; j < numV; j++) {
      const y = top + j * divY;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + gw, y);
      ctx.stroke();
    }

    ctx.setLineDash([]); // Reset line dash
  }

  private drawCenterAxesAndSubTicks(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    const numH = this.config.horizontalDivisions;
    const numV = this.config.verticalDivisions;
    const subTicks = this.config.subTicksPerDivision;

    const centerX = left + gw / 2;
    const centerY = top + gh / 2;

    // Solid center axes
    ctx.strokeStyle = this.config.axisColor;
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(centerX, top);
    ctx.lineTo(centerX, top + gh);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(left, centerY);
    ctx.lineTo(left + gw, centerY);
    ctx.stroke();

    // Center Crosshair center point marker
    ctx.strokeStyle = '#4da6ff';
    ctx.lineWidth = 1.5;
    const crosshairSize = 6;
    ctx.beginPath();
    ctx.moveTo(centerX - crosshairSize, centerY);
    ctx.lineTo(centerX + crosshairSize, centerY);
    ctx.moveTo(centerX, centerY - crosshairSize);
    ctx.lineTo(centerX, centerY + crosshairSize);
    ctx.stroke();

    // Sub-ticks on center horizontal axis (subTicks per division = 0.2 div)
    const totalSubH = numH * subTicks;
    const tickLen = 4;
    const majorTickLen = 6;
    ctx.strokeStyle = this.config.subTickColor;
    ctx.lineWidth = 1.0;

    for (let i = 0; i <= totalSubH; i++) {
      const x = left + (i * gw) / totalSubH;
      const isMajor = i % subTicks === 0;
      const len = isMajor ? majorTickLen : tickLen;
      ctx.beginPath();
      ctx.moveTo(x, centerY - len);
      ctx.lineTo(x, centerY + len);
      ctx.stroke();
    }

    // Sub-ticks on center vertical axis
    const totalSubV = numV * subTicks;
    for (let j = 0; j <= totalSubV; j++) {
      const y = top + (j * gh) / totalSubV;
      const isMajor = j % subTicks === 0;
      const len = isMajor ? majorTickLen : tickLen;
      ctx.beginPath();
      ctx.moveTo(centerX - len, y);
      ctx.lineTo(centerX + len, y);
      ctx.stroke();
    }
  }

  private drawPerimeterMarkers(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    gw: number,
    gh: number
  ): void {
    const numH = this.config.horizontalDivisions;
    const numV = this.config.verticalDivisions;
    const pTickLen = 3;

    ctx.strokeStyle = 'rgba(70, 130, 170, 0.6)';
    ctx.lineWidth = 1.0;

    // Top & Bottom boundary ticks
    for (let i = 0; i <= numH; i++) {
      const x = left + (i * gw) / numH;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + pTickLen);
      ctx.moveTo(x, top + gh);
      ctx.lineTo(x, top + gh - pTickLen);
      ctx.stroke();
    }

    // Left & Right boundary ticks
    for (let j = 0; j <= numV; j++) {
      const y = top + (j * gh) / numV;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + pTickLen, y);
      ctx.moveTo(left + gw, y);
      ctx.lineTo(left + gw - pTickLen, y);
      ctx.stroke();
    }

    // Static center time trigger reference arrow on top border (center marker)
    const centerX = left + gw / 2;
    ctx.fillStyle = '#ffb300';
    ctx.beginPath();
    ctx.moveTo(centerX - 4, top - 7);
    ctx.lineTo(centerX + 4, top - 7);
    ctx.lineTo(centerX, top - 1);
    ctx.closePath();
    ctx.fill();
  }

  private drawStaticLabels(
    ctx: CanvasRenderingContext2D,
    left: number,
    top: number,
    gw: number,
    gh: number,
    w: number,
    _h: number
  ): void {
    // Top right DSO Model watermark
    ctx.fillStyle = '#4a5d70';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('DIGITAL TWIN DSO-5000', w - this.config.marginRight, 29);
    ctx.textAlign = 'left';

    // Static channel badges in footer
    const bottomY = top + gh + 26;

    // Static label for CH1 badge outline
    ctx.strokeStyle = 'rgba(241, 196, 15, 0.4)';
    ctx.lineWidth = 1.0;
    ctx.strokeRect(left, bottomY - 16, 20, 22);

    // Static label for CH2 badge outline
    const ch2Left = left + 160;
    ctx.strokeStyle = 'rgba(0, 210, 211, 0.4)';
    ctx.strokeRect(ch2Left, bottomY - 16, 20, 22);

    // External Trigger static indicator
    ctx.fillStyle = '#4a5d70';
    ctx.font = '11px sans-serif';
    ctx.fillText('EXT TRIG: 1MΩ ≤ 300Vrms', w - this.config.marginRight - 150, bottomY);
  }
}
