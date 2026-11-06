# REST protocol: `legal-acceptance` (player agreements)

Frozen contract for the per-account acceptance of Wyndlewood's three player
agreements: the Terms of Service, the Privacy Policy and the End User License
Agreement. Any client (the web client today, the Unreal client later) follows
the same two calls. The server owns the version tokens and the record;
`src/legal_versions.ts` is the single source of the tokens and
`server/legal_acceptance.ts` is the route module.

## Calls

Both are bearer-authenticated through `requireAccount` (the moderation gate
applies; the POST needs a mutation-tier token, the GET accepts a read token).

`GET /api/legal-acceptance` answers 200:

    { "current": { "terms": T, "privacy": P, "eula": E },
      "accepted": { "terms": T|null, "privacy": P|null, "eula": E|null } | null }

`current` is what the server offers now. `accepted` is what this account last
accepted, per document (`null` for a document never accepted, the whole value
`null` when the account has no record). A document is outdated when
`accepted[doc] !== current[doc]`; any outdated document means the client must
show the agreements before world entry.

`POST /api/legal-acceptance` with body `{ "terms": T, "privacy": P, "eula": E }`
answers 200 `{ "accepted": { ... } }`. The body must name the CURRENT token of
every document, taken from the last GET. The account is taken from the bearer,
never from the body.

## Errors

- 400 `validation.failed`: the body is not an object or a token is missing or
  malformed.
- 400 `legal_acceptance.invalid_input`: the body names a token that is not the
  current one (the documents changed since the client fetched them). The
  client re-fetches and shows the new text. Nothing is recorded.
- 401 `auth.token_missing` / `auth.token_invalid`, 403 `auth.forbidden` (a
  read-only token on the POST), moderation codes for a locked account.

## Rules for implementers

- Tokens are opaque (`YYYY-MM-DD-tag`) and compared for equality only. Never
  order them or parse the tag.
- A client posts the tokens the server reported, not tokens compiled into the
  client. The bundled copy is only the offline world's fallback.
- Bumping a token in `src/legal_versions.ts` re-prompts every account once.
- Storage is one row per account in `account_eula_acceptances` (re-acceptance
  overwrites, deletion cascades from the account); the Terms and Privacy
  columns are additive, so a pre-existing EULA-only row reads those documents
  as never accepted.
- The record is informational for the client gate. The world server does not
  yet refuse a join from an account with an outdated record; that is a
  separate decision.
