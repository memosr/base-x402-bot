import "dotenv/config";
import { createPaidFetch } from "./src/x402.js";
import { sendTelegramMessage } from "./src/telegram.js";
import { runGasCheck, startGasAlertJob } from "./src/gasAlert.js";
import { runLeaderboard, startLeaderboardJob } from "./src/leaderboard.js";

function requireEnv(names) {
  const missing = names.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    // Fail fast with the variable NAMES only — values are never printed.
    console.error(`[error] missing required env vars: ${missing.join(", ")}`);
    console.error("        Copy .env.example to .env and fill them in.");
    process.exit(1);
  }
}

async function main() {
  requireEnv(["BUYER_PRIVATE_KEY", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]);

  const { fetchWithPayment, payerAddress } = createPaidFetch(
    process.env.BUYER_PRIVATE_KEY,
  );

  console.log("=== base-x402-bot ===");
  // Only the public address is logged — never the private key.
  console.log(`  payer: ${payerAddress}`);

  // RUN_ONCE=1: manual test mode — run both paid checks immediately,
  // log the results, and exit instead of starting the cron schedules.
  if (process.env.RUN_ONCE === "1") {
    console.log("[run-once] cron atlandi; her iki kontrol bir kez calisiyor");
    let failed = false;

    try {
      const isBelowThreshold = await runGasCheck(fetchWithPayment);
      console.log(`[run-once] gas check OK (below threshold: ${isBelowThreshold})`);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[run-once] gas check FAILED: ${message}`);
    }

    try {
      await runLeaderboard(fetchWithPayment);
      console.log("[run-once] leaderboard OK");
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[run-once] leaderboard FAILED: ${message}`);
    }

    console.log(`[run-once] tamamlandi${failed ? " (hatalarla)" : ""}`);
    process.exit(failed ? 1 : 0);
  }

  await sendTelegramMessage(
    `🤖 base-x402-bot basladi (payer: ${payerAddress})\n` +
      "Gas alert: 15 dk'da bir · Leaderboard: gunde 1 kez",
  );
  console.log("[startup] Telegram'a baslangic mesaji gonderildi");

  startGasAlertJob(fetchWithPayment);
  startLeaderboardJob(fetchWithPayment);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[fatal] ${message}`);
  process.exit(1);
});
