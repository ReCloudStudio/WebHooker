<template>
  <LegalLayout
    active="terms"
    :title="lang === 'zh' ? '服务条款' : 'Terms of Service'"
    :body="termsBody(lang, contact)"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { pickLang, legalContact, termsBody } from "~/utils/legal";

const route = useRoute();
const config = useRuntimeConfig();
const lang = computed(() => pickLang(String(route.query.lang ?? "")));
const contact = computed(() => legalContact(lang.value, String(config.public.legalContact ?? "")));
</script>
