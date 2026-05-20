import type {
  DexTokenCandidateInput,
  DexTokenCandidatePriorityReason,
  DexTokenCandidateRecord,
  DexTokenCandidateRiskFlag,
  MemeSignalAnalysisRecord
} from "../types.js";
import type { DexScreenerPair } from "./dexScreenerClient.js";

function normalize(value: string | null | undefined): string {
  return String(value ?? "")
    .replaceAll("$", "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function pairCreatedIso(pairCreatedAt: unknown): string | null {
  const timestamp = asNumber(pairCreatedAt);
  if (!timestamp) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

function hasSocialPresence(pair: DexScreenerPair): boolean {
  const websites = pair.info?.websites ?? [];
  const socials = pair.info?.socials ?? [];
  return websites.length > 0 || socials.length > 0;
}

function createdHoursAgo(pairCreatedAt: string | null, now: Date): number | null {
  if (!pairCreatedAt) {
    return null;
  }

  const parsed = Date.parse(pairCreatedAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.max(0, (now.getTime() - parsed) / 3_600_000);
}

function computeMatchedTerms(pair: DexScreenerPair, terms: string[]): string[] {
  const name = normalize(pair.baseToken?.name);
  const symbol = normalize(pair.baseToken?.symbol);
  const matched = new Set<string>();

  for (const term of terms) {
    const normalized = normalize(term);
    if (!normalized) {
      continue;
    }

    if (
      (name && (name === normalized || name.includes(normalized) || normalized.includes(name))) ||
      (symbol && symbol === normalized)
    ) {
      matched.add(normalized);
    }
  }

  return [...matched];
}

function computeMatchComponent(pair: DexScreenerPair, matchedTerms: string[]): number {
  if (matchedTerms.length === 0) {
    return 0;
  }

  const name = normalize(pair.baseToken?.name);
  const symbol = normalize(pair.baseToken?.symbol);
  const exact = matchedTerms.some((term) => term === name || term === symbol);

  return exact ? 100 : Math.min(85, 45 + matchedTerms.length * 15);
}

function logScore(value: number | null, maxReference: number): number {
  if (!value || value <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((Math.log10(value + 1) / Math.log10(maxReference + 1)) * 100));
}

function freshnessScore(pairCreatedAt: string | null, now: Date): number {
  const hoursAgo = createdHoursAgo(pairCreatedAt, now);
  if (hoursAgo === null) {
    return 35;
  }
  if (hoursAgo <= 24) {
    return 100;
  }
  if (hoursAgo <= 72) {
    return 82;
  }
  if (hoursAgo <= 168) {
    return 65;
  }
  if (hoursAgo <= 720) {
    return 42;
  }
  return 20;
}

function uniqueRiskFlags(flags: DexTokenCandidateRiskFlag[]): DexTokenCandidateRiskFlag[] {
  return [...new Set(flags)];
}

function percentGain(current: number | null, previous: number | null): number {
  if (current === null || previous === null || previous <= 0) {
    return 0;
  }

  return (current - previous) / previous;
}

function pairAgeHours(pairCreatedAt: string | null, now: Date): number | null {
  return createdHoursAgo(pairCreatedAt, now);
}

export function scoreDexTokenPriority(
  candidate: Pick<
    DexTokenCandidateInput,
    "priceUsd" | "liquidityUsd" | "volume24hUsd" | "pairCreatedAt"
  >,
  previous: Pick<
    DexTokenCandidateRecord,
    | "priceUsd"
    | "liquidityUsd"
    | "volume24hUsd"
    | "firstPriceUsd"
    | "firstLiquidityUsd"
    | "firstVolume24hUsd"
  > | null,
  now: Date
): Pick<DexTokenCandidateInput, "priorityScore" | "priorityReasons"> {
  const reasons: DexTokenCandidatePriorityReason[] = [];
  let score = 0;

  if ((candidate.volume24hUsd ?? 0) >= 100_000) {
    reasons.push("strong_volume");
    score += 20;
  }
  if ((candidate.liquidityUsd ?? 0) >= 50_000) {
    reasons.push("strong_liquidity");
    score += 15;
  }
  if ((pairAgeHours(candidate.pairCreatedAt, now) ?? Number.POSITIVE_INFINITY) <= 24) {
    reasons.push("fresh_launch");
    score += 15;
  }

  if (previous) {
    if (percentGain(candidate.priceUsd, previous.priceUsd) >= 0.25) {
      reasons.push("price_up_since_last_check");
      score += 20;
    }
    if (percentGain(candidate.volume24hUsd, previous.volume24hUsd) >= 0.5) {
      reasons.push("volume_up_since_last_check");
      score += 15;
    }
    if (percentGain(candidate.liquidityUsd, previous.liquidityUsd) >= 0.25) {
      reasons.push("liquidity_up_since_last_check");
      score += 10;
    }
    if (percentGain(candidate.priceUsd, previous.firstPriceUsd) >= 1) {
      reasons.push("price_up_since_discovery");
      score += 25;
    }
    if (percentGain(candidate.volume24hUsd, previous.firstVolume24hUsd) >= 1) {
      reasons.push("volume_up_since_discovery");
      score += 15;
    }
    if (percentGain(candidate.liquidityUsd, previous.firstLiquidityUsd) >= 0.75) {
      reasons.push("liquidity_up_since_discovery");
      score += 10;
    }
  }

  return {
    priorityScore: Math.max(0, Math.min(100, score)),
    priorityReasons: [...new Set(reasons)]
  };
}

export function buildDexTokenCandidate(
  signal: MemeSignalAnalysisRecord,
  pair: DexScreenerPair,
  matchedTerms: string[],
  options: {
    minLiquidityUsd: number;
    minVolume24hUsd: number;
    duplicateSymbol: boolean;
    now: Date;
  }
): DexTokenCandidateInput | null {
  const chainId = pair.chainId;
  const dexId = pair.dexId;
  const pairAddress = pair.pairAddress;
  const baseTokenAddress = pair.baseToken?.address;
  const baseTokenName = pair.baseToken?.name;
  const baseTokenSymbol = pair.baseToken?.symbol;
  const url = pair.url;

  if (!chainId || !dexId || !pairAddress || !baseTokenAddress || !baseTokenName || !baseTokenSymbol || !url) {
    return null;
  }

  const liquidityUsd = asNumber(pair.liquidity?.usd);
  const volume24hUsd = asNumber(pair.volume?.h24);
  const pairCreatedAt = pairCreatedIso(pair.pairCreatedAt);
  const socialPresence = hasSocialPresence(pair);
  const matchComponent = computeMatchComponent(pair, matchedTerms);
  const liquidityComponent = logScore(liquidityUsd, 1_000_000);
  const volumeComponent = logScore(volume24hUsd, 5_000_000);
  const score = Math.round(
    matchComponent * 0.4 +
      liquidityComponent * 0.2 +
      volumeComponent * 0.2 +
      freshnessScore(pairCreatedAt, options.now) * 0.1 +
      (socialPresence ? 100 : 0) * 0.1
  );
  const hoursAgo = createdHoursAgo(pairCreatedAt, options.now);
  const riskFlags: DexTokenCandidateRiskFlag[] = [];
  const discoveredAt = options.now.toISOString();

  if ((liquidityUsd ?? 0) < options.minLiquidityUsd) {
    riskFlags.push("low_liquidity");
  }
  if ((volume24hUsd ?? 0) < options.minVolume24hUsd) {
    riskFlags.push("low_volume");
  }
  if (hoursAgo !== null && hoursAgo <= 24) {
    riskFlags.push("new_pair");
  }
  if (!socialPresence) {
    riskFlags.push("missing_socials");
  }
  if (options.duplicateSymbol) {
    riskFlags.push("duplicate_symbol");
  }
  if ((pair.fdv ?? 0) >= 10_000_000 && (liquidityUsd ?? 0) < 50_000) {
    riskFlags.push("high_fdv_low_liquidity");
  }

  return {
    postId: signal.postId,
    chainId,
    dexId,
    pairAddress,
    baseTokenAddress,
    baseTokenName,
    baseTokenSymbol,
    quoteTokenSymbol: pair.quoteToken?.symbol ?? null,
    url,
    priceUsd: asNumber(pair.priceUsd),
    liquidityUsd,
    volume24hUsd,
    marketCap: asNumber(pair.marketCap),
    fdv: asNumber(pair.fdv),
    pairCreatedAt,
    matchScore: Math.max(0, Math.min(100, score)),
    riskFlags: uniqueRiskFlags(riskFlags),
    matchedTerms,
    rawPayload: pair,
    discoveredAt,
    lastCheckedAt: discoveredAt,
    ...scoreDexTokenPriority(
      {
        priceUsd: asNumber(pair.priceUsd),
        liquidityUsd,
        volume24hUsd,
        pairCreatedAt
      },
      null,
      options.now
    )
  };
}

export function normalizeDexPairs(
  signal: MemeSignalAnalysisRecord,
  terms: string[],
  pairs: DexScreenerPair[],
  options: {
    minLiquidityUsd: number;
    minVolume24hUsd: number;
    now: Date;
  }
): DexTokenCandidateInput[] {
  const deduped = new Map<string, DexScreenerPair>();
  const symbolCounts = new Map<string, number>();

  for (const pair of pairs) {
    if (!pair.chainId || !pair.pairAddress) {
      continue;
    }

    deduped.set(`${pair.chainId}:${pair.pairAddress}`, pair);
  }

  for (const pair of deduped.values()) {
    const symbol = normalize(pair.baseToken?.symbol);
    if (symbol) {
      symbolCounts.set(symbol, (symbolCounts.get(symbol) ?? 0) + 1);
    }
  }

  return [...deduped.values()]
    .map((pair) => {
      const matchedTerms = computeMatchedTerms(pair, terms);
      if (matchedTerms.length === 0) {
        return null;
      }

      const symbol = normalize(pair.baseToken?.symbol);
      return buildDexTokenCandidate(signal, pair, matchedTerms, {
        ...options,
        duplicateSymbol: symbol ? (symbolCounts.get(symbol) ?? 0) > 1 : false
      });
    })
    .filter((candidate): candidate is DexTokenCandidateInput => Boolean(candidate))
    .filter(
      (candidate) =>
        (candidate.liquidityUsd ?? 0) >= options.minLiquidityUsd &&
        (candidate.volume24hUsd ?? 0) >= options.minVolume24hUsd
    )
    .sort((left, right) => right.matchScore - left.matchScore);
}
