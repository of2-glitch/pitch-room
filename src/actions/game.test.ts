/**
 * Server-action tests against an in-memory stand-in for ActionTools, with the
 * three integrations stubbed. Covers the authorization checks (host only, one
 * answer per player, closed rounds) and the scoring math.
 */
import { describe, expect, it } from 'vitest'
import type { ActionTools } from 'deepspace/worker'
import { gameActions } from './game'

let idCounter = 0

type Row = { recordId: string; data: Record<string, unknown>; createdBy: string; createdAt: string; updatedAt: string }

function fakeTools(userId: string, db: Map<string, Map<string, Row>>, calls: string[], gradeJson: string) {

  const coll = (c: string) => db.get(c) ?? db.set(c, new Map()).get(c)!
  const userBound: Record<string, string> = { rooms: 'hostId', players: 'userId', answers: 'userId' }
  const tools = {
    create: async (c: string, data: Record<string, unknown>) => {
      const id = `${c}_${++idCounter}`
      const d = { ...data }
      if (userBound[c]) d[userBound[c]] = userId
      coll(c).set(id, { recordId: id, data: d, createdBy: userId, createdAt: '', updatedAt: '' })
      return { success: true, data: { recordId: id } }
    },
    update: async (c: string, id: string, data: Record<string, unknown>) => {
      const r = coll(c).get(id)
      if (!r) return { success: false, error: 'nf' }
      r.data = { ...r.data, ...data }
      return { success: true, data: { recordId: id } }
    },
    get: async (c: string, id: string) => {
      const r = coll(c).get(id)
      return r ? { success: true, data: { record: r } } : { success: false, error: 'nf' }
    },
    query: async (c: string, o?: { where?: Record<string, unknown> }) => {
      const recs = [...coll(c).values()].filter((r) =>
        Object.entries(o?.where ?? {}).every(([k, v]) => r.data[k] === v),
      )
      return { success: true, data: { records: recs, count: recs.length } }
    },
    integration: async (endpoint: string, body: { messages?: Array<{ content: string }> }) => {
      calls.push(endpoint)
      if (endpoint === 'finnhub/stock-price') return { success: true, data: { c: 100, dp: -2.5, pc: 102.56 } }
      if (endpoint === 'newsapi/search-everything') return { success: true, data: { headlines: ['Big news'], articles: [] } }
      const isGrading = body.messages?.[0]?.content.includes('grade')
      return { success: true, data: { choices: [{ message: { content: isGrading ? gradeJson : 'Pitch it?' } }] } }
    },
  }
  return tools as unknown as ActionTools
}

function setup() {
  const db = new Map<string, Map<string, Row>>()
  const calls: string[] = []
  const grade = '[{"index":0,"score":8,"feedback":"Solid"},{"index":1,"score":3,"feedback":"Vague"}]'
  const as = (userId: string) => (name: keyof typeof gameActions, params: Record<string, unknown>) =>
    gameActions[name]({ userId, params, tools: fakeTools(userId, db, calls, grade), env: {} as never, callerJwt: 'x' } as never)
  return { db, calls, host: as('host'), alice: as('alice') }
}

async function roomWithPlayers(s: ReturnType<typeof setup>) {
  const r = await fakeTools('host', s.db, [], '').create('rooms', { code: 'ABCD', status: 'lobby', roundNumber: 0, currentRoundId: '' })
  const roomId = (r as { data: { recordId: string } }).data.recordId
  await fakeTools('host', s.db, [], '').create('players', { roomId, name: 'Host', score: 0, answeredRound: 0 })
  await fakeTools('alice', s.db, [], '').create('players', { roomId, name: 'Alice', score: 0, answeredRound: 0 })
  return roomId
}

describe('game actions', () => {
  it('only the host can start a round, and it uses all three integrations', async () => {
    const s = setup()
    const roomId = await roomWithPlayers(s)
    expect((await s.alice('startRound', { roomId })).success).toBe(false)
    const res = await s.host('startRound', { roomId })
    expect(res.success).toBe(true)
    expect(s.calls).toEqual(['finnhub/stock-price', 'newsapi/search-everything', 'openai/chat-completion'])
    const room = s.db.get('rooms')!.get(roomId)!.data
    expect(room.status).toBe('open')
    expect((await s.host('startRound', { roomId })).success).toBe(false) // round already open
  })

  it('one answer per player, and only while the round is open', async () => {
    const s = setup()
    const roomId = await roomWithPlayers(s)
    const start = (await s.host('startRound', { roomId })) as { data: { roundId: string } }
    const roundId = start.data.roundId
    expect((await s.alice('submitAnswer', { roundId, text: 'Buy, margins expanding, risk is China.' })).success).toBe(true)
    expect((await s.alice('submitAnswer', { roundId, text: 'again again again' })).success).toBe(false)
    expect((await s.host('scoreRound', { roomId })).success).toBe(true)
    expect((await s.host('submitAnswer', { roundId, text: 'too late to answer this' })).success).toBe(false)
  })

  it('scoring adds to the leaderboard and reveals results', async () => {
    const s = setup()
    const roomId = await roomWithPlayers(s)
    const { data } = (await s.host('startRound', { roomId })) as { data: { roundId: string } }
    await s.alice('submitAnswer', { roundId: data.roundId, text: 'Buy: services growth offsets hardware.' })
    await s.host('submitAnswer', { roundId: data.roundId, text: 'Pass.' })
    expect((await s.alice('scoreRound', { roomId })).success).toBe(false) // not host
    expect((await s.host('scoreRound', { roomId })).success).toBe(true)
    const players = [...s.db.get('players')!.values()].map((p) => [p.data.name, p.data.score])
    expect(players).toEqual([['Host', 3], ['Alice', 8]])
    const round = s.db.get('rounds')!.get(data.roundId)!.data
    expect(round.status).toBe('scored')
    expect(JSON.parse(round.resultsJson as string)[0]).toMatchObject({ name: 'Alice', score: 8 })
    expect((await s.host('scoreRound', { roomId })).success).toBe(false) // no double scoring
  })
})
