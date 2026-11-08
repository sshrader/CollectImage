# Collect

Hold the coin, sign a free message with Phantom, and one of N images is assigned to your wallet. Only that wallet can open it.

- The images are 32 by 32 pixel frogs and toads drawn by code (`art.js`): 14 skin colours, patterns, eyes, mouths, hats, accessories and backgrounds. Traits come from a secret only the server knows and no two frogs in a set match, so none can be previewed or guessed before it is claimed. Each shows its owner's short address.
- Signing sends no transaction and costs nothing. The server checks the signature, then reads the wallet's balance of the coin from Solana.
- First come, first served. A wallet that already has an image always gets the same one. When all N are taken, the page says so.
- By default the balance is checked on every download, so a wallet that sold the coin stops getting its image.
- No dependencies. Needs Node 20 or newer.

## Run

```
npm start      # http://localhost:3000
npm test
```

## Settings (environment variables)

| Variable | Purpose |
| --- | --- |
| `COIN_MINT` | The coin's mint address. The page stays off until this is set. |
| `COIN_NAME` | Optional name shown on the page. |
| `CLUSTER` | `mainnet` (default) or `devnet`. |
| `RPC_URL` | Your private RPC URL (for example Helius). Kept on the server. Falls back to the public endpoint, which is rate limited. |
| `MIN_HOLD` | Smallest amount of the coin a wallet must hold. Default 1. |
| `SLOTS` | How many images exist, 1 to 100. Default 10. |
| `REQUIRE_HOLD_ON_DOWNLOAD` | `0` lets a wallet that already collected keep its image after selling. Default checks every time. |
| `IMAGE_SECRET` | Optional. Decides how each image looks. If unset, one is created in the data folder. |
| `DATA_DIR` | Where claims are stored. Defaults to `/data` if it exists, otherwise `./data`. On Railway, attach a volume at `/data` or claims are lost on every deploy. |

## Deploy on Railway

1. Create a project from this repo and attach a volume mounted at `/data`.
2. Set `COIN_MINT`, `RPC_URL` and the other settings above. Add your domain.
3. Test on devnet first with `CLUSTER=devnet` and a devnet coin.

## Limits to know

- A downloaded image can be copied. This controls who gets the file, not what they do with it.
- One person can hold the coin in several wallets and collect several images. A higher `MIN_HOLD` makes that costly.
- Back up the data folder. It holds who owns which slot.
