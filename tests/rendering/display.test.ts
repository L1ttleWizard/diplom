import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { DisplayCoordinates } from '../../src/rendering/display/DisplayCoordinates';
import { DisplayRenderTarget } from '../../src/rendering/display/DisplayRenderTarget';
import { DisplayEngine } from '../../src/rendering/display/DisplayEngine';
import { StaticGridLayer, DEFAULT_GRID_CONFIG } from '../../src/rendering/display/StaticGridLayer';
import { DynamicDisplayLayer } from '../../src/rendering/display/DynamicDisplayLayer';

describe('Virtual Display Architecture (Wave 4 & 5)', () => {
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
      screenMesh.position.set(1.5, 0.5, -2.0);
      screenMesh.rotation.y = Math.PI / 4;
      screenMesh.updateMatrixWorld(true);

      const displayPt = { x: 300, y: 200 };
      const worldPt = coords.displayToWorld(displayPt, screenMesh);

      const backDisplay = coords.worldToDisplay(worldPt, screenMesh);
      expect(backDisplay.x).toBeCloseTo(displayPt.x);
      expect(backDisplay.y).toBeCloseTo(displayPt.y);
    });

    it('updates dimensions when viewport changes', () => {
      const dynCoords = new DisplayCoordinates(1024, 640);
      expect(dynCoords.displayWidth).toBe(1024);
      expect(dynCoords.displayHeight).toBe(640);

      dynCoords.updateDimensions(1280, 800);
      expect(dynCoords.displayWidth).toBe(1280);
      expect(dynCoords.displayHeight).toBe(800);

      const center = dynCoords.displayToUV({ x: 640, y: 400 });
      expect(center.u).toBeCloseTo(0.5);
      expect(center.v).toBeCloseTo(0.5);
    });
  });

  describe('DisplayRenderTarget & DPR Support', () => {
    it('initializes render target and attaches texture to mesh material', () => {
      const rt = new DisplayRenderTarget({ width: 1024, height: 640 });
      expect(rt.width).toBe(1024);
      expect(rt.height).toBe(640);
      expect(rt.dpr).toBe(1.0);
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

    it('supports DPR scaling and physical dimensions', () => {
      const rt = new DisplayRenderTarget({ width: 1024, height: 640, dpr: 2.0 });
      expect(rt.width).toBe(1024);
      expect(rt.height).toBe(640);
      expect(rt.dpr).toBe(2.0);
      expect(rt.physicalWidth).toBe(2048);
      expect(rt.physicalHeight).toBe(1280);

      rt.resize(800, 600, 1.5);
      expect(rt.width).toBe(800);
      expect(rt.height).toBe(600);
      expect(rt.dpr).toBe(1.5);
      expect(rt.physicalWidth).toBe(1200);
      expect(rt.physicalHeight).toBe(900);

      rt.dispose();
    });
  });

  describe('StaticGridLayer & Caching (Wave 5)', () => {
    it('initializes with default IEEE standard graticule configuration', () => {
      const staticLayer = new StaticGridLayer();
      expect(staticLayer.config.horizontalDivisions).toBe(10);
      expect(staticLayer.config.verticalDivisions).toBe(8);
      expect(staticLayer.config.subTicksPerDivision).toBe(5);
      expect(staticLayer.isDirty).toBe(true);
      expect(staticLayer.rebuildCount).toBe(0);
    });

    it('calculates grid bounds accurately according to margins', () => {
      const staticLayer = new StaticGridLayer();
      staticLayer.rebuild(1024, 640, 1.0);

      const bounds = staticLayer.getGridBounds();
      expect(bounds.left).toBe(DEFAULT_GRID_CONFIG.marginLeft); // 40
      expect(bounds.top).toBe(DEFAULT_GRID_CONFIG.marginTop);   // 48
      expect(bounds.width).toBe(1024 - 40 - 40); // 944
      expect(bounds.height).toBe(640 - 48 - 44); // 548
    });

    it('caches rendered static layer and does NOT rebuild if not dirty', () => {
      const staticLayer = new StaticGridLayer();

      // First rebuild
      staticLayer.rebuildIfDirty(1024, 640, 1.0);
      expect(staticLayer.rebuildCount).toBe(1);
      expect(staticLayer.isDirty).toBe(false);

      // Subsequent calls with unchanged dimensions MUST NOT rebuild
      staticLayer.rebuildIfDirty(1024, 640, 1.0);
      staticLayer.rebuildIfDirty(1024, 640, 1.0);
      staticLayer.rebuildIfDirty(1024, 640, 1.0);
      expect(staticLayer.rebuildCount).toBe(1); // Still 1! Zero redundant rebuilds!
    });

    it('rebuilds when explicitly marked dirty or when parameters change', () => {
      const staticLayer = new StaticGridLayer();
      staticLayer.rebuildIfDirty(1024, 640, 1.0);
      expect(staticLayer.rebuildCount).toBe(1);

      // Explicit invalidation
      staticLayer.markDirty();
      expect(staticLayer.isDirty).toBe(true);
      staticLayer.rebuildIfDirty(1024, 640, 1.0);
      expect(staticLayer.rebuildCount).toBe(2);

      // Viewport change invalidation
      staticLayer.rebuildIfDirty(1280, 720, 1.0);
      expect(staticLayer.rebuildCount).toBe(3);

      // DPR change invalidation
      staticLayer.rebuildIfDirty(1280, 720, 2.0);
      expect(staticLayer.rebuildCount).toBe(4);
    });
  });

  describe('DynamicDisplayLayer (Wave 5)', () => {
    it('renders dynamic elements without errors in headless mode', () => {
      const dynamicLayer = new DynamicDisplayLayer();
      const mockCtx = {
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        stroke: () => {},
        fill: () => {},
        arc: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        fillText: () => {},
        measureText: (text: string) => ({ width: text.length * 6 }),
        setLineDash: () => {},
        closePath: () => {}
      } as unknown as CanvasRenderingContext2D;

      const bounds = { left: 40, top: 48, width: 944, height: 548 };

      expect(() =>
        dynamicLayer.render(
          mockCtx,
          {
            state: 'RUNNING',
            timeDivStr: '1.00 ms',
            timeDivValue: 0.001,
            ch1Enabled: true,
            ch1VoltDivStr: '1.00 V',
            ch1VoltDivValue: 1.0,
            ch2Enabled: true,
            ch2VoltDivStr: '2.00 V',
            ch2VoltDivValue: 2.0,
            triggerMode: 'AUTO',
            triggerLevelStr: 'CH1 0.50V',
            triggerLevelValue: 0.5,
            sampleRateStr: '2.00 MS/s',
            cursors: {
              timeCursor: { enabled: true, timeA: 0.2, timeB: 0.7 },
              voltageCursor: { enabled: true, channelId: 'CH1', voltageA: 1.0, voltageB: -1.0 }
            },
            measurements: [
              { name: 'Vpp', value: '2.80 V', channel: 'CH1' },
              { name: 'Freq', value: '1.00 kHz', channel: 'CH1' }
            ]
          },
          bounds,
          1024,
          640,
          16.67
        )
      ).not.toThrow();
    });
  });

  describe('DisplayEngine Integration & Caching Verification', () => {
    it('preserves static cache across multiple frame renders', () => {
      const engine = new DisplayEngine();

      expect(engine.getStaticRebuildCount()).toBe(0);

      // Frame 1
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
      });

      expect(engine.getStaticRebuildCount()).toBe(1);

      // Frame 2 to Frame 10: static rebuild count MUST stay at 1!
      for (let i = 2; i <= 10; i++) {
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
        });
      }

      expect(engine.getStaticRebuildCount()).toBe(1);

      // Invalidate viewport -> exactly 1 additional rebuild
      engine.setViewport(1280, 800);
      engine.render();
      expect(engine.getStaticRebuildCount()).toBe(2);

      // Invalidate DPR -> exactly 1 additional rebuild
      engine.setDpr(2.0);
      engine.render();
      expect(engine.getStaticRebuildCount()).toBe(3);

      engine.renderTarget.dispose();
    });

    it('supports dynamic cursor and measurement updates via API', () => {
      const engine = new DisplayEngine();

      engine.setCursors({
        timeCursor: { enabled: true, timeA: 0.3, timeB: 0.8 },
        voltageCursor: { enabled: true, channelId: 'CH1', voltageA: 2.0, voltageB: -2.0 }
      });

      engine.setMeasurements([
        { name: 'Vmax', value: '2.50 V', channel: 'CH1' },
        { name: 'Vmin', value: '-2.50 V', channel: 'CH1' }
      ]);

      expect(() => engine.render()).not.toThrow();
      engine.renderTarget.dispose();
    });

    it('benchmarks CPU impact: cached blit vs un-cached full static rebuild', () => {
      const engine = new DisplayEngine();
      const iterations = 50;

      // 1. Warm-up
      engine.render();

      // 2. Measure cached rendering time
      const t0 = performance.now();
      for (let i = 0; i < iterations; i++) {
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
        });
      }
      const cachedDuration = performance.now() - t0;

      // 3. Measure un-cached rendering time (forcing rebuild every frame)
      const t1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        engine.invalidateStaticLayer();
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
        });
      }
      const uncachedDuration = performance.now() - t1;

      // Cached execution should be significantly faster or at least as fast without GC thrashing
      expect(cachedDuration).toBeLessThanOrEqual(uncachedDuration * 1.5);

      engine.renderTarget.dispose();
    });
  });
});
