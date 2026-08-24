<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{ modelValue: string[]; placeholder?: string }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string[]): void }>();

const text = ref("");

function add(value: string) {
  const v = value.trim();
  if (!v) return;
  if (props.modelValue.includes(v)) return;
  emit("update:modelValue", [...props.modelValue, v]);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === ",") {
    e.preventDefault();
    add(text.value);
    text.value = "";
  } else if (e.key === "Backspace" && text.value === "" && props.modelValue.length > 0) {
    emit("update:modelValue", props.modelValue.slice(0, -1));
  }
}

function onBlur() {
  if (text.value) {
    add(text.value);
    text.value = "";
  }
}

function remove(index: number) {
  const next = [...props.modelValue];
  next.splice(index, 1);
  emit("update:modelValue", next);
}
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface/60 px-2 py-1.5 focus-within:border-accent"
  >
    <span
      v-for="(v, i) in modelValue"
      :key="`${v}-${i}`"
      class="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 text-xs text-accent"
    >
      {{ v }}
      <button
        type="button"
        class="text-accent/70 hover:text-accent"
        :aria-label="'remove'"
        @click="remove(i)"
      >
        &times;
      </button>
    </span>
    <input
      v-model="text"
      type="text"
      class="min-w-[8rem] flex-1 bg-transparent text-sm text-text outline-none placeholder:text-text/40"
      :placeholder="placeholder"
      @keydown="onKeydown"
      @blur="onBlur"
    />
  </div>
</template>
