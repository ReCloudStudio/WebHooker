<script setup lang="ts">
const props = defineProps<{ modelValue: string[]; placeholder?: string }>();
const emit = defineEmits<{ (e: "update:modelValue", value: string[]): void }>();
</script>

<template>
  <RcTagInput
    :model-value="props.modelValue"
    :placeholder="props.placeholder"
    separator=","
    unique
    size="sm"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
