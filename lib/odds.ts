export const SPORT_KEYS: Record<string, string> = {
  NFL: 'americanfootball_nfl',
  MLB: 'baseball_mlb',
}

const SPORT_MARKETS: Record<string, string> = {
  NFL: 'player_pass_yds,player_rush_yds,player_reception_yds,player_pass_tds,player_rush_attempts',
  MLB: 'pitcher_strikeouts,batter_hits,batter_home_runs,batter_rbis,pitcher_outs',
}

export type PropLine = {
  player: string
  propType: string
  line: number
  overOdds: number | null
  underOdds: number | null
  homeTeam: string
  awayTeam: string
  gameDate: string
}

function formatMarketKey(key: string): string {
  return key
    .replace(/^(player_|pitcher_|batter_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export async function fetchPlayerProps(sport: string): Promise<PropLine[]> {
  const sportKey = SPORT_KEYS[sport]
  const markets = SPORT_MARKETS[sport]
  const apiKey = process.env.ODDS_API_KEY

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american`
  const res = await fetch(url, { next: { revalidate: 300 } })

  if (!res.ok) {
    throw new Error(`Odds API error: ${res.status} ${await res.text()}`)
  }

  const events: OddsEvent[] = await res.json()
  const propMap = new Map<string, PropLine>()

  for (const event of events) {
    const homeTeam = event.home_team
    const awayTeam = event.away_team
    const gameDate = event.commence_time

    for (const bookmaker of event.bookmakers) {
      for (const market of bookmaker.markets) {
        const propType = formatMarketKey(market.key)

        for (const outcome of market.outcomes) {
          const player = outcome.description
          if (!player || outcome.point == null) continue

          const mapKey = `${player}::${propType}`
          const existing = propMap.get(mapKey)

          if (!existing) {
            propMap.set(mapKey, {
              player,
              propType,
              line: outcome.point,
              overOdds: outcome.name === 'Over' ? outcome.price : null,
              underOdds: outcome.name === 'Under' ? outcome.price : null,
              homeTeam,
              awayTeam,
              gameDate,
            })
          } else {
            if (outcome.name === 'Over') existing.overOdds = outcome.price
            if (outcome.name === 'Under') existing.underOdds = outcome.price
          }
        }
      }
    }
  }

  return Array.from(propMap.values())
}

// Odds API response types
type OddsEvent = {
  id: string
  home_team: string
  away_team: string
  commence_time: string
  bookmakers: Bookmaker[]
}

type Bookmaker = {
  key: string
  markets: Market[]
}

type Market = {
  key: string
  outcomes: Outcome[]
}

type Outcome = {
  name: string
  description?: string
  price: number
  point?: number
}
