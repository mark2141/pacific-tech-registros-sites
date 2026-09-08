/// <reference types="@cloudflare/workers-types" />
/// <reference types="vite/client" />

declare namespace Cloudflare {
  interface Env { DB: D1Database; FILES: R2Bucket; }
}
