export interface DexScreenerToken {
  address?: string;
  name?: string;
  symbol?: string;
}

export interface DexScreenerPair {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: DexScreenerToken;
  quoteToken?: DexScreenerToken;
  priceUsd?: string;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  liquidity?: {
    usd?: number;
  };
  volume?: {
    h24?: number;
  };
  info?: {
    imageUrl?: string;
    websites?: Array<{ url?: string }>;
    socials?: Array<{ type?: string; url?: string }>;
  };
  [key: string]: unknown;
}

interface DexScreenerSearchResponse {
  pairs?: DexScreenerPair[] | null;
}

export interface DexScreenerClient {
  searchPairs(query: string): Promise<DexScreenerPair[]>;
  getPairsByChainAndAddresses(chainId: string, pairAddresses: string[]): Promise<DexScreenerPair[]>;
}

export class HttpDexScreenerClient implements DexScreenerClient {
  public constructor(
    private readonly baseUrl = "https://api.dexscreener.com",
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  public async searchPairs(query: string): Promise<DexScreenerPair[]> {
    const url = new URL("/latest/dex/search", this.baseUrl);
    url.searchParams.set("q", query);

    const response = await this.fetchImpl(url, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`DexScreener search failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DexScreenerSearchResponse;
    return Array.isArray(payload.pairs) ? payload.pairs : [];
  }

  public async getPairsByChainAndAddresses(chainId: string, pairAddresses: string[]): Promise<DexScreenerPair[]> {
    const cleanedAddresses = pairAddresses
      .map((address) => address.trim())
      .filter((address) => address.length > 0);

    if (cleanedAddresses.length === 0) {
      return [];
    }

    const url = new URL(
      `/latest/dex/pairs/${encodeURIComponent(chainId)}/${cleanedAddresses.map(encodeURIComponent).join(",")}`,
      this.baseUrl
    );
    const response = await this.fetchImpl(url, {
      headers: {
        accept: "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`DexScreener pair lookup failed with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as DexScreenerSearchResponse;
    return Array.isArray(payload.pairs) ? payload.pairs : [];
  }
}
