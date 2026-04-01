import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { fetchPlayerProps, SPORT_KEYS, type PropLine } from '@/lib/odds'
import { researchPlayers } from '@/lib/research'

export const maxDuration = 60

const PLAYERS_PER_GAME = 4

function selectPlayersAcrossGames(allProps: PropLine[]): PropLine[] {
  // Group props by game
  const byGame = new Map<string, PropLine[]>()
  for (const prop of allProps) {
    const gameKey = `${prop.awayTeam} @ ${prop.homeTeam}`
    if (!byGame.has(gameKey)) byGame.set(gameKey, [])
    byGame.get(gameKey)!.push(prop)
  }

  // Pick up to PLAYERS_PER_GAME unique players per game
  const selectedPlayers = new Set<string>()
  for (const gameProps of byGame.values()) {
    const uniqueInGame = [...new Map(gameProps.map((p) => [p.player, p])).values()]
    for (const p of uniqueInGame.slice(0, PLAYERS_PER_GAME)) {
      selectedPlayers.add(p.player)
    }
  }

  return allProps.filter((p) => selectedPlayers.has(p.player))
}

export async function POST(req: Request) {
  const { sport } = await req.json()

  if (!SPORT_KEYS[sport]) {
    return Response.json({ error: 'Invalid sport' }, { status: 400 })
  }

  // 1. Fetch live player props from The Odds API
  let allProps
  try {
    allProps = await fetchPlayerProps(sport)
  } catch (err) {
    return Response.json(
      { error: `Failed to fetch odds: ${(err as Error).message}` },
      { status: 502 },
    )
  }

  if (allProps.length === 0) {
    return Response.json(
      { error: 'No player props available right now. Check back closer to game time.' },
      { status: 404 },
    )
  }

  // 2. Select players spread across games
  const selectedProps = selectPlayersAcrossGames(allProps)
  const uniquePlayers = [...new Map(selectedProps.map((p) => [p.player, p])).values()]

  // 3. Research each player in parallel with Tavily
  let research
  try {
    research = await researchPlayers(
      uniquePlayers.map((p) => ({
        player: p.player,
        opponent: p.awayTeam,
      })),
    )
  } catch {
    research = uniquePlayers.map((p) => ({
      player: p.player,
      stats: 'Research unavailable',
      injuryStatus: 'No data',
    }))
  }

  // 4. Build prompt context — include game label so AI can echo it back
  const propsContext = selectedProps
    .map(
      (p) =>
        `${p.player} | ${p.propType} | Line: ${p.line} | Over ${p.overOdds ?? 'N/A'} / Under ${p.underOdds ?? 'N/A'} | Game: ${p.awayTeam} @ ${p.homeTeam}`,
    )
    .join('\n')

  const researchContext = research
    .map(
      (r) =>
        `=== ${r.player} ===\nRecent Stats: ${r.stats}\nInjury/Status: ${r.injuryStatus}`,
    )
    .join('\n\n')

  // 5. Stream structured NDJSON analysis from GPT-4o
  const result = streamText({
    model: openai('gpt-4o'),
    system: `You are a sports analytics expert. Analyze player props and output ONLY valid NDJSON — one JSON object per line, no markdown, no extra text, no code fences. Each line must be a complete, parseable JSON object. Output one object per prop analyzed.`,
    prompt: `Analyze these ${sport} player props. For each prop, output one JSON object on its own line with exactly these fields:

{
  "player": string,
  "propType": string,
  "line": number,
  "game": string (copy the "Game:" value from the props context verbatim, e.g. "Yankees @ Red Sox"),
  "recommendation": "OVER" | "UNDER" | "AVOID",
  "confidence": "high" | "medium" | "low",
  "reasoning": string (2-3 sentences max),
  "injuryFlag": string | null,
  "keyStats": string[] (2-3 bullet points)
}

PROPS TO ANALYZE:
${propsContext}

PLAYER RESEARCH:
${researchContext}

Rules:
- confidence "high" = strong statistical or situational edge
- confidence "medium" = slight lean, some uncertainty
- confidence "low" / recommendation "AVOID" = conflicting signals or too risky
- injuryFlag: ONLY set this if the player is currently listed as Questionable, Doubtful, Out, or on the IL/IR. If they are active and healthy, set null. Do NOT flag past injuries or general soreness mentions.
- game: must be copied verbatim from the props context "Game:" field
- Keep reasoning concise and factual
- Output ONLY the JSON lines, nothing else`,
  })

  return result.toTextStreamResponse()
}
