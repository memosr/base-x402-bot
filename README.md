# base-x402-bot

Telegram bot that **pays live x402 APIs on Base mainnet** (USDC micropayments) and posts notifications:

1. **Gas alert** — every 15 min, pays $0.001 to [base-gas-x402](https://base-gas-x402-production.up.railway.app/gas). When `baseFeePerGas` drops below `GAS_THRESHOLD_GWEI` (default 0.01), sends one alert per cheap-gas episode (edge-triggered, no spam).
2. **Daily leaderboard** — once a day (default 09:00), pays [codetrack-x402-api](https://codetrack-x402-api-production.up.railway.app/leaderboard?limit=5) and posts the top 5 Base builders (`code` + `tx_count`).

Payments use `@x402/fetch` v2 (`x402Client` + `ExactEvmScheme` + builder-code extension `bc_lhfd8zad`) on `eip155:8453`.

## Setup

```bash
npm install
cp .env.example .env   # fill in the values
npm start
```

## Environment

| Variable | Required | Description |
|---|---|---|
| `BUYER_PRIVATE_KEY` | yes | Base mainnet key holding USDC (pays the API calls). Never logged. |
| `TELEGRAM_BOT_TOKEN` | yes | From @BotFather. Never logged. |
| `TELEGRAM_CHAT_ID` | yes | Target chat/channel id. |
| `GAS_THRESHOLD_GWEI` | no | Alert threshold in gwei (default `0.01`). |
| `CRON_LEADERBOARD` | no | Leaderboard schedule (default `0 9 * * *`). |

On start the bot sends a "bot basladi" message so you can confirm it's alive.
