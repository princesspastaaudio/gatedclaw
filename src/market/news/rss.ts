import { DOMParser } from "linkedom";

export type RssFeedConfig = {
  name: string;
  url: string;
  tags?: string[];
};

export type RssItem = {
  title: string;
  url: string;
  publishedAt?: string;
};

function textContent(node: Element | null | undefined): string {
  if (!node) {
    return "";
  }
  return (node.textContent ?? "").trim();
}

function resolveItemLink(item: Element): string {
  const link = textContent(item.querySelector("link"));
  if (link) {
    return link;
  }
  const linkEl = item.querySelector("link[href]") as Element | null;
  const href = linkEl?.getAttribute("href")?.trim() ?? "";
  return href;
}

function resolvePublishedAt(item: Element): string | undefined {
  const pubDate = textContent(item.querySelector("pubDate"));
  if (pubDate) {
    return new Date(pubDate).toISOString();
  }
  const updated = textContent(item.querySelector("updated"));
  if (updated) {
    return new Date(updated).toISOString();
  }
  const published = textContent(item.querySelector("published"));
  if (published) {
    return new Date(published).toISOString();
  }
  return undefined;
}

function extractItems(doc: Document): Element[] {
  const rssItems = Array.from(doc.querySelectorAll("item"));
  if (rssItems.length > 0) {
    return rssItems as Element[];
  }
  const atomEntries = Array.from(doc.querySelectorAll("entry"));
  return atomEntries as Element[];
}

export function parseRss(xml: string): RssItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  if (!doc) {
    return [];
  }
  const items = extractItems(doc);
  const results: RssItem[] = [];
  for (const item of items) {
    const title = textContent(item.querySelector("title"));
    const url = resolveItemLink(item);
    if (!title || !url) {
      continue;
    }
    results.push({
      title,
      url,
      publishedAt: resolvePublishedAt(item),
    });
  }
  return results;
}
