# Third Party Notices

Wyndlewood project code is licensed under the MIT License in `LICENSE`.
Bundled art, audio and font asset credits are tracked separately in
`CREDITS.md`.

## Runtime dependencies

Every runtime dependency the shipped client, desktop shell and server bundle
is declared in `package.json` and pinned in `pnpm-lock.yaml`. Each installed
package ships its own license text (MIT, ISC, BSD or Apache-2.0) in its
package directory; none of them requires a separate notice beyond that file.

## Removed: the wallet-linking stack

Earlier versions of this file recorded the notices for the Reown AppKit,
WalletConnect, `@solana/web3.js`, `@noble/curves`, `bs58` and `tweetnacl`
packages behind the retired wallet-linking feature. Wyndlewood ships no
cryptocurrency, token or wallet integration of any kind: those packages were
removed from `package.json` and `pnpm-lock.yaml` on 2026-11-05 (Steam does
not allow blockchain games), and the community license texts that applied
only to them were removed from `third_party/licenses/` in the same change.
Nothing in the shipped build is distributed under those licenses any more.
