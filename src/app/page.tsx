"use client";

import { FormEvent, useMemo, useState } from "react";
import styles from "./page.module.css";
import type { PubMedPaper } from "@/lib/types";

export default function Home() {
  const [query, setQuery] = useState("obesity treatment GLP-1 randomized trial");
  const [papers, setPapers] = useState<PubMedPaper[]>([]);
  const [selectedPmids, setSelectedPmids] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState(
    "Summarize key findings and safety concerns from selected papers.",
  );
  const [answer, setAnswer] = useState("");
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [error, setError] = useState("");

  const selectedPapers = useMemo(
    () => papers.filter((paper) => selectedPmids.has(paper.pmid)),
    [papers, selectedPmids],
  );

  const togglePaperSelection = (pmid: string) => {
    setSelectedPmids((prev) => {
      const next = new Set(prev);
      if (next.has(pmid)) {
        next.delete(pmid);
      } else {
        next.add(pmid);
      }
      return next;
    });
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setAnswer("");
    setLoadingSearch(true);

    try {
      const res = await fetch(`/api/pubmed/search?query=${encodeURIComponent(query)}&limit=10`);
      const data = (await res.json()) as { papers?: PubMedPaper[]; error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch papers.");
      }

      const nextPapers = data.papers || [];
      setPapers(nextPapers);
      setSelectedPmids(new Set(nextPapers.slice(0, 3).map((paper) => paper.pmid)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoadingAsk(true);
    setAnswer("");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, papers: selectedPapers }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Failed to answer question.");
      }

      setAnswer(data.answer || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question failed.");
    } finally {
      setLoadingAsk(false);
    }
  };

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1>Research Assistant AI (PubMed MVP)</h1>
        <p className={styles.subtitle}>
          Search PubMed papers, select sources, and ask citation-backed questions.
        </p>

        <form className={styles.form} onSubmit={handleSearch}>
          <label htmlFor="query">PubMed search query</label>
          <div className={styles.row}>
            <input
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter disease, drug, biomarker, etc."
            />
            <button type="submit" disabled={loadingSearch}>
              {loadingSearch ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        <section className={styles.results}>
          <h2>Search results</h2>
          {!papers.length ? (
            <p className={styles.muted}>Run a search to load papers.</p>
          ) : (
            papers.map((paper) => (
              <label className={styles.paper} key={paper.pmid}>
                <input
                  type="checkbox"
                  checked={selectedPmids.has(paper.pmid)}
                  onChange={() => togglePaperSelection(paper.pmid)}
                />
                <div>
                  <a href={paper.url} target="_blank" rel="noreferrer">
                    {paper.title}
                  </a>
                  <p>
                    PMID: {paper.pmid} | {paper.journal} | {paper.pubDate}
                  </p>
                  <p>{paper.abstract || "No abstract available."}</p>
                </div>
              </label>
            ))
          )}
        </section>

        <form className={styles.form} onSubmit={handleAsk}>
          <label htmlFor="question">Ask a question on selected papers</label>
          <textarea
            id="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={4}
          />
          <button type="submit" disabled={loadingAsk || selectedPapers.length === 0}>
            {loadingAsk ? "Thinking..." : `Ask (${selectedPapers.length} selected)`}
          </button>
        </form>

        <section className={styles.answer}>
          <h2>Answer</h2>
          {error ? <p className={styles.error}>{error}</p> : null}
          {answer ? <pre>{answer}</pre> : <p className={styles.muted}>No answer yet.</p>}
        </section>
      </main>
    </div>
  );
}
