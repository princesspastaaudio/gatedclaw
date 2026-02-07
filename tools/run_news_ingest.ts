import crypto from "node:crypto";
import { loadConfig } from "../src/config/config.js";
import { createRateLimiter, fetchWithLimits } from "../src/market/news/fetch.js";
import { extractReadableArticle } from "../src/market/news/extract.js";
import { parseRss } from "../src/market/news/rss.js";
import {
  appendNewsArticle,
  buildProvenance,
  canonicalizeUrl,
  createArticleId,
  hashText,
  loadNewsDedupeState,
  type NewsArticle,
} from "../src/market/news/store.js";
import { appendRunRecord, buildRunRecord, notifyOperators } from "../src/ops/notify.js";

const cfg = loadConfig();
const newsCfg = cfg.news ?? {};
const feeds = newsCfg.rssFeeds ?? [];

const runId = `news-${crypto.randomUUID()}`;
const startedAt = new Date().toISOString();
const rateLimiter = createRateLimiter();
const dedupe = await loadNewsDedupeState();

let fetchedFeeds = 0;
let fetchedArticles = 0;
let savedArticles = 0;
let dedupeUrl = 0;
let dedupeHash = 0;
let failures = 0;

for (const feed of feeds) {
  if (!feed.url) {
    continue;
  }
  const feedUrl = new URL(feed.url);
  await rateLimiter(feedUrl, newsCfg.rateLimitPerHostPerMinute ?? 30);
  const res = await fetchWithLimits(feed.url, {
    timeoutMs: newsCfg.fetchTimeoutMs ?? 12_000,
    maxBytes: newsCfg.maxArticleBytes ?? 1_000_000,
    userAgent: newsCfg.userAgent ?? "OpenClawMarketBot/1.0",
    rateLimitPerHostPerMinute: newsCfg.rateLimitPerHostPerMinute ?? 30,
  });
  if (!res.ok) {
    failures += 1;
    continue;
  }
  fetchedFeeds += 1;
  const items = parseRss(res.body).slice(0, newsCfg.maxItemsPerFeed ?? 10);
  for (const item of items) {
    const canonicalUrl = canonicalizeUrl(item.url);
    if (dedupe.urls.has(canonicalUrl)) {
      dedupeUrl += 1;
      continue;
    }
    const articleUrl = new URL(item.url);
    await rateLimiter(articleUrl, newsCfg.rateLimitPerHostPerMinute ?? 30);
    const articleRes = await fetchWithLimits(item.url, {
      timeoutMs: newsCfg.fetchTimeoutMs ?? 12_000,
      maxBytes: newsCfg.maxArticleBytes ?? 1_000_000,
      userAgent: newsCfg.userAgent ?? "OpenClawMarketBot/1.0",
      rateLimitPerHostPerMinute: newsCfg.rateLimitPerHostPerMinute ?? 30,
    });
    fetchedArticles += 1;
    if (!articleRes.ok) {
      failures += 1;
      continue;
    }
    const extracted = extractReadableArticle(articleRes.body, item.url);
    if (!extracted) {
      failures += 1;
      continue;
    }
    const hash = hashText(extracted.text);
    if (dedupe.hashes.has(hash)) {
      dedupeHash += 1;
      continue;
    }
    const article: NewsArticle = {
      id: createArticleId(canonicalUrl, hash),
      source: { type: "rss", name: feed.name, url: feed.url },
      url: canonicalUrl,
      title: extracted.title ?? item.title,
      publishedAt: item.publishedAt,
      fetchedAt: new Date().toISOString(),
      text: extracted.text,
      lang: extracted.lang,
      hash,
      provenance: buildProvenance(runId, "news_ingest"),
    };
    await appendNewsArticle(article);
    dedupe.urls.add(canonicalUrl);
    dedupe.hashes.add(hash);
    savedArticles += 1;
  }
}

const finishedAt = new Date().toISOString();
const record = buildRunRecord({
  runId,
  job: "news_ingest",
  startedAt,
  finishedAt,
  counts: {
    feeds: fetchedFeeds,
    fetched: fetchedArticles,
    saved: savedArticles,
    dedupeUrl,
    dedupeHash,
    failures,
  },
});

await appendRunRecord(record);
await notifyOperators(
  `News ingest summary\nnew items: ${fetchedArticles}\nsaved: ${savedArticles}\ndedupe hits: ${dedupeUrl + dedupeHash}\nfailures: ${failures}`,
);
