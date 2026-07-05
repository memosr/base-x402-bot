import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { BuilderCodeClientExtension } from "@x402/extensions/builder-code";
import { privateKeyToAccount } from "viem/accounts";

// Payments settle on Base mainnet, matching both target servers.
const PAYMENT_NETWORK = "eip155:8453";

// Base Builder Code attached to the payment payload for attribution.
const BUILDER_CODE_VALUE = process.env.BUILDER_CODE || "bc_lhfd8zad";

/**
 * Normalizes a hex private key to the 0x-prefixed form viem expects.
 * The key is NEVER logged, printed, or otherwise exposed.
 *
 * @param {string} key
 * @returns {`0x${string}`}
 */
function normalizePrivateKey(key) {
  const trimmed = key.trim();
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

/**
 * Builds a fetch that transparently answers HTTP 402 challenges by signing
 * an x402 payment authorization and retrying with an X-PAYMENT header.
 *
 * @param {string} privateKey - Funded Base mainnet key (USDC), from env only.
 * @returns {{ fetchWithPayment: typeof fetch, payerAddress: string }}
 */
export function createPaidFetch(privateKey) {
  // privateKeyToAccount throws on a malformed key; surface a clean message
  // without ever echoing the key value.
  let account;
  try {
    account = privateKeyToAccount(normalizePrivateKey(privateKey));
  } catch {
    throw new Error(
      "BUYER_PRIVATE_KEY is not a valid hex private key. Expected 32 bytes (64 hex chars, optional 0x prefix).",
    );
  }

  const client = new x402Client().register(
    PAYMENT_NETWORK,
    new ExactEvmScheme(account),
  );
  client.registerExtension(new BuilderCodeClientExtension(BUILDER_CODE_VALUE));

  return {
    fetchWithPayment: wrapFetchWithPayment(fetch, client),
    payerAddress: account.address,
  };
}
