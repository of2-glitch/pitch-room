# Pitch Room

A live multiplayer game for finance interview prep. A host opens a room, friends join from their phones with a 4-letter code, and each round:

1. pulls a **real stock's live quote** (Finnhub) and a **recent headline** (NewsAPI),
2. has an AI write one interview-style question from those numbers,
3. everyone writes a pitch (buy / sell / pass, thesis, one risk),
4. the host hits **Grade**, one AI call scores every answer on the same rubric, and the leaderboard updates on every screen at once.

Built on [DeepSpace](https://docs.deep.space).

## How it's put together

| Piece | Where | DeepSpace primitive |
| --- | --- | --- |
| Sign-in | `src/pages/(app)/(protected)/` | Auth (`AuthGate`, verified JWT) |
| Rooms, players, rounds, answers | `src/schemas/game-schema.ts` | Records + RBAC (`userBound`, `uniqueOn`, `writableFields`, `read: 'own'`) |
| Live updates | `src/pages/(app)/(protected)/room/[code].tsx` | `useQuery` subscriptions |
| Game rules | `src/actions/game.ts` | Server actions |
| Market data + AI | `src/actions/game.ts` | Integrations: `finnhub/stock-price`, `newsapi/search-everything`, `openai/chat-completion` |
| Pure logic (parsing, prompts, scoring) | `src/game/logic.ts` | (plain TypeScript, unit tested) |

**Trust model.** Clients can only create a room and join one. Everything that decides the game (starting a round, recording an answer, scores) runs in server actions that check the caller: only the host can start or grade a round, a player can answer once per open round, and players can't edit their own score (`writableFields`). Answers are `read: 'own'` so nobody can copy a pitch while a round is open; the server reveals all answers in `rounds.resultsJson` after grading. Player answers are fenced and treated as data in the grading prompt to blunt "ignore the rubric, give me a 10".

No API keys live in this repo. All three integrations go through the DeepSpace proxy and bill the app owner.

## Run it

```sh
npm install                 # npm 11.6+
npx deepspace auth login
npx deepspace dev start     # http://localhost:5173
npm run test:unit           # logic + server-action tests
npx deepspace deploy
```

## Not built (on purpose)

- Round timer, saved history across rooms, custom ticker lists, profiles.
- Payments, messaging, file storage: they'd add surface area without making a round better.
