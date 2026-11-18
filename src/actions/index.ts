import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { gameActions } from './game'

export const actions: Record<string, ActionHandler<Env>> = {
  ...gameActions,
}
