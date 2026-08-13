export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  modules: ["@nuxtjs/tailwindcss"],
  // Target: Cloudflare Workers (single _worker.js via the cloudflare_module preset).
  nitro: {
    preset: "cloudflare_module",
    errorHandler: "~~/server/error-handler",
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      "*/5 * * * *": ["discord-sync", "telegram-sync", "audit-prune"],
    },
  },
  app: {
    head: {
      title: "WebHooker",
      link: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
        },
      ],
    },
  },
  tailwindcss: {
    cssPath: "~/assets/css/main.css",
    configPath: "tailwind.config",
  },
  devtools: { enabled: false },
  runtimeConfig: {
    // Overridable via NUXT_PUBLIC_DOCS_URL / NUXT_PUBLIC_REPO_URL.
    public: {
      docsUrl: "",
      repoUrl: "",
    },
  },
  // The config console stays a client-side SPA (same behavior as the old
  // standalone admin app); home/legal pages render server-side.
  routeRules: {
    "/admin/**": { ssr: false },
  },
});
