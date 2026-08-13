<template>
  <LegalLayout
    active="privacy"
    :title="lang === 'zh' ? '隐私政策' : 'Privacy Policy'"
    :body="privacyBody(lang, contact)"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { pickLang, legalContact, privacyBody } from "~/utils/legal";

const route = useRoute();
const config = useRuntimeConfig();
const lang = computed(() => pickLang(String(route.query.lang ?? "")));
const contact = computed(() => legalContact(lang.value, String(config.public.legalContact ?? "")));
</script>
