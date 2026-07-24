import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  saveToken,
  getToken,
  removeToken,
  findUserIdByToken,
  initTokenStore,
} from "../token-store";

const TEST_STORE = "./data/test-tokens.json";

beforeEach(() => {
  const dir = dirname(TEST_STORE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (existsSync(TEST_STORE)) unlinkSync(TEST_STORE);
  initTokenStore(TEST_STORE);
});

afterEach(() => {
  if (existsSync(TEST_STORE)) unlinkSync(TEST_STORE);
});

describe("token-store", () => {
  it("saves and retrieves token", () => {
    saveToken("user1", "token-abc", 3600);
    expect(getToken("user1")).toBe("token-abc");
  });

  it("returns null for expired token", () => {
    saveToken("user1", "token-abc", -1);
    expect(getToken("user1")).toBeNull();
  });

  it("returns null for nonexistent user", () => {
    expect(getToken("nobody")).toBeNull();
  });

  it("removes token", () => {
    saveToken("user1", "token-abc", 3600);
    removeToken("user1");
    expect(getToken("user1")).toBeNull();
  });

  it("finds userId by token", () => {
    saveToken("user1", "token-abc", 3600);
    expect(findUserIdByToken("token-abc")).toBe("user1");
  });

  it("returns null for unknown token", () => {
    expect(findUserIdByToken("unknown")).toBeNull();
  });

  it("persists across reload", () => {
    saveToken("user1", "token-abc", 3600);
    initTokenStore(TEST_STORE);
    expect(getToken("user1")).toBe("token-abc");
  });
});
