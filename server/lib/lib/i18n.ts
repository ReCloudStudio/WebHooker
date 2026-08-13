import { en } from "./locales/en";
import { zh } from "./locales/zh";

type NestedStrings = { [key: string]: string | NestedStrings };
export type Translations = NestedStrings;

function getByPath(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    return key in params ? String(params[key]) : `{${key}}`;
  });
}

const cache = new Map<string, Translations>();

export async function loadTranslations(
  lang: string,
  kv?: { get<T>(key: string, type: "json"): Promise<T | null> },
): Promise<Translations> {
  if (lang === "en") return en;
  if (lang === "zh") return zh;

  const cached = cache.get(lang);
  if (cached) return cached;

  if (!kv) return en;

  try {
    const stored = await kv.get<Partial<Translations>>(`i18n:${lang}`, "json");
    if (stored) {
      const merged = { ...en, ...stored } as Translations;
      cache.set(lang, merged);
      return merged;
    }
  } catch {
    // KV read failed, fall back to EN
  }

  return en;
}

export function t(
  key: string,
  params?: Record<string, string | number>,
  lang?: string | null,
  translations?: Translations,
): string {
  const dict = translations ?? en;
  const raw =
    getByPath(dict as Record<string, unknown>, key) ??
    getByPath(en as Record<string, unknown>, key) ??
    key;
  return params ? interpolate(raw, params) : raw;
}
