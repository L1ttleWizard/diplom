import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Architectural Boundaries & Isolation', () => {
  const domainDir = path.resolve(__dirname, '../../src/domain');

  it('verifies that domain tests run in pure Node without browser globals', () => {
    expect((globalThis as Record<string, unknown>).window).toBeUndefined();
    expect((globalThis as Record<string, unknown>).document).toBeUndefined();
  });

  it('ensures src/domain has ZERO imports of React, Three.js, or DOM libraries', () => {
    const forbiddenImports = [
      /from\s+['"]react['"]/,
      /from\s+['"]react-dom['"]/,
      /from\s+['"]three['"]/,
      /from\s+['"]@react-three/,
      /from\s+['"]\.\.?\/application/,
      /from\s+['"]\.\.?\/rendering/,
      /from\s+['"]\.\.?\/data/,
      /from\s+['"]\.\.?\/workers/,
      /from\s+['"]\.\.?\/wasm/,
      /from\s+['"]\.\.?\/storage/
    ];

    const violations: string[] = [];

    function checkDir(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of forbiddenImports) {
            if (pattern.test(content)) {
              violations.push(`${path.relative(domainDir, fullPath)} matches ${pattern}`);
            }
          }
        }
      }
    }

    checkDir(domainDir);
    expect(violations).toEqual([]);
  });

  it('ensures no circular dependencies exist inside src/domain', () => {
    const graph: Record<string, string[]> = {};

    function buildGraph(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          buildGraph(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const importMatches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
          const imports: string[] = [];
          for (const m of importMatches) {
            const importTarget = m[1];
            if (importTarget.startsWith('.')) {
              const resolved = path.resolve(path.dirname(fullPath), importTarget);
              imports.push(resolved);
            }
          }
          const baseKey = fullPath.replace(/\.ts$/, '');
          graph[baseKey] = imports.map((i) => i.replace(/\.ts$/, ''));
        }
      }
    }

    buildGraph(domainDir);

    const cycles: string[] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    function dfs(node: string, pathStack: string[]): boolean {
      visited.add(node);
      recStack.add(node);

      const neighbors = graph[node] || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, [...pathStack, neighbor])) return true;
        } else if (recStack.has(neighbor)) {
          cycles.push(`${pathStack.join(' -> ')} -> ${neighbor}`);
          return true;
        }
      }

      recStack.delete(node);
      return false;
    }

    for (const node of Object.keys(graph)) {
      if (!visited.has(node)) {
        dfs(node, [node]);
      }
    }

    expect(cycles).toEqual([]);
  });
});
