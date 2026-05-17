export function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

export function parseBoundedInteger(value: string | null, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

export function parseAnalysisStatus(value: string | null): "success" | "error" | null {
  if (value === "success" || value === "error") {
    return value;
  }

  return null;
}

export function errorJson(error: unknown, status = 500): Response {
  return json(
    {
      error: error instanceof Error ? error.message : "Internal Server Error"
    },
    { status }
  );
}
