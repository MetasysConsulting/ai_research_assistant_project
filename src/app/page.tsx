"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./page.module.css";
import type { TrialStudy } from "@/lib/types";

type SortKey = "studyId" | "title" | "trialStartDate" | "status" | "primaryEndpoint" | "phase";
type SortDirection = "asc" | "desc";

type SavedCollection = {
  id: string;
  name: string;
  studyIds: string[];
  createdAt: string;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type ChatThread = {
  id: string;
  title: string;
  studyIds: string[];
  messages: ChatMessage[];
  createdAt: string;
};

function getStoredCollections(): SavedCollection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("trialsGuru.collections");
    return raw ? (JSON.parse(raw) as SavedCollection[]) : [];
  } catch {
    return [];
  }
}

function getStoredThreads(): ChatThread[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("trialsGuru.threads");
    return raw ? (JSON.parse(raw) as ChatThread[]) : [];
  } catch {
    return [];
  }
}

export default function Home() {
  const [condition, setCondition] = useState("obesity");
  const [intervention, setIntervention] = useState("semaglutide");
  const [textSearch, setTextSearch] = useState("GLP-1");
  const [studies, setStudies] = useState<TrialStudy[]>([]);
  const [selectedStudyIds, setSelectedStudyIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"results" | "compare" | "timeline" | "chat">("results");

  const [statusFilter, setStatusFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [onlyWithPublications, setOnlyWithPublications] = useState(false);
  const [onlyWithBiomarkers, setOnlyWithBiomarkers] = useState(false);
  const [columnFilter, setColumnFilter] = useState("");
  const [visibleColumns, setVisibleColumns] = useState({
    studyId: true,
    title: true,
    trialStartDate: true,
    status: true,
    primaryEndpoint: true,
    phase: true,
    diseaseNames: true,
  });

  const [loadingSearch, setLoadingSearch] = useState(false);
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("Compare efficacy signals and inclusion criteria.");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState("No studies loaded");
  const [sortKey, setSortKey] = useState<SortKey>("trialStartDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [collections, setCollections] = useState<SavedCollection[]>(getStoredCollections);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>(getStoredThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const stored = getStoredThreads();
    return stored[0]?.id ?? null;
  });

  const selectedStudies = useMemo(
    () => studies.filter((study) => selectedStudyIds.has(study.studyId)),
    [studies, selectedStudyIds],
  );

  const filteredStudies = useMemo(() => {
    const q = columnFilter.toLowerCase().trim();
    const filtered = studies.filter((study) => {
      if (statusFilter !== "all" && study.status !== statusFilter) return false;
      if (phaseFilter !== "all" && study.phase !== phaseFilter) return false;
      if (onlyWithPublications && !study.hasPublications) return false;
      if (onlyWithBiomarkers && study.biomarkers.length === 0) return false;
      if (!q) return true;
      return (
        study.studyId.toLowerCase().includes(q) ||
        study.title.toLowerCase().includes(q) ||
        study.primaryEndpoint.toLowerCase().includes(q) ||
        study.phase.toLowerCase().includes(q)
      );
    });

    filtered.sort((a, b) => {
      const aValue = String(a[sortKey] ?? "").toLowerCase();
      const bValue = String(b[sortKey] ?? "").toLowerCase();
      const direction = sortDirection === "asc" ? 1 : -1;
      return aValue.localeCompare(bValue) * direction;
    });

    return filtered;
  }, [
    studies,
    statusFilter,
    phaseFilter,
    onlyWithPublications,
    onlyWithBiomarkers,
    columnFilter,
    sortKey,
    sortDirection,
  ]);

  const statuses = useMemo(
    () => Array.from(new Set(studies.map((s) => s.status).filter(Boolean))).sort(),
    [studies],
  );
  const phases = useMemo(
    () => Array.from(new Set(studies.map((s) => s.phase).filter(Boolean))).sort(),
    [studies],
  );

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  useEffect(() => {
    window.localStorage.setItem("trialsGuru.collections", JSON.stringify(collections));
  }, [collections]);

  useEffect(() => {
    window.localStorage.setItem("trialsGuru.threads", JSON.stringify(threads));
  }, [threads]);

  const toggleSelection = (studyId: string) => {
    setSelectedStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(studyId)) next.delete(studyId);
      else next.add(studyId);
      return next;
    });
  };

  const toggleColumn = (columnKey: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [columnKey]: !prev[columnKey] }));
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPhaseFilter("all");
    setOnlyWithPublications(false);
    setOnlyWithBiomarkers(false);
    setColumnFilter("");
  };

  const selectVisible = () => {
    setSelectedStudyIds(new Set(filteredStudies.map((s) => s.studyId)));
  };

  const removeSelectedFromList = () => {
    const selected = new Set(selectedStudyIds);
    const next = studies.filter((study) => !selected.has(study.studyId));
    setStudies(next);
    setSelectedStudyIds(new Set());
    setMeta(`Studies found: ${next.length} | Selected: 0`);
  };

  const exportSelected = () => {
    if (!selectedStudies.length) return;
    const header = [
      "Study ID",
      "Title",
      "Status",
      "Phase",
      "Trial Start Date",
      "Primary Endpoint",
      "Conditions",
      "Interventions",
      "Sponsor",
      "URL",
    ];
    const rows = selectedStudies.map((study) => [
      study.studyId,
      study.title,
      study.status,
      study.phase,
      study.trialStartDate,
      study.primaryEndpoint,
      study.diseaseNames.join(" | "),
      study.interventions.join(" | "),
      study.sponsor,
      study.url,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "selected-trials.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveCollection = () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed || selectedStudies.length === 0) return;
    const collection: SavedCollection = {
      id: `col-${Date.now()}`,
      name: trimmed,
      studyIds: selectedStudies.map((s) => s.studyId),
      createdAt: new Date().toISOString(),
    };
    setCollections((prev) => [collection, ...prev]);
    setNewCollectionName("");
  };

  const loadCollection = (collection: SavedCollection) => {
    setSelectedStudyIds(new Set(collection.studyIds));
    setActiveTab("results");
  };

  const createThreadFromSelection = () => {
    if (!selectedStudies.length) return;
    const thread: ChatThread = {
      id: `thread-${Date.now()}`,
      title: `Thread ${new Date().toLocaleDateString()}`,
      studyIds: selectedStudies.map((s) => s.studyId),
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
  };

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection("asc");
  };

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setAnswer("");
    setLoadingSearch(true);
    try {
      const params = new URLSearchParams({
        condition,
        intervention,
        textSearch,
        limit: "40",
      });
      const res = await fetch(`/api/trials/search?${params.toString()}`);
      const data = (await res.json()) as { studies?: TrialStudy[]; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Study search failed.");
      const list = data.studies || [];
      setStudies(list);
      setSelectedStudyIds(new Set(list.slice(0, 3).map((s) => s.studyId)));
      setMeta(`Studies found: ${data.total ?? list.length} | Selected: ${Math.min(3, list.length)}`);
      setActiveTab("results");
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
        body: JSON.stringify({ question, studies: selectedStudies }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to answer question.");
      setAnswer(data.answer || "");
      if (activeThread) {
        const updated: ChatThread = {
          ...activeThread,
          messages: [
            ...activeThread.messages,
            { role: "user", content: question, createdAt: new Date().toISOString() },
            { role: "assistant", content: data.answer || "", createdAt: new Date().toISOString() },
          ],
        };
        setThreads((prev) => prev.map((thread) => (thread.id === updated.id ? updated : thread)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question failed.");
    } finally {
      setLoadingAsk(false);
    }
  };

  const timelineBounds = useMemo(() => {
    const years = filteredStudies.map((s) => s.trialStartYear).filter((y): y is number => y !== null);
    if (!years.length) return null;
    const min = Math.min(...years);
    const max = Math.max(...years);
    return { min, max: min === max ? max + 1 : max };
  }, [filteredStudies]);

  const timelineTicks = useMemo(() => {
    if (!timelineBounds) return [];
    const { min, max } = timelineBounds;
    const span = max - min;
    const steps = Math.min(6, Math.max(2, span + 1));
    return Array.from({ length: steps }, (_, i) => Math.round(min + (i * span) / (steps - 1)));
  }, [timelineBounds]);

  const timelineChartData = useMemo(
    () =>
      filteredStudies
        .filter((study) => study.trialStartYear !== null)
        .map((study, index) => ({
          x: study.trialStartYear as number,
          y: index + 1,
          label: study.studyId,
          status: study.status,
        })),
    [filteredStudies],
  );

  return (
    <div className={styles.page}>
      <aside className={styles.leftRail}>
        <div className={styles.railLogo}>TG</div>
        <button type="button" className={styles.railActive}>
          S
        </button>
        <button type="button">C</button>
        <button type="button">T</button>
        <button type="button">AI</button>
      </aside>
      <main className={styles.main}>
        <div className={styles.headerRow}>
          <div>
            <h1>Trials Guru</h1>
            <p className={styles.subtitle}>
              Search clinical studies, filter, compare, inspect timeline, and chat with AI on selected studies.
            </p>
          </div>
          <div className={styles.topMetrics}>
            <span>{meta}</span>
            <span>Selected for analysis: {selectedStudies.length}</span>
          </div>
        </div>

        <form className={styles.searchCard} onSubmit={handleSearch}>
          <div className={styles.searchGrid}>
            <div>
              <label htmlFor="condition">Condition</label>
              <input id="condition" value={condition} onChange={(e) => setCondition(e.target.value)} />
            </div>
            <div>
              <label htmlFor="intervention">Intervention</label>
              <input id="intervention" value={intervention} onChange={(e) => setIntervention(e.target.value)} />
            </div>
            <div>
              <label htmlFor="textSearch">Text Search</label>
              <input id="textSearch" value={textSearch} onChange={(e) => setTextSearch(e.target.value)} />
            </div>
          </div>
          <div className={styles.actionsRow}>
            <button type="submit" disabled={loadingSearch}>
              {loadingSearch ? "Searching..." : "Study Search"}
            </button>
            <button type="button" onClick={clearFilters}>
              Clear Filters
            </button>
            <span className={styles.meta}>Condition + intervention + text search query ClinicalTrials.gov</span>
          </div>
        </form>

        <div className={styles.tabBar}>
          <button className={activeTab === "results" ? styles.activeTab : ""} onClick={() => setActiveTab("results")} type="button">Study Search and Results</button>
          <button className={activeTab === "compare" ? styles.activeTab : ""} onClick={() => setActiveTab("compare")} type="button">Compare Trials</button>
          <button className={activeTab === "timeline" ? styles.activeTab : ""} onClick={() => setActiveTab("timeline")} type="button">Timelines</button>
          <button className={activeTab === "chat" ? styles.activeTab : ""} onClick={() => setActiveTab("chat")} type="button">Chat with AI Assistant</button>
        </div>

        {activeTab === "results" && (
          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <button type="button" onClick={selectVisible} disabled={!filteredStudies.length}>
                Select Visible
              </button>
              <button type="button" onClick={removeSelectedFromList} disabled={!selectedStudies.length}>
                Remove from List
              </button>
              <button type="button" onClick={exportSelected} disabled={!selectedStudies.length}>
                Export List
              </button>
            </div>
            <div className={styles.filtersLayout}>
              <aside className={styles.filters}>
                <h3>Filters</h3>
                <label>General Trial Filters</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="all">All status</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <label>Phase</label>
                <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
                  <option value="all">All phases</option>
                  {phases.map((phase) => (
                    <option key={phase} value={phase}>{phase}</option>
                  ))}
                </select>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" checked={onlyWithPublications} onChange={(e) => setOnlyWithPublications(e.target.checked)} />
                  Publications
                </label>
                <label className={styles.checkboxRow}>
                  <input type="checkbox" checked={onlyWithBiomarkers} onChange={(e) => setOnlyWithBiomarkers(e.target.checked)} />
                  Biomarkers
                </label>
                <label>Column specific filters</label>
                <input value={columnFilter} onChange={(e) => setColumnFilter(e.target.value)} placeholder="Filter Study ID/Title/Endpoint" />
                <label>Configure table columns</label>
                <div className={styles.columns}>
                  {(Object.keys(visibleColumns) as Array<keyof typeof visibleColumns>).map((key) => (
                    <label key={key} className={styles.checkboxRow}>
                      <input type="checkbox" checked={visibleColumns[key]} onChange={() => toggleColumn(key)} />
                      {key}
                    </label>
                  ))}
                </div>
                <label>Collections</label>
                <div className={styles.collectionForm}>
                  <input
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection name"
                  />
                  <button type="button" onClick={saveCollection} disabled={!selectedStudies.length}>
                    Save
                  </button>
                </div>
                <div className={styles.collectionList}>
                  {collections.slice(0, 6).map((collection) => (
                    <button key={collection.id} type="button" onClick={() => loadCollection(collection)}>
                      {collection.name} ({collection.studyIds.length})
                    </button>
                  ))}
                </div>
              </aside>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th />
                      {visibleColumns.studyId && (
                        <th>
                          <button type="button" onClick={() => setSort("studyId")} className={styles.sortBtn}>
                            Study ID
                          </button>
                        </th>
                      )}
                      {visibleColumns.title && (
                        <th>
                          <button type="button" onClick={() => setSort("title")} className={styles.sortBtn}>
                            Study Title
                          </button>
                        </th>
                      )}
                      {visibleColumns.trialStartDate && (
                        <th>
                          <button
                            type="button"
                            onClick={() => setSort("trialStartDate")}
                            className={styles.sortBtn}
                          >
                            Trial Start Date
                          </button>
                        </th>
                      )}
                      {visibleColumns.status && (
                        <th>
                          <button type="button" onClick={() => setSort("status")} className={styles.sortBtn}>
                            Status
                          </button>
                        </th>
                      )}
                      {visibleColumns.primaryEndpoint && (
                        <th>
                          <button
                            type="button"
                            onClick={() => setSort("primaryEndpoint")}
                            className={styles.sortBtn}
                          >
                            Primary Endpoint
                          </button>
                        </th>
                      )}
                      {visibleColumns.phase && (
                        <th>
                          <button type="button" onClick={() => setSort("phase")} className={styles.sortBtn}>
                            Phase
                          </button>
                        </th>
                      )}
                      {visibleColumns.diseaseNames && <th>Disease Name</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudies.map((study) => (
                      <tr key={study.studyId}>
                        <td><input type="checkbox" checked={selectedStudyIds.has(study.studyId)} onChange={() => toggleSelection(study.studyId)} /></td>
                        {visibleColumns.studyId && <td><a href={study.url} target="_blank" rel="noreferrer">{study.studyId}</a></td>}
                        {visibleColumns.title && <td>{study.title}</td>}
                        {visibleColumns.trialStartDate && <td>{study.trialStartDate}</td>}
                        {visibleColumns.status && <td>{study.status}</td>}
                        {visibleColumns.primaryEndpoint && <td>{study.primaryEndpoint}</td>}
                        {visibleColumns.phase && <td>{study.phase}</td>}
                        {visibleColumns.diseaseNames && <td>{study.diseaseNames.join(" / ") || "N/A"}</td>}
                      </tr>
                    ))}
                    {!filteredStudies.length && (
                      <tr>
                        <td colSpan={8} className={styles.emptyCell}>
                          No studies match current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === "compare" && (
          <section className={styles.panel}>
            <h2>Compare Trials</h2>
            {!selectedStudies.length ? (
              <p className={styles.muted}>Select studies in results tab to compare.</p>
            ) : (
              <div className={styles.compareGrid}>
                {selectedStudies.map((study) => (
                  <article key={study.studyId} className={styles.compareCard}>
                    <h3>{study.studyId}</h3>
                    <p>{study.title}</p>
                    <ul>
                      <li>Status: {study.status}</li>
                      <li>Start: {study.trialStartDate}</li>
                      <li>Phase: {study.phase}</li>
                      <li>Primary Endpoint: {study.primaryEndpoint}</li>
                      <li>Interventions: {study.interventions.join(", ") || "N/A"}</li>
                      <li>Biomarkers: {study.biomarkers.join(", ") || "N/A"}</li>
                    </ul>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === "timeline" && (
          <section className={styles.panel}>
            <h2>Clinical Trials Timeline</h2>
            {!filteredStudies.length ? (
              <p className={styles.muted}>No trials to visualize yet.</p>
            ) : (
              <div className={styles.timeline}>
                <div className={styles.chartCard}>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Start Year"
                        domain={
                          timelineBounds ? [timelineBounds.min, timelineBounds.max] : ["dataMin", "dataMax"]
                        }
                        tickCount={timelineTicks.length || 6}
                      />
                      <YAxis type="number" dataKey="y" name="Trials" tick={false} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={timelineChartData} fill="#2563eb" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <div className={styles.timelineAxis}>
                  {timelineTicks.map((tick) => (
                    <span key={tick}>{tick}</span>
                  ))}
                </div>
                {filteredStudies.map((study) => (
                  <div key={study.studyId} className={styles.timelineRow}>
                    <span>{study.studyId}</span>
                    <div className={styles.timelineBar}>
                      <div
                        className={styles.timelineDot}
                        style={{
                          left:
                            study.trialStartYear && timelineBounds
                              ? `${((study.trialStartYear - timelineBounds.min) / (timelineBounds.max - timelineBounds.min)) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <span>{study.trialStartYear ?? "N/A"}</span>
                  </div>
                ))}
                <p className={styles.axisLabel}>X-axis: Years | Y-axis: Trials</p>
              </div>
            )}
          </section>
        )}

        {activeTab === "chat" && (
          <section className={styles.panel}>
            <div className={styles.chatLayout}>
              <aside className={styles.threadSidebar}>
                <button type="button" onClick={createThreadFromSelection} disabled={!selectedStudies.length}>
                  + New Thread from Selection
                </button>
                <div className={styles.threadList}>
                  {threads.map((thread) => (
                    <button
                      key={thread.id}
                      type="button"
                      className={thread.id === activeThreadId ? styles.threadActive : ""}
                      onClick={() => {
                        setActiveThreadId(thread.id);
                        setSelectedStudyIds(new Set(thread.studyIds));
                      }}
                    >
                      {thread.title}
                    </button>
                  ))}
                </div>
              </aside>
              <div className={styles.chatMain}>
            <form className={styles.form} onSubmit={handleAsk}>
              <label htmlFor="question">Ask AI using selected studies as source</label>
              <p className={styles.muted}>
                Grounding source: {selectedStudies.map((s) => s.studyId).join(", ") || "None"}
              </p>
              <textarea id="question" value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} />
              <button type="submit" disabled={loadingAsk || selectedStudies.length === 0}>
                {loadingAsk ? "Thinking..." : `Ask (${selectedStudies.length} selected)`}
              </button>
            </form>
            <section className={styles.answer}>
              <h2>Answer</h2>
              {error ? <p className={styles.error}>{error}</p> : null}
              {answer ? <pre>{answer}</pre> : <p className={styles.muted}>No answer yet.</p>}
              {activeThread?.messages.length ? (
                <div className={styles.threadMessages}>
                  {activeThread.messages.map((msg, idx) => (
                    <article key={`${msg.createdAt}-${idx}`} className={styles.msg}>
                      <strong>{msg.role === "user" ? "You" : "Assistant"}:</strong> {msg.content}
                    </article>
                  ))}
                </div>
              ) : null}
            </section>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
