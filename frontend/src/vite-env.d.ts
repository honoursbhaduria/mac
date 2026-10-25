/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute API origin for split deployments, e.g. https://api.example.com. Empty = same origin. */
  readonly VITE_API_BASE_URL?: string;
}
