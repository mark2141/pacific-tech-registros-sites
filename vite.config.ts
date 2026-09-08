import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig(async () => {
  const target = process.env.DEPLOY_TARGET === "sites" ? "sites" : "netlify";
  const platformDirectory = fileURLToPath(new URL(`./platforms/${target}`, import.meta.url));
  const plugins: PluginOption[] = [vinext()];

  if (target === "sites") {
    process.env.WRANGLER_WRITE_LOGS ??= "false";
    process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
    process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";
    const { sites } = await import("@openai/sites-vite-plugin");
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    plugins.push(sites(), cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      config: {
        main: "vinext/server/fetch-handler",
        compatibility_flags: ["nodejs_compat"],
        r2_buckets: [{ binding: "FILES", bucket_name: "pacific-tech-files-local" }],
        d1_databases: [{
          binding: "DB",
          database_name: "pacific-tech-sites-local",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: "drizzle",
        }],
      },
    }));
  } else {
    const { nitro } = await import("nitro/vite");
    plugins.push(nitro({ preset: "netlify" }));
  }

  return {
    resolve: { alias: { "@platform": platformDirectory } },
    server: { host: "0.0.0.0", allowedHosts: ["terminal.local"] },
    plugins,
  };
});
