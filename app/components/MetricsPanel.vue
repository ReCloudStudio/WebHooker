<script setup lang="ts">
import type { DeliveryMetrics } from "~/types";

const { t } = useI18n();

defineProps<{
  metrics: DeliveryMetrics | null;
  loading: boolean;
  error: string;
}>();

const emit = defineEmits<{ refresh: [] }>();

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
</script>

<template>
  <div class="log-toolbar">
    <span class="kpi-label">{{ t("metrics.title") }}</span>
    <button class="btn btn-ghost btn-sm" @click="emit('refresh')">
      {{ t("metrics.refresh") }}
    </button>
  </div>

  <p v-if="error" class="err">{{ error }}</p>
  <template v-else-if="metrics">
    <div class="log-list">
      <article class="log-entry">
        <div class="log-meta">
          <span class="kpi-label">{{ t("metrics.total") }}: {{ metrics.total }}</span>
          <span class="kpi-label">{{ t("metrics.ok") }}: {{ metrics.ok }}</span>
          <span class="kpi-label">{{ t("metrics.failed") }}: {{ metrics.failed }}</span>
          <span class="kpi-label"
            >{{ t("metrics.failureRate") }}: {{ pct(metrics.failureRate) }}</span
          >
          <span class="kpi-label">
            {{ t("metrics.avgDuration") }}: {{ metrics.avgDurationMs.toFixed(0) }}ms
          </span>
          <span class="kpi-label">
            {{ t("metrics.avgAttempts") }}: {{ metrics.avgAttempts.toFixed(1) }}
          </span>
        </div>
      </article>

      <article v-if="metrics.byPlatform.length" class="log-entry">
        <h3 class="log-head">{{ t("metrics.byPlatform") }}</h3>
        <div v-for="p in metrics.byPlatform" :key="p.platform" class="log-meta">
          <span class="kpi-label">{{ p.platform ?? "unknown" }}</span>
          <span class="kpi-label">{{ t("metrics.ok") }}: {{ p.ok }}</span>
          <span class="kpi-label">{{ t("metrics.failed") }}: {{ p.failed }}</span>
        </div>
      </article>

      <article v-if="metrics.byEvent.length" class="log-entry">
        <h3 class="log-head">{{ t("metrics.byEvent") }}</h3>
        <div v-for="e in metrics.byEvent" :key="e.event" class="log-meta">
          <span class="kpi-label">{{ e.event ?? "unknown" }}</span>
          <span class="kpi-label">{{ t("metrics.ok") }}: {{ e.ok }}</span>
          <span class="kpi-label">{{ t("metrics.failed") }}: {{ e.failed }}</span>
        </div>
      </article>

      <article v-if="metrics.recentFailures.length" class="log-entry">
        <h3 class="log-head">{{ t("metrics.recentFailures") }}</h3>
        <div
          v-for="f in metrics.recentFailures"
          :key="f.id ?? `${f.ts}-${f.target}`"
          class="log-entry"
        >
          <span class="log-route">{{ f.event }}</span>
          <span class="log-meta">{{ f.target }}</span>
          <span class="log-status ok" v-if="f.errorCode">{{ f.errorCode }}</span>
        </div>
      </article>
    </div>
  </template>
  <p v-else-if="!loading" class="empty-log">{{ t("metrics.empty") }}</p>
</template>
