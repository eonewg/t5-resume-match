import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'T5_');
  const target = env.T5_API_PROXY_TARGET || 'http://127.0.0.1:8000';
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      proxy: Object.fromEntries(
        ['/api', '/health', '/ready', '/demo'].map((path) => [path, { target }]),
      ),
    },
    build: { outDir: 'dist', emptyOutDir: true },
  };
});
