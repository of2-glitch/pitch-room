/**
 * Lobby: create a room (you become host) or join one with a 4-letter code.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useMutations } from 'deepspace'
import { Button, Input, useToast } from '@/components/ui'
import { makeRoomCode, normalizeRoomCode } from '../../game/logic'

export default function HomePage() {
  const { isSignedIn, user } = useAuthProfileReady({ requireUser: true })
  const navigate = useNavigate()
  const { error } = useToast()
  const rooms = useMutations<{ code: string }>('rooms')
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [showAuth, setShowAuth] = useState(false)

  async function createRoom() {
    setCreating(true)
    try {
      // Codes are unique (uniqueOn: ['code']); retry once on the rare clash.
      for (let attempt = 0; attempt < 2; attempt++) {
        const code = makeRoomCode()
        try {
          await rooms.createConfirmed({ code })
          navigate(`/room/${code}`)
          return
        } catch (e) {
          if (attempt === 1) throw e
        }
      }
    } catch (e) {
      error('Could not create a room', e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  function join(e: FormEvent) {
    e.preventDefault()
    const code = normalizeRoomCode(joinCode)
    if (code.length >= 4) navigate(`/room/${code}`)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Live market · AI graded</p>
        <h1 className="text-4xl font-bold tracking-tight">Pitch Room</h1>
        <p className="text-muted-foreground">
          Practice stock pitches with friends. Each round pulls a real stock&apos;s live move and a recent
          headline, everyone pitches it, and an AI grader scores every answer on the same rubric.
        </p>
      </header>

      {!isSignedIn ? (
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-4 text-sm text-muted-foreground">Sign in to host or join a room.</p>
          <Button onClick={() => setShowAuth(true)}>Sign in</Button>
          {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-1 font-semibold">Host a room</h2>
            <p className="mb-4 text-sm text-muted-foreground">You run the rounds and trigger grading.</p>
            <Button
              data-testid="create-room"
              onClick={createRoom}
              loading={creating}
              disabled={!rooms.ready || creating}
              className="w-full"
            >
              Create room
            </Button>
          </div>
          <form onSubmit={join} className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-1 font-semibold">Join a room</h2>
            <p className="mb-4 text-sm text-muted-foreground">Enter the code on the host&apos;s screen.</p>
            <div className="flex gap-2">
              <Input
                data-testid="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABCD"
                maxLength={8}
                className="font-mono uppercase tracking-widest"
              />
              <Button type="submit" variant="secondary" disabled={normalizeRoomCode(joinCode).length < 4}>
                Join
              </Button>
            </div>
          </form>
          {user && (
            <p className="text-xs text-muted-foreground sm:col-span-2">Signed in as {user.name || user.email}</p>
          )}
        </div>
      )}
    </div>
  )
}
