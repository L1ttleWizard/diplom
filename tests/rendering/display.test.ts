import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DisplayCoordinates } from '../../src/rendering/display/DisplayCoordinates';
import { DisplayRenderTarget } from '../../src/rendering/display/DisplayRenderTarget';
import { DisplayEngine } from '../../src/rendering/display/DisplayEngine';

describe('Virtual Display Architecture (Wave 4)', () => {
  describe('DisplayCoordinates', () => {
    const coords = new DisplayCoordinates(1024, 640, 0.17, 0.105);

    it('converts display pixel coordinates to UV and back', () => {
      // Top-left (0, 0) -> UV (0, 1)
      const uvTopLeft = coords.displayToUV({ x: 0, y: 0 });
      expect(uvTopLeft.u).toBe(0);
      expect(uvTopLeft.v).toBe(1);

      // Center (512, 320) -> UV (0.5, 0.5)
      const uvCenter = coords.displayToUV({ x: 512, y: 320 });
      expect(uvCenter.u).toBeCloseTo(0.5);
      expect(uvCenter.v).toBeCloseTo(0.5);

      // Round-trip
      const pt = { x: 256, y: 128 };
      const uv = coords.displayToUV(pt);
      const back = coords.uvToDisplay(uv);
      expect(back.x).toBeCloseTo(pt.x);
      expect(back.y).toBeCloseTo(pt.y);
    });

    it('converts display pixels to screen-local 3D coordinates on mesh plane', () => {
      // Center display pixel should map to (0, 0, 0) local
      const localCenter = coords.displayToScreenLocal({ x: 512, y: 320 });
      expect(localCenter.x).toBeCloseTo(0);
      expect(localCenter.y).toBeCloseTo(0);
      expect(localCenter.z).toBe(0);

      // Top-left display should map to (-meshWidth/2, meshHeight/2, 0)
      const localTopLeft = coords.displayToScreenLocal({ x: 0, y: 0 });
      expect(localTopLeft.x).toBeCloseTo(-0.17 / 2);
      expect(localTopLeft.y).toBeCloseTo(0.105 / 2);
      expect(localTopLeft.z).toBe(0);

      // Round-trip
      const back = coords.screenLocalToDisplay(localTopLeft);
      expect(back.x).toBeCloseTo(0);
      expect(back.y).toBeCloseTo(0);
    });

    it('converts display coordinates to Three.js world coordinates and back', () => {
      const screenMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.17, 0.105),
        new THREE.MeshStandardMaterial()
      );
      // Position and rotate screen mesh in world space
      screenMesh.position.set(1.5, 0.5, -2.0);
      screenMesh.rotation.y = Math.PI / 4;
      screenMesh.updateMatrixWorld(true);

      const displayPt = { x: 300, y: 200 };
      const worldPt = coords.displayToWorld(displayPt, screenMesh);

      // Convert back from world coordinates to display
      const backDisplay = coords.worldToDisplay(worldPt, screenMesh);
      expect(backDisplay.x).toBeCloseTo(displayPt.x);
      expect(backDisplay.y).toBeCloseTo(displayPt.y);
    });
  });

  describe('DisplayRenderTarget & Texture Binding', () => {
    it('initializes render target and attaches texture to mesh material', () => {
      const rt = new DisplayRenderTarget({ width: 1024, height: 640 });
      expect(rt.width).toBe(1024);
      expect(rt.height).toBe(640);
      expect(rt.texture).toBeInstanceOf(THREE.CanvasTexture);

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(0.17, 0.105),
        new THREE.MeshStandardMaterial()
      );

      rt.attachToScreenMesh(mesh);

      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.map).toBe(rt.texture);
      expect(mat.emissiveMap).toBe(rt.texture);
      expect(mat.emissiveIntensity).toBeGreaterThan(0.5);

      rt.dispose();
    });
  });

  describe('DisplayEngine', () => {
    it('initializes display engine with coordinates and render target', () => {
      const engine = new DisplayEngine();
      expect(engine.renderTarget.width).toBe(1024);
      expect(engine.renderTarget.height).toBe(640);
      expect(engine.coordinates).toBeDefined();

      // Calling render should not throw even in test environment
      expect(() =>
        engine.render({
          state: 'RUNNING',
          timeDivStr: '1.00ms',
          ch1Enabled: true,
          ch1VoltDivStr: '1.00V',
          ch2Enabled: false,
          ch2VoltDivStr: '1.00V',
          triggerMode: 'AUTO',
          triggerLevelStr: 'CH1 0.00V',
          sampleRateStr: '2.00 MS/s'
        })
      ).not.toThrow();

      engine.renderTarget.dispose();
    });
  });
});
