/**
 * Pitch Room server actions.
 *
 * Actions run with record RBAC turned off (see src/server/action-routes.ts),
 * so every action here checks the caller itself before writing:
 *   - startRound / scoreRound: caller must be the room's host.
 *   - submitAnswer: caller must be a player in the room, the round must be
 *     open, and they must not have answered it yet.
 *
 * Integrations (all developer-billed through the DeepSpace proxy, no keys in
 * this repo):
 *   - finnhub/stock-price      live quote for the round's ticker
 *   - newsapi/search-everything one recent headline for context (best effort)
 *   - openai/chat-completion   writes the question, then grades the answers
 */

import type { ActionContext, ActionHandler, ActionResult } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  completionText,
  fallbackQuestion,
  parseQuote,
  parseScores,
  pickHeadline,
  pickTicker,
  questionPrompt,
  scoringPrompt,
  type RoundResult,
} from '../game/logic'

/** Cheap, fast model with standard pricing in the DeepSpace catalog. */
const MODEL = 'gpt-4o-mini'

interface Room extends Record<string, unknown> {
  code: string
  hostId: string
  status: string
  roundNumber: number
  currentRoundId: string
}
interface Player extends Record<string, unknown> {
  roomId: string
  userId: string
  name: string
  score: number
  answeredRound: number
}
interface Round extends Record<string, unknown> {
  roomId: string
  roundNumber: number
  ticker: string
  question: string
  status: string
}
interface Answer extends Record<string, unknown> {
  roundId: string
  roomId: string
  userId: string
  text: string
}

type Ctx = ActionContext<Env>

const fail = (error: string, code?: string): ActionResult => ({ success: false, error, code })

function str(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
}

async function loadHostedRoom(
  ctx: Ctx,
  roomId: string,
): Promise<{ ok: false; error: ActionResult } | { ok: true; room: Room }> {
  const res = await ctx.tools.get<Room>('rooms', roomId)
  if (!res.success) return { ok: false, error: fail('Room not found.', 'room_not_found') }
  const room = res.data.record.data
  if (room.hostId !== ctx.userId) return { ok: false, error: fail('Only the host can do that.', 'not_host') }
  return { ok: true, room }
}

const startRound: ActionHandler<Env> = async (ctx) => {
  const roomId = str(ctx.params.roomId)
  if (!roomId) return fail('roomId is required.')
  const loaded = await loadHostedRoom(ctx, roomId)
  if (!loaded.ok) return loaded.error
  const { room } = loaded
  if (room.status === 'open' || room.status === 'scoring') {
    return fail('Finish the current round first.', 'round_in_progress')
  }

  // Avoid repeating tickers within a room.
  const past = await ctx.tools.query<Round>('rounds', { where: { roomId }, limit: 100 })
  const used = past.success ? past.data.records.map((r) => r.data.ticker) : []
  const ticker = pickTicker(used)

  // 1. Live price. Without it there is no round: a made-up number would teach
  //    people the wrong thing, so surface the error instead.
  const quoteRes = await ctx.tools.integration('finnhub/stock-price', { symbol: ticker.symbol })
  const quote = quoteRes.success ? parseQuote(quoteRes.data) : null
  if (!quote) {
    console.warn(`[startRound] quote failed for ${ticker.symbol}: ${quoteRes.success ? 'unparsed body' : quoteRes.error}`)
    return fail(`Couldn't load a live price for ${ticker.symbol}. Try again.`, 'quote_unavailable')
  }

  // 2. One headline for context. Optional: the round works without it.
  const from = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const newsRes = await ctx.tools.integration('newsapi/search-everything', {
    q: `"${ticker.company}"`,
    from,
    language: 'en',
    sortBy: 'publishedAt',
    pageSize: 5,
  })
  const headline = newsRes.success ? pickHeadline(newsRes.data) : ''

  // 3. The question. Fall back to a template so a model hiccup can't block play.
  const qRes = await ctx.tools.integration('openai/chat-completion', {
    model: MODEL,
    messages: questionPrompt(ticker, quote, headline),
    max_tokens: 120,
    temperature: 0.8,
  })
  const question = (qRes.success && completionText(qRes.data)) || fallbackQuestion(ticker, quote)

  const roundNumber = (room.roundNumber ?? 0) + 1
  const created = await ctx.tools.create('rounds', {
    roomId,
    roundNumber,
    ticker: ticker.symbol,
    company: ticker.company,
    price: quote.price,
    changePct: quote.changePct,
    headline,
    question: question.slice(0, 600),
    status: 'open',
    resultsJson: '',
  })
  if (!created.success) return fail(created.error)

  const updated = await ctx.tools.update<Room>('rooms', roomId, {
    status: 'open',
    roundNumber,
    currentRoundId: created.data.recordId,
  })
  if (!updated.success) return fail(updated.error)
  return { success: true, data: { roundId: created.data.recordId } }
}

const submitAnswer: ActionHandler<Env> = async (ctx) => {
  const roundId = str(ctx.params.roundId)
  const text = str(ctx.params.text, 600)
  if (!roundId || !text) return fail('Write an answer first.')

  const roundRes = await ctx.tools.get<Round>('rounds', roundId)
  if (!roundRes.success) return fail('Round not found.', 'round_not_found')
  const round = roundRes.data.record.data
  if (round.status !== 'open') return fail('This round is closed.', 'round_closed')

  const playerRes = await ctx.tools.query<Player>('players', {
    where: { roomId: round.roomId, userId: ctx.userId },
    limit: 1,
  })
  const player = playerRes.success ? playerRes.data.records[0] : undefined
  if (!player) return fail('Join the room first.', 'not_a_player')
  if (player.data.answeredRound >= round.roundNumber) return fail('You already answered.', 'already_answered')

  // userId is stamped from the caller by the record room (userBound), and
  // uniqueOn [roundId, userId] blocks a double submit that races this check.
  const created = await ctx.tools.create('answers', { roundId, roomId: round.roomId, text })
  if (!created.success) return fail(created.error)
  await ctx.tools.update<Player>('players', player.recordId, { answeredRound: round.roundNumber })
  return { success: true, data: { answerId: created.data.recordId } }
}

const scoreRound: ActionHandler<Env> = async (ctx) => {
  const roomId = str(ctx.params.roomId)
  if (!roomId) return fail('roomId is required.')
  const loaded = await loadHostedRoom(ctx, roomId)
  if (!loaded.ok) return loaded.error
  const { room } = loaded
  if (room.status !== 'open' || !room.currentRoundId) return fail('No open round to score.', 'no_open_round')

  const roundRes = await ctx.tools.get<Round>('rounds', room.currentRoundId)
  if (!roundRes.success) return fail('Round not found.', 'round_not_found')
  const round = roundRes.data.record.data

  // Close the round before the slow model call so a second click (or a late
  // answer) can't double-score it.
  await ctx.tools.update<Round>('rounds', room.currentRoundId, { status: 'scoring' })
  await ctx.tools.update<Room>('rooms', roomId, { status: 'scoring' })

  const [answersRes, playersRes] = await Promise.all([
    ctx.tools.query<Answer>('answers', { where: { roundId: room.currentRoundId }, limit: 100 }),
    ctx.tools.query<Player>('players', { where: { roomId }, limit: 100 }),
  ])
  const answers = answersRes.success ? answersRes.data.records : []
  const players = playersRes.success ? playersRes.data.records : []
  const byUser = new Map(players.map((p) => [p.data.userId, p]))

  let scores = answers.map(() => ({ score: 1, feedback: 'Could not be graded.' }))
  if (answers.length > 0) {
    const gradeRes = await ctx.tools.integration('openai/chat-completion', {
      model: MODEL,
      messages: scoringPrompt(round.question, answers.map((a) => ({ id: a.recordId, text: a.data.text }))),
      max_tokens: 80 + answers.length * 60,
      temperature: 0,
    })
    if (gradeRes.success) scores = parseScores(completionText(gradeRes.data), answers.length)
    else console.warn(`[scoreRound] grading failed: ${gradeRes.error}`)
  }

  const results: RoundResult[] = []
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i]
    const s = scores[i]
    const p = byUser.get(a.data.userId)
    await ctx.tools.update('answers', a.recordId, { score: s.score, feedback: s.feedback })
    if (p) {
      p.data.score = (p.data.score ?? 0) + s.score
      await ctx.tools.update<Player>('players', p.recordId, { score: p.data.score })
    }
    results.push({ name: p?.data.name ?? 'Player', answer: a.data.text, score: s.score, feedback: s.feedback })
  }
  results.sort((x, y) => y.score - x.score)

  await ctx.tools.update<Round>('rounds', room.currentRoundId, {
    status: 'scored',
    resultsJson: JSON.stringify(results),
  })
  await ctx.tools.update<Room>('rooms', roomId, { status: 'results' })
  return { success: true, data: { scored: answers.length } }
}

export const gameActions: Record<string, ActionHandler<Env>> = {
  startRound,
  submitAnswer,
  scoreRound,
}
