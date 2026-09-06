import { DisplayRenderTarget } from './DisplayRenderTarget';
import { DisplayCoordinates } from './DisplayCoordinates';
import { StaticGridLayer } from './StaticGridLayer';
import { DynamicDisplayLayer } from './DynamicDisplayLayer';
import { DisplayStateSnapshot, CursorState, MeasurementItem, GridConfig } from './types';

export class DisplayEngine {
  public readonly renderTarget: DisplayRenderTarget;
  public readonly coordinates: DisplayCoordinates;
  public readonly staticLayer: StaticGridLayer;
  public readonly dynamicLayer: DynamicDisplayLayer;

  private _cursors: Partial<CursorState> | null = null;
  private _measurements: MeasurementItem[] | null = null;

  constructor(
    renderTarget?: DisplayRenderTarget,
    gridConfig?: Partial<GridConfig>
  ) {
    this.renderTarget = renderTarget ?? new DisplayRenderTarget({ width: 1024, height: 640 });
    this.coordinates = new DisplayCoordinates(this.renderTarget.width, this.renderTarget.height);
    this.staticLayer = new StaticGridLayer(gridConfig);
    this.dynamicLayer = new DynamicDisplayLayer();
  }

  public getStaticRebuildCount(): number {
    return this.staticLayer.rebuildCount;
  }

  public invalidateStaticLayer(): void {
    this.staticLayer.markDirty();
  }

  public setViewport(width: number, height: number): void {
    if (this.renderTarget.width === width && this.renderTarget.height === height) {
      return;
    }
    this.renderTarget.resize(width, height);
    this.coordinates.updateDimensions(width, height);
    this.staticLayer.markDirty();
  }

  public setDpr(dpr: number): void {
    if (this.renderTarget.dpr === dpr) {
      return;
    }
    this.renderTarget.resize(this.renderTarget.width, this.renderTarget.height, dpr);
    this.staticLayer.markDirty();
  }

  public setCursors(cursors: Partial<CursorState> | null): void {
    this._cursors = cursors;
  }

  public setMeasurements(measurements: MeasurementItem[] | null): void {
    this._measurements = measurements;
  }

  /**
   * Main display rendering pass.
   * 1. Rebuilds static layer ONLY IF DIRTY (cached O(1) blit on normal frames).
   * 2. Blits static cache onto render target.
   * 3. Renders dynamic elements (waveforms, trigger markers, cursors, measurements).
   * 4. Updates GPU texture.
   */
  public render(state?: DisplayStateSnapshot, deltaMs: number = 16.67): void {
    const w = this.renderTarget.width;
    const h = this.renderTarget.height;
    const dpr = this.renderTarget.dpr;

    // 1. Rebuild static layer if dirty (e.g. on init, resize, or DPR change)
    this.staticLayer.rebuildIfDirty(w, h, dpr);

    const ctx = this.renderTarget.ctx;
    if (!ctx || !ctx.fillRect) return; // Headless test mock

    const physicalW = this.renderTarget.physicalWidth;
    const physicalH = this.renderTarget.physicalHeight;

    // 2. Fast O(1) blit of cached static layer
    const cachedCanvas = this.staticLayer.cachedCanvas;
    if (cachedCanvas && ctx.drawImage) {
      ctx.drawImage(cachedCanvas, 0, 0, physicalW, physicalH);
    } else {
      ctx.fillStyle = '#060a0f';
      ctx.fillRect(0, 0, physicalW, physicalH);
    }

    // 3. Dynamic layer rendering (with DPR scaling)
    ctx.save();
    ctx.scale(dpr, dpr);

    const mergedState: DisplayStateSnapshot | undefined = state
      ? {
          ...state,
          cursors: state.cursors ?? (this._cursors ?? undefined),
          measurements: state.measurements ?? (this._measurements ?? undefined)
        }
      : undefined;

    const bounds = this.staticLayer.getGridBounds();
    this.dynamicLayer.render(ctx, mergedState, bounds, w, h, deltaMs);

    ctx.restore();

    // 4. Mark render target dirty for GPU upload
    this.renderTarget.markDirty();
    this.renderTarget.updateTexture();
  }
}
