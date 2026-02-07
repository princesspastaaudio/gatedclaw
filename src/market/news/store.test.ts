import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalizeUrl, loadNewsDedupeState } from "./store.js";

const ORIGINAL_STATE_DIR = process.env.OPENCLAW_STATE_DIR;

function setTempStateDir(): string {
  const dir = fs.mkdtempSync(path.join("/tmp", "openclaw-state-"));
  process.env.OPENCLAW_STATE_DIR = dir;
  return dir;
}

afterEach(() => {
  if (ORIGINAL_STATE_DIR) {
    process.env.OPENCLAW_STATE_DIR = ORIGINAL_STATE_DIR;
  } else {
    delete process.env.OPENCLAW_STATE_DIR;
  }
});

describe("canonicalizeUrl", () => {
  it("removes tracking params and hashes", () => {
    const url = "https://Example.com/news/article/?utm_source=feed&fbclid=abc#section";
    expect(canonicalizeUrl(url)).toBe("https://example.com/news/article");
  });
});

describe("loadNewsDedupeState", () => {
  it("hydrates url and hash sets", async () => {
    const stateDir = setTempStateDir();
    const filePath = path.join(stateDir, "market", "news", "articles.ndjson");
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const lines = [
      JSON.stringify({ url: "https://example.com/one", hash: "hash-one" }),
      JSON.stringify({ url: "https://example.com/two", hash: "hash-two" }),
    ].join("\n");
    fs.writeFileSync(filePath, `${lines}\n`, "utf8");
    const state = await loadNewsDedupeState();
    expect(state.urls.has("https://example.com/one")).toBe(true);
    expect(state.hashes.has("hash-two")).toBe(true);
  });
});
