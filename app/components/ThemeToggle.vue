<template>
  <button
    type="button"
    class="theme-toggle-btn"
    :title="label"
    :aria-label="label"
    @click="cycleTheme"
  >
    <component :is="currentIcon" :size="size" />
    <span v-if="showLabel" class="theme-label">{{ shortLabel }}</span>
  </button>
</template>

<script setup lang="ts">
import { Laptop, Moon, Sun } from "lucide-vue-next";
import { computed } from "vue";
import { useTheme } from "~/composables/useTheme";

const props = withDefaults(
  defineProps<{
    size?: number;
    showLabel?: boolean;
    compact?: boolean;
  }>(),
  {
    size: 16,
    showLabel: false,
    compact: false,
  },
);

const { theme, cycleTheme } = useTheme();

const currentIcon = computed(() => {
  if (theme.value === "light") return Sun;
  if (theme.value === "dark") return Moon;
  return Laptop;
});

const label = computed(() => {
  if (theme.value === "light") return "浅色模式 (点击切换为深色)";
  if (theme.value === "dark") return "深色模式 (点击切换为跟随系统)";
  return "跟随系统 (点击切换为浅色)";
});

const shortLabel = computed(() => {
  if (theme.value === "light") return "浅色";
  if (theme.value === "dark") return "深色";
  return "自动";
});
</script>

<style scoped>
.theme-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  padding: 0.4rem 0.55rem;
  border-radius: 9999px;
  border: 1px solid rgb(var(--wh-border));
  background: rgb(var(--wh-surface));
  color: rgb(var(--wh-muted));
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 150ms ease;
}

.theme-toggle-btn:hover {
  border-color: rgb(var(--wh-accent));
  color: rgb(var(--wh-text));
  background: rgb(var(--wh-surface-2));
}

.theme-label {
  font-size: 0.75rem;
}
</style>
