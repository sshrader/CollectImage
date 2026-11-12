# Bear Den

A pump.fun launchpad for one coin, plus a holder reward: hold the coin and collect a pixel bear.

- **`/launch`** (owner only) creates the coin on the pump.fun bonding curve with the official `@pump-fun/pump-sdk`. Your dev buy goes in the same transaction as the launch, so no one can buy in between.
- **`/`** is the public page. It shows the bonding curve's progress, a Buy on pump.fun button (mainnet), and the collect flow below.

Hold the coin, sign a free message with Phantom, and one of N images is assigned to your wallet. Only that wallet can open it.

- The images are 64 by 64 pixel bears drawn by code (`art.js`): 8 coat colours, eyes, mouths, accessories (beanies, scarves, honey pots and more) and cave, snow and campfire backgrounds. Traits come from a secret only the server knows and no two bears in a set match, so none can be previewed or guessed before it is claimed. Each shows its owner's short address.
- Signing sends no transaction and costs nothing. The server checks the signature, then reads the wallet's balance of the coin from Solana.
- First come, first served. A wallet that already has an image always gets the same one. When all N are taken, the page says so.
- By default the balance is checked on every download, so a wallet that sold the coin stops getting its image.
- The collect server itself uses no packages. The launch page needs the pump SDK, installed by `npm install`. Needs Node 20 or newer.

## Launching the coin

1. In Railway set `ADMIN_TOKEN` (a long random password), `RPC_URL` (your private Helius URL) and `PUBLIC_URL` (your custom domain, **before** you launch: the coin's metadata link is permanent).
2. Open `https://yourdomain.com/launch`, connect Phantom, enter the password, fill in the name, ticker, socials and image (a generated bear is one click), pick the network and dev buy, and launch. Try devnet first.
3. Copy the new coin's address into `COIN_MINT` in Railway (and set `CLUSTER=devnet` if it was a devnet test). The public page now opens for holders.

The browser never sees your private RPC URL: mainnet calls go through `POST /api/rpc/mainnet`, which only forwards an allowlist of calls. The launch is always one transaction on mainnet (create plus dev buy), uses a lookup table the first time a wallet launches (about 0.003 SOL), and needs about 0.08 SOL plus the dev buy. The code in `src/launch.mjs` is the same tested module Sparkpad uses. `npm run build` bundles it to `dist/launch.js`; Railway runs that for you.

## Run

```
npm install
npm run build  # bundles the pump.fun launch code to dist/launch.js
npm start      # http://localhost:3000
npm test
```

## Settings (environment variables)

| Variable | Purpose |
| --- | --- |
| `COIN_MINT` | The coin's mint address. The page stays off until this is set. |
| `COIN_NAME` | Name shown on the page, for example `Bear Den`. |
| `CLUSTER` | `mainnet` (default) or `devnet`. |
| `RPC_URL` | Your private RPC URL (for example Helius). Kept on the server. Falls back to the public endpoint, which is rate limited. |
| `MIN_HOLD` | Smallest amount of the coin a wallet must hold. Default 1. |
| `SLOTS` | How many images exist, 1 to 100. Default 40. |
| `REQUIRE_HOLD_ON_DOWNLOAD` | `0` lets a wallet that already collected keep its image after selling. Default checks every time. |
| `IMAGE_SECRET` | Optional. Decides how each image looks. If unset, one is created in the data folder. |
| `ADMIN_TOKEN` | Password for the `/launch` tools. They stay off while it is unset. |
| `PUBLIC_URL` | Your domain, used in the coin's metadata links. |
| `DATA_DIR` | Where claims are stored. Defaults to `/data` if it exists, otherwise `./data`. On Railway, attach a volume at `/data` or claims are lost on every deploy. |

## Deploy on Railway

1. Create a project from this repo and attach a volume mounted at `/data`.
2. Set `COIN_MINT`, `RPC_URL` and the other settings above. Add your domain.
3. Test on devnet first with `CLUSTER=devnet` and a devnet coin.

## Limits to know

- A downloaded image can be copied. This controls who gets the file, not what they do with it.
- One person can hold the coin in several wallets and collect several images. A higher `MIN_HOLD` makes that costly.
- Back up the data folder. It holds who owns which slot.
