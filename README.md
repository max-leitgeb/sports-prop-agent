# Sports Prop Analytics Agent

An AI-powered sports analytics tool that fetches live player prop lines, researches each player in real time, and streams structured analysis back as scannable cards — grouped by game and filterable by prop type, confidence, and recommendation.

## Demo

Select a sport, click **Analyze Props**, and watch picks stream in as the agent works.

![Sports Prop Analytics](public/next.svg)

## How It Works

```
User selects sport (NFL / MLB)
        ↓
Fetch live player prop lines from The Odds API
(per-event endpoint, up to 10 games in parallel)
        ↓
Run parallel Tavily searches per player:
  · Recent stats
  · Injury / roster status
        ↓
GPT-4o analyzes props + research context
streams back one JSON object per prop
        ↓
Cards render progressively as analysis streams in
```

## Tech Stack

- **[Next.js 16](https://nextjs.org)** — App Router, TypeScript
- **[Vercel AI SDK v6](https://sdk.vercel.ai)** — `streamText`, NDJSON streaming
- **[OpenAI GPT-4o](https://openai.com)** — prop analysis and reasoning
- **[The Odds API](https://the-odds-api.com)** — live player prop lines
- **[Tavily](https://tavily.com)** — real-time player research
- **[Tailwind CSS v4](https://tailwindcss.com)** — styling
- **[Vercel](https://vercel.com)** — deployment

## Features

- Live prop lines pulled fresh on each analysis
- Players selected across all available games (not just one matchup)
- Parallel web research per player at analysis time
- Picks stream in progressively — no waiting for the full response
- Filter bar: by game, prop type, confidence level, and recommendation
- Cards grouped by game with color-coded confidence (green / amber / red)
- Injury flags surfaced only for active designations (Q, D, Out, IL)
- Friendly off-season and no-lines-yet empty states

## Getting Started

### Prerequisites

You'll need API keys for:

- [OpenAI](https://platform.openai.com) — GPT-4o access
- [The Odds API](https://the-odds-api.com) — free tier (500 requests/month) covers player props
- [Tavily](https://tavily.com) — free tier (1,000 searches/month)

### Installation

```bash
git clone https://github.com/mjleitgeb/sports-prop-agent
cd sports-prop-agent
npm install
```

Create a `.env.local` file:

```bash
OPENAI_API_KEY=your_key_here
TAVILY_API_KEY=your_key_here
ODDS_API_KEY=your_key_here
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
app/
  api/analyze/route.ts   # POST handler — orchestrates fetch → research → stream
  page.tsx               # Sport selector, filter bar, streaming card UI
lib/
  odds.ts                # The Odds API client — fetches and parses prop lines
  research.ts            # Tavily client — parallel player research
```

## Key Implementation Notes

**Streaming format** — The API route uses `streamText().toTextStreamResponse()` and instructs GPT-4o to output one complete JSON object per line (NDJSON). The client reads the stream, splits on `\n`, and parses complete lines as cards arrive — no partial JSON parsing needed.

**Props API** — The Odds API serves player props one event at a time via `/events/{id}/odds`. The app fetches up to 10 events in parallel, then selects up to 4 players per game to keep the analysis focused and Tavily usage within free tier limits.

**Research** — Two Tavily searches run per player (recent stats + injury status). Research failures are non-fatal — the analysis proceeds with whatever context is available.
