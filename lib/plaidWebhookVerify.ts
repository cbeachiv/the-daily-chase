// Verify the authenticity of a Plaid webhook (https://plaid.com/docs/api/webhooks/webhook-verification).
// Plaid signs each webhook with an ES256 JWS in the `Plaid-Verification` header.
// We fetch the matching public key (JWK) by `kid`, verify the signature + freshness,
// then confirm the SHA-256 of the raw body matches the signed claim.
import { createHash } from "node:crypto";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { plaidClient } from "@/lib/plaid";

// kid → JWK. Plaid rotates keys rarely; cache to avoid a fetch per webhook.
const keyCache = new Map<string, JWK>();

export async function verifyPlaidWebhook(rawBody: string, headers: Headers): Promise<boolean> {
  const token = headers.get("plaid-verification");
  if (!token) return false;

  let kid: string | undefined;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== "ES256" || !header.kid) return false;
    kid = header.kid;
  } catch {
    return false;
  }

  let jwk = keyCache.get(kid);
  if (!jwk) {
    try {
      const resp = await plaidClient().webhookVerificationKeyGet({ key_id: kid });
      const key = resp.data.key as unknown as JWK & { expired_at?: number | null };
      if (key.expired_at) return false; // revoked/expired key
      jwk = key;
      keyCache.set(kid, jwk);
    } catch {
      return false;
    }
  }

  try {
    const pubKey = await importJWK(jwk, "ES256");
    // Verifies the ES256 signature and rejects tokens older than 5 minutes (replay guard).
    const { payload } = await jwtVerify(token, pubKey, { algorithms: ["ES256"], maxTokenAge: "5 min" });
    const bodyHash = createHash("sha256").update(rawBody, "utf8").digest("hex");
    return payload.request_body_sha256 === bodyHash;
  } catch {
    return false;
  }
}
