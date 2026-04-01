export const SPORT_KEYS: Record<string, string> = {
  NFL: 'americanfootball_nfl',
  MLB: 'baseball_mlb',
}

const SPORT_MARKETS: Record<string, string> = {
  NFL: 'player_pass_yds,player_rush_yds,player_reception_yds,player_pass_tds,player_rush_attempts',
  MLB: 'pitcher_strikeouts,batter_hits,batter_home_runs,batter_rbis,batter_total_bases',
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

function parseEvents(events: OddsEvent[]): PropLine[] {
  const propMap = new Map<string, PropLine>()

  for (const event of events) {
    for (const bookmaker of event.bookmakers ?? []) {
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
              homeTeam: event.home_team,
              awayTeam: event.away_team,
              gameDate: event.commence_time,
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

// Try up to this many events; stop once we have props
const MAX_EVENTS_TO_TRY = 10

export async function fetchPlayerProps(sport: string): Promise<PropLine[]> {
  const sportKey = SPORT_KEYS[sport]
  const markets = SPORT_MARKETS[sport]
  const apiKey = process.env.ODDS_API_KEY

  // Step 1: fetch the list of upcoming events
  const eventsRes = await fetch(
    `https://api.the-odds-api.com/v4/sports/${sportKey}/events?apiKey=${apiKey}`,
    { next: { revalidate: 300 } },
  )
  if (!eventsRes.ok) {
    throw new Error(`Odds API error: ${eventsRes.status} ${await eventsRes.text()}`)
  }
  const eventList: Array<{
    id: string
    home_team: string
    away_team: string
    commence_time: string
  }> = await eventsRes.json()

  if (eventList.length === 0) return []

  // Step 2: fetch props for events in parallel, up to MAX_EVENTS_TO_TRY
  const batch = eventList.slice(0, MAX_EVENTS_TO_TRY)

  const results = await Promise.allSettled(
    batch.map(async (ev) => {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american`,
        { next: { revalidate: 300 } },
      )
      if (!res.ok) return [] as PropLine[]
      const data: OddsEvent = await res.json()
      return parseEvents([data])
    }),
  )

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
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
