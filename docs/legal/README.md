# Wyndlewood legal drafts

> Every document in this folder is a **DRAFT TEMPLATE for a lawyer to review**.
> None of it is legal advice, and none of it may be published or relied on
> until a qualified lawyer has reviewed it for each country Wyndlewood is sold
> in. The publishing entity is still undecided, so every document uses the
> placeholder `[PUBLISHER LEGAL NAME]` (and other square-bracket placeholders).

| Document | Player-facing page | Notes |
|---|---|---|
| `eula.md` | `public/eula.html` (`/eula`) | Accepted in the client before world entry, versioned (`src/legal_versions.ts` `EULA_VERSION`), recorded per account (`server/eula.ts`). |
| `terms-of-service.md` | `public/terms.html` (`/terms`) | Online service, accounts, moderation, wipes. |
| `privacy-policy.md` | `public/privacy.html` (`/privacy`) | Accounts, chat, Steam sign-in, the opt-in analytics (`src/analytics_events.ts`), export and deletion. |
| `code-of-conduct.md` | in-game and Discord | Player rules and enforcement ladder. |
| `early-access-and-refunds.md` | Steam store page | The Early Access disclosure, the one planned wipe at 1.0, Steam refunds. |
| `license-review.md` | none | What the MIT fork license and the third-party notices require for a commercial release. |

## Owner actions before publishing

1. Choose the publishing entity and fill `[PUBLISHER LEGAL NAME]`, address,
   registration number, governing law, venue, and contact emails.
2. Have a lawyer review every document (consumer law, GDPR/UK GDPR, CCPA,
   COPPA, Steam requirements), including whether an EU/UK representative is
   needed.
3. Fill the retention periods in the privacy policy from the real server
   configuration, and list the actual hosting and email providers.
4. Bump `EULA_VERSION` in `src/legal_versions.ts` when the reviewed EULA is
   final, so every account accepts the final text once.
5. Paste the reviewed EULA into the Steamworks custom EULA field if you want
   Steam to show it before first launch too.
