import { defineConfig } from "vitepress";

const github = "https://github.com/ReCloudStudio/WebHooker";

export default defineConfig({
  title: "WebHooker",
  description: "GitHub webhook to Discord dispatcher on Cloudflare Workers",
  base: "/",

  head: [["link", { rel: "icon", type: "image/svg+xml", href: "/logo.svg" }]],

  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/introduction" },
          { text: "API", link: "/api/overview" },
          { text: "Events", link: "/events/supported" },
          {
            text: "Links",
            items: [
              { text: "GitHub", link: github },
              { text: "Changelog", link: `${github}/releases` },
            ],
          },
        ],
        sidebar: {
          "/guide/": [
            {
              text: "Guide",
              items: [
                { text: "Introduction", link: "/guide/introduction" },
                { text: "Getting Started", link: "/guide/getting-started" },
                { text: "Configuration", link: "/guide/configuration" },
                { text: "Filter Tutorial", link: "/guide/filters" },
                { text: "Deployment", link: "/guide/deployment" },
              ],
            },
          ],
          "/api/": [
            {
              text: "API Reference",
              items: [
                { text: "Overview", link: "/api/overview" },
                { text: "OAuth", link: "/api/oauth" },
                { text: "Actions", link: "/api/actions" },
              ],
            },
          ],
          "/events/": [
            {
              text: "Events",
              items: [{ text: "Supported Events", link: "/events/supported" }],
            },
          ],
        },
        footer: {
          message: "Released under the MIT License.",
          copyright: "Copyright 2025 ReCloudStudio",
        },
        editLink: {
          pattern: `${github}/edit/main/docs/:path`,
          text: "Edit this page on GitHub",
        },
      },
    },
    zh: {
      label: "简体中文",
      lang: "zh-CN",
      themeConfig: {
        nav: [
          { text: "指南", link: "/zh/guide/introduction" },
          { text: "API", link: "/zh/api/overview" },
          { text: "事件", link: "/zh/events/supported" },
          {
            text: "链接",
            items: [
              { text: "GitHub", link: github },
              { text: "更新日志", link: `${github}/releases` },
            ],
          },
        ],
        sidebar: {
          "/zh/guide/": [
            {
              text: "指南",
              items: [
                { text: "简介", link: "/zh/guide/introduction" },
                { text: "快速开始", link: "/zh/guide/getting-started" },
                { text: "配置", link: "/zh/guide/configuration" },
                { text: "过滤器教程", link: "/zh/guide/filters" },
                { text: "部署", link: "/zh/guide/deployment" },
              ],
            },
          ],
          "/zh/api/": [
            {
              text: "API 参考",
              items: [
                { text: "概览", link: "/zh/api/overview" },
                { text: "OAuth", link: "/zh/api/oauth" },
                { text: "用户操作", link: "/zh/api/actions" },
              ],
            },
          ],
          "/zh/events/": [
            {
              text: "事件",
              items: [{ text: "支持的事件", link: "/zh/events/supported" }],
            },
          ],
        },
        footer: {
          message: "基于 MIT 许可发布。",
          copyright: "Copyright 2025 ReCloudStudio",
        },
        editLink: {
          pattern: `${github}/edit/main/docs/:path`,
          text: "在 GitHub 上编辑此页面",
        },
      },
    },
  },

  themeConfig: {
    logo: "/logo.svg",
    socialLinks: [{ icon: "github", link: github }],
    search: { provider: "local" },
  },
});
