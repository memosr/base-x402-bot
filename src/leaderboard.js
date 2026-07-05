import cron from "node-cron";
import { sendTelegramMessage } from "./telegram.js";

const LEADERBOARD_API_URL =
  process.env.LEADERBOARD_API_URL ||
  "https://codetrack-x402-api-production.up.railway.app/leaderboard?limit=5";

const CRON_LEADERBOARD = process.env.CRON_LEADERBOARD || "0 9 * * *"; // daily 09:00

const MEDALS = ["🥇", "🥈", "🥉", "4.", "5."];

/**
 * Formats leaderboard entries ({code, tx_count}) into a Telegram summary.
 *
 * @param {Array<{code?: string, tx_count?: number}>} entries
 * @returns {string}
 */
function formatLeaderboard(entries) {
  const lines = entries.map((entry, index) => {
    const rank = MEDALS[index] ?? `${index + 1}.`;
    const code = entry.code ?? "?";
    const txCount = entry.tx_count ?? "?";
    return `${rank} ${code} — ${txCount} tx`;
  });
  return `🏆 Bugunun top Base builder lari:\n${lines.join("\n")}`;
}

/**
 * Runs one paid leaderboard fetch: pays over x402 to read the top 5 builders
 * and posts the summary to Telegram.
 *
 * @param {typeof fetch} fetchWithPayment - x402 payment-wrapped fetch.
 * @returns {Promise<void>}
 */
export async function runLeaderboard(fetchWithPayment) {
  const response = await fetchWithPayment(LEADERBOARD_API_URL);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `leaderboard API returned HTTP ${response.status}: ${body}`,
    );
  }

  const data = await response.json();
  // codetrack-x402-api returns {builders: [{code, tx_count}], count, fetchedAt};
  // fall back to a {leaderboard: [...]} envelope or a bare array.
  const entries =
    data.builders ?? data.leaderboard ?? (Array.isArray(data) ? data : null);
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(
      `leaderboard API returned no entries: ${JSON.stringify(data).slice(0, 200)}`,
    );
  }

  await sendTelegramMessage(formatLeaderboard(entries.slice(0, 5)));
  console.log(`[leaderboard] posted top ${Math.min(entries.length, 5)} builders`);
}

/**
 * Starts the daily leaderboard cron job (09:00 by default).
 *
 * @param {typeof fetch} fetchWithPayment - x402 payment-wrapped fetch.
 * @returns {import("node-cron").ScheduledTask}
 */
export function startLeaderboardJob(fetchWithPayment) {
  const task = cron.schedule(CRON_LEADERBOARD, async () => {
    try {
      await runLeaderboard(fetchWithPayment);
    } catch (error) {
      // Keep the schedule alive on transient failures; next run retries.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[leaderboard] run failed: ${message}`);
    }
  });

  console.log(
    `[leaderboard] scheduled "${CRON_LEADERBOARD}" -> ${LEADERBOARD_API_URL}`,
  );
  return task;
}
