/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load env variables for configuring base path when building for production
    const env = loadEnv(mode, process.cwd(), '');
    const isStaticMode = mode === 'static' || env.VITE_STATIC_MODE === 'true';
    const basePath = isStaticMode ? './' : (env.VITE_BASE_PATH || '/');

    return {
        plugins: [react()],
        base: basePath,
        build: {
            outDir: isStaticMode ? 'static' : 'dist',
            emptyOutDir: true,
            // Separate MotherDuck WASM client into its own chunk for lazy loading
            rollupOptions: {
                output: {
                    manualChunks: {
                        'motherduck-wasm': ['@motherduck/wasm-client'],
                    },
                },
            },
            // Ensure WASM files are handled correctly
            target: 'esnext',
        },
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts'],
            include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.{ts,tsx}'],
        },
        // Dev server headers required for WASM SharedArrayBuffer
        server: {
            headers: {
                'Cross-Origin-Embedder-Policy': 'require-corp',
                'Cross-Origin-Opener-Policy': 'same-origin',
            },
        },
        // Preview server (for `npm run preview`) also needs headers
        preview: {
            headers: {
                'Cross-Origin-Embedder-Policy': 'require-corp',
                'Cross-Origin-Opener-Policy': 'same-origin',
            },
        },
    };
});
