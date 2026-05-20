import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("accepts Postgres DATABASE_URL for serverless deployments", () => {
    const config = loadConfig({
      DATABASE_URL: "postgresql://user:password@example.com:5432/postgres"
    });

    expect(config.databaseUrl).toBe("postgresql://user:password@example.com:5432/postgres");
    expect(config.databasePath).toMatch(/data\/app\.db$/);
  });

  it("loads DEX discovery defaults and overrides", () => {
    const defaults = loadConfig({});
    expect(defaults.dexDiscoveryEnabled).toBe(false);
    expect(defaults.dexDiscoveryMinSignalScore).toBe(70);
    expect(defaults.dexCandidateRefreshTtlMinutes).toBe(10);
    expect(defaults.dexCandidateRefreshLimit).toBe(100);
    expect(defaults.dexScreenerBaseUrl).toBe("https://api.dexscreener.com");

    const config = loadConfig({
      DEX_DISCOVERY_ENABLED: "true",
      DEX_DISCOVERY_MIN_SIGNAL_SCORE: "80",
      DEX_DISCOVERY_MAX_SIGNALS_PER_RUN: "9",
      DEX_DISCOVERY_MAX_QUERIES_PER_SIGNAL: "12",
      DEX_DISCOVERY_CACHE_TTL_MINUTES: "45",
      DEX_CANDIDATE_REFRESH_TTL_MINUTES: "7",
      DEX_CANDIDATE_REFRESH_LIMIT: "44",
      DEX_DISCOVERY_MIN_LIQUIDITY_USD: "2500.5",
      DEX_DISCOVERY_MIN_VOLUME_24H_USD: "750",
      DEXSCREENER_BASE_URL: "https://example.test"
    });

    expect(config.dexDiscoveryEnabled).toBe(true);
    expect(config.dexDiscoveryMinSignalScore).toBe(80);
    expect(config.dexDiscoveryMaxSignalsPerRun).toBe(9);
    expect(config.dexDiscoveryMaxQueriesPerSignal).toBe(12);
    expect(config.dexDiscoveryCacheTtlMinutes).toBe(45);
    expect(config.dexCandidateRefreshTtlMinutes).toBe(7);
    expect(config.dexCandidateRefreshLimit).toBe(44);
    expect(config.dexDiscoveryMinLiquidityUsd).toBe(2500.5);
    expect(config.dexDiscoveryMinVolume24hUsd).toBe(750);
    expect(config.dexScreenerBaseUrl).toBe("https://example.test");
  });
});
