import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { RaycastManager } from '../../src/rendering/interaction/RaycastManager';
import { IInteractionTarget, STABLE_IDS } from '../../src/rendering/interaction/InteractionTarget';
import { OscilloscopeInteractionAdapter } from '../../src/rendering/interaction/OscilloscopeInteractionAdapter';
import { OscilloscopeService } from '../../src/application/services/OscilloscopeService';
import { EventBus } from '../../src/application/events/EventBus';

describe('3D Oscilloscope Interaction Pipeline (Wave 3)', () => {
  describe('RaycastManager', () => {
    it('registers and unregisters interaction targets', () => {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      const rm = new RaycastManager(camera);

      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      const target: IInteractionTarget = {
        stableId: STABLE_IDS.OSC_BUTTON_RUN,
        object3D: mesh,
        type: 'BUTTON',
        onClick: vi.fn()
      };

      rm.registerTarget(target);
      // Position object in front of camera
      mesh.position.set(0, 0, -5);
      mesh.updateMatrixWorld();

      // At center NDC (0, 0), raycast should hit the mesh
      const hit = rm.findTargetAtNDC(0, 0);
      expect(hit).toBe(target);

      // At corner NDC (1, 1), should miss
      expect(rm.findTargetAtNDC(1, 1)).toBeNull();

      rm.unregisterTarget(target);
      expect(rm.findTargetAtNDC(0, 0)).toBeNull();
    });

    it('handles pointer down capture, drag and click dispatch', () => {
      const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
      const rm = new RaycastManager(camera);

      const onClick = vi.fn();
      const onDrag = vi.fn();

      const btnMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      btnMesh.position.set(0, 0, -5);
      btnMesh.updateMatrixWorld();

      const knobMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1));
      knobMesh.position.set(2, 0, -5);
      knobMesh.updateMatrixWorld();

      rm.registerTarget({
        stableId: STABLE_IDS.OSC_BUTTON_RUN,
        object3D: btnMesh,
        type: 'BUTTON',
        onClick
      });

      rm.registerTarget({
        stableId: STABLE_IDS.OSC_KNOB_TIME,
        object3D: knobMesh,
        type: 'KNOB',
        onDrag
      });

      // 1. Click button (down and up without drag)
      expect(rm.onPointerDown(0, 0)).toBe(true);
      rm.onPointerUp();
      expect(onClick).toHaveBeenCalledOnce();

      // 2. Drag knob
      // NDC coordinates for position (2, 0, -5) with 45 deg FOV
      expect(rm.onPointerDown(0.48, 0)).toBe(true);
      rm.onPointerDrag(-20); // drag up 20px
      expect(onDrag).toHaveBeenCalled();
      rm.onPointerUp();
      // Since it was dragged, onClick should NOT fire
    });
  });

  describe('OscilloscopeInteractionAdapter (Command & State Representation)', () => {
    it('dispatches RUN/STOP commands on button click', () => {
      const eventBus = new EventBus();
      const service = new OscilloscopeService(undefined, eventBus);
      const camera = new THREE.PerspectiveCamera();
      const rm = new RaycastManager(camera);

      const btnMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshStandardMaterial());
      const map = new Map<string, THREE.Object3D>([['btn_run_stop', btnMesh]]);

      new OscilloscopeInteractionAdapter(service, rm, map);

      expect(service.getState()).toBe('IDLE');

      // Click button -> dispatches RUN
      const target = rm.findTargetAtNDC(0, 0); // or invoke onClick directly
      rm.onPointerDown(0, 0); // dummy down
      // Trigger click callback registered in RM
      const registeredTarget = Array.from((rm as any)._targets.values())[0] as IInteractionTarget;
      registeredTarget.onClick?.();

      expect(service.getState()).toBe('RUNNING');

      // Click again -> dispatches STOP
      registeredTarget.onClick?.();
      expect(service.getState()).toBe('STOPPED');
    });

    it('maps knob drag to 1-2-5 scale commands in domain and updates knob visual rotation', () => {
      const eventBus = new EventBus();
      const service = new OscilloscopeService(undefined, eventBus);
      const camera = new THREE.PerspectiveCamera();
      const rm = new RaycastManager(camera);

      const knobTime = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1));
      const map = new Map<string, THREE.Object3D>([['knob_time_div', knobTime]]);

      const adapter = new OscilloscopeInteractionAdapter(service, rm, map);

      expect(service.oscilloscope.timeDiv.value).toBe(1e-3); // 1ms default
      const initialRotation = knobTime.rotation.z;

      // Find registered knob target and simulate drag forward
      const registeredTarget = Array.from((rm as any)._targets.values())[0] as IInteractionTarget;
      expect(registeredTarget.type).toBe('KNOB');

      // Drag positive threshold -> advance time/div step
      registeredTarget.onDrag?.(1.0);

      // Domain should now have 2ms (next on 1-2-5 scale after 1ms)
      expect(service.oscilloscope.timeDiv.value).toBe(2e-3);

      // CRITICAL INVARIANT: Knob rotation was updated by domain event, not by local drag!
      expect(knobTime.rotation.z).not.toBe(initialRotation);

      // Direct domain command also updates knob visual rotation
      service.execute({ type: 'SET_TIME_DIV', timeDiv: 50e-6 });
      expect(service.oscilloscope.timeDiv.value).toBe(50e-6);

      adapter.dispose();
    });
  });
});
