/**
 * Pitch Room schemas.
 *
 * Trust model in one paragraph: clients may only create a room (as its host)
 * and join a room (a `players` row bound to their own user id). Everything
 * that decides the game (the round's question, who answered, the scores) is
 * written by server actions in src/actions/game.ts, which check the caller
 * themselves. So members get `create: false` on `rounds` and `answers`, and
 * `writableFields` stops a player from editing their own score.
 */

import type { CollectionSchema } from 'deepspace/schema'

/** One game room. The host is the row's owner (`hostId`, stamped server-side). */
export const roomsSchema: CollectionSchema = {
  name: 'rooms',
  columns: [
    { name: 'code', storage: 'text', interpretation: 'plain', required: true, immutable: true, maxLength: 8 },
    { name: 'hostId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true, required: true },
    // lobby | open | scoring | results
    { name: 'status', storage: 'text', interpretation: 'plain', default: 'lobby' },
    { name: 'roundNumber', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'currentRoundId', storage: 'text', interpretation: 'plain', default: '' },
  ],
  uniqueOn: ['code'],
  ownerField: 'hostId',
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    // Clients may only create a room. Status/round fields move only through
    // server actions, so no client update rights at all.
    member: { read: true, create: true, update: false, delete: 'own', writableFields: ['code'] },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/** A player in a room. One row per (room, user). */
export const playersSchema: CollectionSchema = {
  name: 'players',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true, required: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 40 },
    { name: 'score', storage: 'number', interpretation: 'plain', default: 0 },
    /** Round number this player last answered. Written by the server. */
    { name: 'answeredRound', storage: 'number', interpretation: 'plain', default: 0 },
  ],
  uniqueOn: ['roomId', 'userId'],
  ownerField: 'userId',
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: 'own', delete: 'own', writableFields: ['roomId', 'name'] },
    admin: { read: true, create: true, update: true, delete: true },
  },
}

/** One round: the market data and the question. Server-written only. */
export const roundsSchema: CollectionSchema = {
  name: 'rounds',
  columns: [
    { name: 'roomId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'roundNumber', storage: 'number', interpretation: 'plain', required: true },
    { name: 'ticker', storage: 'text', interpretation: 'plain', required: true },
    { name: 'company', storage: 'text', interpretation: 'plain' },
    { name: 'price', storage: 'number', interpretation: 'plain' },
    { name: 'changePct', storage: 'number', interpretation: 'plain' },
    { name: 'headline', storage: 'text', interpretation: 'plain', default: '' },
    { name: 'question', storage: 'text', interpretation: 'plain', required: true },
    // open | scoring | scored
    { name: 'status', storage: 'text', interpretation: 'plain', default: 'open' },
    /** JSON array of {name, answer, score, feedback}, revealed after scoring. */
    { name: 'resultsJson', storage: 'text', interpretation: 'plain', default: '' },
  ],
  permissions: {
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}

/**
 * A player's answer. Read is 'own' so nobody can copy someone else's pitch
 * while the round is open; everyone sees all answers once the server reveals
 * them in `rounds.resultsJson`.
 */
export const answersSchema: CollectionSchema = {
  name: 'answers',
  columns: [
    { name: 'roundId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'roomId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true, required: true },
    { name: 'text', storage: 'text', interpretation: 'plain', required: true, maxLength: 600 },
    { name: 'score', storage: 'number', interpretation: 'plain', default: 0 },
    { name: 'feedback', storage: 'text', interpretation: 'plain', default: '' },
  ],
  uniqueOn: ['roundId', 'userId'],
  ownerField: 'userId',
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
