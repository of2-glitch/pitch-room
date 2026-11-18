# Submission note (draft, edit into your own words before submitting)

**What I built.** Pitch Room is a live multiplayer game for finance interview prep. A host opens a room, friends join from their phones with a code, and each round pulls a real stock's live price and a recent headline. An AI turns that into one interview-style question, everyone writes a pitch, and one AI call grades every answer on the same rubric. The leaderboard updates on every screen at once.

**DeepSpace pieces I used.**
- Auth for sign-in and verified identity.
- Records with RBAC for rooms, players, rounds, and answers. I leaned on `userBound` so ids can't be spoofed, `uniqueOn` so a player can't join twice or answer twice, `writableFields` so nobody edits their own score, and `read: 'own'` so you can't copy someone's pitch before grading.
- Live `useQuery` subscriptions for the real-time part. No custom websockets.
- Server actions for anything that decides the game. Actions skip record RBAC, so each one checks the caller itself (host only for start and grade).
- Three integrations through the DeepSpace proxy, so there are no API keys in the repo: `finnhub/stock-price` for the quote, `newsapi/search-everything` for a headline, and `openai/chat-completion` to write the question and grade answers.

**What I left out and why.** Payments, messaging, and file storage wouldn't make a round better. I also skipped round timers, saved history, and custom ticker lists to keep one loop solid.

**Main tradeoff.** I grade every answer in one AI call when the host clicks Grade, instead of grading each answer as it comes in. One call is cheaper and scores everyone against the same context, so scores are comparable. The cost is a few seconds of "grading..." at the end of each round. A second, smaller one: if the live quote fails, the round refuses to start instead of making up a number, because a fake price would teach the wrong thing.

**What the agent did.** I used Claude to scaffold the app, read the SDK types and live integration catalog, write the schemas, server actions, and UI, and write unit tests for the game logic and the server actions (14 tests, with the integrations stubbed). It also ran type-check, lint, the build, and DeepSpace's schema linter.

**What I verified or changed myself.** [Fill this in honestly after you test. For example: confirmed the Finnhub response shape with `integrations invoke`; two-browser test of create, join, answer, grade, live leaderboard; checked a non-host can't start or grade; played a game with teammates on phones and fixed X.]

**What I'd do next.** A round timer, saved history so you can see your scores improve, custom ticker lists (like "only banks" for a bank superday), and a coach mode where the host can override a score with a note.
