import { useCallback, useEffect, useMemo, useState } from "react";

const FREE_USAGE_LIMIT = 3;
const USAGE_STORAGE_KEY = "travel-planner:anonymous-usage-count";

type UsageStatus = {
  remaining: number;
  limit: number;
  isLimited: boolean;
  source: "local" | "api";
  resetAt?: string;
};

type ApiUsageStatus = {
  plan: string;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
};

function getStoredUsageCount() {
  if (typeof window === "undefined") {
    return 0;
  }

  const value = window.localStorage.getItem(USAGE_STORAGE_KEY);
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toUsageStatus(usedCount: number, source: UsageStatus["source"]): UsageStatus {
  const remaining = Math.max(FREE_USAGE_LIMIT - usedCount, 0);

  return {
    remaining,
    limit: FREE_USAGE_LIMIT,
    isLimited: remaining <= 0,
    source,
  };
}

export function useUsageStatus() {
  const [usedCount, setUsedCount] = useState(getStoredUsageCount);
  const [apiUsage, setApiUsage] = useState<UsageStatus | null>(null);

  const usageStatus = useMemo(
    () => apiUsage ?? toUsageStatus(usedCount, "local"),
    [apiUsage, usedCount],
  );

  const recordGeneration = useCallback(() => {
    setApiUsage((current) => {
      if (!current) {
        return null;
      }

      const remaining = Math.max(current.remaining - 1, 0);

      return {
        ...current,
        remaining,
        isLimited: remaining <= 0,
      };
    });
    setUsedCount((current) => {
      const nextCount = Math.min(current + 1, FREE_USAGE_LIMIT);

      if (typeof window !== "undefined") {
        window.localStorage.setItem(USAGE_STORAGE_KEY, String(nextCount));
      }

      return nextCount;
    });
  }, []);

  const refreshUsage = useCallback(async () => {
    const response = await fetch("/api/me/usage");

    if (!response.ok) {
      throw new Error(`利用状況の取得に失敗しました (${response.status})`);
    }

    const data = (await response.json()) as Partial<ApiUsageStatus>;

    if (typeof data.remaining === "number" && typeof data.limit === "number") {
      setApiUsage({
        remaining: Math.max(data.remaining, 0),
        limit: data.limit,
        isLimited: data.remaining <= 0,
        source: "api",
        resetAt: data.resetAt,
      });
    }
  }, []);

  useEffect(() => {
    void refreshUsage().catch(() => {
      setApiUsage(null);
    });
  }, [refreshUsage]);

  return {
    usageStatus,
    recordGeneration,
    refreshUsage,
  };
}
