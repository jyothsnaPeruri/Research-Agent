"use client";
import { useState } from "react";

interface Source {
  title: string;
  url: string;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Searching the web...");
  const [error, setError] = useState("");

  const exampleQueries = [
    "What is machine learning?",
    "Latest AI trends 2025",
    "How does blockchain work?",
  ];

  async function handleSearch(q?: string) {
    const question = q || query;
    if (!question.trim()) return;
    setLoading(true);
    setAnswer("");
    setSources([]);
    setError("");
    setQuery(question);
    setStatus("Searching the web...");

    setTimeout(() => setStatus("Reading top sources..."), 1500);
    setTimeout(() => setStatus("Writing your answer..."), 3000);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: question }),
      });
      const data = await res.json();
      setAnswer(data.answer);
      setSources(data.sources);
    } catch (e) {
      setError("Something went wrong. Make sure your backend is running.");
    }
    setLoading(false);
  }

  const steps = ["Search", "Read", "Write"];
  const activeStep = status.includes("Search") ? 0 : status.includes("Read") ? 1 : 2;

  return (
    <main className="min-h-screen px-4 py-12" style={{ background: "#f0f4ff" }}>
      <div className="max-w-2xl mx-auto">

        {/* Hero */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full mb-4"
            style={{ background: "#EEF2FF", color: "#4338CA", border: "0.5px solid #C7D2FE" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#6366F1" }} />
            AI-powered research
          </div>
          <h1 className="text-4xl font-semibold mb-3 leading-tight" style={{ color: "#1E1B4B" }}>
            Ask anything,{" "}
            <span style={{ color: "#6366F1" }}>get cited answers</span>
          </h1>
          <p className="text-base" style={{ color: "#6B7280" }}>
            Searches the web in real time and summarises with sources
          </p>
        </div>

        {/* Search card */}
        <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "0.5px solid #E0E7FF" }}>
          <div className="flex gap-3 mb-4">
            <input
              className="flex-1 rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{ background: "#F8FAFF", border: "1.5px solid #E0E7FF", color: "#374151" }}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="What do you want to research?"
              onFocus={(e) => { e.target.style.borderColor = "#6366F1"; e.target.style.background = "#fff"; }}
              onBlur={(e) => { e.target.style.borderColor = "#E0E7FF"; e.target.style.background = "#F8FAFF"; }}
            />
            <button
              onClick={() => handleSearch()}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60"
              style={{ background: "#6366F1" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              {loading ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Example pills */}
          <div className="flex gap-2 flex-wrap">
            {exampleQueries.map((q) => (
              <button
                key={q}
                onClick={() => handleSearch(q)}
                className="text-xs rounded-full px-4 py-1.5 transition-colors"
                style={{ background: "#F0F4FF", border: "0.5px solid #C7D2FE", color: "#4338CA" }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ background: "#fff", border: "0.5px solid #E0E7FF" }}>
            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
              style={{ borderColor: "#E0E7FF", borderTopColor: "#6366F1" }} />
            <span className="text-sm flex-1" style={{ color: "#6B7280" }}>{status}</span>
            <div className="flex gap-1.5">
              {steps.map((s, i) => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-full"
                  style={{
                    background: i <= activeStep ? "#6366F1" : "#EEF2FF",
                    color: i <= activeStep ? "#fff" : "#4338CA",
                  }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl p-4 mb-4" style={{ background: "#FEF2F2", border: "0.5px solid #FECACA" }}>
            <p className="text-sm" style={{ color: "#DC2626" }}>{error}</p>
          </div>
        )}

        {/* Answer */}
        {answer && (
          <div className="rounded-2xl p-5 mb-4" style={{ background: "#fff", border: "0.5px solid #E0E7FF" }}>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider mb-4"
              style={{ color: "#6366F1" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8L12 14.6l-5 3.6 1.9-5.8L4 8.8h6.1z"/>
              </svg>
              Answer
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#374151" }}>
              {answer}
            </p>
          </div>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <div className="rounded-2xl p-5" style={{ background: "#fff", border: "0.5px solid #E0E7FF" }}>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider mb-4"
              style={{ color: "#6366F1" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Sources
            </div>
            <div>
              {sources.map((s, i) => (
                <a
                  key={i}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 py-2.5 group"
                  style={{ borderBottom: i < sources.length - 1 ? "0.5px solid #F3F4F6" : "none" }}
                >
                  <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0"
                    style={{ background: "#EEF2FF", color: "#4338CA" }}>
                    {i + 1}
                  </span>
                  <span className="text-sm flex-1 transition-colors" style={{ color: "#6366F1" }}>
                    {s.title}
                  </span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </a>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}