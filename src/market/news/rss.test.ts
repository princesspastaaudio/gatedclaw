import { describe, expect, it } from "vitest";
import { parseRss } from "./rss.js";

describe("parseRss", () => {
  it("parses RSS items", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Test Title</title>
            <link>https://example.com/article</link>
            <pubDate>Fri, 01 Mar 2024 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Test Title");
    expect(items[0]?.url).toBe("https://example.com/article");
    expect(items[0]?.publishedAt).toContain("2024-03-01");
  });

  it("parses Atom entries", () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>Atom Entry</title>
          <link href="https://example.com/atom" />
          <updated>2024-04-01T12:00:00Z</updated>
        </entry>
      </feed>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("Atom Entry");
    expect(items[0]?.url).toBe("https://example.com/atom");
    expect(items[0]?.publishedAt).toContain("2024-04-01");
  });
});
