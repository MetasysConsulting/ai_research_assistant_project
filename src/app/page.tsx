"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
type BinaryFilter = "all" | "yes" | "no";
type FilterableColumn = "all" | "studyId" | "title" | "trialStartDate" | "status" | "primaryEndpoint" | "phase" | "diseaseNames";

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

function getStatusStyle(status: string): React.CSSProperties {
  const s = status.toLowerCase();
  if (s.includes("recruiting") && !s.includes("not")) {
    return { background: "#dcfce7", color: "#15803d", border: "1px solid #86efac" };
  }
  if (s.includes("not yet")) {
    return { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" };
  }
  if (s.includes("active, not")) {
    return { background: "#cffafe", color: "#0e7490", border: "1px solid #67e8f9" };
  }
  if (s.includes("completed")) {
    return { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" };
  }
  if (s.includes("terminat") || s.includes("withdrawn") || s.includes("suspend")) {
    return { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" };
  }
  if (s.includes("planned")) {
    return { background: "#faf5ff", color: "#7c3aed", border: "1px solid #c4b5fd" };
  }
  return { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" };
}

const compareFields: Array<
  | { label: string; key: keyof TrialStudy }
  | { label: string; render: (s: TrialStudy) => string }
> = [
  { label: "Status", key: "status" },
  { label: "Phase", key: "phase" },
  { label: "Trial Start Date", key: "trialStartDate" },
  { label: "Primary Endpoint", key: "primaryEndpoint" },
  { label: "Sponsor", key: "sponsor" },
  { label: "Conditions", render: (s) => s.diseaseNames.join(", ") || "N/A" },
  { label: "Interventions", render: (s) => s.interventions.join(", ") || "N/A" },
  { label: "Biomarkers", render: (s) => s.biomarkers.join(", ") || "N/A" },
  { label: "Publications", render: (s) => (s.hasPublications ? "✓ Yes" : "No") },
  { label: "Results", render: (s) => (s.hasResults ? "✓ Yes" : "No") },
];

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
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
  const [publicationsFilter, setPublicationsFilter] = useState<BinaryFilter>("all");
  const [biomarkersFilter, setBiomarkersFilter] = useState<BinaryFilter>("all");
  const [columnFilter, setColumnFilter] = useState("");
  const [columnFilterKey, setColumnFilterKey] = useState<FilterableColumn>("all");
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
  const [question, setQuestion] = useState("");
  const [loadingAsk, setLoadingAsk] = useState(false);
  const [error, setError] = useState("");
  const [meta, setMeta] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("trialStartDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [collections, setCollections] = useState<SavedCollection[]>(getStoredCollections);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>(getStoredThreads);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() => {
    const stored = getStoredThreads();
    return stored[0]?.id ?? null;
  });

  const chatFormRef = useRef<HTMLFormElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedStudies = useMemo(
    () => studies.filter((study) => selectedStudyIds.has(study.studyId)),
    [studies, selectedStudyIds],
  );

  const filteredStudies = useMemo(() => {
    const q = columnFilter.toLowerCase().trim();
    const filtered = studies.filter((study) => {
      if (statusFilter !== "all" && study.status !== statusFilter) return false;
      if (phaseFilter !== "all" && study.phase !== phaseFilter) return false;
      if (publicationsFilter === "yes" && !study.hasPublications) return false;
      if (publicationsFilter === "no" && study.hasPublications) return false;
      if (biomarkersFilter === "yes" && study.biomarkers.length === 0) return false;
      if (biomarkersFilter === "no" && study.biomarkers.length > 0) return false;
      if (!q) return true;
      const byColumn: Record<Exclude<FilterableColumn, "all">, string> = {
        studyId: study.studyId,
        title: study.title,
        trialStartDate: study.trialStartDate,
        status: study.status,
        primaryEndpoint: study.primaryEndpoint,
        phase: study.phase,
        diseaseNames: study.diseaseNames.join(", "),
      };
      if (columnFilterKey === "all") {
        return Object.values(byColumn).some((value) => value.toLowerCase().includes(q));
      }
      return byColumn[columnFilterKey].toLowerCase().includes(q);
    });
    filtered.sort((a, b) => {
      const aValue = String(a[sortKey] ?? "").toLowerCase();
      const bValue = String(b[sortKey] ?? "").toLowerCase();
      const direction = sortDirection === "asc" ? 1 : -1;
      return aValue.localeCompare(bValue) * direction;
    });
    return filtered;
  }, [studies, statusFilter, phaseFilter, publicationsFilter, biomarkersFilter, columnFilter, columnFilterKey, sortKey, sortDirection]);

  const statuses = useMemo(() => Array.from(new Set(studies.map((s) => s.status).filter(Boolean))).sort(), [studies]);
  const phases = useMemo(() => Array.from(new Set(studies.map((s) => s.phase).filter(Boolean))).sort(), [studies]);

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  useEffect(() => {
    window.localStorage.setItem("trialsGuru.collections", JSON.stringify(collections));
  }, [collections]);

  useEffect(() => {
    window.localStorage.setItem("trialsGuru.threads", JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeThread?.messages, loadingAsk]);

  const toggleSelection = (studyId: string) => {
    setSelectedStudyIds((prev) => {
      const next = new Set(prev);
      if (next.has(studyId)) next.delete(studyId);
      else next.add(studyId);
      return next;
    });
  };

  const toggleColumn = (key: keyof typeof visibleColumns) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setPhaseFilter("all");
    setPublicationsFilter("all");
    setBiomarkersFilter("all");
    setColumnFilter("");
    setColumnFilterKey("all");
  };

  const selectVisible = () => setSelectedStudyIds(new Set(filteredStudies.map((s) => s.studyId)));

  const removeSelectedFromList = () => {
    const selected = new Set(selectedStudyIds);
    const next = studies.filter((s) => !selected.has(s.studyId));
    setStudies(next);
    setSelectedStudyIds(new Set());
    setMeta(`${next.length} studies`);
  };

  const exportSelected = () => {
    if (!selectedStudies.length) return;
    const header = ["Study ID", "Title", "Status", "Phase", "Trial Start Date", "Primary Endpoint", "Conditions", "Interventions", "Sponsor", "URL"];
    const rows = selectedStudies.map((s) => [s.studyId, s.title, s.status, s.phase, s.trialStartDate, s.primaryEndpoint, s.diseaseNames.join(" | "), s.interventions.join(" | "), s.sponsor, s.url]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
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
    setCollections((prev) => [{ id: `col-${Date.now()}`, name: trimmed, studyIds: selectedStudies.map((s) => s.studyId), createdAt: new Date().toISOString() }, ...prev]);
    setNewCollectionName("");
  };

  const loadCollection = (col: SavedCollection) => {
    setSelectedStudyIds(new Set(col.studyIds));
    setActiveTab("results");
  };

  const createThread = () => {
    if (!selectedStudies.length) return null;
    const thread: ChatThread = {
      id: `thread-${Date.now()}`,
      title: `${selectedStudies.slice(0, 2).map((s) => s.studyId).join(", ")}…`,
      studyIds: selectedStudies.map((s) => s.studyId),
      messages: [],
      createdAt: new Date().toISOString(),
    };
    setThreads((prev) => [thread, ...prev]);
    setActiveThreadId(thread.id);
    return thread.id;
  };

  const setSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortIcon = (key: SortKey) => (sortKey === key ? (sortDirection === "asc" ? " ↑" : " ↓") : " ↕");

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoadingSearch(true);
    try {
      const params = new URLSearchParams({ condition, intervention, textSearch, limit: "40" });
      const res = await fetch(`/api/trials/search?${params.toString()}`);
      const data = (await res.json()) as { studies?: TrialStudy[]; total?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Study search failed.");
      const list = data.studies || [];
      setStudies(list);
      setSelectedStudyIds(new Set(list.slice(0, 3).map((s) => s.studyId)));
      setMeta(`${data.total ?? list.length} studies found`);
      setActiveTab("results");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleAsk = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || loadingAsk) return;

    setError("");
    setLoadingAsk(true);

    let threadId = activeThreadId;
    if (!threadId) {
      threadId = createThread();
    }

    const threadForHistory = threadId ? threads.find((t) => t.id === threadId) ?? null : null;

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmedQuestion,
          studies: selectedStudies,
          history: (threadForHistory?.messages || []).map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to answer question.");
      if (!threadId) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.id !== threadId
            ? t
            : {
                ...t,
                messages: [
                  ...t.messages,
                  { role: "user", content: trimmedQuestion, createdAt: new Date().toISOString() },
                  { role: "assistant", content: data.answer || "", createdAt: new Date().toISOString() },
                ],
              },
        ),
      );
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Question failed.");
    } finally {
      setLoadingAsk(false);
    }
  };

  const handleChatKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      chatFormRef.current?.requestSubmit();
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
    const steps = Math.min(7, Math.max(2, span + 1));
    return Array.from({ length: steps }, (_, i) => Math.round(min + (i * span) / (steps - 1)));
  }, [timelineBounds]);

  const timelineChartData = useMemo(
    () =>
      filteredStudies
        .filter((s) => s.trialStartYear !== null)
        .map((s, i) => ({ x: s.trialStartYear as number, y: i + 1, label: s.studyId, status: s.status })),
    [filteredStudies],
  );

  return (
    <div className={styles.page}>
      {/* Left nav rail */}
      <aside className={styles.leftRail}>
        <div className={styles.railLogo}>TG</div>
        {(["results", "compare", "timeline", "chat"] as const).map((tab, i) => {
          const icons = ["🔬", "⚖️", "📅", "💬"];
          const labels = ["Search", "Compare", "Timeline", "AI Chat"];
          return (
            <button
              key={tab}
              type="button"
              className={`${styles.railBtn} ${activeTab === tab ? styles.railBtnActive : ""}`}
              onClick={() => setActiveTab(tab)}
              title={labels[i]}
            >
              <span>{icons[i]}</span>
              <span className={styles.railLabel}>{labels[i]}</span>
            </button>
          );
        })}
      </aside>

      <main className={styles.main}>
        {/* Header */}
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.headerTitle}>Trials Guru</h1>
            <p className={styles.subtitle}>
              Discover, compare, and query clinical trials from ClinicalTrials.gov — powered by AI.
            </p>
          </div>
          <div className={styles.topMetrics}>
            {meta && (
              <span className={styles.metricPill}>
                <strong>{meta.split(" ")[0]}</strong>{" "}
                {meta.split(" ").slice(1).join(" ")}
              </span>
            )}
            <span className={styles.metricPill}>
              Selected for analysis: <strong>{selectedStudies.length}</strong>
            </span>
          </div>
        </div>

        {/* Search card */}
        <form className={styles.searchCard} onSubmit={handleSearch}>
          <div className={styles.searchGrid}>
            <div className={styles.inputGroup}>
              <span className={styles.inputLabel}>Condition</span>
              <input className={styles.searchInput} id="condition" value={condition} onChange={(e) => setCondition(e.target.value)} placeholder="e.g. obesity, diabetes" />
            </div>
            <div className={styles.inputGroup}>
              <span className={styles.inputLabel}>Intervention</span>
              <input className={styles.searchInput} id="intervention" value={intervention} onChange={(e) => setIntervention(e.target.value)} placeholder="e.g. semaglutide, placebo" />
            </div>
            <div className={styles.inputGroup}>
              <span className={styles.inputLabel}>Text Search</span>
              <input className={styles.searchInput} id="textSearch" value={textSearch} onChange={(e) => setTextSearch(e.target.value)} placeholder="e.g. GLP-1, randomized" />
            </div>
          </div>
          <div className={styles.actionsRow}>
            <button type="submit" className={styles.btnPrimary} disabled={loadingSearch}>
              {loadingSearch ? "Searching…" : "🔍 Study Search"}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={clearFilters}>
              ✕ Clear Filters
            </button>
            <span className={styles.searchHint}>Searches ClinicalTrials.gov in real time</span>
          </div>
          {error && <div className={styles.errorBar}>{error}</div>}
        </form>

        {/* Tab bar */}
        <div className={styles.tabBar}>
          <button type="button" className={`${styles.tabBtn} ${activeTab === "results" ? styles.tabActive : ""}`} onClick={() => setActiveTab("results")}>🔬 Study Search &amp; Results</button>
          <button type="button" className={`${styles.tabBtn} ${activeTab === "compare" ? styles.tabActive : ""}`} onClick={() => setActiveTab("compare")}>⚖️ Compare Trials</button>
          <button type="button" className={`${styles.tabBtn} ${activeTab === "timeline" ? styles.tabActive : ""}`} onClick={() => setActiveTab("timeline")}>📅 Timelines</button>
          <button type="button" className={`${styles.tabBtn} ${activeTab === "chat" ? styles.tabActive : ""}`} onClick={() => setActiveTab("chat")}>💬 AI Assistant</button>
        </div>

        {/* ── Results tab ── */}
        {activeTab === "results" && (
          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <button type="button" className={styles.btnSecondary} onClick={selectVisible} disabled={!filteredStudies.length}>Select All Visible</button>
              <button type="button" className={styles.btnSecondary} onClick={removeSelectedFromList} disabled={!selectedStudies.length}>Remove Selected</button>
              <button type="button" className={styles.btnSecondary} onClick={exportSelected} disabled={!selectedStudies.length}>⬇ Export CSV</button>
            </div>

            <div className={styles.filtersLayout}>
              {/* Filter sidebar */}
              <aside className={styles.filters}>
                <p className={styles.filterTitle}>Filters</p>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>General Trial Filters</p>
                  <select className={styles.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All statuses</option>
                    {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>Phase</p>
                  <select className={styles.filterSelect} value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}>
                    <option value="all">All phases</option>
                    {phases.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>Has Publications</p>
                  <select className={styles.filterSelect} value={publicationsFilter} onChange={(e) => setPublicationsFilter(e.target.value as BinaryFilter)}>
                    <option value="all">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>Has Biomarkers</p>
                  <select className={styles.filterSelect} value={biomarkersFilter} onChange={(e) => setBiomarkersFilter(e.target.value as BinaryFilter)}>
                    <option value="all">Any</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>Column search</p>
                  <select className={styles.filterSelect} value={columnFilterKey} onChange={(e) => setColumnFilterKey(e.target.value as FilterableColumn)}>
                    <option value="all">Any column</option>
                    <option value="studyId">studyId</option>
                    <option value="title">title</option>
                    <option value="trialStartDate">trialStartDate</option>
                    <option value="status">status</option>
                    <option value="primaryEndpoint">primaryEndpoint</option>
                    <option value="phase">phase</option>
                    <option value="diseaseNames">diseaseNames</option>
                  </select>
                  <input className={styles.filterInput} value={columnFilter} onChange={(e) => setColumnFilter(e.target.value)} placeholder="Filter any column…" />
                </div>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>Configure columns</p>
                  <div className={styles.columns}>
                    {(Object.keys(visibleColumns) as Array<keyof typeof visibleColumns>).map((key) => (
                      <div key={key} className={styles.columnRow}>
                        <span className={styles.columnName}>{key}</span>
                        <select
                          className={styles.columnSelect}
                          value={visibleColumns[key] ? "show" : "hide"}
                          onChange={(e) => {
                            const shouldShow = e.target.value === "show";
                            if (visibleColumns[key] !== shouldShow) toggleColumn(key);
                          }}
                        >
                          <option value="show">Show</option>
                          <option value="hide">Hide</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.filterSection}>
                  <p className={styles.filterLabel}>Saved Collections</p>
                  <div className={styles.collectionForm}>
                    <input value={newCollectionName} onChange={(e) => setNewCollectionName(e.target.value)} placeholder="Collection name…" />
                    <button type="button" className={styles.btnPrimary} onClick={saveCollection} disabled={!selectedStudies.length} style={{ padding: "7px 10px", fontSize: "12px" }}>Save</button>
                  </div>
                  <div className={styles.collectionList}>
                    {collections.slice(0, 6).map((col) => (
                      <button key={col.id} type="button" className={styles.collectionItem} onClick={() => loadCollection(col)}>
                        📂 {col.name} ({col.studyIds.length})
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              {/* Table */}
              <div className={styles.tableWrap}>
                {loadingSearch ? (
                  <div className={styles.spinnerWrap}>
                    <div className={styles.spinner} />
                    Searching ClinicalTrials.gov…
                  </div>
                ) : !studies.length ? (
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon}>🔬</span>
                    <p className={styles.emptyTitle}>No studies loaded yet</p>
                    <p className={styles.emptyBody}>Enter a condition, intervention, or search term above and click &ldquo;Study Search&rdquo; to fetch real clinical trial data.</p>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }} />
                        {visibleColumns.studyId && <th><button type="button" className={styles.sortBtn} onClick={() => setSort("studyId")}>Study ID{sortIcon("studyId")}</button></th>}
                        {visibleColumns.title && <th><button type="button" className={styles.sortBtn} onClick={() => setSort("title")}>Study Title{sortIcon("title")}</button></th>}
                        {visibleColumns.trialStartDate && <th><button type="button" className={styles.sortBtn} onClick={() => setSort("trialStartDate")}>Start Date{sortIcon("trialStartDate")}</button></th>}
                        {visibleColumns.status && <th><button type="button" className={styles.sortBtn} onClick={() => setSort("status")}>Status{sortIcon("status")}</button></th>}
                        {visibleColumns.primaryEndpoint && <th><button type="button" className={styles.sortBtn} onClick={() => setSort("primaryEndpoint")}>Primary Endpoint{sortIcon("primaryEndpoint")}</button></th>}
                        {visibleColumns.phase && <th><button type="button" className={styles.sortBtn} onClick={() => setSort("phase")}>Phase{sortIcon("phase")}</button></th>}
                        {visibleColumns.diseaseNames && <th>Disease</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudies.map((study) => (
                        <tr key={study.studyId}>
                          <td>
                            <input type="checkbox" checked={selectedStudyIds.has(study.studyId)} onChange={() => toggleSelection(study.studyId)} />
                          </td>
                          {visibleColumns.studyId && (
                            <td>
                              <a href={study.url} target="_blank" rel="noreferrer" className={styles.studyLink}>{study.studyId}</a>
                            </td>
                          )}
                          {visibleColumns.title && <td>{study.title}</td>}
                          {visibleColumns.trialStartDate && <td>{study.trialStartDate}</td>}
                          {visibleColumns.status && (
                            <td>
                              <span className={styles.badge} style={getStatusStyle(study.status)}>{study.status}</span>
                            </td>
                          )}
                          {visibleColumns.primaryEndpoint && <td>{study.primaryEndpoint}</td>}
                          {visibleColumns.phase && <td>{study.phase}</td>}
                          {visibleColumns.diseaseNames && <td>{study.diseaseNames.slice(0, 2).join(", ") || "N/A"}</td>}
                        </tr>
                      ))}
                      {!filteredStudies.length && (
                        <tr><td colSpan={8} className={styles.emptyCell}>No studies match current filters.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Compare tab ── */}
        {activeTab === "compare" && (
          <section className={styles.panel}>
            <p className={styles.panelTitle}>⚖️ Compare Selected Trials</p>
            {!selectedStudies.length ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>⚖️</span>
                <p className={styles.emptyTitle}>No studies selected</p>
                <p className={styles.emptyBody}>Select studies using checkboxes in the Study Search tab, then come back here to compare them side by side.</p>
              </div>
            ) : (
              <div className={styles.compareWrap}>
                <table className={styles.compareTable}>
                  <thead>
                    <tr>
                      <th style={{ width: 160 }}>Field</th>
                      {selectedStudies.map((s) => (
                        <th key={s.studyId} className={styles.compareTh}>
                          <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>{s.studyId}</a>
                          <div style={{ fontWeight: 400, fontSize: 11, opacity: 0.75, marginTop: 2, fontStyle: "italic" }}>{s.title.slice(0, 60)}{s.title.length > 60 ? "…" : ""}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {compareFields.map((field) => (
                      <tr key={field.label}>
                        <td className={styles.compareField}>{field.label}</td>
                        {selectedStudies.map((study) => {
                          const value = "render" in field ? field.render(study) : String(study[field.key] ?? "N/A");
                          const isStatus = field.label === "Status";
                          return (
                            <td key={study.studyId}>
                              {isStatus ? (
                                <span className={styles.badge} style={getStatusStyle(value)}>{value}</span>
                              ) : value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ── Timeline tab ── */}
        {activeTab === "timeline" && (
          <section className={styles.panel}>
            <p className={styles.panelTitle}>📅 Trial Timelines</p>
            {!filteredStudies.length ? (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon}>📅</span>
                <p className={styles.emptyTitle}>No trials to visualize</p>
                <p className={styles.emptyBody}>Run a study search first to see trials plotted on the timeline.</p>
              </div>
            ) : (
              <div className={styles.timeline}>
                <div className={styles.chartCard}>
                  <ResponsiveContainer width="100%" height={320}>
                    <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 16 }}>
                      <CartesianGrid strokeDasharray="4 4" stroke="#e2eaf8" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Start Year"
                        domain={timelineBounds ? [timelineBounds.min - 0.5, timelineBounds.max + 0.5] : ["auto", "auto"]}
                        tickCount={timelineTicks.length || 6}
                        tick={{ fontSize: 11, fill: "#94a3b8" }}
                        axisLine={{ stroke: "#e2eaf8" }}
                        tickLine={false}
                        label={{ value: "Trial Start Year", position: "insideBottom", offset: -10, fontSize: 11, fill: "#94a3b8" }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="Trial"
                        tick={false}
                        axisLine={false}
                        tickLine={false}
                        label={{ value: "Trials", angle: -90, position: "insideLeft", fontSize: 11, fill: "#94a3b8" }}
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3", stroke: "#2563eb" }}
                        content={({ payload }) => {
                          const d = payload?.[0]?.payload as { label?: string; status?: string; x?: number } | undefined;
                          if (!d) return null;
                          return (
                            <div style={{ background: "#fff", border: "1px solid #e2eaf8", borderRadius: 10, padding: "8px 12px", fontSize: 12, boxShadow: "0 4px 12px rgba(15,23,42,0.12)" }}>
                              <strong style={{ color: "#1d4ed8" }}>{d.label}</strong>
                              <div style={{ color: "#475569", marginTop: 2 }}>{d.status}</div>
                              <div style={{ color: "#94a3b8" }}>Start: {d.x}</div>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={timelineChartData} fill="#2563eb" opacity={0.85} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                <div className={styles.timelineAxis}>
                  {timelineTicks.map((tick) => <span key={tick}>{tick}</span>)}
                </div>

                {filteredStudies.slice(0, 30).map((study) => (
                  <div key={study.studyId} className={styles.timelineRow}>
                    <span className={styles.timelineId}>{study.studyId}</span>
                    <div className={styles.timelineBar}>
                      <div
                        className={styles.timelineDot}
                        style={{
                          left: study.trialStartYear && timelineBounds
                            ? `${((study.trialStartYear - timelineBounds.min) / Math.max(timelineBounds.max - timelineBounds.min, 1)) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <span className={styles.timelineYear}>{study.trialStartYear ?? "N/A"}</span>
                  </div>
                ))}
                <p className={styles.axisLabel}>Each dot = trial start date. X-axis = year, Y-axis = individual trials.</p>
              </div>
            )}
          </section>
        )}

        {/* ── Chat tab ── */}
        {activeTab === "chat" && (
          <section className={styles.panel}>
            <div className={styles.chatLayout}>
              {/* Thread sidebar */}
              <aside className={styles.threadSidebar}>
                <p className={styles.threadSidebarTitle}>Threads</p>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  style={{ width: "100%", fontSize: "12px", padding: "8px" }}
                  onClick={() => createThread()}
                  disabled={!selectedStudies.length}
                >
                  + New Thread
                </button>
                <div className={styles.threadList}>
                  {!threads.length && (
                    <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>
                      Select studies and create a thread to start chatting.
                    </p>
                  )}
                  {threads.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`${styles.threadItem} ${t.id === activeThreadId ? styles.threadActive : ""}`}
                      onClick={() => {
                        setActiveThreadId(t.id);
                        setSelectedStudyIds(new Set(t.studyIds));
                      }}
                    >
                      💬 {t.title}
                    </button>
                  ))}
                </div>
              </aside>

              {/* Chat main */}
              <div className={styles.chatMain}>
                <div className={styles.chatTopBar}>
                  <div>
                    <div className={styles.chatTopBarTitle}>
                      {activeThread ? `Thread: ${activeThread.title}` : "AI Research Assistant"}
                    </div>
                    <div className={styles.chatTopBarSub}>
                      {selectedStudies.length
                        ? `Grounded on: ${selectedStudies.map((s) => s.studyId).join(", ")}`
                        : "No studies selected — select studies in Search tab first"}
                    </div>
                  </div>
                </div>

                <div className={styles.chatMessages}>
                  {!activeThread || !activeThread.messages.length ? (
                    <div className={styles.chatWelcome}>
                      <span className={styles.chatWelcomeIcon}>🤖</span>
                      <p className={styles.chatWelcomeTitle}>Ask me anything about your selected trials</p>
                      <p className={styles.chatWelcomeSub}>
                        I will answer based only on the studies you have selected. Select studies in the Search tab, then start a thread and ask questions.
                      </p>
                    </div>
                  ) : (
                    activeThread.messages.map((msg, idx) => (
                      <div key={`${msg.createdAt}-${idx}`} className={`${styles.msgRow} ${msg.role === "user" ? styles.msgRowUser : ""}`}>
                        <div className={`${styles.msgAvatar} ${msg.role === "user" ? styles.msgAvatarUser : styles.msgAvatarAI}`}>
                          {msg.role === "user" ? "You" : "AI"}
                        </div>
                        <div>
                          <div className={`${styles.msgBubble} ${msg.role === "user" ? styles.msgBubbleUser : styles.msgBubbleAI}`}>
                            {msg.content}
                          </div>
                          <div className={styles.msgTime} style={{ textAlign: msg.role === "user" ? "right" : "left" }}>
                            {formatTime(msg.createdAt)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {loadingAsk && (
                    <div className={styles.msgRow}>
                      <div className={`${styles.msgAvatar} ${styles.msgAvatarAI}`}>AI</div>
                      <div className={styles.thinking}>
                        <div className={styles.thinkingDot} />
                        <div className={styles.thinkingDot} />
                        <div className={styles.thinkingDot} />
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className={styles.errorBar} style={{ margin: "0 0 4px" }}>{error}</div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <form ref={chatFormRef} onSubmit={handleAsk}>
                  <div className={styles.chatInputBar}>
                    <textarea
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder={selectedStudies.length ? "Ask a question about the selected trials… (Enter to send, Shift+Enter for newline)" : "Select studies in the Search tab first…"}
                      disabled={loadingAsk || selectedStudies.length === 0}
                      rows={1}
                    />
                    <button type="submit" className={styles.chatSendBtn} disabled={loadingAsk || !question.trim() || selectedStudies.length === 0}>
                      ➤
                    </button>
                  </div>
                </form>
                <p className={styles.chatHint}>Press Enter to send · Shift+Enter for newline · Context-aware multi-turn chat</p>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
