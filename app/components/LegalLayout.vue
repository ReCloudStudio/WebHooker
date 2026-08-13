<template>
  <div class="mx-auto max-w-[760px] px-5 pb-20 pt-12">
    <header class="mb-7 flex flex-wrap items-center justify-between gap-4">
      <NuxtLink
        class="text-base font-extrabold tracking-[-0.01em] text-text no-underline"
        :to="q('/terms')"
        >Web<span class="text-accent">Hooker</span></NuxtLink
      >
      <nav class="flex gap-2">
        <NuxtLink
          class="rounded-full border border-transparent px-3.5 py-1.5 text-[13px] text-muted no-underline transition-colors hover:text-text"
          :class="active === 'terms' ? 'border-accent-border bg-accent-dim text-accent' : ''"
          :to="q('/terms')"
        >
          {{ t("服务条款", "Terms") }}
        </NuxtLink>
        <NuxtLink
          class="rounded-full border border-transparent px-3.5 py-1.5 text-[13px] text-muted no-underline transition-colors hover:text-text"
          :class="active === 'privacy' ? 'border-accent-border bg-accent-dim text-accent' : ''"
          :to="q('/privacy')"
        >
          {{ t("隐私政策", "Privacy") }}
        </NuxtLink>
      </nav>
    </header>
    <article
      class="rounded-xl border border-border bg-surface px-10 py-9 shadow-[0_1px_3px_var(--shadow)]"
    >
      <h1 class="mb-1.5 text-[26px] font-extrabold tracking-[-0.02em]">{{ title }}</h1>
      <p class="mb-6 text-[13px] text-muted">{{ t("最后更新", "Last updated") }}: {{ updated }}</p>
      <div class="legal-body" v-html="body" />
    </article>
    <footer class="mt-6 flex flex-wrap items-center justify-between gap-3">
      <span class="text-[13px] text-muted">WebHooker · GitHub → Discord</span>
      <NuxtLink
        class="rounded-full border border-border bg-surface px-3.5 py-1.5 text-[13px] text-muted no-underline transition-colors hover:text-text"
        :to="altLink"
        >{{ lang === "zh" ? "English" : "中文" }}</NuxtLink
      >
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { pickLang, type Lang } from "~/utils/legal";

const props = defineProps<{ active: "terms" | "privacy"; title: string; body: string }>();

const route = useRoute();
const config = useRuntimeConfig();

const lang = computed<Lang>(() => pickLang(String(route.query.lang ?? "")));
const altLang = computed(() => (lang.value === "zh" ? "en" : "zh"));
const updated = computed(() => "2026-08-01");

const t = (zh: string, en: string): string => (lang.value === "zh" ? zh : en);
const q = (p: string): string => `${p}?lang=${lang.value}`;
const altLink = computed(() =>
  q(props.active === "terms" ? "/terms" : "/privacy").replace(
    `lang=${lang.value}`,
    `lang=${altLang.value}`,
  ),
);

useHead({ title: `${props.title} · WebHooker` });
void config;
</script>
