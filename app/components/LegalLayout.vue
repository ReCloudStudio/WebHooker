<template>
  <main class="legal-shell">
    <header class="legal-header">
      <NuxtLink class="legal-brand" :to="q('/')"><AppLogo :size="28" /><span>WebHooker</span></NuxtLink>
      <nav aria-label="Legal navigation">
        <NuxtLink v-for="item in links" :key="item.key" :to="q(item.path)">
          <RcBadge :variant="active === item.key ? 'brand' : 'subtle'" size="sm">{{ item.label }}</RcBadge>
        </NuxtLink>
      </nav>
    </header>
    <section class="legal-heading">
      <p>{{ t("WebHooker 服务规范", "WebHooker service policy") }}</p>
      <h1>{{ title }}</h1>
      <span>{{ t("最后更新", "Last updated") }} · {{ updated }}</span>
    </section>
    <RcCard variant="outline" padding="lg" class="legal-card"><article class="legal-body" v-html="body" /></RcCard>
    <footer class="legal-footer">
      <NuxtLink :to="q('/')">{{ t("返回首页", "Back to home") }}</NuxtLink>
      <div class="legal-footer-actions">
        <ThemeToggle show-label />
        <NuxtLink :to="altLink">{{ lang === "zh" ? "English" : "中文" }}</NuxtLink>
      </div>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { pickLang, type Lang } from "~/utils/legal";

const props = defineProps<{ active: "terms" | "privacy"; title: string; body: string }>();
const route = useRoute();
const lang = computed<Lang>(() => pickLang(String(route.query.lang ?? "")));
const altLang = computed(() => (lang.value === "zh" ? "en" : "zh"));
const updated = "2026-08-01";
const t = (zh: string, en: string): string => (lang.value === "zh" ? zh : en);
const q = (path: string): string => `${path}?lang=${lang.value}`;
const links = computed(() => [
  { key: "terms" as const, path: "/terms", label: t("服务条款", "Terms") },
  { key: "privacy" as const, path: "/privacy", label: t("隐私政策", "Privacy") },
]);
const altLink = computed(() => `${props.active === "terms" ? "/terms" : "/privacy"}?lang=${altLang.value}`);

useHead({ title: `${props.title} · WebHooker` });
</script>

<style scoped>
.legal-shell { position: relative; z-index: 1; width: min(100% - 2rem, 860px); margin: 0 auto; padding: 2rem 0 4rem; } .legal-header, .legal-footer { display: flex; align-items: center; justify-content: space-between; gap: 1rem; } .legal-brand { display: inline-flex; align-items: center; gap: .6rem; color: rgb(var(--wh-text)); font-size: 1rem; font-weight: 800; text-decoration: none; letter-spacing: -.035em; } .legal-brand :deep(svg) { color: rgb(var(--wh-accent)); } nav { display: flex; gap: .35rem; } nav a { text-decoration: none; }
.legal-heading { max-width: 640px; padding: clamp(4rem, 11vw, 7rem) 0 clamp(2rem, 6vw, 3.5rem); } .legal-heading p { margin: 0 0 .75rem; color: rgb(var(--wh-accent)); font-size: .72rem; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; } .legal-heading h1 { margin: 0; font-size: clamp(2.4rem, 7vw, 4rem); letter-spacing: -.06em; line-height: 1; } .legal-heading span { display: block; margin-top: 1rem; color: rgb(var(--wh-faint)); font-size: .78rem; }
.legal-card { box-shadow: 0 24px 60px rgb(var(--wh-text) / .06); } .legal-body :deep(h2) { margin: 2.25rem 0 .75rem; font-size: 1.1rem; letter-spacing: -.02em; } .legal-body :deep(h2:first-child) { margin-top: 0; } .legal-body :deep(p), .legal-body :deep(li) { color: rgb(var(--wh-body-text)); line-height: 1.8; } .legal-body :deep(a) { color: rgb(var(--wh-accent)); } .legal-body :deep(ul) { padding-left: 1.25rem; }
.legal-footer { margin-top: 1.5rem; color: rgb(var(--wh-muted)); font-size: .78rem; } .legal-footer-actions { display: flex; align-items: center; gap: .75rem; } .legal-footer a { color: inherit; text-decoration: none; } .legal-footer a:hover { color: rgb(var(--wh-accent)); }
@media (max-width: 520px) { .legal-shell { width: min(100% - 1.5rem, 860px); } .legal-header { align-items: flex-start; flex-direction: column; } }
</style>
