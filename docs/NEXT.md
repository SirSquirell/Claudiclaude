# Planning 0.11 — retired

This was the research document written while 0.10.0 was being tested. Everything in it has since
been built or superseded, so its content is gone and the pointers below say where each item went.
Where things stand is in [STATUS.md](STATUS.md); what shipped when is in [../CHANGELOG.md](../CHANGELOG.md).

| Was | Became |
|---|---|
| §1 Keep unrecognised fields from the API | `parseProducts` keeps them as `extra`; the missing-field alarm is US-17 (0.46.0) |
| §2 What US-07 (options & margin) needs | Still open, still needs a real HAR — see US-07 in [BACKLOG.md](BACKLOG.md) §3 and STATUS.md *Refined, not built* |
| §3 US-11 — report a bug without handing over the portfolio | Built as US-11/US-11b, the clipboard bug report (0.14.0) |
| §3b Zeus — what a competitor had | Answered in BACKLOG.md, *Where we now stand against Zeus*: annual reports (US-30, 0.34.0), a language switch (0.32.0), trade markers (0.15.0), drag-to-zoom (0.12.0; refined by US-55/62/63 in 0.47.0) |
| §3c US-12 — zoom the value chart | Built 0.12.0, refined as US-55, US-62 and US-63 (0.47.0) |
| §3d US-13 — candles on the value chart | Built 0.12.0; the toggle's refusal fixed 0.13.0 |
| §3e B11 — contract size through an interpolated rate | Fixed 0.29.0 |
| §4 T-1 — the leak guards | `tools/check-leaks.mjs`, wired into `npm test` |
