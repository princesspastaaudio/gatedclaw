import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { resolveStateDir } from "../../config/paths.js";
import { VERSION } from "../../version.js";

export type NewsSource = {
  type: "rss";
  name: string;
  url: string;
};

export type NewsArticle = {
  id: string;
  source: NewsSource;
  url: string;
  title: string;
  publishedAt?: string;
  fetchedAt: string;
  text: string;
  lang?: string | null;
  hash: string;
  provenance: {
    runId: string;
    agent: string;
    version: string;
  };
};

export type NewsDedupeState = {
  urls: Set<string>;
  hashes: Set<string>;
};

export const NEWS_ARTICLES_PATH = path.join("market", "news", "articles.ndjson");

export function resolveNewsArticlesPath(): string {
  return path.join(resolveStateDir(), NEWS_ARTICLES_PATH);
}

export function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const trackingParams = new Set([
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
    ]);
    const params = Array.from(url.searchParams.entries()).filter(
      ([key]) => !trackingParams.has(key.toLowerCase()),
    );
    url.search = "";
    for (const [key, value] of params.sort()) {
      url.searchParams.append(key, value);
    }
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export function hashText(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function createArticleId(url: string, hash: string): string {
  return crypto.createHash("sha256").update(`${url}|${hash}`).digest("hex").slice(0, 16);
}

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function appendNewsArticle(article: NewsArticle): Promise<void> {
  const filePath = resolveNewsArticlesPath();
  await ensureDir(filePath);
  await fs.promises.appendFile(filePath, `${JSON.stringify(article)}\n`, "utf8");
}

export async function loadNewsDedupeState(): Promise<NewsDedupeState> {
  const urls = new Set<string>();
  const hashes = new Set<string>();
  const filePath = resolveNewsArticlesPath();
  if (!fs.existsSync(filePath)) {
    return { urls, hashes };
  }
  const stream = fs.createReadStream(filePath, "utf8");
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    try {
      const parsed = JSON.parse(line) as NewsArticle;
      if (parsed.url) {
        urls.add(parsed.url);
      }
      if (parsed.hash) {
        hashes.add(parsed.hash);
      }
    } catch {
      continue;
    }
  }
  return { urls, hashes };
}

export async function loadNewsArticles(): Promise<NewsArticle[]> {
  const filePath = resolveNewsArticlesPath();
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = await fs.promises.readFile(filePath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  const articles: NewsArticle[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as NewsArticle;
      if (parsed.id && parsed.url) {
        articles.push(parsed);
      }
    } catch {
      continue;
    }
  }
  return articles;
}

export function buildProvenance(runId: string, agent: string) {
  return {
    runId,
    agent,
    version: VERSION,
  };
}
