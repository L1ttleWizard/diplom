import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@domain': path.resolve(__dirname, './src/domain'),
      '@application': path.resolve(__dirname, './src/application'),
      '@rendering': path.resolve(__dirname, './src/rendering'),
      '@data': path.resolve(__dirname, './src/data'),
      '@workers': path.resolve(__dirname, './src/workers'),
      '@wasm': path.resolve(__dirname, './src/wasm'),
      '@storage': path.resolve(__dirname, './src/storage')
    }
  }
});
