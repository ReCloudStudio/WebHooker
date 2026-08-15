import type { NeutralAuthor, NeutralMessage } from "../types";
import type { T } from "./helpers";

export interface FormatContext {
  payload: Record<string, unknown>;
  repo?: string;
  repoUrl?: string;
  author: NeutralAuthor;
  t: T;
  showEmoji: boolean;
}

export interface EventFormatter {
  readonly events: readonly string[];
  format(ctx: FormatContext): NeutralMessage;
}
