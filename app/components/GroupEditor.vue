<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="close"></div>
    </Transition>
    <Transition name="slide">
      <aside v-if="open" class="editor" role="dialog" aria-modal="true">
        <div class="editor-head">
          <h2>{{ isEdit ? t("groupEditor.editTitle") : t("groupEditor.newTitle") }}</h2>
          <button class="icon-btn" :title="t('groupEditor.close')" @click="close">✕</button>
        </div>
        <form class="editor-body" @submit.prevent="save">
          <div class="row2">
            <div class="field">
              <label>{{ t("groupEditor.name") }}</label>
              <input
                v-model="form.name"
                type="text"
                class="input"
                :placeholder="t('groupEditor.namePlaceholder')"
                required
              />
            </div>
            <div class="field">
              <label>{{ t("groupEditor.id") }}</label>
              <input
                v-model="form.id"
                type="text"
                class="input"
                :placeholder="t('groupEditor.idPlaceholder')"
                required
              />
              <div class="hint">
                {{ isEdit ? t("groupEditor.renameHint") : t("groupEditor.idHint") }}
              </div>
            </div>
          </div>
          <div class="row2">
            <div class="field">
              <label>{{ t("groupEditor.language") }}</label>
              <input
                v-model="form.lang"
                type="text"
                class="input"
                :placeholder="t('groupEditor.langPlaceholder')"
              />
              <div class="hint">{{ t("groupEditor.langHint") }}</div>
            </div>
            <div class="field">
              <label
                >{{ t("groupEditor.emoji") }}
                <span class="lbl-note">{{ t("groupEditor.emojiNote") }}</span></label
              >
              <label class="inline">
                <input v-model="form.emoji" type="checkbox" />
                <span>{{ t("groupEditor.emojiLabel") }}</span>
              </label>
            </div>
          </div>
          <div class="field">
            <label
              >{{ t("groupEditor.membersNote") }}
              <span class="lbl-note">{{ t("groupEditor.membersHint") }}</span></label
            >
            <p class="hint">
              {{ t("groupEditor.membersGoPanel") }}
            </p>
          </div>
          <div v-if="superAdmin" class="field">
            <label
              >{{ t("groupEditor.owners") }}
              <span class="lbl-note">{{ t("groupEditor.ownersNote") }}</span></label
            >
            <input
              v-model="form.owners"
              type="text"
              class="input"
              :placeholder="t('groupEditor.ownersPlaceholder')"
            />
            <div class="hint">{{ t("groupEditor.ownersHint") }}</div>
          </div>
          <div v-else class="field">
            <label
              >{{ t("groupEditor.owners") }}
              <span class="lbl-note">{{ t("groupEditor.ownersSuperOnly") }}</span></label
            >
            <input v-model="ownersReadonly" type="text" class="input opacity-60" disabled />
          </div>
          <div class="field">
            <label
              >{{ t("groupEditor.providers") }}
              <span class="lbl-note">{{ t("groupEditor.providersNote") }}</span></label
            >
            <div class="flex flex-wrap gap-4">
              <label class="inline">
                <input
                  type="checkbox"
                  :checked="form.providers.includes('github')"
                  @change="toggleProvider('github', $event)"
                />
                <span>GitHub</span>
              </label>
              <label class="inline">
                <input
                  type="checkbox"
                  :checked="form.providers.includes('gitea')"
                  @change="toggleProvider('gitea', $event)"
                />
                <span>Gitea</span>
              </label>
            </div>
            <div class="hint">{{ t("groupEditor.providersHint") }}</div>
          </div>
          <div class="field">
            <label
              >{{ t("groupEditor.installationId") }}
              <span class="lbl-note">{{ t("groupEditor.installationIdNote") }}</span></label
            >
            <input
              v-model="form.installationId"
              type="text"
              class="input"
              inputmode="numeric"
              :placeholder="t('groupEditor.installationIdPlaceholder')"
            />
            <div class="hint">{{ t("groupEditor.installationIdHint") }}</div>
          </div>
          <div class="field">
            <label
              >{{ t("groupEditor.logTarget") }}
              <span class="lbl-note">{{ t("groupEditor.logTargetNote") }}</span></label
            >
            <select v-model="form.logPlatform" class="select">
              <option value="">{{ t("groupEditor.logDisabled") }}</option>
              <option value="discord">Discord</option>
              <option value="telegram">Telegram</option>
            </select>
            <template v-if="form.logPlatform === 'discord'">
              <input
                v-model="form.logChannelId"
                type="text"
                class="input mt-2"
                :placeholder="t('routeEditor.channelPlaceholder')"
              />
              <input
                v-model="form.logThreadId"
                type="text"
                class="input mt-2"
                :placeholder="t('routeEditor.threadPlaceholder')"
              />
            </template>
            <template v-else-if="form.logPlatform === 'telegram'">
              <input
                v-model="form.logChatId"
                type="text"
                class="input mt-2"
                :placeholder="t('routeEditor.chatPlaceholder')"
              />
              <input
                v-model="form.logTopicId"
                type="text"
                class="input mt-2"
                :placeholder="t('routeEditor.topicPlaceholder')"
              />
            </template>
            <div class="hint">{{ t("groupEditor.logTargetHint") }}</div>
          </div>
          <div class="err">{{ formError }}</div>
        </form>
        <div class="editor-foot">
          <button class="btn btn-ghost" type="button" @click="close">
            {{ t("groupEditor.cancel") }}
          </button>
          <button class="btn btn-accent" type="button" :disabled="saving" @click="save">
            {{ t("groupEditor.save") }}
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { Group } from "~/types";

const { t } = useI18n();

const props = defineProps<{
  open: boolean;
  group: Group | null;
  saving: boolean;
  superAdmin?: boolean;
}>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "save", group: Group): void;
}>();

const isEdit = computed(() => props.group != null);
const formError = ref("");
const ownersReadonly = computed(() => (props.group?.owners ?? []).join(", "));

const form = reactive({
  id: "",
  name: "",
  owners: "",
  providers: [] as ("github" | "gitea")[],
  installationId: "",
  emoji: true,
  lang: "",
  logPlatform: "" as "" | "discord" | "telegram",
  logChannelId: "",
  logThreadId: "",
  logChatId: "",
  logTopicId: "",
});

function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toggleProvider(p: "github" | "gitea", e: Event): void {
  const checked = (e.target as HTMLInputElement).checked;
  form.providers = checked
    ? [...new Set([...form.providers, p])]
    : form.providers.filter((x) => x !== p);
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    const g = props.group;
    const lt = g?.logTarget;
    form.id = g?.id ?? "";
    form.name = g?.name ?? "";
    form.owners = (g?.owners ?? []).join(", ");
    form.providers = (g?.providers ?? []).filter(
      (p): p is "github" | "gitea" => p === "github" || p === "gitea",
    );
    form.installationId = g?.installationId != null ? String(g.installationId) : "";
    form.emoji = g?.emoji ?? true;
    form.lang = g?.lang ?? "";
    form.logPlatform = lt?.platform ?? "";
    form.logChannelId = lt?.channelId ?? "";
    form.logThreadId = lt?.threadId ?? "";
    form.logChatId = lt?.chatId ?? "";
    form.logTopicId = lt?.topicId ?? "";
    formError.value = "";
  },
);

function close(): void {
  emit("close");
}

function save(): void {
  formError.value = "";
  const id = form.id.trim();
  const name = form.name.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    formError.value = t("groupEditor.errIdFormat");
    return;
  }
  if (!name) {
    formError.value = t("groupEditor.errName");
    return;
  }
  let logTarget:
    | { platform: "discord"; channelId: string; threadId?: string }
    | {
        platform: "telegram";
        chatId: string;
        topicId?: string;
      }
    | undefined;
  if (form.logPlatform === "discord") {
    const channelId = form.logChannelId.trim();
    if (!channelId) {
      formError.value = t("groupEditor.errLogChannel");
      return;
    }
    logTarget = { platform: "discord", channelId, threadId: form.logThreadId.trim() || undefined };
  } else if (form.logPlatform === "telegram") {
    const chatId = form.logChatId.trim();
    if (!chatId) {
      formError.value = t("groupEditor.errLogChat");
      return;
    }
    logTarget = { platform: "telegram", chatId, topicId: form.logTopicId.trim() || undefined };
  }
  const installationText = form.installationId.trim();
  let installationId: number | undefined;
  if (installationText) {
    installationId = Number(installationText);
    if (!Number.isInteger(installationId) || installationId <= 0) {
      formError.value = t("groupEditor.errInstallationId");
      return;
    }
  }
  const owners = splitList(form.owners);
  const members = props.group?.members
    ? props.group.members.map((m) => ({ ...m }))
    : props.group?.adminIds?.length
      ? props.group.adminIds.map((login) => ({ login, role: "owner" as const }))
      : [];
  emit("save", {
    id,
    name,
    members,
    adminIds: members.filter((m) => m.role === "owner").map((m) => m.login),
    owners: props.superAdmin ? (owners.length ? owners : undefined) : props.group?.owners,
    providers: form.providers.length ? form.providers : undefined,
    installationId,
    emoji: form.emoji,
    lang: form.lang.trim() || undefined,
    logTarget,
  });
}
</script>
