export interface RoomRow {
  code: string
  hostId: string
  status: 'lobby' | 'open' | 'scoring' | 'results'
  roundNumber: number
  currentRoundId: string
}
export interface PlayerRow {
  roomId: string
  userId: string
  name: string
  score: number
  answeredRound: number
}
export interface RoundRow {
  roomId: string
  roundNumber: number
  ticker: string
  company: string
  price: number
  changePct: number
  headline: string
  question: string
  status: 'open' | 'scoring' | 'scored'
  resultsJson: string
}
export interface AnswerRow {
  roundId: string
  roomId: string
  userId: string
  text: string
  score: number
  feedback: string
}
