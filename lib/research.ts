import { tavily } from '@tavily/core'

const tv = tavily({ apiKey: process.env.TAVILY_API_KEY })

export type PlayerResearch = {
  player: string
  stats: string
  injuryStatus: string
}

export async function researchPlayer(
  player: string,
  opponent: string,
): Promise<PlayerResearch> {
  const [statsResult, injuryResult] = await Promise.all([
    tv.search(`${player} stats recent games 2025`, {
      searchDepth: 'basic',
      maxResults: 3,
      includeAnswer: true,
    }),
    tv.search(`${player} injury report active roster status 2026`, {
      searchDepth: 'basic',
      maxResults: 2,
      includeAnswer: true,
    }),
  ])

  const stats =
    statsResult.answer ||
    statsResult.results
      .map((r) => r.content)
      .join(' ')
      .slice(0, 600)

  const injuryStatus =
    injuryResult.answer ||
    injuryResult.results
      .map((r) => r.content)
      .join(' ')
      .slice(0, 300)

  return { player, stats, injuryStatus }
}

export async function researchPlayers(
  players: Array<{ player: string; opponent: string }>,
): Promise<PlayerResearch[]> {
  return Promise.all(
    players.map(({ player, opponent }) => researchPlayer(player, opponent)),
  )
}
