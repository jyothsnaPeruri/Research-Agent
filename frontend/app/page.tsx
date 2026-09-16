"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

interface Source {
  title: string;
  url: string;
}

type Phase = "idle" | "searching" | "reading" | "writing";
type ServerState = "unknown" | "waking" | "ready" | "down";

const EXAMPLES = [
  "What changed in React 19 and why does it matter?",
  "How do vector databases work?",
  "Latest developments in battery recycling",
  "Explain retrieval-augmented generation simply",
];

const HISTORY_KEY = "research-agent:history";
const STEPS: { key: Phase; label: string }[] = [
  { key: "searching", label: "Search" },
  { key: "reading", label: "Read" },
  { key: "writing", label: "Write" },
];

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The model appends its own "Sources" list; we render sources separately, so drop it. */
function stripTrailingSources(text: string) {
  const m = text.match(/\n\s*(?:\*\*)?(?:sources|references)(?:\*\*)?\s*:?\s*\n[\s\S]*$/i);
  return m && m.index !== undefined ? text.slice(0, m.index).trimEnd() : text.trim();
}

function Cite({ n, sources }: { n: number; sources: Source[] }) {
  const src = sources[n - 1];
  if (!src) return <span className="cite">{n}</span>;
  return (
    <a className="cite" href={src.url} target="_blank" rel="noopener noreferrer" title={src.title}>
      {n}
    </a>
  );
}

function Inline({ text, sources }: { text: string; sources: Source[] }): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+(?:\s*,\s*\d+)*\])/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    const cite = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (cite) {
      return cite[1].split(/\s*,\s*/).map((n) => <Cite key={`${i}-${n}`} n={Number(n)} sources={sources} />);
    }
    return part;
  });
}

function Answer({ text, sources }: { text: string; sources: Source[] }) {
  const lines = stripTrailingSources(text).split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={blocks.length}><Inline text={para.join(" ")} sources={sources} /></p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const Tag = list.ordered ? "ol" : "ul";
      blocks.push(
        <Tag key={blocks.length}>
          {list.items.map((item, i) => <li key={i}><Inline text={item} sources={sources} /></li>)}
        </Tag>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) { flushPara(); flushList(); blocks.push(<h3 key={blocks.length}>{heading[1]}</h3>); continue; }
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      flushPara();
      const ordered = /^\d/.test(line);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(bullet[1]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return <div className="answer text-[15px] leading-relaxed">{blocks}</div>;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [server, setServer] = useState<ServerState>("unknown");
  const [lastQuestion, setLastQuestion] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const loading = phase !== "idle";

  // Warm the free-tier backend as soon as the page opens.
  useEffect(() => {
    setServer("waking");
    fetch("/api/wake")
      .then((r) => setServer(r.ok ? "ready" : "down"))
      .catch(() => setServer("down"));
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      if (Array.isArray(saved)) setHistory(saved.slice(0, 6));
    } catch { /* ignore */ }
  }, []);

  // "/" focuses the search box, like GitHub.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const remember = (q: string) => {
    setHistory((prev) => {
      const next = [q, ...prev.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleSearch = useCallback(async (q?: string) => {
    const question = (q ?? query).trim();
    if (!question || loading) return;
    setQuery(question);
    setLastQuestion(question);
    setAnswer("");
    setSources([]);
    setError("");
    setCopied(false);
    setSlow(false);
    setPhase("searching");
    clearTimers();
    timers.current.push(window.setTimeout(() => setPhase("reading"), 2500));
    timers.current.push(window.setTimeout(() => setPhase("writing"), 6000));
    timers.current.push(window.setTimeout(() => setSlow(true), 9000));

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setError(data.error || "Something went wrong. Please try again.");
      } else {
        setAnswer(String(data.answer || ""));
        setSources(Array.isArray(data.sources) ? data.sources : []);
        setServer("ready");
        remember(question);
      }
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      clearTimers();
      setPhase("idle");
      setSlow(false);
    }
  }, [query, loading]);

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(stripTrailingSources(answer));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const activeStep = STEPS.findIndex((s) => s.key === phase);

  return (
    <main className="flex-1 px-4 pb-16 pt-10 sm:pt-16">
      <div className="mx-auto w-full max-w-2xl">

        {/* Header */}
        <header className="mb-8 text-center rise">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                server === "ready" ? "bg-success" : server === "down" ? "bg-danger" : "bg-accent pulse"
              }`}
            />
            {server === "ready" ? "Agent online" : server === "down" ? "Agent unreachable" : "Waking the agent…"}
            <span className="text-border">·</span>
            Groq · Tavily · FastAPI
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Ask anything.
            <br />
            <span className="text-accent">Get a cited answer.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[15px] text-muted">
            The agent searches the live web, reads the top sources and writes an answer with
            numbered citations you can click.
          </p>
        </header>

        {/* Search */}
        <section className="card rise p-3 sm:p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            className="flex flex-col gap-2 sm:flex-row"
          >
            <label className="relative flex-1">
              <span className="sr-only">Your question</span>
              <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                ref={inputRef}
                className="focus-ring w-full rounded-2xl border border-border bg-surface-2 py-3.5 pl-11 pr-12 text-[15px] text-text placeholder:text-muted"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="What do you want to research?"
                autoComplete="off"
                maxLength={400}
                disabled={loading}
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-muted sm:block">
                /
              </kbd>
            </label>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="focus-ring inline-flex items-center justify-center gap-2 rounded-2xl bg-accent px-5 py-3.5 text-sm font-medium text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
                </svg>
              )}
              {loading ? "Researching" : "Research"}
            </button>
          </form>

          {!answer && !loading && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(history.length ? history : EXAMPLES).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleSearch(q)}
                  className="focus-ring max-w-full truncate rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent-text"
                  title={q}
                >
                  {history.length ? "↺ " : ""}{q}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Progress */}
        {loading && (
          <section className="card rise mt-4 p-4" aria-live="polite">
            <div className="flex items-center gap-3">
              <div className="flex flex-1 items-center gap-2">
                {STEPS.map((s, i) => {
                  const state = i < activeStep ? "done" : i === activeStep ? "active" : "todo";
                  return (
                    <div key={s.key} className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium transition ${
                          state === "todo" ? "bg-surface-2 text-muted" : "bg-accent text-white"
                        }`}
                      >
                        {state === "done" ? "✓" : state === "active" ? <span className="h-1.5 w-1.5 rounded-full bg-white pulse" /> : null}
                        {s.label}
                      </span>
                      {i < STEPS.length - 1 && <span className="h-px w-4 bg-border" />}
                    </div>
                  );
                })}
              </div>
              <span className="text-xs text-muted">
                {phase === "searching" ? "Searching the web…" : phase === "reading" ? "Reading top sources…" : "Writing your answer…"}
              </span>
            </div>
            {slow && (
              <p className="mt-3 text-xs text-muted">
                Taking longer than usual — the backend runs on a free tier and may be waking up. Hang on, this usually finishes within a minute.
              </p>
            )}
            <div className="mt-4 space-y-2">
              <div className="skeleton h-3.5 w-11/12" />
              <div className="skeleton h-3.5 w-full" />
              <div className="skeleton h-3.5 w-4/5" />
            </div>
          </section>
        )}

        {/* Error */}
        {error && (
          <section className="rise mt-4 flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4">
            <svg className="mt-0.5 shrink-0 text-danger" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-text">{error}</p>
              <button
                type="button"
                onClick={() => handleSearch(lastQuestion || query)}
                className="mt-2 text-xs font-medium text-accent-text underline-offset-2 hover:underline"
              >
                Try again
              </button>
            </div>
          </section>
        )}

        {/* Answer */}
        {answer && (
          <section className="card rise mt-4 p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-accent-text">Answer</div>
                <h2 className="mt-0.5 text-base font-medium text-text">{lastQuestion}</h2>
              </div>
              <button
                type="button"
                onClick={copyAnswer}
                className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent-text"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <Answer text={answer} sources={sources} />
          </section>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <section className="card rise mt-4 p-5 sm:p-6">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-accent-text">
              Sources · {sources.length}
            </div>
            <ol className="grid gap-2 sm:grid-cols-2">
              {sources.map((s, i) => (
                <li key={s.url + i}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="focus-ring group flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 transition hover:border-accent"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent-text">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium text-text group-hover:text-accent-text">{s.title || hostOf(s.url)}</span>
                      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://www.google.com/s2/favicons?sz=32&domain=${hostOf(s.url)}`}
                          alt=""
                          width={14}
                          height={14}
                          className="rounded-sm"
                          loading="lazy"
                        />
                        <span className="truncate">{hostOf(s.url)}</span>
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-10 text-center text-xs text-muted">
          Built by{" "}
          <a href="https://jyothsnaperuri.github.io/Jyothsna-portfolio/" className="text-accent-text hover:underline" target="_blank" rel="noopener noreferrer">
            Jyothsna (Jo) Peruri
          </a>{" "}
          · FastAPI · Groq (Llama 3.3 70B) · Tavily · Next.js ·{" "}
          <a href="https://github.com/jyothsnaPeruri/Research-Agent" className="text-accent-text hover:underline" target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </footer>
      </div>
    </main>
  );
}
