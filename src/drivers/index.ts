import type { Route } from "../types";
import type { PlatformDriver } from "./types";
import { DiscordDriver } from "./discord";
import { TelegramDriver } from "./telegram";

const drivers: Record<string, PlatformDriver> = {
  discord: new DiscordDriver(),
  telegram: new TelegramDriver(),
};

export function getDriver(target: Route["target"]): PlatformDriver {
  const platform = (target as { platform?: string }).platform ?? "discord";
  const driver = drivers[platform];
  if (!driver) throw new Error(`No driver for platform "${platform}"`);
  return driver;
}
