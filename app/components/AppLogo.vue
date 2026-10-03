<template>
  <img
    src="/logo.svg"
    :width="size"
    :height="size"
    alt="WebHooker"
    class="app-logo"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number;
  }>(),
  {
    size: 32,
  },
);
</script>

<style scoped>
.app-logo {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
  border-radius: 22%;
}
</style>
