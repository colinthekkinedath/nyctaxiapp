const BASE = import.meta.env.VITE_API_BASE || "/api";

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