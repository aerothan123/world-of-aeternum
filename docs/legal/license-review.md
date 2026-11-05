# License review: what the fork license requires for a commercial Wyndlewood release

> **DRAFT FOR LAWYER REVIEW, NOT LEGAL ADVICE.** This is an engineering reading
> of the license files in this repository as of the Wyndlewood rebrand
> (`LICENSE`, `THIRD_PARTY_NOTICES.md`, `CREDITS.md`). A lawyer must confirm it
> before release, in particular the asset questions in section 3.

## 1. The code: MIT License (`LICENSE`)

`LICENSE` is the standard MIT License, "Copyright (c) 2026 Levy Street". It
covers the project's **source code only** (`CREDITS.md` says so explicitly and
carves media assets out of it).

What MIT allows: use, copy, modify, merge, publish, distribute, sublicense,
and **sell** copies, so a paid, closed-source commercial game built on this code
is permitted. Wyndlewood's own additions may be licensed however the owner
chooses; MIT does not require the fork to stay open source.

What MIT requires, the one condition: **"The above copyright notice and this
permission notice shall be included in all copies or substantial portions of
the Software."** For Wyndlewood that means:

- Every distributed build (the Steam depot, any website installer, the web
  client bundle) must carry the full MIT text with the "Copyright (c) 2026
  Levy Street" line. The desktop build now ships it: `package.json`
  `build.extraResources` copies `LICENSE`, `THIRD_PARTY_NOTICES.md`, and
  `CREDITS.md` into the install folder under `resources/licenses/`, so they sit
  beside the game on every player's disk (pinned by
  `tests/electron_brand.test.ts`).
- The notice must not be removed or altered. `LICENSE` and
  `THIRD_PARTY_NOTICES.md` are left byte-for-byte intact by the rebrand.
- MIT gives no warranty and no trademark rights (see section 4).

MIT does **not** require: crediting upstream in the game UI, publishing
Wyndlewood's source, using the same license, or asking permission. A short
"Built on the open-source World of ClaudeCraft engine" credit (as the EULA
section 9 and the footer GitHub link already carry) is courteous and
recommended, not required.

## 2. Third-party runtime dependencies (`THIRD_PARTY_NOTICES.md` and the bundle)

`THIRD_PARTY_NOTICES.md` currently records only the wallet-linking packages:
Reown AppKit and the WalletConnect community-licensed packages (each requires
the notice "Portions (c) 2025 Reown, Inc. All Rights Reserved" plus its license
copy under `third_party/licenses/`), WalletConnect MIT and 0BSD helpers,
`@noble/curves`, `@noble/hashes`, `@solana/web3.js`, `bs58`, `TweetNaCl.js`,
and `buffer`.

- While any of those packages ships in a build, its notice must ship too.
- Steam bans blockchain games, and the owner decided to REMOVE the crypto
  packages (core-systems crew). Once they are out of `package.json` and the
  bundle, their sections can be dropped from the notices; until then, keep them.
- The file is scoped to those packages only, but the shipped client bundle
  also contains other open-source code (for example three.js, MIT) whose
  licenses likewise require their notices in distributed copies. **Owner or
  engineering action:** generate a complete notices file from the actual
  production bundle (the Vite client and the Electron vendor bundle) before
  release, and ship it in `resources/licenses/`. Electron's own
  `LICENSE.electron.txt` and `LICENSES.chromium.html` are added by
  electron-builder automatically; keep them.

## 3. Media assets (`CREDITS.md`)

`CREDITS.md` is the operative license record for art, audio, fonts, and other
media, and it **controls over MIT**. Its Redistribution column decides what a
commercial fork may ship:

| Redistribution value | Rows (at this review) | Commercial Wyndlewood release |
|---|---|---|
| `Yes` (CC0, public domain) | 36 | Ship freely. |
| `Yes, attribution required` (CC BY 4.0, MIT, Apache-2.0) | 3 | Ship, but keep the credit and license notice: the ESO / S. Brunier skybox (CC BY 4.0), the three.js water normal maps (MIT), and the Basis Universal transcoder (Apache-2.0, which also requires its NOTICE and license text). Shipping `CREDITS.md` and `THIRD_PARTY_NOTICES.md` in `resources/licenses/` covers the credit; add the Apache-2.0 text. |
| `Yes, under SIL OFL 1.1` | 1 (Cinzel, Alegreya, Alegreya Sans webfonts) | Ship with the OFL license text; never sell the fonts on their own; do not use the reserved font names for modified versions. |
| `Yes, with attribution` (base horse, CC BY 4.0) | 1 | Ship with the WildPoly3D credit kept. |
| `With the project only` | 209 | `CREDITS.md` permits keeping these "as part of World of ClaudeCraft or a fork of it", not extracting them. **Get written confirmation from Levy Street that a PAID fork is covered** (owner decision 1 asks to replace them anyway). |
| `Non-commercial only, with attribution` (CC BY-NC 4.0, @jamiecypher audio) | 9 | **Cannot ship commercially.** The commercial grant runs to World of ClaudeCraft (Levy Street) only and does not transfer. Replace before release. |
| `No, permission required` (rights reserved, CraftPix, used with permission; excluding the new Wyndlewood brand set row, which is the owner's own art) | 143 | **Cannot ship.** Replace with original Wyndlewood work or obtain written permission (owner decision 1: replace). |
| Not listed at all | unknown | "Unrecorded, not free": audit every shipped file before release. |

The rebrand replaced the World of ClaudeCraft logos, favicons, app icons, splash
and home background in place with the owner's original Wyndlewood art, and
recorded them as the Wyndlewood brand set row in `CREDITS.md`.

## 4. Trademarks

Neither MIT nor `CREDITS.md` licenses any trademark. `CREDITS.md` "Brand marks"
says the "World of ClaudeCraft" and "Levy Street" names, logos, and branding
are not licensed. Wyndlewood may state the factual relationship ("built on the
open-source World of ClaudeCraft engine") but must not present itself as World
of ClaudeCraft, use its logos, or imply endorsement. Platform marks (Steam,
Discord) are used only to identify links, under each platform's brand
guidelines. A formal trademark search for "Wyndlewood" (classes 9, 28, 41) is an
open owner action.

## 5. Checklist before a commercial release

1. Keep `LICENSE` (MIT, Levy Street notice) and `THIRD_PARTY_NOTICES.md` intact
   and shipped in every build (done for the desktop build via
   `build.extraResources`).
2. Generate a complete third-party notices file from the real production
   bundle; drop the crypto sections only once those packages are removed.
3. Replace every `No, permission required` and CC BY-NC asset; get written
   confirmation for, or replace, the `With the project only` set.
4. Audit unlisted shipped files and record each in `CREDITS.md`.
5. Keep attribution for the CC BY, Apache-2.0, MIT media, and OFL fonts, and
   ship the Apache-2.0 and OFL license texts.
6. Lawyer review of this document, the EULA (section 9 open-source clause),
   and the trademark position.
