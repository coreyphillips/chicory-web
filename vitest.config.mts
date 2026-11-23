import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import paths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), paths()],
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-utils/setup.ts'], include: ['src/**/*.test.{ts,tsx}'] },
});
