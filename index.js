import "dotenv/config";
import { createPaidFetch } from "./src/x402.js";
import { sendTelegramMessage } from "./src/telegram.js";
import {
  runGasCheck,
  sendGasSummary,
  startGasAlertJob,
} from "./src/gasAlert.js";
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

  // RUN_ONCE=1: manual test mode — run one paid gas check, send the daily
  // gas summary once, run the leaderboard once, then exit (no cron).
  if (process.env.RUN_ONCE === "1") {
    console.log(
      "[run-once] cron atlandi; gas check + gunluk ozet + leaderboard bir kez calisiyor",
    );
    let failed = false;

    try {
      const reading = await runGasCheck(fetchWithPayment);
      console.log(`[run-once] gas check OK (baseFee: ${reading.baseFeeGwei} gwei)`);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[run-once] gas check FAILED: ${message}`);
    }

    try {
      const sent = await sendGasSummary();
      console.log(`[run-once] gas summary ${sent ? "OK" : "SKIPPED (no data)"}`);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[run-once] gas summary FAILED: ${message}`);
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
      "Gas check: 15 dk'da bir (log-only) · Gas ozeti: gunde 1 kez · Leaderboard: gunde 1 kez",
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
