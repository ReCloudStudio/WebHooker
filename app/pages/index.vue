<template>
  <div class="relative z-[1] mx-auto flex min-h-screen max-w-[720px] flex-col px-5 pb-16 pt-[72px]">
    <div class="mb-10 text-center">
      <div
        class="mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-xl font-extrabold tracking-tight text-white shadow-[0_8px_24px_-8px_var(--accent)]"
      >
        WH
      </div>
      <h1 class="mb-2.5 text-[34px] font-extrabold tracking-[-0.03em]">
        Web<span class="text-accent">Hooker</span>
      </h1>
      <p class="m-0 text-[15px] leading-relaxed text-muted">
        {{
          lang === "zh"
            ? "将 GitHub webhook 事件转发到 Discord 频道，并支持在 Discord 中以你本人身份操作 GitHub。"
            : "Forward GitHub webhook events to Discord, and act on GitHub from Discord as yourself."
        }}
      </p>
    </div>
    <nav class="grid gap-3">
      <a
        v-for="it in items"
        :key="it.label"
        class="flex items-center gap-4 rounded-[14px] border border-border bg-surface px-5 py-[18px] text-text no-underline shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-card-hover"
        :class="it.primary ? 'border-accent bg-accent shadow-none hover:border-accent hover:shadow-accent-lg' : ''"
        :href="it.href"
        :target="it.external ? '_blank' : undefined"
        :rel="it.external ? 'noopener noreferrer' : undefined"
      >
        <span
          class="flex h-11 w-11 flex-none items-center justify-center rounded-[11px] text-accent"
          :class="it.primary ? 'bg-white/15 text-white' : 'bg-surface-2'"
          v-html="icon(it.icon)"
        />
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[15px] font-bold" :class="it.primary ? 'text-white' : ''">{{
            it.label
          }}</span>
          <span class="text-[13px]" :class="it.primary ? 'text-white/80' : 'text-muted'">{{
            it.desc
          }}</span>
        </span>
        <span class="flex-none text-lg" :class="it.primary ? 'text-white' : 'text-faint'">{{
          it.external ? "↗" : "→"
        }}</span>
      </a>
    </nav>
    <footer class="mt-auto flex flex-wrap items-center justify-between gap-3 pt-10">
      <span class="text-[13px] text-muted">WebHooker · GitHub → Discord</span>
      <NuxtLink
        class="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] text-muted no-underline transition-colors hover:border-border-strong hover:text-text"
        :to="`/?lang=${altLang}`"
        >{{ lang === "zh" ? "English" : "中文" }}</NuxtLink
      >
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const DEFAULT_REPO = "https://github.com/ReCloudStudio/WebHooker";
const DEFAULT_DOCS = "https://webhooker.docs.worldexecute.me";

const route = useRoute();
const config = useRuntimeConfig();

const lang = computed(() => (route.query.lang === "en" ? "en" : "zh"));
const altLang = computed(() => (lang.value === "zh" ? "en" : "zh"));
const repo = computed(() => (config.public.repoUrl as string) || DEFAULT_REPO);
const docsBase = computed(() => ((config.public.docsUrl as string) || DEFAULT_DOCS).replace(/\/+$/, ""));

const t = (zh: string, en: string): string => (lang.value === "zh" ? zh : en);

const items = computed(() => {
  const docs = lang.value === "zh" ? `${docsBase.value}/zh` : `${docsBase.value}/`;
  const q = (p: string): string => `${p}?lang=${lang.value}`;
  return [
    {
      href: docs,
      label: t("文档", "Documentation"),
      desc: t("部署、配置与事件参考", "Deployment, configuration & event reference"),
      icon: "docs",
      external: true,
    },
    {
      href: repo.value,
      label: t("GitHub 仓库", "GitHub Repository"),
      desc: t("源代码、问题与发布", "Source code, issues & releases"),
      icon: "github",
      external: true,
    },
    {
      href: q("/terms"),
      label: t("服务条款", "Terms of Service"),
      desc: t("使用本服务的条款", "The terms for using this service"),
      icon: "terms",
      external: false,
    },
    {
      href: q("/privacy"),
      label: t("隐私政策", "Privacy Policy"),
      desc: t("我们如何处理你的数据", "How we handle your data"),
      icon: "privacy",
      external: false,
    },
    {
      href: "/admin/login",
      label: t("登录控制台", "Sign in to Console"),
      desc: t("管理路由与分组", "Manage routes and groups"),
      icon: "login",
      external: false,
      primary: true,
    },
  ];
});

const ICON_PATHS: Record<string, string> = {
  docs: '<path d="M4 4a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"/><path d="M13 2v5h5"/><path d="M8 12h8M8 16h6"/>',
  github:
    '<path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/>',
  terms: '<path d="M9 12h6M9 16h6M9 8h2"/><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>',
  privacy:
    '<path d="M12 2l7 3v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V5l7-3z"/><path d="M9 12l2 2 4-4"/>',
  login:
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
};

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${ICON_PATHS[name] ?? ""}</svg>`;
}

useHead({
  title: "WebHooker",
  meta: [
    {
      name: "description",
      content:
        lang.value === "zh"
          ? "GitHub webhook 转发到 Discord"
          : "GitHub webhooks forwarded to Discord",
    },
  ],
});
</script>

