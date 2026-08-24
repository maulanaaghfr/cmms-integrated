import { apiCentral } from "./api";

export function listPublicPlans() {
  return apiCentral("/public/plans");
}

export function registerOnboarding(payload) {
  const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return apiCentral("/onboarding/register", {
    method: "POST",
    body: payload,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
