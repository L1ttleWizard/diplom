import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { AssetLifecycle } from '../../src/rendering/assets/AssetLifecycle';

describe('AssetLifecycle', () => {
  it('caches geometries and prevents duplicate allocation for identical keys', () => {
    const lifecycle = new AssetLifecycle();
    const factory = vi.fn(() => new THREE.BoxGeometry(1, 1, 1));

    const geo1 = lifecycle.getOrCreateGeometry('box_1', factory);
    const geo2 = lifecycle.getOrCreateGeometry('box_1', factory);

    expect(geo1).toBe(geo2);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(lifecycle.stats.cachedGeometries).toBe(1);
  });

  it('caches materials and prevents duplicate material creation', () => {
    const lifecycle = new AssetLifecycle();
    const factory = vi.fn(() => new THREE.MeshBasicMaterial({ color: '#ff0000' }));

    const mat1 = lifecycle.getOrCreateMaterial('red_mat', factory);
    const mat2 = lifecycle.getOrCreateMaterial('red_mat', factory);

    expect(mat1).toBe(mat2);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(lifecycle.stats.cachedMaterials).toBe(1);
  });

  it('disposes object hierarchy including geometry and material', () => {
    const lifecycle = new AssetLifecycle();
    const parent = new THREE.Group();
    const geo = new THREE.BoxGeometry();
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    parent.add(mesh);

    const geoDispose = vi.spyOn(geo, 'dispose');
    const matDispose = vi.spyOn(mat, 'dispose');

    lifecycle.disposeObject(mesh);

    expect(geoDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    expect(parent.children.length).toBe(0);
  });

  it('clears all cached resources and calls dispose on each', () => {
    const lifecycle = new AssetLifecycle();
    const geo = lifecycle.getOrCreateGeometry('g1', () => new THREE.SphereGeometry(1));
    const mat = lifecycle.getOrCreateMaterial('m1', () => new THREE.MeshStandardMaterial());

    const geoDispose = vi.spyOn(geo, 'dispose');
    const matDispose = vi.spyOn(mat, 'dispose');

    lifecycle.clearAll();

    expect(geoDispose).toHaveBeenCalled();
    expect(matDispose).toHaveBeenCalled();
    expect(lifecycle.stats.cachedGeometries).toBe(0);
    expect(lifecycle.stats.cachedMaterials).toBe(0);
  });
});
