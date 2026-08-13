<template>
  <section class="members-panel">
    <div class="panel-head">
      <h3>{{ t("members.title") }}</h3>
      <span class="lbl-note">{{ t("members.note") }}</span>
    </div>

    <p v-if="!members.length" class="empty-log">{{ t("members.empty") }}</p>

    <ul class="member-list">
      <li v-for="m in members" :key="m.login.toLowerCase()" class="member-row">
        <span class="member-login">{{ m.login }}</span>
        <select
          v-if="canEdit"
          class="filter-select"
          :value="m.role"
          :disabled="saving"
          @change="onRoleChange(m, $event)"
        >
          <option value="owner">{{ t("roles.owner") }}</option>
          <option value="admin">{{ t("roles.admin") }}</option>
          <option value="viewer">{{ t("roles.viewer") }}</option>
        </select>
        <span v-else class="role-pill" :class="m.role">{{ t("roles." + m.role) }}</span>
        <button
          v-if="canEdit"
          class="icon-btn danger"
          :disabled="saving"
          :title="t('members.remove')"
          @click="removeMember(m)"
        >
          ✕
        </button>
      </li>
    </ul>

    <div v-if="canEdit" class="member-add">
      <input
        v-model="newLogin"
        type="text"
        :placeholder="t('members.addPlaceholder')"
        class="text-input"
        @keydown.enter.prevent="addMember"
      />
      <select v-model="newRole" class="filter-select">
        <option value="owner">{{ t("roles.owner") }}</option>
        <option value="admin">{{ t("roles.admin") }}</option>
        <option value="viewer">{{ t("roles.viewer") }}</option>
      </select>
      <button class="btn btn-accent btn-sm" :disabled="saving" @click="addMember">
        {{ t("members.addBtn") }}
      </button>
    </div>

    <div v-if="canEdit" class="invite-box">
      <h4>
        {{ t("members.invites") }}
        <span class="lbl-note">{{ t("members.inviteNote") }}</span>
      </h4>
      <div class="invite-create">
        <select v-model="inviteRole" class="filter-select">
          <option value="admin">{{ t("roles.admin") }}</option>
          <option value="viewer">{{ t("roles.viewer") }}</option>
        </select>
        <button class="btn btn-accent btn-sm" :disabled="saving || inviting" @click="createInvite">
          {{ t("members.createInvite") }}
        </button>
      </div>
      <ul v-if="invites.length" class="invite-list">
        <li v-for="inv in invites" :key="inv.token" class="invite-row">
          <code class="invite-token">{{ shortToken(inv.token) }}</code>
          <span class="role-pill" :class="inv.role">{{ t("roles." + inv.role) }}</span>
          <span class="invite-exp">{{ fmtExp(inv.expiresAt) }}</span>
          <button class="btn btn-ghost btn-sm" @click="copyInvite(inv)">
            {{ copied === inv.token ? t("members.copied") : t("members.copyLink") }}
          </button>
          <button class="icon-btn danger" @click="revoke(inv)">{{ t("members.revoke") }}</button>
        </li>
      </ul>
      <p v-else class="empty-log">{{ t("members.noInvites") }}</p>
    </div>

    <div class="err">{{ formError }}</div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import type { Group, GroupInvite, GroupMember, GroupRole } from "~/types";
import { useInvitesApi } from "~/composables/useInvites";

const { t } = useI18n();

const props = defineProps<{ group: Group; canEdit: boolean; saving: boolean }>();
const emit = defineEmits<{ (e: "save", group: Group): void }>();

const invitesApi = useInvitesApi();
const members = ref<GroupMember[]>([]);
const invites = ref<GroupInvite[]>([]);
const newLogin = ref("");
const newRole = ref<GroupRole>("admin");
const inviteRole = ref<"admin" | "viewer">("admin");
const inviting = ref(false);
const formError = ref("");
const { copied, copy } = useCopy(2000);

watch(
  () => props.group,
  (g) => {
    members.value = (g.members ?? []).map((m) => ({ ...m }));
    formError.value = "";
    if (props.canEdit) loadInvites();
  },
  { immediate: true },
);

async function loadInvites(): Promise<void> {
  invites.value = await invitesApi.list(props.group.id);
}

function ownerCount(): number {
  return members.value.filter((m) => m.role === "owner").length;
}

function onRoleChange(m: GroupMember, e: Event): void {
  const role = (e.target as HTMLSelectElement).value as GroupRole;
  if (role === "viewer" && m.role === "owner" && ownerCount() === 1) {
    formError.value = t("members.errLastOwner");
    return;
  }
  m.role = role;
  emitSave();
}

function addMember(): void {
  const login = newLogin.value.trim();
  if (!login) return;
  if (members.value.some((m) => m.login.toLowerCase() === login.toLowerCase())) {
    formError.value = t("members.errOwner");
    return;
  }
  members.value.push({ login, role: newRole.value });
  newLogin.value = "";
  emitSave();
}

function removeMember(m: GroupMember): void {
  if (m.role === "owner" && ownerCount() === 1) {
    formError.value = t("members.errLastOwner");
    return;
  }
  members.value = members.value.filter((x) => x !== m);
  emitSave();
}

function emitSave(): void {
  emit("save", { ...props.group, members: members.value.map((m) => ({ ...m })) });
}

async function createInvite(): Promise<void> {
  inviting.value = true;
  formError.value = "";
  try {
    const url = await invitesApi.create(props.group.id, inviteRole.value);
    const token = url.split("token=")[1] ?? "";
    if (token) {
      invites.value = [
        {
          token,
          groupId: props.group.id,
          role: inviteRole.value,
          expiresAt: Date.now() + 7 * 86400_000,
          createdBy: "",
        },
        ...invites.value,
      ];
    }
    copy(`${window.location.origin}${url}`, token);
    await loadInvites();
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  } finally {
    inviting.value = false;
  }
}

async function copyInvite(inv: GroupInvite): Promise<void> {
  const url = `${window.location.origin}/admin/invite?token=${inv.token}`;
  await copy(url, inv.token);
}

async function revoke(inv: GroupInvite): Promise<void> {
  try {
    await invitesApi.revoke(inv.token);
    invites.value = invites.value.filter((i) => i.token !== inv.token);
  } catch (err) {
    formError.value = err instanceof Error ? err.message : String(err);
  }
}

function shortToken(token: string): string {
  return token.slice(0, 8) + "…";
}

function fmtExp(ts: number): string {
  return new Date(ts).toLocaleDateString();
}
</script>
