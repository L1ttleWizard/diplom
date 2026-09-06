import * as THREE from 'three';
import { IInteractionTarget } from './InteractionTarget';

export class RaycastManager {
  private readonly _raycaster: THREE.Raycaster;
  private readonly _camera: THREE.Camera;
  private readonly _targets: Map<number, IInteractionTarget> = new Map(); // object3D.id -> Target
  private readonly _intersectableObjects: THREE.Object3D[] = [];

  // Scratch vector for NDC coordinates
  private readonly _ndc: THREE.Vector2 = new THREE.Vector2();

  // Active interaction tracking
  private _hoveredTarget: IInteractionTarget | null = null;
  private _activeTarget: IInteractionTarget | null = null;
  private _dragAccumulator: number = 0;
  private _hasDragged: boolean = false;

  constructor(camera: THREE.Camera) {
    this._raycaster = new THREE.Raycaster();
    this._camera = camera;
  }

  public registerTarget(target: IInteractionTarget): void {
    this._targets.set(target.object3D.id, target);
    this._intersectableObjects.push(target.object3D);

    // Also register children if it's a group
    target.object3D.traverse((child) => {
      if (child !== target.object3D) {
        this._targets.set(child.id, target);
        this._intersectableObjects.push(child);
      }
    });
  }

  public unregisterTarget(target: IInteractionTarget): void {
    this._targets.delete(target.object3D.id);
    const idx = this._intersectableObjects.indexOf(target.object3D);
    if (idx !== -1) {
      this._intersectableObjects.splice(idx, 1);
    }
  }

  public clearTargets(): void {
    this._targets.clear();
    this._intersectableObjects.length = 0;
  }

  /**
   * Raycast at NDC coordinates [-1, 1]
   */
  public findTargetAtNDC(ndcX: number, ndcY: number): IInteractionTarget | null {
    this._ndc.set(ndcX, ndcY);
    this._raycaster.setFromCamera(this._ndc, this._camera);

    const intersects = this._raycaster.intersectObjects(this._intersectableObjects, false);
    if (intersects.length > 0) {
      const hitObj = intersects[0].object;
      return this._targets.get(hitObj.id) ?? null;
    }
    return null;
  }

  /**
   * Pointer Move - handles hover feedback
   */
  public onPointerMove(ndcX: number, ndcY: number): IInteractionTarget | null {
    if (this._activeTarget && this._activeTarget.type === 'KNOB') {
      return this._activeTarget;
    }

    const hit = this.findTargetAtNDC(ndcX, ndcY);

    if (hit !== this._hoveredTarget) {
      if (this._hoveredTarget && this._hoveredTarget.onHover) {
        this._hoveredTarget.onHover(false);
      }
      this._hoveredTarget = hit;
      if (this._hoveredTarget && this._hoveredTarget.onHover) {
        this._hoveredTarget.onHover(true);
      }
    }

    return hit;
  }

  /**
   * Pointer Down - captures target if interactive
   * Returns true if an interactive target was captured (prevents camera orbit).
   */
  public onPointerDown(ndcX: number, ndcY: number): boolean {
    const hit = this.findTargetAtNDC(ndcX, ndcY);
    if (hit) {
      this._activeTarget = hit;
      this._dragAccumulator = 0;
      this._hasDragged = false;
      return true;
    }
    this._activeTarget = null;
    return false;
  }

  /**
   * Pointer Drag - dispatches drag delta to knobs
   */
  public onPointerDrag(deltaY: number): void {
    if (!this._activeTarget) return;

    this._dragAccumulator += Math.abs(deltaY);
    if (this._dragAccumulator > 3) {
      this._hasDragged = true;
    }

    if (this._activeTarget.type === 'KNOB' && this._activeTarget.onDrag) {
      // Normalized drag: -deltaY (dragging up rotates clockwise/forward)
      const normalizedDelta = -deltaY * 0.05;
      this._activeTarget.onDrag(normalizedDelta);
    }
  }

  /**
   * Pointer Up - executes click if not dragged
   */
  public onPointerUp(): void {
    if (this._activeTarget) {
      if (!this._hasDragged && this._activeTarget.onClick) {
        this._activeTarget.onClick();
      }
      this._activeTarget = null;
    }
    this._hasDragged = false;
    this._dragAccumulator = 0;
  }
}
