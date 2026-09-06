import { CameraManager } from './CameraManager';
import { RendererBootstrap } from './RendererBootstrap';

export class ResizeController {
  private _resizeObserver: ResizeObserver | null = null;
  private _boundOnWindowResize: (() => void) | null = null;
  private _container: HTMLElement | null = null;
  private _rendererBootstrap: RendererBootstrap;
  private _cameraManager: CameraManager;

  constructor(
    rendererBootstrap: RendererBootstrap,
    cameraManager: CameraManager,
    container?: HTMLElement
  ) {
    this._rendererBootstrap = rendererBootstrap;
    this._cameraManager = cameraManager;
    this._container = container ?? (typeof document !== 'undefined' ? document.body : null);

    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    if (typeof ResizeObserver !== 'undefined' && this._container) {
      this._resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) {
            this.handleResize(width, height);
          }
        }
      });
      this._resizeObserver.observe(this._container);
    } else {
      this._boundOnWindowResize = () => {
        this.handleResize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', this._boundOnWindowResize);
    }

    // Trigger initial resize
    if (this._container && this._container.clientWidth > 0) {
      this.handleResize(this._container.clientWidth, this._container.clientHeight);
    } else if (typeof window !== 'undefined') {
      this.handleResize(window.innerWidth, window.innerHeight);
    }
  }

  public handleResize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;

    const aspect = width / height;
    this._cameraManager.setAspect(aspect);
    this._rendererBootstrap.setSize(width, height);
  }

  public dispose(): void {
    if (this._resizeObserver && this._container) {
      this._resizeObserver.unobserve(this._container);
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._boundOnWindowResize && typeof window !== 'undefined') {
      window.removeEventListener('resize', this._boundOnWindowResize);
      this._boundOnWindowResize = null;
    }
  }
}
