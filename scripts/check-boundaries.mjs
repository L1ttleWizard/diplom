import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const domainDir = path.resolve(rootDir, 'src/domain');

console.log('=== Checking Architectural Boundaries ===');

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"]react['"]/,
  /from\s+['"]react-dom['"]/,
  /from\s+['"]three['"]/,
  /from\s+['"]@react-three/,
  /from\s+['"]\.\.?\/application/,
  /from\s+['"]\.\.?\/rendering/,
  /from\s+['"]\.\.?\/data/,
  /from\s+['"]\.\.?\/workers/,
  /from\s+['"]\.\.?\/wasm/,
  /from\s+['"]\.\.?\/storage/,
  /from\s+['"]@application/,
  /from\s+['"]@rendering/,
  /from\s+['"]@data/,
  /from\s+['"]@workers/,
  /from\s+['"]@wasm/,
  /from\s+['"]@storage/
];

const FORBIDDEN_GLOBAL_PATTERNS = [
  /\bwindow\./,
  /\bdocument\./,
  /\bHTMLElement\b/,
  /\blocalStorage\b/
];

let errors = [];

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relPath = path.relative(rootDir, filePath);

  // Check forbidden imports
  for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`[FORBIDDEN IMPORT] ${relPath} contains forbidden import matching ${pattern}`);
    }
  }

  // Check forbidden DOM globals
  for (const pattern of FORBIDDEN_GLOBAL_PATTERNS) {
    if (pattern.test(content)) {
      errors.push(`[FORBIDDEN GLOBAL] ${relPath} references DOM global matching ${pattern}`);
    }
  }
}

function traverse(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      traverse(fullPath);
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
      checkFile(fullPath);
    }
  }
}

traverse(domainDir);

// Check circular dependencies in src/domain
console.log('Checking circular dependencies in src/domain...');
const graph = {};

function buildGraph(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      buildGraph(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const importMatches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
      const imports = [];
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

function detectCycles() {
  const visited = new Set();
  const recStack = new Set();

  function dfs(node, pathStack) {
    visited.add(node);
    recStack.add(node);

    const neighbors = graph[node] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor, [...pathStack, neighbor])) return true;
      } else if (recStack.has(neighbor)) {
        errors.push(`[CIRCULAR DEPENDENCY] Cycle detected: ${pathStack.join(' -> ')} -> ${neighbor}`);
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
}

detectCycles();

if (errors.length > 0) {
  console.error('\nBoundary check FAILED with errors:');
  for (const err of errors) {
    console.error(' - ' + err);
  }
  process.exit(1);
} else {
  console.log('✓ All domain boundary checks passed: 0 forbidden imports, 0 DOM globals, 0 circular dependencies.');
}
