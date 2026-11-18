/**
 * The live room. Everything on this screen is a live `useQuery` subscription,
 * so when the host starts or scores a round every phone updates at once.
 * Game-changing writes go through server actions (src/actions/game.ts).
 */

import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useAuthProfileReady, useMutations, useQuery } from 'deepspace'
import { Button, Input, Textarea, useToast } from '@/components/ui'
import { callAction } from '../../../../game/call-action'
import { normalizeRoomCode, parseResults } from '../../../../game/logic'
import type { AnswerRow, PlayerRow, RoomRow, RoundRow } from '../../../../game/types'

export default function RoomPage() {
  const code = normalizeRoomCode(useParams().code ?? '')
  const { userId } = useAuth()
  const roomQ = useQuery<RoomRow>('rooms', { where: { code }, limit: 1 })
  const room = roomQ.records[0]

  if (roomQ.status === 'loading') return <Centered>Loading room…</Centered>
  if (!room) {
    return (
      <Centered>
        <p className="mb-4">No room with code <span className="font-mono">{code}</span>.</p>
        <Link to="/home" className="text-primary underline">Back to lobby</Link>
      </Centered>
    )
  }
  return <Room roomId={room.recordId} room={room.data} userId={userId ?? ''} />
}

function Room({ roomId, room, userId }: { roomId: string; room: RoomRow; userId: string }) {
  const isHost = room.hostId === userId
  const playersQ = useQuery<PlayerRow>('players', { where: { roomId }, limit: 100 })
  const roundQ = useQuery<RoundRow>('rounds', { where: { roomId }, orderBy: 'roundNumber', orderDir: 'desc', limit: 1 })
  const players = useMemo(
    () => [...playersQ.records].sort((a, b) => b.data.score - a.data.score),
    [playersQ.records],
  )
  const me = players.find((p) => p.data.userId === userId)
  const round = roundQ.records[0]
  const isCurrent = round && round.recordId === room.currentRoundId

  if (playersQ.status === 'loading') return <Centered>Loading players…</Centered>
  if (!me) return <JoinForm roomId={roomId} code={room.code} />

  const answered = players.filter((p) => p.data.answeredRound >= room.roundNumber && room.roundNumber > 0).length

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_280px]">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Room code</p>
            <p data-testid="room-code" className="font-mono text-3xl font-bold tracking-[0.3em]">{room.code}</p>
          </div>
          {isHost && <HostControls roomId={roomId} room={room} answered={answered} total={players.length} />}
        </div>

        {room.status === 'lobby' && (
          <Panel>
            <p className="text-lg font-medium">Waiting for the host to start round 1.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Share the code. Each round pulls a live stock quote and asks everyone to pitch it.
            </p>
          </Panel>
        )}

        {round && isCurrent && room.status !== 'lobby' && (
          <RoundView round={round.data} roundId={round.recordId} me={me.data} room={room} answered={answered} total={players.length} />
        )}
      </section>

      <aside>
        <Panel>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">Leaderboard</h2>
          <ol data-testid="leaderboard" className="space-y-2">
            {players.map((p, i) => (
              <li key={p.recordId} className="flex items-center justify-between text-sm">
                <span className={p.data.userId === userId ? 'font-semibold' : ''}>
                  <span className="mr-2 font-mono text-muted-foreground">{i + 1}</span>
                  {p.data.name}
                  {p.data.userId === room.hostId && <span className="ml-2 text-xs text-primary">host</span>}
                </span>
                <span className="font-mono">{p.data.score}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </aside>
    </div>
  )
}

function HostControls({ roomId, room, answered, total }: { roomId: string; room: RoomRow; answered: number; total: number }) {
  const { error } = useToast()
  const [busy, setBusy] = useState(false)

  async function run(name: 'startRound' | 'scoreRound') {
    setBusy(true)
    try {
      await callAction(name, { roomId })
    } catch (e) {
      error(name === 'startRound' ? 'Could not start the round' : 'Could not score the round', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (room.status === 'open') {
    return (
      <Button data-testid="score-round" onClick={() => run('scoreRound')} loading={busy} disabled={busy || answered === 0}>
        Grade answers ({answered}/{total})
      </Button>
    )
  }
  if (room.status === 'scoring') return <Button disabled loading>Grading…</Button>
  return (
    <Button data-testid="start-round" onClick={() => run('startRound')} loading={busy} disabled={busy}>
      {room.roundNumber === 0 ? 'Start round 1' : `Start round ${room.roundNumber + 1}`}
    </Button>
  )
}

function RoundView({ round, roundId, me, room, answered, total }: {
  round: RoundRow; roundId: string; me: PlayerRow; room: RoomRow; answered: number; total: number
}) {
  const up = round.changePct >= 0
  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-3 flex flex-wrap items-baseline gap-3">
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Round {round.roundNumber}</span>
          <span className="font-mono text-xl font-bold">{round.ticker}</span>
          <span className="text-sm text-muted-foreground">{round.company}</span>
          <span className="font-mono">${round.price.toFixed(2)}</span>
          <span className={`font-mono ${up ? 'text-emerald-400' : 'text-red-400'}`}>
            {up ? '▲' : '▼'} {Math.abs(round.changePct).toFixed(2)}%
          </span>
        </div>
        {round.headline && <p className="mb-3 text-sm italic text-muted-foreground">News: {round.headline}</p>}
        <p data-testid="question" className="text-lg font-medium leading-snug">{round.question}</p>
      </Panel>

      {room.status === 'open' && (
        me.answeredRound >= round.roundNumber ? (
          <MyAnswer roundId={roundId} waiting={`${answered} of ${total} answered. Waiting for the host to grade.`} />
        ) : (
          <AnswerForm roundId={roundId} />
        )
      )}
      {room.status === 'scoring' && <Panel><p className="animate-pulse">The grader is reading everyone&apos;s pitch…</p></Panel>}
      {room.status === 'results' && <Results json={round.resultsJson} />}
    </div>
  )
}

function AnswerForm({ roundId }: { roundId: string }) {
  const { error } = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await callAction('submitAnswer', { roundId, text })
    } catch (err) {
      error('Could not submit', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        data-testid="answer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={600}
        rows={5}
        placeholder="Your call (buy / sell / pass), your thesis, and one risk."
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{text.length}/600</span>
        <Button data-testid="submit-answer" type="submit" loading={busy} disabled={busy || text.trim().length < 10}>
          Lock it in
        </Button>
      </div>
    </form>
  )
}

/** Your own answer (answers are read: 'own', so only yours comes back). */
function MyAnswer({ roundId, waiting }: { roundId: string; waiting: string }) {
  const mine = useQuery<AnswerRow>('answers', { where: { roundId }, limit: 1 }).records[0]
  return (
    <Panel>
      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Your pitch</p>
      <p className="whitespace-pre-wrap text-sm">{mine?.data.text ?? '…'}</p>
      <p className="mt-3 text-sm text-muted-foreground">{waiting}</p>
    </Panel>
  )
}

function Results({ json }: { json: string }) {
  const results = parseResults(json)
  if (results.length === 0) return <Panel><p>No answers this round.</p></Panel>
  return (
    <div data-testid="results" className="space-y-3">
      {results.map((r, i) => (
        <Panel key={i}>
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">{r.name}</span>
            <span className="font-mono text-lg font-bold text-primary">{r.score}/10</span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{r.answer}</p>
          {r.feedback && <p className="mt-2 text-sm text-muted-foreground">Grader: {r.feedback}</p>}
        </Panel>
      ))}
    </div>
  )
}

function JoinForm({ roomId, code }: { roomId: string; code: string }) {
  const { user } = useAuthProfileReady({ requireUser: true })
  const players = useMutations<{ roomId: string; name: string }>('players')
  const { error } = useToast()
  const [name, setName] = useState(user?.name?.split(' ')[0] ?? '')
  const [busy, setBusy] = useState(false)

  async function join(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await players.createConfirmed({ roomId, name: name.trim().slice(0, 40) })
    } catch (err) {
      error('Could not join', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Centered>
      <form onSubmit={join} className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-card p-6 text-left">
        <p className="text-sm text-muted-foreground">Joining room <span className="font-mono font-bold">{code}</span></p>
        <Input data-testid="player-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" maxLength={40} />
        <Button data-testid="join-room" type="submit" className="w-full" loading={busy} disabled={!players.ready || busy || !name.trim()}>
          Join
        </Button>
      </form>
    </Centered>
  )
}

function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-5">{children}</div>
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</div>
}
