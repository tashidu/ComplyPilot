"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { AuditView } from "@/components/audit-view";
import { EvidenceView } from "@/components/evidence-view";
import { FilingView } from "@/components/filing-view";
import { OverviewView } from "@/components/overview-view";
import { RulesView } from "@/components/rules-view";
import { Sidebar, type ViewId } from "@/components/sidebar";
import { Modal, Toast } from "@/components/ui";
import {
  type AuditEvent,
  INITIAL_AUDIT,
} from "@/lib/demo";
import type { AnalyzeResult } from "@/lib/types";

export default function Page() {
  const [view, setView] = useState<ViewId>("overview");
  const [futureRules, setFutureRules] = useState<boolean>(true);
  const [resolved, setResolved] = useState<string[]>([]);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  
  const [notice2, setNotice2] = useState(false);
  const [files, setFiles] = useState(13);
  const [activeEvidence, setActiveEvidence] = useState<string>("supplier");
  const [audit, setAudit] = useState<AuditEvent[]>(INITIAL_AUDIT);
  const [approved, setApproved] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState({ message: "", show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openBlockers = useMemo(() => {
    if (!analyzeResult) return [];
    return analyzeResult.findings.filter(f => f.status === "open").map(f => f.id);
  }, [analyzeResult]);

  const fetchAnalysis = useCallback(async (isFuture: boolean, currentResolved: string[], file?: File) => {
    try {
      const formData = new FormData();
      formData.append("futureRules", String(isFuture));
      formData.append("resolvedBlockers", JSON.stringify(currentResolved));
      if (file) {
        formData.append("file", file);
      }
      
      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setAnalyzeResult(data);
      if (data.auditEvents && data.auditEvents.length > 0) {
        setAudit(prev => [...prev, ...data.auditEvents]);
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch analysis");
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAnalysis(futureRules, resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = useCallback((message: string) => {
    setToast({ message, show: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 2400);
  }, []);

  const addAudit = useCallback(
    (actor: AuditEvent["actor"], title: string, detail: string) => {
      const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
      setAudit((events) => [...events, { time, actor, title, detail }]);
    },
    []
  );

  const navigate = useCallback((next: ViewId) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const toggleResolve = useCallback(async (id: string) => {
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: id, resolvedBlockers: resolved, futureRules }),
      });
      const data = await res.json();
      setAnalyzeResult(data);
      if (data.auditEvents && data.auditEvents.length > 0) {
        setAudit(prev => [...prev, ...data.auditEvents]);
      }
      
      setResolved(prev => {
        const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
        return next;
      });
      showToast(`Readiness updated to ${data.score.total}/100`);
    } catch (e) {
      console.error(e);
      showToast("Failed to resolve blocker");
    }
  }, [futureRules, resolved, showToast]);

  const fixAll = useCallback(async () => {
    if (!analyzeResult) return;
    const allIds = analyzeResult.findings.map(f => f.id);
    setResolved(allIds);
    await fetchAnalysis(futureRules, allIds);
    addAudit(
      "human",
      "What-if scenario completed",
      "All applicable synthetic blockers were resolved. The package moved to approval-ready status."
    );
    showToast(`What-if complete: readiness updated`);
  }, [analyzeResult, futureRules, fetchAnalysis, addAudit, showToast]);

  const setProfile = useCallback(
    async (future: boolean) => {
      setFutureRules(future);
      await fetchAnalysis(future, resolved);
      addAudit(
        "agent",
        "Rule profile changed",
        future
          ? "The October 2026 rule pack was activated and the document agent re-ran."
          : "The historical pre-October profile was activated."
      );
      showToast(`Rule profile updated`);
    },
    [resolved, fetchAnalysis, addAudit, showToast]
  );

  const toggleNotice2 = useCallback(() => {
    setNotice2((current) => {
      const next = !current;
      addAudit(
        "agent",
        "Refund clock scenario changed",
        next
          ? "Notice 2 compliance moved the scenario start date to 7 Dec 2026."
          : "The no-Notice-2 scenario was restored."
      );
      showToast(next ? "Notice 2 scenario applied" : "Standard clock scenario restored");
      return next;
    });
  }, [addAudit, showToast]);

  const addFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setFiles((current) => current + fileList.length);
      
      const file = fileList[0]; // just use the first for the demo
      await fetchAnalysis(futureRules, resolved, file);
      
      addAudit(
        "human",
        `${fileList.length} evidence file${fileList.length > 1 ? "s" : ""} added`,
        "Files were added and analyzed."
      );
      showToast(`${fileList.length} file${fileList.length > 1 ? "s" : ""} added and analyzed`);
    },
    [futureRules, resolved, fetchAnalysis, addAudit, showToast]
  );

  const openEvidence = useCallback(
    (id: string) => {
      setActiveEvidence(id);
      navigate("evidence");
    },
    [navigate]
  );

  const submitMock = useCallback(async () => {
    if (openBlockers.length || !approved || submitted) return;
    
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      const data = await res.json();
      setSubmitted(true);
      if (data.auditEvent) {
        setAudit(prev => [...prev, data.auditEvent]);
      }
      setModalOpen(true);
    } catch (e) {
      console.error(e);
      showToast("Failed to submit");
    }
  }, [approved, openBlockers.length, submitted, showToast]);

  const exportAudit = useCallback(() => {
    if (!analyzeResult) return;
    const payload = {
      product: "ComplyPilot RefundShield",
      note: "Synthetic demo audit log. No taxpayer data.",
      runId: analyzeResult.runId,
      ruleProfile: futureRules ? "v2026.10" : "historical",
      score: analyzeResult.score.total,
      events: audit,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "complypilot-demo-audit.json";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Synthetic audit log exported");
  }, [audit, showToast, analyzeResult, futureRules]);

  const resetDemo = useCallback(() => {
    setFutureRules(true);
    setResolved([]);
    setNotice2(false);
    setFiles(13);
    setActiveEvidence("supplier");
    setAudit(INITIAL_AUDIT);
    setApproved(false);
    setSubmitted(false);
    setModalOpen(false);
    fetchAnalysis(true, []);
    navigate("overview");
    showToast("Demo reset to the 68/100 starting state");
  }, [navigate, showToast, fetchAnalysis]);

  if (!analyzeResult) return null; // loading state

  return (
    <div className="shell">
      <Sidebar view={view} onNavigate={navigate} openBlockers={openBlockers.length} />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            <strong>Serendib Export Works</strong>
            <span>October 2026 VAT evidence workspace</span>
          </div>
          <div className="topbar-actions">
            <span
              className={`pill ${analyzeResult.mode === "LIVE_QWEN" ? "live" : "fallback"}`}
              title={
                analyzeResult.fallbackReason ??
                "Fields were extracted by Alibaba Cloud Model Studio for this run."
              }
            >
              <i className="dot" />
              {analyzeResult.mode === "LIVE_QWEN" ? "LIVE QWEN" : "DEMO FALLBACK"}
            </span>
            <button className="button" onClick={resetDemo}>
              Reset
            </button>
            <button className="button primary" onClick={() => navigate("filing")}>
              Review filing
            </button>
          </div>
        </header>

        <div className="content">
          {view === "overview" ? (
            <OverviewView
              result={analyzeResult}
              futureRules={futureRules}
              files={files}
              onAddFiles={addFiles}
              onToggleResolve={toggleResolve}
              onFixAll={fixAll}
              onOpenEvidence={openEvidence}
            />
          ) : null}

          {view === "evidence" ? (
            <EvidenceView
              result={analyzeResult}
              active={activeEvidence}
              onSelect={setActiveEvidence}
              onBack={() => navigate("overview")}
            />
          ) : null}

          {view === "rules" ? (
            <RulesView
              result={analyzeResult}
              futureRules={futureRules}
              notice2={notice2}
              onSetProfile={setProfile}
              onToggleNotice2={toggleNotice2}
            />
          ) : null}

          {view === "filing" ? (
            <FilingView
              result={analyzeResult}
              approved={approved}
              submitted={submitted}
              onApprovalChange={setApproved}
              onSubmit={submitMock}
            />
          ) : null}

          {view === "audit" ? <AuditView events={audit} onExport={exportAudit} /> : null}
        </div>
      </main>

      <Toast message={toast.message} show={toast.show} />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} auditCount={audit.length} />
    </div>
  );
}
