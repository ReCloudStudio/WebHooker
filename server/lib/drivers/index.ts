import type { RouteTarget } from "../types";
import type { PlatformDriver } from "./types";
import { DiscordDriver } from "./discord";
import { TelegramDriver } from "./telegram";
import { FeishuDriver } from "./feishu";

const drivers: Record<string, PlatformDriver> = {
  discord: new DiscordDriver(),
  telegram: new TelegramDriver(),
  feishu: new FeishuDriver(),
};

export function getDriver(target: RouteTarget): PlatformDriver {
  const platform = target.platform ?? "discord";
  const driver = drivers[platform];
  if (!driver) throw new Error(`No driver for platform "${platform}"`);
  return driver;
}
