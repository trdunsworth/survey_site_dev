/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_BASE_PATH: string;
  readonly VITE_STATIC_MODE: string;
  readonly VITE_MOTHERDUCK_TOKEN: string;
  readonly VITE_MOTHERDUCK_DB: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}