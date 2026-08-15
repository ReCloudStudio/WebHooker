import { describe, test, expect } from "bun:test";
import { renderNeutralMessage as renderDiscord } from "../server/lib/drivers/discord/render";
import { renderNeutralMessage as renderTelegram } from "../server/lib/drivers/telegram/render";
import {
  MAX_TITLE,
  MAX_DESCRIPTION,
  MAX_FIELDS,
  MAX_FIELD_VALUE,
  MAX_FOOTER,
} from "../server/lib/formatters/helpers";
import type { NeutralMessage } from "../server/lib/types";

const big = "x".repeat(10000);

function oversized(): NeutralMessage {
  return {
    title: `acme/widget#1: ${big}`,
    url: "https://github.com/acme/widget",
    description: big,
    fields: Array.from({ length: 30 }, (_, i) => ({ name: `field-${i}`, value: big })),
    footer: big,
  };
}

describe("platform contract", () => {
  test("discord render clamps all limits", () => {
    const embed = renderDiscord(oversized()).embeds?.[0];
    expect(embed).toBeDefined();
    expect(embed!.title!.length).toBeLessThanOrEqual(MAX_TITLE);
    expect(embed!.description!.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
    expect(embed!.fields!.length).toBeLessThanOrEqual(MAX_FIELDS);
    for (const f of embed!.fields!) {
      expect(f.value.length).toBeLessThanOrEqual(MAX_FIELD_VALUE);
    }
    expect(embed!.footer).toBeDefined();
    expect(embed!.footer!.text.length).toBeLessThanOrEqual(MAX_FOOTER);
  });

  test("telegram render stays within the 4096-char cap", () => {
    const html = renderTelegram(oversized());
    expect(html.length).toBeGreaterThan(4000);
    expect(html.length).toBeLessThan(4200);
  });
});
