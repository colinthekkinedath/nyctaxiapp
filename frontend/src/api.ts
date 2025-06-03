const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

export async function fetchDemand(hour: number, q?: string) {
  const p = new URLSearchParams({ hour: hour.toString() });
  if (q) p.append("q", q);
  return fetch(`${BASE}/demand?${p}`).then(r => r.json());
}

export async function fetchTips(zoneId: number) {
  return fetch(`${BASE}/tips/${zoneId}`).then(r => r.json());
}

export async function fetchAnomalies(minFare = 200, limit = 100) {
  const p = new URLSearchParams({ min_fare: minFare.toString(), limit: String(limit) });
  return fetch(`${BASE}/anomalies?${p}`).then(r => r.json());
}

export async function fetchTripPerformance(zoneId: number, hour?: number, isWeekend?: boolean) {
  const params = new URLSearchParams();
  if (hour !== undefined) params.append("hour", hour.toString());
  if (isWeekend !== undefined) params.append("is_weekend", isWeekend.toString());
  return fetch(`${BASE}/trip-performance/${zoneId}?${params}`).then(r => r.json());
}

export async function fetchPopularRoutes(zoneId: number, hour?: number, limit = 10) {
  const params = new URLSearchParams();
  if (hour !== undefined) params.append("hour", hour.toString());
  params.append("limit", limit.toString());
  return fetch(`${BASE}/popular-routes/${zoneId}?${params}`).then(r => r.json());
}

export async function fetchPaymentAnalysis(zoneId: number, hour?: number) {
  const params = new URLSearchParams();
  if (hour !== undefined) params.append("hour", hour.toString());
  return fetch(`${BASE}/payment-analysis/${zoneId}?${params}`).then(r => r.json());
} 