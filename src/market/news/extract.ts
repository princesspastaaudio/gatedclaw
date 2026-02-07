import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";

export type ExtractedArticle = {
  text: string;
  lang: string | null;
  title: string | null;
};

function fallbackText(doc: Document): string {
  const bodyText = doc.body?.textContent ?? "";
  return bodyText.replace(/\s+/g, " ").trim();
}

export function extractReadableArticle(html: string, url: string): ExtractedArticle | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  if (!doc) {
    return null;
  }
  const readability = new Readability(doc, {
    debug: false,
  });
  const article = readability.parse();
  const text = (article?.textContent ?? "").replace(/\s+/g, " ").trim();
  const resolvedText = text || fallbackText(doc);
  if (!resolvedText) {
    return null;
  }
  const lang = doc.documentElement?.getAttribute("lang")?.trim() ?? null;
  const title = (article?.title ?? doc.title ?? "").trim() || null;
  return {
    text: resolvedText,
    lang,
    title,
  };
}
