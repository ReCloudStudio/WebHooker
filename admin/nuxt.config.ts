export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: "2025-01-01",
  app: {
    head: {
      title: "WebHooker · Config Console",
      link: [
        {
          rel: "stylesheet",
          href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
        },
      ],
    },
  },
  css: ["~/assets/css/main.css"],
  devtools: { enabled: false },
  runtimeConfig: {
    public: {
      apiBase: "/admin/api",
    },
  },
});
