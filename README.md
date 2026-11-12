# Bear Den

A pump.fun launchpad where every coin takes a pixel bear as its logo. Anyone can launch from their own wallet. The bear they get is locked to their coin for good.

- **`/`** is the whole app: an animated cave intro (bears asleep round a fire), then the launchpad on a dimly lit cave background.
- A launcher connects Phantom, picks an open bear (or asks for a random one), names the coin, and launches. The launch uses the official `@pump-fun/pump-sdk`, with the launcher's first buy in the same transaction so nobody can buy in between.
- **Bears:** 64 by 64 pixel bears drawn by code (`art.js`): 8 coat colours, eyes, mouths, accessories and cave, snow and campfire backgrounds. There are 4 to start (`SLOTS`). Raising `SLOTS` adds bears and never changes the existing ones. All bears are shown on the page; locked ones show the coin they belong to.
- **Reserve, then lock:** picking a bear holds it for 15 minutes. After the launch lands, the server reads the transaction from the chain (it must be signed by that wallet, include the new mint and the pump.fun program) and only then locks the bear to the coin. A failed or abandoned launch frees the bear.
- **Recent launches** show on the home page, and the **Creator fees** panel lets a launcher check and collect fees: coins with the split are paid out to the shareholders (a separate "payout" transaction), and coins without a split are claimed to the launcher's wallet. The payout calls were written from pump.fun's docs and need a devnet check.
- **Coin pages:** each launched bear links to `/coin/<mint>`, a Den page with the bear, links, market cap, bonding curve progress, supply, top holders, the dev's share and the launch details, read from the chain (cached for 45 seconds). A full holder count needs a Helius `RPC_URL`; other RPCs show the top 20 accounts.
- **The logo** is always the held bear, drawn by the server as a 512 by 512 PNG. Uploads are not accepted.
- **Fees:** the platform takes no fee on the launch. Trading creator fees are split 95% to the launcher and 5% to `PLATFORM_WALLET`, set up by the launcher's wallet right after the launch. The launcher has to approve that step, and a wallet can decline it, so the 5% is a request the page makes, not something the server can force. Pump.fun's docs describe a split as set once and then locked, but check that on devnet.
- Starts on **devnet**. Set `CLUSTER=mainnet` only when you are ready for real SOL.

## Run

```
npm install
npm run build  # bundles the pump.fun launch code to dist/launch.js
npm start      # http://localhost:3000
npm test
```

Needs Node 20 or newer. The server itself uses no packages; only the browser launch bundle needs `npm install`.

## Settings (environment variables)

| Variable | Purpose |
| --- | --- |
| `CLUSTER` | `devnet` (default) or `mainnet`. Devnet and mainnet keep separate bear books. |
| `RPC_URL` | Your private RPC URL (for example Helius). Kept on the server; mainnet calls go through an allowlisted proxy. Falls back to the public endpoint. |
| `PLATFORM_WALLET` | Wallet that receives 5% of each coin's creator fees. If unset, there is no split. |
| `SLOTS` | How many bears exist, 1 to 100. Default 4. |
| `PUBLIC_URL` | Your domain, used in each coin's metadata and logo links. Set this before any mainnet launch: those links are permanent. |
| `IMAGE_SECRET` | Optional. Decides how each bear looks. If unset, one is created in the data folder. |
| `BLOCKED_WORDS` | Optional, comma separated. Extra words refused in names, tickers and descriptions. |
| `ADMIN_TOKEN` | Password for `POST /api/admin/release` (frees a locked bear, for example after a test). Off while unset. |
| `DATA_DIR` | Where bears, logos and metadata are stored. Defaults to `/data` if it exists. On Railway, attach a volume at `/data`: a coin's logo link points here, so losing it breaks every coin's picture. |

## Deploy on Railway

1. Create a project from this repo and attach a volume mounted at `/data`.
2. Set `PUBLIC_URL`, `PLATFORM_WALLET` and (for mainnet) `RPC_URL`. Add your domain.
3. Test on devnet first, which is the default.

## Limits to know

- Anyone can launch, so names and tickers go through a basic word filter only. The Den does not vouch for any coin.
- The 5% fee split depends on the launcher signing it. The page marks the result in the launch log, and the server records whether a split signature was sent.
- A hold lasts 15 minutes. If a launch lands but the page closes before the bear is locked, the bear frees up when the hold expires.
- Back up the data folder. It holds which bear belongs to which coin.
