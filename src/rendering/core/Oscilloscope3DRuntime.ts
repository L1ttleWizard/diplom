import * as THREE from 'three';
import { RendererBootstrap } from './RendererBootstrap';
import { SceneManager } from './SceneManager';
import { CameraManager } from './CameraManager';
import { ResizeController } from './ResizeController';
import { RenderLoop } from './RenderLoop';
import { AssetLifecycle } from '../assets/AssetLifecycle';
import { LabSceneBuilder } from '../procedural/LabSceneBuilder';
import { PerformanceMonitor } from '../diagnostics/PerformanceMonitor';
import { RaycastManager } from '../interaction/RaycastManager';
import { OscilloscopeInteractionAdapter } from '../interaction/OscilloscopeInteractionAdapter';
import { DisplayEngine } from '../display/DisplayEngine';
import { OscilloscopeService } from '../../application/services/OscilloscopeService';
import { PerformanceTier, PerformanceMetrics } from '../types';

export interface RuntimeOptions {
  canvas?: HTMLCanvasElement;
  container?: HTMLElement;
  tier?: PerformanceTier;
  service?: OscilloscopeService;
}

export class Oscilloscope3DRuntime {
  public readonly rendererBootstrap: RendererBootstrap;
  public readonly sceneManager: SceneManager;
  public readonly cameraManager: CameraManager;
  public readonly renderLoop: RenderLoop;
  public readonly assetLifecycle: AssetLifecycle;
  public readonly performanceMonitor: PerformanceMonitor;
  public readonly service: OscilloscopeService;
  public readonly raycastManager: RaycastManager;
  public readonly displayEngine: DisplayEngine;

  private _interactionAdapter: OscilloscopeInteractionAdapter | null = null;
  private _resizeController: ResizeController | null = null;
  private _screenMesh: THREE.Mesh | null = null;
  private _interactiveObjects: Map<string, THREE.Object3D> = new Map();

  // Pointer interaction state
  private _isPointerDown: boolean = false;
  private _isWidgetInteracting: boolean = false;
  private _pointerButton: number = 0; // 0: left, 1: middle, 2: right
  private _prevPointerX: number = 0;
  private _prevPointerY: number = 0;
  private _boundOnPointerDown: ((e: PointerEvent) => void) | null = null;
  private _boundOnPointerMove: ((e: PointerEvent) => void) | null = null;
  private _boundOnPointerUp: ((e: PointerEvent) => void) | null = null;
  private _boundOnWheel: ((e: WheelEvent) => void) | null = null;
  private _boundOnContextMenu: ((e: MouseEvent) => void) | null = null;

  constructor(options: RuntimeOptions = {}) {
    this.service = options.service ?? new OscilloscopeService();
    this.assetLifecycle = new AssetLifecycle();
    this.performanceMonitor = new PerformanceMonitor();

    this.rendererBootstrap = new RendererBootstrap({
      canvas: options.canvas,
      tier: options.tier ?? 'HIGH'
    });

    this.sceneManager = new SceneManager();
    this.cameraManager = new CameraManager();
    this.raycastManager = new RaycastManager(this.cameraManager.camera);
    this.displayEngine = new DisplayEngine();

    const rendererInstance = typeof document !== 'undefined' ? this.rendererBootstrap.renderer : null;
    this.renderLoop = new RenderLoop(
      rendererInstance,
      this.sceneManager.scene,
      this.cameraManager.camera,
      this.performanceMonitor
    );

    // Build procedural 3D lab scene
    this.buildScene();

    // Attach virtual display texture to screen mesh
    if (this._screenMesh) {
      this.displayEngine.renderTarget.attachToScreenMesh(this._screenMesh);
    }

    // Connect 3D controls to Domain Service
    this._interactionAdapter = new OscilloscopeInteractionAdapter(
      this.service,
      this.raycastManager,
      this._interactiveObjects
    );

    // Render loop callback for display update
    this.renderLoop.addCallback((deltaMs) => {
      const scope = this.service.oscilloscope;
      this.displayEngine.render(
        {
          state: scope.state,
          timeDivStr: scope.timeDiv.toString(),
          ch1Enabled: scope.getChannel('CH1').enabled,
          ch1VoltDivStr: scope.getChannel('CH1').voltsPerDiv.toString(),
          ch2Enabled: scope.getChannel('CH2').enabled,
          ch2VoltDivStr: scope.getChannel('CH2').voltsPerDiv.toString(),
          triggerMode: scope.trigger.mode,
          triggerLevelStr: `CH1 ${scope.trigger.level.toFixed(2)}V`,
          sampleRateStr: `${(scope.acquisition.sampleRate / 1e6).toFixed(2)} MS/s`
        },
        deltaMs
      );
    });

    if (typeof window !== 'undefined') {
      this._resizeController = new ResizeController(
        this.rendererBootstrap,
        this.cameraManager,
        options.container
      );
      this.setupControls(options.canvas ?? (rendererInstance ? rendererInstance.domElement : null));
    }
  }

  public get screenMesh(): THREE.Mesh | null {
    return this._screenMesh;
  }

  public get interactiveObjects(): Map<string, THREE.Object3D> {
    return this._interactiveObjects;
  }

  public get interactionAdapter(): OscilloscopeInteractionAdapter | null {
    return this._interactionAdapter;
  }

  private buildScene(): void {
    const builder = new LabSceneBuilder(this.assetLifecycle);
    const { screenMesh, interactiveObjects } = builder.buildLabScene(this.sceneManager.hierarchy);
    this._screenMesh = screenMesh;
    this._interactiveObjects = interactiveObjects;
  }

  private getNDC(e: PointerEvent, targetElement: HTMLElement): { x: number; y: number } {
    const rect = targetElement.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    return { x, y };
  }

  private setupControls(targetElement: HTMLElement | null): void {
    if (!targetElement) return;

    this._boundOnPointerDown = (e: PointerEvent) => {
      this._isPointerDown = true;
      this._pointerButton = e.button;
      this._prevPointerX = e.clientX;
      this._prevPointerY = e.clientY;
      targetElement.setPointerCapture(e.pointerId);

      const ndc = this.getNDC(e, targetElement);
      // Check if clicking on an interactive 3D control
      const hitInteractive = this.raycastManager.onPointerDown(ndc.x, ndc.y);
      this._isWidgetInteracting = hitInteractive;
    };

    this._boundOnPointerMove = (e: PointerEvent) => {
      const ndc = this.getNDC(e, targetElement);
      this.raycastManager.onPointerMove(ndc.x, ndc.y);

      if (!this._isPointerDown) return;

      const deltaX = e.clientX - this._prevPointerX;
      const deltaY = e.clientY - this._prevPointerY;
      this._prevPointerX = e.clientX;
      this._prevPointerY = e.clientY;

      if (this._isWidgetInteracting) {
        // Drag active widget (e.g. knob)
        this.raycastManager.onPointerDrag(deltaY);
      } else {
        // Camera navigation
        const isPan = this._pointerButton === 2 || this._pointerButton === 1 || e.shiftKey;
        if (isPan) {
          this.cameraManager.pan(deltaX * 0.002, deltaY * 0.002);
        } else {
          this.cameraManager.orbit(-deltaX * 0.005, -deltaY * 0.005);
        }
      }
    };

    this._boundOnPointerUp = (e: PointerEvent) => {
      this._isPointerDown = false;
      if (this._isWidgetInteracting) {
        this.raycastManager.onPointerUp();
        this._isWidgetInteracting = false;
      }
      try {
        targetElement.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore
      }
    };

    this._boundOnWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY * 0.0015;
      this.cameraManager.zoom(zoomFactor);
    };

    this._boundOnContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    targetElement.addEventListener('pointerdown', this._boundOnPointerDown);
    targetElement.addEventListener('pointermove', this._boundOnPointerMove);
    targetElement.addEventListener('pointerup', this._boundOnPointerUp);
    targetElement.addEventListener('pointercancel', this._boundOnPointerUp);
    targetElement.addEventListener('wheel', this._boundOnWheel, { passive: false });
    targetElement.addEventListener('contextmenu', this._boundOnContextMenu);
  }

  public resetCamera(): void {
    this.cameraManager.reset();
  }

  public setTier(tier: PerformanceTier): void {
    this.rendererBootstrap.setTier(tier);
    this.sceneManager.setShadows(tier !== 'LOW');
  }

  public getMetrics(): PerformanceMetrics {
    const rendererInstance = typeof document !== 'undefined' ? this.rendererBootstrap.renderer : undefined;
    return this.performanceMonitor.getMetrics(rendererInstance);
  }

  public start(): void {
    this.renderLoop.start();
  }

  public stop(): void {
    this.renderLoop.stop();
  }

  public dispose(): void {
    this.stop();

    if (this._interactionAdapter) {
      this._interactionAdapter.dispose();
      this._interactionAdapter = null;
    }

    if (this._resizeController) {
      this._resizeController.dispose();
      this._resizeController = null;
    }

    this.displayEngine.renderTarget.dispose();
    this.assetLifecycle.disposeObject(this.sceneManager.hierarchy.root);
    this.assetLifecycle.clearAll();
    this.rendererBootstrap.dispose();
  }
}
