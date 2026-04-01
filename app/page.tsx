'use client'

import { useState } from 'react'

type Recommendation = 'OVER' | 'UNDER' | 'AVOID'
type Confidence = 'high' | 'medium' | 'low'

type PropPick = {
  player: string
  propType: string
  line: number
  recommendation: Recommendation
  confidence: Confidence
  reasoning: string
  injuryFlag: string | null
  keyStats: string[]
}

type Sport = 'NFL' | 'MLB'

const CONFIDENCE_STYLES: Record<Confidence, string> = {
  high: 'border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  medium: 'border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30',
  low: 'border-l-4 border-rose-400 bg-rose-50 dark:bg-rose-950/30',
}

const CONFIDENCE_BADGE: Record<Confidence, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  low: 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
}

const REC_BADGE: Record<Recommendation, string> = {
  OVER: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  UNDER: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  AVOID: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

function PropCard({ pick }: { pick: PropPick }) {
  return (
    <div
      className={`rounded-xl p-5 shadow-sm ${CONFIDENCE_STYLES[pick.confidence]} transition-all`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {pick.player}
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {pick.propType} · Line: {pick.line}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase tracking-wide ${REC_BADGE[pick.recommendation]}`}
          >
            {pick.recommendation}
          </span>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full capitalize ${CONFIDENCE_BADGE[pick.confidence]}`}
          >
            {pick.confidence} confidence
          </span>
        </div>
      </div>

      {pick.injuryFlag && (
        <div className="mb-3 flex items-start gap-1.5 text-sm text-rose-700 dark:text-rose-400 bg-rose-100/60 dark:bg-rose-900/20 rounded-lg px-3 py-2">
          <span className="mt-0.5">⚠</span>
          <span>{pick.injuryFlag}</span>
        </div>
      )}

      <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3 leading-relaxed">
        {pick.reasoning}
      </p>

      {pick.keyStats && pick.keyStats.length > 0 && (
        <ul className="space-y-1">
          {pick.keyStats.map((stat, i) => (
            <li
              key={i}
              className="text-xs text-zinc-600 dark:text-zinc-400 flex items-start gap-1.5"
            >
              <span className="mt-0.5 text-zinc-400">·</span>
              {stat}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Home() {
  const [sport, setSport] = useState<Sport>('NFL')
  const [picks, setPicks] = useState<PropPick[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'streaming' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    setStatus('loading')
    setError(null)
    setPicks([])

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sport }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server error: ${res.status}`)
      }

      setStatus('streaming')

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const pick = JSON.parse(trimmed) as PropPick
            if (pick.player && pick.propType) {
              setPicks((prev) => [...prev, pick])
            }
          } catch {
            // incomplete JSON chunk — skip
          }
        }
      }

      // Flush remaining buffer
      const remaining = buffer.trim()
      if (remaining) {
        try {
          const pick = JSON.parse(remaining) as PropPick
          if (pick.player && pick.propType) {
            setPicks((prev) => [...prev, pick])
          }
        } catch {
          // ignore
        }
      }

      setStatus('done')
    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  const isRunning = status === 'loading' || status === 'streaming'

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tracking-tight">
            Sports Prop Analytics
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400 text-sm">
            AI-powered player prop analysis · live odds · real-time research
          </p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {(['NFL', 'MLB'] as Sport[]).map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                disabled={isRunning}
                className={`px-5 py-2.5 text-sm font-medium transition-colors ${
                  sport === s
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-white text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={analyze}
            disabled={isRunning}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning && (
              <span className="size-4 border-2 border-white/30 border-t-white dark:border-zinc-900/30 dark:border-t-zinc-900 rounded-full animate-spin" />
            )}
            {status === 'loading'
              ? 'Fetching odds…'
              : status === 'streaming'
              ? 'Analyzing…'
              : 'Analyze Props'}
          </button>
        </div>

        {/* Status messages */}
        {status === 'loading' && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Pulling live prop lines and researching players…
          </p>
        )}

        {status === 'error' && error && (
          <div className="mb-6 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
            {error}
          </div>
        )}

        {/* Results */}
        {picks.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                {sport} Props · {picks.length} analyzed
              </h2>
              <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-600">
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-emerald-500 inline-block" /> Strong
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-amber-400 inline-block" /> Moderate
                </span>
                <span className="flex items-center gap-1">
                  <span className="size-2 rounded-full bg-rose-400 inline-block" /> Avoid
                </span>
              </div>
            </div>

            {picks.map((pick, i) => (
              <PropCard key={`${pick.player}-${pick.propType}-${i}`} pick={pick} />
            ))}
          </div>
        )}

        {status === 'done' && picks.length === 0 && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No props returned. Try again in a moment.
          </p>
        )}
      </div>
    </div>
  )
}
