# Agent log

How the coding agent (Claude) was directed and what was checked. Owen: add your own entries below as you test and change things.

## 2026-11-18: initial build (agent)

- Scaffolded with `npm create deepspace@latest pitch-room --with-skill` (npm 11 needed; npm 10 is unsupported by the template).
- docs.deep.space wasn't reachable from the agent's sandbox, so the agent read the installed SDK types (`node_modules/deepspace/dist/*.d.ts`) and the bundled DeepSpace skill instead, and pulled the live integration catalog (`/api/integrations`) through a browser to get exact endpoint names and input schemas for `finnhub/stock-price`, `newsapi/search-everything`, and `openai/chat-completion`.
- Wrote schemas, three server actions, the lobby and room pages, and a theme.
- Checks run by the agent: `tsc --noEmit` clean, `eslint` clean, `vite build` succeeds (with a throwaway app id in a scratch copy, since the real id is minted on first login), DeepSpace's `lintSchemaSet` returns no warnings, 14 unit tests pass (pure logic + server actions against an in-memory fake of the record tools with stubbed integrations).
- Bug the tests caught: none in the app; one in the test helper (duplicate fake ids), fixed.
- Known unknown: Finnhub's `stock-price` has no published output schema, so `parseQuote` accepts both Finnhub's raw `{c, dp, pc}` shape and long-form names, and the round refuses to start (with a visible error) rather than inventing a price.

## To verify by hand (Owen)

- [ ] `npx deepspace integrations invoke finnhub/stock-price --body '{"symbol":"AAPL"}'` returns a price that `parseQuote` reads
- [ ] Two browsers (one incognito, two accounts): create room, join, start round, both answer, grade, leaderboard updates on both without refresh
- [ ] Non-host can't see Start/Grade buttons, and calling the action directly is refused
- [ ] A player's answer isn't visible to others until grading
- [ ] Play a real game with 3+ people on phones; note what confused them
