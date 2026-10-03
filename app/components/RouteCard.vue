<template>
  <RcCard variant="outline" padding="none" :class="cardClass">
    <div class="route-card-main">
      <div class="route-card-header">
        <RcSwitch
          v-if="!readonly"
          :model-value="route.enabled"
          size="sm"
          @update:model-value="onToggle"
        />
        <span v-if="readonly" class="dot" :class="route.enabled ? 'ok' : 'bad'"></span>
        <div class="route-card-title">
          <span class="route-name">{{ route.name || t("route.untitled") }}</span>
          <span class="route-id">{{ route.id }}</span>
        </div>
        <div class="route-card-badges">
          <RcBadge
            v-for="(tg, i) in route.targets"
            :key="i"
            size="xs"
            class="route-badge"
            :class="
              tg.platform === 'telegram'
                ? 'route-badge-tg'
                : tg.platform === 'feishu'
                  ? 'route-badge-fs'
                  : 'route-badge-dc'
            "
          >
            <span
              class="route-badge-dot"
              :class="
                tg.platform === 'telegram'
                  ? 'bg-info'
                  : tg.platform === 'feishu'
                    ? 'bg-warn'
                    : 'bg-accent'
              "
            ></span>
            {{
              tg.platform === "telegram"
                ? "Telegram"
                : tg.platform === "feishu"
                  ? t("route.feishu")
                  : "Discord"
            }}
          </RcBadge>
          <RcBadge
            v-if="route.fallback"
            variant="warning"
            size="xs"
            class="route-badge route-badge-fallback"
            >{{ t("route.fallback") }}</RcBadge
          >
          <RcBadge
            v-if="route.stop"
            variant="destructive"
            size="xs"
            class="route-badge route-badge-stop"
            >{{ t("route.stop") }}</RcBadge
          >
          <RcBadge
            v-if="route.discordRoleIds?.length"
            size="xs"
            class="route-badge route-badge-role"
            >@roles</RcBadge
          >
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <div class="route-card-filters">
          <span v-if="summary" class="route-chip">
            <span class="route-chip-val">{{ summary }}</span>
          </span>
          <span v-else class="route-chip route-chip-empty">
            <span class="route-chip-type">{{ t("route.noFilters") }}</span>
          </span>
        </div>

        <div v-if="route.targets.length" class="route-card-targets">
          <div v-for="(tg, i) in route.targets" :key="i" class="route-target">
            <div class="route-target-row">
              <span class="route-target-label">
                <template v-if="tg.platform === 'telegram' || tg.platform === 'feishu'">{{
                  t("route.chat")
                }}</template>
                <template v-else-if="tg.threadId">{{ t("route.thread") }}</template>
                <template v-else>{{ t("route.channel") }}</template>
              </span>
              <code class="route-target-id">
                <template v-if="tg.platform === 'telegram' || tg.platform === 'feishu'">{{
                  tg.chatId
                }}</template>
                <template v-else-if="tg.threadId">{{ tg.threadId }}</template>
                <template v-else>{{ tg.channelId }}</template>
              </code>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!readonly" class="route-card-actions">
      <RcButton
        type="button"
        variant="ghost"
        size="icon"
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
      </RcButton>
      <RcButton
        type="button"
        variant="ghost"
        size="icon"
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
      </RcButton>
      <RcButton
        type="button"
        variant="ghost"
        size="icon"
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
      </RcButton>
      <RcButton
        type="button"
        variant="destructive"
        size="icon"
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
      </RcButton>
    </div>
  </RcCard>
</template>

<script setup lang="ts">
import type { FilterNode, Route } from "~/types";
import { describeNode } from "~/composables/useFilterNode";

const { t } = useI18n();

const props = defineProps<{
  route: Route;
  atFirst?: boolean;
  atLast?: boolean;
  readonly?: boolean;
}>();

const summary = computed(() => {
  const node: FilterNode = props.route.ast ?? { all: props.route.filters };
  return describeNode(node, t);
});
const cardClass = computed(() => `route-card${props.route.enabled ? "" : " disabled"}`);
const emit = defineEmits<{
  (e: "toggle", route: Route): void;
  (e: "edit", route: Route): void;
  (e: "delete", route: Route): void;
  (e: "move", route: Route, dir: -1 | 1): void;
}>();

function onToggle(enabled: boolean): void {
  const next = { ...props.route, enabled };
  emit("toggle", next);
}
</script>
