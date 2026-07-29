# Legacy source of truth

Two files, copied verbatim out of the Nuxt 2 app at `4eb587d` before Task 12
deleted `frontend/`. They are not built and not shipped. They exist because
three things in the rebuild are checked *against* them rather than assumed:

| File | Read by | Guarantees |
|---|---|---|
| `data.js` | `scripts/extract-copy.mjs`, `web/test/cases.test.ts` | the medical copy in `web/content/copy.generated.ts` is character-for-character the original |
| `nuxt.config.js` | `web/test/legacyRoutes.test.ts` | `LEGACY_ROUTES` covers exactly the paths the old site generated, so nothing bookmarked 404s |

Deleting `frontend/` without keeping these would have left the copy-parity
test with nothing to compare against -- it would have passed by comparing
`copy.generated.ts` to itself. The whole point of that test is that the two
sides have independent origins.

Do not edit these files. They are a historical record; if they change, the
tests stop meaning anything. The full app remains in git history at `4eb587d`.
