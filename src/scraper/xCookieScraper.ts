import { ScraperError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { ScrapeResult, TimelineScraper } from "../types.js";
import { parseUserTweetsResponse } from "./parseUserTweetsResponse.js";

interface XCookieScraperOptions {
  authToken?: string;
  ct0?: string;
  cookieHeader?: string;
  guestToken?: string;
  bearerToken?: string;
  userTweetsUrl?: string;
  clientTransactionId?: string;
  userAgent?: string;
}

const defaultBearerToken =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D" +
  "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

function findUserTimelineUrl(html: string): string | null {
  const matches = html.matchAll(/https:\/\/x\.com\/i\/api\/graphql\/[^"'\\]+\/UserTweets\?[^"'\\]+/g);

  for (const match of matches) {
    return match[0].replaceAll("\\u0026", "&");
  }

  return null;
}

export class XCookieScraper implements TimelineScraper {
  public constructor(
    private readonly options: XCookieScraperOptions,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  public async scrapeTimeline(handle: string): Promise<ScrapeResult> {
    const extractedAt = new Date().toISOString();
    const sourceUrl = `https://x.com/${handle}`;
    const rawHtml = this.options.userTweetsUrl ? "" : await this.fetchProfileHtml(sourceUrl);
    const userTweetsUrl = this.options.userTweetsUrl ?? findUserTimelineUrl(rawHtml);
    if (!userTweetsUrl) {
      throw new ScraperError("TIMELINE_NOT_FOUND", "Could not find UserTweets endpoint in X profile HTML");
    }

    const timelineResponse = await this.fetchImpl(userTweetsUrl, {
      headers: this.headers(sourceUrl)
    });

    if (timelineResponse.status === 401 || timelineResponse.status === 403) {
      return {
        posts: [],
        loginExpired: true,
        extractedAt,
        sourceUrl,
        rawHtml,
        artifactPaths: []
      };
    }

    if (!timelineResponse.ok) {
      throw new ScraperError("NAVIGATION_FAILED", "X UserTweets request failed", {
        status: timelineResponse.status
      });
    }

    const payload = await timelineResponse.json();
    const posts = parseUserTweetsResponse(payload, {
      expectedHandle: handle,
      detectedAt: extractedAt
    });

    this.logger.debug("Cookie scraper parsed UserTweets response", {
      parsedPostCount: posts.length
    });

    return {
      posts,
      loginExpired: false,
      extractedAt,
      sourceUrl,
      rawHtml,
      artifactPaths: []
    };
  }

  public async close(): Promise<void> {
    return undefined;
  }

  private async fetchProfileHtml(sourceUrl: string): Promise<string> {
    const profileResponse = await this.fetchImpl(sourceUrl, {
      headers: this.headers(sourceUrl)
    });
    const rawHtml = await profileResponse.text();

    if (profileResponse.status === 401 || profileResponse.status === 403) {
      throw new ScraperError("LOGIN_REQUIRED", "X profile request rejected authenticated cookies");
    }

    return rawHtml;
  }

  private headers(referer: string): HeadersInit {
    const cookie = this.options.cookieHeader ?? this.buildCookieHeader();

    return {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      authorization: `Bearer ${this.options.bearerToken ?? defaultBearerToken}`,
      cookie,
      "content-type": "application/json",
      priority: "u=1, i",
      referer,
      "sec-ch-ua": '"Not(A:Brand";v="8", "Chromium";v="144", "Google Chrome";v="144"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Linux"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        this.options.userAgent ??
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
      ...(this.options.clientTransactionId ? { "x-client-transaction-id": this.options.clientTransactionId } : {}),
      "x-csrf-token": this.options.ct0 ?? this.extractCookieValue(cookie, "ct0") ?? "",
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en"
    };
  }

  private buildCookieHeader(): string {
    const cookies: string[] = [];
    if (this.options.authToken) {
      cookies.push(`auth_token=${this.options.authToken}`);
    }
    if (this.options.ct0) {
      cookies.push(`ct0=${this.options.ct0}`);
    }
    if (this.options.guestToken) {
      cookies.push(`gt=${this.options.guestToken}`);
    }

    return cookies.join("; ");
  }

  private extractCookieValue(cookieHeader: string, name: string): string | null {
    for (const part of cookieHeader.split(";")) {
      const [rawName, ...rawValue] = part.trim().split("=");
      if (rawName === name) {
        return rawValue.join("=");
      }
    }

    return null;
  }
}
