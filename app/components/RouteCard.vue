<template>
  <article class="route-card" :class="{ disabled: !route.enabled }">
    <div class="route-card-main">
      <div class="route-card-header">
        <label v-if="!readonly" class="switch">
          <input type="checkbox" :checked="route.enabled" @change="onToggle" />
          <span class="track"></span>
        </label>
        <span v-if="readonly" class="dot" :class="route.enabled ? 'ok' : 'bad'"></span>
        <div class="route-card-title">
          <span class="route-name">{{ route.name || t("route.untitled") }}</span>
          <span class="route-id">{{ route.id }}</span>
        </div>
        <div class="route-card-badges">
          <span
            v-for="(tg, i) in route.targets"
            :key="i"
            class="route-badge"
            :class="tg.platform === 'telegram' ? 'route-badge-tg' : 'route-badge-dc'"
          >
            <span
              class="route-badge-dot"
              :class="tg.platform === 'telegram' ? 'bg-info' : 'bg-accent'"
            ></span>
            {{ tg.platform === "telegram" ? "Telegram" : "Discord" }}
          </span>
          <span v-if="route.fallback" class="route-badge route-badge-fallback">{{
            t("route.fallback")
          }}</span>
          <span v-if="route.stop" class="route-badge route-badge-stop">{{ t("route.stop") }}</span>
          <span v-if="route.discordRoleIds?.length" class="route-badge route-badge-role"
            >@roles</span
          >
        </div>
      </div>

      <div class="route-card-filters">
        <span
          v-for="(f, i) in route.filters"
          :key="i"
          class="route-chip"
          :class="{ exclude: f.exclude }"
        >
          <span class="route-chip-type"
            >{{ f.exclude ? t("routeEditor.not") + " " : "" }}{{ t("filter." + f.type) }}</span
          >
          <span class="route-chip-val">{{ fmtMatch(f.match) }}</span>
        </span>
        <span v-if="!route.filters.length" class="route-chip route-chip-empty">
          <span class="route-chip-type">{{ t("route.noFilters") }}</span>
        </span>
      </div>

      <div class="route-card-targets" v-if="route.targets.length">
        <div v-for="(tg, i) in route.targets" :key="i" class="route-target">
          <div class="route-target-row">
            <span class="route-target-label">
              <template v-if="tg.platform === 'telegram'">{{ t("route.chat") }}</template>
              <template v-else-if="tg.threadId">{{ t("route.thread") }}</template>
              <template v-else>{{ t("route.channel") }}</template>
            </span>
            <code class="route-target-id">
              <template v-if="tg.platform === 'telegram'">{{ tg.chatId }}</template>
              <template v-else-if="tg.threadId">{{ tg.threadId }}</template>
              <template v-else>{{ tg.channelId }}</template>
            </code>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!readonly" class="route-card-actions">
      <button
        class="route-action-btn"
        :disabled="atFirst"
        :title="t('route.moveUp')"
        @click="$emit('move', route, -1)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>
      <button
        class="route-action-btn"
        :disabled="atLast"
        :title="t('route.moveDown')"
        @click="$emit('move', route, 1)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <button
        class="route-action-btn"
        :title="t('routeEditor.editTitle')"
        @click="$emit('edit', route)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </button>
      <button
        class="route-action-btn route-action-btn-danger"
        :title="t('routeEditor.close')"
        @click="$emit('delete', route)"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Route } from "~/types";
import { fmtMatch } from "~/types";

const { t } = useI18n();

const props = defineProps<{
  route: Route;
  atFirst?: boolean;
  atLast?: boolean;
  readonly?: boolean;
}>();
const emit = defineEmits<{
  (e: "toggle", route: Route): void;
  (e: "edit", route: Route): void;
  (e: "delete", route: Route): void;
  (e: "move", route: Route, dir: -1 | 1): void;
}>();

function onToggle(event: Event): void {
  const next = { ...props.route, enabled: (event.target as HTMLInputElement).checked };
  emit("toggle", next);
}
</script>
