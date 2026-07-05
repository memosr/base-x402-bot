import cron from "node-cron";
import { sendTelegramMessage } from "./telegram.js";

const GAS_API_URL =
  process.env.GAS_API_URL ||
  "https://base-gas-x402-production.up.railway.app/gas";

const DEFAULT_THRESHOLD_GWEI = 0.01;
const CRON_GAS = process.env.CRON_GAS || "*/15 * * * *"; // every 15 minutes

function getThresholdGwei() {
  const raw = Number(process.env.GAS_THRESHOLD_GWEI);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD_GWEI;
}

/**
 * Runs one paid gas check: pays $0.001 over x402 to read live Base gas data
 * and alerts Telegram when the base fee drops below the threshold.
 * Edge-triggered: alerts only when the reading is below the threshold AND
 * the previous one wasn't.
 *
 * @param {typeof fetch} fetchWithPayment - x402 payment-wrapped fetch.
 * @param {boolean} wasBelowThreshold - Previous reading's below-threshold state.
 * @returns {Promise<boolean>} This reading's below-threshold state.
 */
export async function runGasCheck(fetchWithPayment, wasBelowThreshold = false) {
  const thresholdGwei = getThresholdGwei();

  const response = await fetchWithPayment(GAS_API_URL);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`gas API returned HTTP ${response.status}: ${body}`);
  }

  const data = await response.json();
  const baseFeeGwei = Number(data.baseFeePerGas);
  if (!Number.isFinite(baseFeeGwei)) {
    throw new Error(
      `gas API returned unexpected baseFeePerGas: ${JSON.stringify(data.baseFeePerGas)}`,
    );
  }

  const transferEth = data.estimatedTransferCost?.eth ?? "?";
  const isBelowThreshold = baseFeeGwei < thresholdGwei;
  console.log(
    `[gas-alert] baseFee=${baseFeeGwei} gwei, transfer~${transferEth} ETH, threshold=${thresholdGwei} gwei, below=${isBelowThreshold}`,
  );

  if (isBelowThreshold && !wasBelowThreshold) {
    await sendTelegramMessage(
      `⛽️ Base gas ucuz: ${baseFeeGwei} gwei (esik: ${thresholdGwei} gwei)\n` +
        `Transfer maliyeti ~${transferEth} ETH — islem zamani!`,
    );
    console.log("[gas-alert] alert sent (threshold crossed downward)");
  }

  return isBelowThreshold;
}

/**
 * Starts the gas-alert cron job (every 15 minutes by default). Keeps the
 * below-threshold state across ticks so an ongoing cheap-gas streak doesn't
 * produce repeated alerts; it re-arms after gas climbs back above the threshold.
 *
 * @param {typeof fetch} fetchWithPayment - x402 payment-wrapped fetch.
 * @returns {import("node-cron").ScheduledTask}
 */
export function startGasAlertJob(fetchWithPayment) {
  let wasBelowThreshold = false;

  const task = cron.schedule(CRON_GAS, async () => {
    try {
      wasBelowThreshold = await runGasCheck(fetchWithPayment, wasBelowThreshold);
    } catch (error) {
      // Keep the schedule alive on transient failures; next tick retries.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[gas-alert] tick failed: ${message}`);
    }
  });

  console.log(
    `[gas-alert] scheduled "${CRON_GAS}" -> ${GAS_API_URL} (threshold ${getThresholdGwei()} gwei)`,
  );
  return task;
}
