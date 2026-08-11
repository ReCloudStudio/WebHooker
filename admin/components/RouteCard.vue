<template>
  <article class="card" :class="{ disabled: !route.enabled }">
    <div class="card-head">
      <div class="card-title">
        <label class="switch">
          <input type="checkbox" :checked="route.enabled" @change="onToggle" />
          <span class="track"></span>
        </label>
        <span class="route-name">{{ route.name || t("route.untitled") }}</span>
        <span class="route-id">{{ route.id }}</span>
        <span v-if="route.lang" class="badge lang">{{ route.lang }}</span>
        <span
          v-for="(tg, i) in route.targets"
          :key="i"
          class="badge"
          :class="tg.platform === 'telegram' ? 'fallback' : 'lang'"
          >{{ tg.platform === "telegram" ? "Telegram" : "Discord" }}</span
        >
        <span v-if="route.fallback" class="badge fallback">{{ t("route.fallback") }}</span>
        <span v-if="route.stop" class="badge stop">{{ t("route.stop") }}</span>
        <span v-if="route.discordRoleIds?.length" class="badge lang">@roles</span>
      </div>
      <div class="card-actions">
        <button
          class="icon-btn"
          :disabled="atFirst"
          :title="t('route.moveUp')"
          @click="$emit('move', route, -1)"
        >
          ↑
        </button>
        <button
          class="icon-btn"
          :disabled="atLast"
          :title="t('route.moveDown')"
          @click="$emit('move', route, 1)"
        >
          ↓
        </button>
        <button class="icon-btn" :title="t('routeEditor.editTitle')" @click="$emit('edit', route)">
          ✎
        </button>
        <button
          class="icon-btn danger"
          :title="t('routeEditor.close')"
          @click="$emit('delete', route)"
        >
          ✕
        </button>
      </div>
    </div>
    <div class="chips">
      <span v-for="(f, i) in route.filters" :key="i" class="chip" :class="{ exclude: f.exclude }">
        <span class="f-type"
          >{{ f.exclude ? t("routeEditor.not") + " " : "" }}{{ t("filter." + f.type) }}</span
        >
        <span class="f-val">{{ fmtMatch(f.match) }}</span>
      </span>
      <span v-if="!route.filters.length" class="chip"
        ><span class="f-type">{{ t("route.noFilters") }}</span></span
      >
    </div>
    <div class="target">
      <div v-for="(tg, i) in route.targets" :key="i" class="target-group">
        <span class="target-plat"
          ><b>{{ tg.platform === "telegram" ? t("route.chat") : t("route.channel") }}</b
          ><code>{{ tg.platform === "telegram" ? tg.chatId : tg.channelId }}</code></span
        >
        <span v-if="tg.platform === 'telegram' && tg.topicId"
          ><b>{{ t("route.topic") }}</b
          ><code>{{ tg.topicId }}</code></span
        >
        <span v-else-if="tg.platform !== 'telegram' && tg.threadId"
          ><b>{{ t("route.thread") }}</b
          ><code>{{ tg.threadId }}</code></span
        >
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import type { Route } from "~/types";
import { fmtMatch } from "~/types";

const { t } = useI18n();

const props = defineProps<{ route: Route; atFirst?: boolean; atLast?: boolean }>();
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
