import { openai } from '@ai-sdk/openai'
import { streamText } from 'ai'
import { fetchPlayerProps, SPORT_KEYS } from '@/lib/odds'
import { researchPlayers } from '@/lib/research'

export const maxDuration = 60

const MAX_PLAYERS = 5

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

  // 2. Select top players (deduplicated) and their props
  const uniquePlayers = [
    ...new Map(allProps.map((p) => [p.player, p])).values(),
  ].slice(0, MAX_PLAYERS)

  const selectedProps = allProps.filter((p) =>
    uniquePlayers.some((u) => u.player === p.player),
  )

  // 3. Research each player in parallel with Tavily
  let research
  try {
    research = await researchPlayers(
      uniquePlayers.map((p) => ({
        player: p.player,
        opponent: p.homeTeam === p.awayTeam ? p.awayTeam : p.awayTeam,
      })),
    )
  } catch {
    // Research is best-effort — don't fail the whole request
    research = uniquePlayers.map((p) => ({
      player: p.player,
      stats: 'Research unavailable',
      injuryStatus: 'No data',
    }))
  }

  // 4. Build prompt context
  const propsContext = selectedProps
    .map(
      (p) =>
        `${p.player} | ${p.propType} ${p.line} | Over ${p.overOdds ?? 'N/A'} / Under ${p.underOdds ?? 'N/A'} | ${p.homeTeam} vs ${p.awayTeam}`,
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
- injuryFlag: note any injury concern, or null if healthy
- Keep reasoning concise and factual
- Output ONLY the JSON lines, nothing else`,
  })

  return result.toTextStreamResponse()
}
