export type NewsFeedConfig = {
  name: string;
  url: string;
  tags?: string[];
};

export type NewsConfig = {
  rssFeeds?: NewsFeedConfig[];
  maxItemsPerFeed?: number;
  fetchTimeoutMs?: number;
  maxArticleBytes?: number;
  userAgent?: string;
  rateLimitPerHostPerMinute?: number;
};

export type MarketTapeSourceConfig = {
  name: string;
  kind: string;
  enabled?: boolean;
};

export type MarketTapeConfig = {
  symbols?: string[];
  sources?: MarketTapeSourceConfig[];
  pollIntervalSeconds?: number;
  staleAfterSeconds?: number;
};

export type SentimentConfig = {
  enabled?: boolean;
  model?: {
    name?: string;
    tier?: string;
  };
  triage?: {
    enabled?: boolean;
    minRelevanceScore?: number;
  };
  tagging?: {
    enabled?: boolean;
    tagSet?: string[];
  };
  maxArticlesPerRun?: number;
  maxDailyTokens?: number;
  maxSingleRunCostUsd?: number;
};
