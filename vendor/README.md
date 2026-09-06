# What is vendored here, and how to tell it is untouched

MV3's content security policy forbids remote scripts, so the one library this extension uses
is committed rather than fetched. That is the right place for it and also the one place a
modified copy would go unnoticed: a change to `chart.umd.js` is a change to every chart, and
nothing in `src/` would see it. `tools/check-vendor.mjs` runs before the tests and refuses a
file whose sha256 is not the one recorded below (US-141, finding 4).

| File | sha256 |
|---|---|
| `chart.umd.js` | `2812cb8825fdc57469eb2f7bb055e9429244e599920511ee477e828499b632cb` |
| `fonts/newsreader-latin.woff2` | `6e4f2958c3a7c4a80acde4e5a679abe7e01bc1e30b92be3c7a8b696ef401d101` |
| `fonts/source-sans-3-latin.woff2` | `7a19a7027e125257d310c6dbd78ae3a30b5ea1e3794d60b12bb28227a003bfda` |

The check reads this table, so a new vendored file needs a row here and a row here needs the
file. The licence texts beside them (`chart.js-LICENSE.md`, `fonts/OFL-*.txt`) are not hashed.

## Chart.js 4.4.7 (`chart.umd.js`, MIT)

The hash above is the upstream build's, not merely the committed file's. On 2026-09-06 the
`dist/chart.umd.js` inside two independent copies of the 4.4.7 publication hashed to exactly
that value, and so did the committed file:

- <https://registry.npmjs.org/chart.js/-/chart.js-4.4.7.tgz> (the npm publication)
- <https://github.com/chartjs/Chart.js/releases/download/v4.4.7/chart.js-4.4.7.tgz> (the
  GitHub release asset)

The CDN copies at <https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.7/chart.umd.js> and
<https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.js> serve the same npm publication;
they could not be reached from the session that recorded this, so they are listed as where to
look, not as what was checked.

Upgrading: replace the file, fetch the new version from one of the sources above, hash both,
and put the matching value in the table in the same commit. A row that is updated without a
fetch is a hash of whatever is on disk, which checks nothing.

## Fonts (`fonts/*.woff2`, SIL Open Font License 1.1)

Two variable faces, latin subset, from Google Fonts: Source Sans 3 and Newsreader. The hashes
are of the committed files; Google Fonts re-serves subsets and does not publish a stable
per-file digest, so there is no upstream value to compare them with. What the row buys is
that a later change to either file is a deliberate one, made in the same commit as this table.
