import type {
  DexRugpullDetail,
  DexRugpullFlag,
  DexRugpullLevel,
  DexRugpullRiskInput,
  DexRugpullTrend,
  DexTokenCandidateRecord
} from "../types.js";

type CandidateRiskView = Pick<
  DexTokenCandidateRecord,
  | "postId"
  | "chainId"
  | "pairAddress"
  | "baseTokenAddress"
  | "priceUsd"
  | "liquidityUsd"
  | "volume24hUsd"
  | "fdv"
  | "pairCreatedAt"
  | "riskFlags"
  | "previousPriceUsd"
  | "previousLiquidityUsd"
  | "rugpullScore"
  | "lastRugCheckedAt"
>;

function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function percentDrop(current: number | null, previous: number | null): number {
  if (current === null || previous === null || previous <= 0) {
    return 0;
  }

  return Math.max(0, (previous - current) / previous);
}

function pairAgeHours(pairCreatedAt: string | null, now: Date): number | null {
  if (!pairCreatedAt) {
    return null;
  }

  const parsed = Date.parse(pairCreatedAt);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.max(0, (now.getTime() - parsed) / 3_600_000);
}

function detail(flag: DexRugpullFlag, severity: DexRugpullLevel, points: number, description: string): DexRugpullDetail {
  return {
    flag,
    severity,
    points,
    description
  };
}

function scoreToLevel(score: number): DexRugpullLevel {
  if (score >= 75) {
    return "critical";
  }
  if (score >= 50) {
    return "high";
  }
  if (score >= 25) {
    return "medium";
  }
  return "low";
}

function scoreToTrend(score: number, previousScore: number | null): DexRugpullTrend {
  if (previousScore === null) {
    return "stable";
  }

  const delta = score - previousScore;
  if (delta >= 10) {
    return "worsening";
  }
  if (delta <= -10) {
    return "improving";
  }
  return "stable";
}

export function scoreDexRugpullRisk(
  candidate: CandidateRiskView,
  now: Date
): DexRugpullRiskInput {
  const details: DexRugpullDetail[] = [];
  const liquidityUsd = candidate.liquidityUsd;
  const volume24hUsd = candidate.volume24hUsd;
  const fdv = candidate.fdv;
  const previousRugpullScore = candidate.lastRugCheckedAt && Number.isFinite(candidate.rugpullScore)
    ? candidate.rugpullScore
    : null;

  if ((liquidityUsd ?? 0) < 1_000) {
    details.push(detail("critical_liquidity", "critical", 35, "Liquidity is below $1k."));
  } else if ((liquidityUsd ?? 0) < 5_000) {
    details.push(detail("low_liquidity", "high", 20, "Liquidity is below $5k."));
  }

  const liquidityDrop = percentDrop(liquidityUsd, candidate.previousLiquidityUsd);
  if (liquidityDrop > 0.7) {
    details.push(detail("liquidity_collapse", "critical", 40, "Liquidity dropped more than 70% since the previous check."));
  } else if (liquidityDrop > 0.5) {
    details.push(detail("liquidity_drop", "high", 25, "Liquidity dropped more than 50% since the previous check."));
  }

  const fdvLiquidityRatio = ratio(fdv, liquidityUsd);
  if (fdvLiquidityRatio !== null && fdvLiquidityRatio > 500) {
    details.push(detail("extreme_fdv_liquidity", "critical", 35, "FDV is more than 500x available liquidity."));
  } else if (fdvLiquidityRatio !== null && fdvLiquidityRatio > 100) {
    details.push(detail("high_fdv_liquidity", "high", 20, "FDV is more than 100x available liquidity."));
  }

  const volumeLiquidityRatio = ratio(volume24hUsd, liquidityUsd);
  if (volumeLiquidityRatio !== null && volumeLiquidityRatio > 50) {
    details.push(detail("extreme_volume_liquidity", "high", 25, "24h volume is more than 50x liquidity."));
  } else if (volumeLiquidityRatio !== null && volumeLiquidityRatio > 20) {
    details.push(detail("high_volume_liquidity", "medium", 15, "24h volume is more than 20x liquidity."));
  }

  if (percentDrop(candidate.priceUsd, candidate.previousPriceUsd) > 0.5) {
    details.push(detail("price_collapse", "high", 20, "Price dropped more than 50% since the previous check."));
  }

  if (candidate.riskFlags.includes("missing_socials")) {
    details.push(detail("missing_socials", "medium", 10, "Token has no website or social links in DexScreener metadata."));
  }
  if (candidate.riskFlags.includes("duplicate_symbol")) {
    details.push(detail("duplicate_symbol", "medium", 8, "Multiple matched pairs share the same token symbol."));
  }
  if (candidate.riskFlags.includes("high_fdv_low_liquidity")) {
    details.push(detail("high_fdv_low_liquidity", "high", 25, "FDV is high while liquidity remains thin."));
  }

  const ageHours = pairAgeHours(candidate.pairCreatedAt, now);
  if (ageHours !== null && ageHours < 1) {
    details.push(detail("very_new_pair", "medium", 12, "Pair is less than one hour old."));
  } else if (ageHours !== null && ageHours <= 24) {
    details.push(detail("new_pair", "low", 6, "Pair is less than 24 hours old."));
  }

  const score = Math.max(0, Math.min(100, details.reduce((sum, item) => sum + item.points, 0)));
  const checkedAt = now.toISOString();

  return {
    postId: candidate.postId,
    chainId: candidate.chainId,
    pairAddress: candidate.pairAddress,
    baseTokenAddress: candidate.baseTokenAddress,
    rugpullScore: score,
    previousRugpullScore,
    rugpullLevel: scoreToLevel(score),
    rugpullTrend: scoreToTrend(score, previousRugpullScore),
    rugpullFlags: [...new Set(details.map((item) => item.flag))],
    rugpullDetails: details,
    rawPayload: {
      liquidityUsd,
      previousLiquidityUsd: candidate.previousLiquidityUsd,
      volume24hUsd,
      fdv,
      fdvLiquidityRatio,
      volumeLiquidityRatio,
      priceUsd: candidate.priceUsd,
      previousPriceUsd: candidate.previousPriceUsd,
      pairCreatedAt: candidate.pairCreatedAt,
      riskFlags: candidate.riskFlags
    },
    checkedAt
  };
}
