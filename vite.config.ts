import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load env variables for configuring base path when building for production
    const env = loadEnv(mode, process.cwd(), '');
    const basePath = env.VITE_BASE_PATH || '/';

    return {
        plugins: [react()],
        base: basePath,
    };
});
