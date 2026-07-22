import cron from "node-cron";
import { sendTelegramMessage } from "./telegram.js";

const GAS_API_URL =
  process.env.GAS_API_URL ||
  "https://base-gas-x402-production.up.railway.app/gas";

const DEFAULT_THRESHOLD_GWEI = 0.01;
const CRON_GAS = process.env.CRON_GAS || "0 * * * *"; // hourly
const CRON_GAS_SUMMARY = process.env.CRON_GAS_SUMMARY || "0 9 * * *"; // daily 09:00

// Freshest reading from the 15-minute paid checks; the daily summary reads it.
/** @type {{baseFeeGwei: number, transferEth: string, fetchedAt: string} | null} */
let lastGasReading = null;

function getThresholdGwei() {
  const raw = Number(process.env.GAS_THRESHOLD_GWEI);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD_GWEI;
}

/**
 * Runs one paid gas check: pays $0.001 over x402 to read live Base gas data,
 * logs it, and stores it as the latest reading for the daily summary.
 * Never messages Telegram — that is the daily summary's job.
 *
 * @param {typeof fetch} fetchWithPayment - x402 payment-wrapped fetch.
 * @returns {Promise<{baseFeeGwei: number, transferEth: string, fetchedAt: string}>}
 */
export async function runGasCheck(fetchWithPayment) {
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
  const reading = {
    baseFeeGwei,
    transferEth,
    fetchedAt: new Date().toISOString(),
  };
  lastGasReading = reading;

  console.log(
    `[gas-alert] baseFee=${baseFeeGwei} gwei, transfer~${transferEth} ETH (fetched ${reading.fetchedAt})`,
  );
  return reading;
}

/**
 * Sends the daily gas summary to Telegram using the latest reading collected
 * by the 15-minute checks. Skips (with a log) when no reading exists yet.
 *
 * @returns {Promise<boolean>} True when a summary was sent.
 */
export async function sendGasSummary() {
  if (!lastGasReading) {
    console.warn("[gas-summary] no gas reading yet; skipping summary");
    return false;
  }

  const { baseFeeGwei, transferEth, fetchedAt } = lastGasReading;
  const thresholdGwei = getThresholdGwei();
  const verdict =
    baseFeeGwei < thresholdGwei
      ? `ucuz (esik ${thresholdGwei} gwei altinda) — islem icin iyi zaman`
      : `normal (esik ${thresholdGwei} gwei uzerinde)`;

  await sendTelegramMessage(
    `⛽️ Base gas gunluk ozet\n` +
      `Base fee: ${baseFeeGwei} gwei\n` +
      `Transfer maliyeti: ~${transferEth} ETH\n` +
      `Durum: ${verdict}\n` +
      `Veri zamani: ${fetchedAt}`,
  );
  console.log("[gas-summary] daily summary sent");
  return true;
}

/**
 * Starts both gas jobs:
 *  - CRON_GAS (default hourly): paid x402 gas check, log-only.
 *    Keeps traffic/attribution flowing and refreshes the latest reading.
 *  - CRON_GAS_SUMMARY (default daily at 09:00): one Telegram summary built
 *    from the latest reading.
 *
 * @param {typeof fetch} fetchWithPayment - x402 payment-wrapped fetch.
 * @returns {{checkTask: import("node-cron").ScheduledTask, summaryTask: import("node-cron").ScheduledTask}}
 */
export function startGasAlertJob(fetchWithPayment) {
  const checkTask = cron.schedule(CRON_GAS, async () => {
    try {
      await runGasCheck(fetchWithPayment);
    } catch (error) {
      // Keep the schedule alive on transient failures; next tick retries.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[gas-alert] tick failed: ${message}`);
    }
  });

  const summaryTask = cron.schedule(CRON_GAS_SUMMARY, async () => {
    try {
      await sendGasSummary();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[gas-summary] tick failed: ${message}`);
    }
  });

  console.log(
    `[gas-alert] check scheduled "${CRON_GAS}" -> ${GAS_API_URL} (log-only)`,
  );
  console.log(
    `[gas-summary] Telegram summary scheduled "${CRON_GAS_SUMMARY}" (threshold ${getThresholdGwei()} gwei)`,
  );
  return { checkTask, summaryTask };
}
