"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuditView } from "@/components/audit-view";
import { BusinessProfileView, type ProfileFormValue } from "@/components/business-profile-view";
import { DataCopilot } from "@/components/data-copilot";
import { EvidenceView } from "@/components/evidence-view";
import { FilingView } from "@/components/filing-view";
import { InvoiceInboxView } from "@/components/invoice-inbox-view";
import { OverviewView } from "@/components/overview-view";
import { PeriodCloseView } from "@/components/period-close-view";
import { PeriodsView, type PeriodFormValue } from "@/components/periods-view";
import { RulesView } from "@/components/rules-view";
import { Sidebar, type ViewId } from "@/components/sidebar";
import { SmartFixView } from "@/components/smart-fix-view";
import { SubmissionHistoryView } from "@/components/submission-history-view";
import { TasksView } from "@/components/tasks-view";
import { Modal, Toast } from "@/components/ui";
import { INITIAL_AUDIT, type AuditEvent } from "@/lib/demo";
import { governmentSources } from "@/lib/government-data";
import type { AnalyzeResult, DataMode } from "@/lib/types";
import type { BusinessWorkspace, WorkspaceTask } from "@/lib/workspace/workspace";

type TaskDraft = Pick<WorkspaceTask, "assignedTo" | "evidenceNote" | "status">;

export default function Page() {
  const [view, setView] = useState<ViewId>("overview");
  const [futureRules, setFutureRules] = useState(true);
  const [resolved, setResolved] = useState<string[]>([]);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [workspace, setWorkspace] = useState<BusinessWorkspace | null>(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice2, setNotice2] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState("supplier");
  const [audit, setAudit] = useState<AuditEvent[]>(INITIAL_AUDIT);
  const [filingConsent, setFilingConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState({ message: "", show: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef<string | null>(null);
  const dataModeRef = useRef<DataMode>("SYNTHETIC_DEMO");
  const initialised = useRef(false);

  const showToast = useCallback((message: string) => {
    setToast({ message, show: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast((current) => ({ ...current, show: false })), 2600);
  }, []);

  const addAudit = useCallback((actor: AuditEvent["actor"], title: string, detail: string) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setAudit((events) => [...events, { time, actor, title, detail }]);
  }, []);

  const navigate = useCallback((next: ViewId) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const postWorkspaceAction = useCallback(async (
    body: Record<string, unknown>,
    options: { silent?: boolean } = {},
  ): Promise<BusinessWorkspace | null> => {
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The workspace could not be updated.");
      setWorkspace(data.workspace);
      setWorkspaceError("");
      return data.workspace as BusinessWorkspace;
    } catch (error) {
      console.error(error);
      if (!options.silent) showToast(error instanceof Error ? error.message : "The workspace could not be updated.");
      return null;
    }
  }, [showToast]);

  const fetchAnalysis = useCallback(async (
    isFuture: boolean,
    currentResolved: string[],
    file?: File,
    requestedMode?: DataMode,
    periodId?: string,
  ): Promise<AnalyzeResult | null> => {
    try {
      const dataMode: DataMode = file ? "USER_PROVIDED" : requestedMode ?? dataModeRef.current;
      const formData = new FormData();
      formData.append("futureRules", String(isFuture));
      formData.append("resolvedBlockers", JSON.stringify(currentResolved));
      formData.append("dataMode", dataMode);
      if (runIdRef.current) formData.append("runId", runIdRef.current);
      if (file) formData.append("file", file);
      const response = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The analysis request failed.");
      const result = data as AnalyzeResult;
      runIdRef.current = result.runId;
      dataModeRef.current = result.dataMode;
      setAnalyzeResult(result);
      setResolved(result.findings.filter((finding) => finding.status === "resolved").map((finding) => finding.id));
      if (result.auditEvents?.length) setAudit((events) => [...events, ...result.auditEvents]);
      const schedule = file?.name.toLowerCase().endsWith(".csv");
      await postWorkspaceAction(
        {
          action: "sync_analysis",
          runId: result.runId,
          ...(periodId ? { periodId } : {}),
          ...(file ? { fileName: file.name, documentType: schedule ? "VAT_SCHEDULE" : "INVOICE" } : {}),
        },
        { silent: true },
      );
      return result;
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Failed to fetch analysis");
      return null;
    }
  }, [postWorkspaceAction, showToast]);

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    let cancelled = false;
    async function initialise() {
      try {
        const response = await fetch("/api/workspace");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "The business workspace is unavailable.");
        const nextWorkspace = data.workspace as BusinessWorkspace;
        if (cancelled) return;
        setWorkspace(nextWorkspace);
        const profile = nextWorkspace.profiles.find((candidate) => candidate.id === nextWorkspace.activeProfileId) ?? nextWorkspace.profiles[0];
        const period = nextWorkspace.periods.find((candidate) => candidate.id === profile.activePeriodId);
        dataModeRef.current = profile.isSynthetic ? "SYNTHETIC_DEMO" : "USER_PROVIDED";
        const completedFindingIds = period
          ? nextWorkspace.tasks.filter((task) => task.periodId === period.id && task.status === "COMPLETED").map((task) => task.findingId)
          : [];
        runIdRef.current = period?.runId ?? null;
        await fetchAnalysis(true, completedFindingIds, undefined, dataModeRef.current, period?.id);
      } catch (error) {
        if (cancelled) return;
        console.error(error);
        setWorkspaceError(error instanceof Error ? error.message : "The business workspace is unavailable.");
      }
    }
    void initialise();
    return () => { cancelled = true; };
  }, [fetchAnalysis]);

  const activeProfile = useMemo(() => {
    if (!workspace) return null;
    return workspace.profiles.find((profile) => profile.id === workspace.activeProfileId) ?? workspace.profiles[0] ?? null;
  }, [workspace]);

  const activePeriod = useMemo(() => {
    if (!workspace || !activeProfile) return null;
    return workspace.periods.find((period) => period.id === activeProfile.activePeriodId && period.profileId === activeProfile.id)
      ?? workspace.periods.find((period) => period.profileId === activeProfile.id)
      ?? null;
  }, [workspace, activeProfile]);

  const openBlockers = useMemo(() => analyzeResult?.findings.filter((finding) => finding.status === "open").map((finding) => finding.id) ?? [], [analyzeResult]);
  const smartFixCount = useMemo(() => analyzeResult?.smartFix.actions.filter((action) => action.decision === "NEEDS_HUMAN").length ?? 0, [analyzeResult]);
  const activeTasks = useMemo(() => workspace && activePeriod ? workspace.tasks.filter((task) => task.periodId === activePeriod.id) : [], [workspace, activePeriod]);
  const inboxCount = useMemo(() => workspace && activePeriod ? workspace.inbox.filter((item) => item.periodId === activePeriod.id).length : 0, [workspace, activePeriod]);

  const toggleResolve = useCallback(async (id: string, evidenceNote: string): Promise<AnalyzeResult | null> => {
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findingId: id, resolvedBlockers: resolved, futureRules, runId: runIdRef.current, evidenceNote }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The finding could not be updated.");
      const result = data as AnalyzeResult;
      runIdRef.current = result.runId;
      setAnalyzeResult(result);
      setResolved(result.findings.filter((finding) => finding.status === "resolved").map((finding) => finding.id));
      if (result.auditEvents?.length) setAudit((events) => [...events, ...result.auditEvents]);
      await postWorkspaceAction({ action: "sync_analysis", runId: result.runId, ...(activePeriod ? { periodId: activePeriod.id } : {}) }, { silent: true });
      showToast(`Evidence accepted · readiness ${result.score.total}/100`);
      return result;
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Failed to complete the task");
      return null;
    }
  }, [activePeriod, futureRules, postWorkspaceAction, resolved, showToast]);

  const queueRescueActions = useCallback(async (ids: string[]) => {
    if (!activePeriod || ids.length === 0) return;
    const updated = await postWorkspaceAction({ action: "queue_tasks", periodId: activePeriod.id, findingIds: ids });
    if (!updated) return;
    addAudit("human", "Rescue actions saved", `${ids.length} selected action${ids.length === 1 ? "" : "s"} added to the period task queue; no finding was auto-resolved.`);
    navigate("tasks");
    showToast(`${ids.length} rescue action${ids.length === 1 ? "" : "s"} saved to Tasks`);
  }, [activePeriod, addAudit, navigate, postWorkspaceAction, showToast]);

  const setRuleProfile = useCallback(async (future: boolean) => {
    if (activePeriod?.status === "APPROVED" || activePeriod?.status === "SUBMITTED") {
      showToast("This period is closed. Create a new VAT period to change its rule profile.");
      return;
    }
    setFutureRules(future);
    await fetchAnalysis(future, resolved, undefined, dataModeRef.current, activePeriod?.id);
    addAudit("agent", "Rule profile changed", future ? "The October 2026 rule pack was activated and the agents re-ran." : "The historical pre-October profile was activated.");
    showToast("Rule profile updated");
  }, [activePeriod, addAudit, fetchAnalysis, resolved, showToast]);

  const toggleNotice2 = useCallback(() => {
    setNotice2((current) => {
      const next = !current;
      addAudit("agent", "Refund clock scenario changed", next ? "Notice 2 compliance moved the scenario start date to 7 Dec 2026." : "The no-Notice-2 scenario was restored.");
      showToast(next ? "Notice 2 scenario applied" : "Standard clock scenario restored");
      return next;
    });
  }, [addAudit, showToast]);

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList?.length || !activePeriod) return;
    if (activePeriod.status === "APPROVED" || activePeriod.status === "SUBMITTED") {
      showToast("This period is closed and cannot accept new documents.");
      return;
    }
    setUploading(true);
    let processed = 0;
    try {
      for (const file of Array.from(fileList)) {
        const result = await fetchAnalysis(futureRules, resolved, file, "USER_PROVIDED", activePeriod.id);
        if (!result) continue;
        processed += 1;
        const schedule = file.name.toLowerCase().endsWith(".csv");
        addAudit("human", schedule ? "VAT Schedule added to period inbox" : "Invoice added to period inbox", `${file.name} was processed and saved under ${activePeriod.label}.`);
      }
      if (processed) showToast(`${processed} document${processed === 1 ? "" : "s"} saved to ${activePeriod.label}`);
    } finally {
      setUploading(false);
    }
  }, [activePeriod, addAudit, fetchAnalysis, futureRules, resolved, showToast]);

  const applySmartFix = useCallback(async (humanValues: Record<string, string>): Promise<boolean> => {
    try {
      const response = await fetch("/api/smart-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: runIdRef.current, futureRules, resolvedBlockers: resolved, humanValues }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The Smart Fix correction could not be applied.");
      const result = data as AnalyzeResult;
      runIdRef.current = result.runId;
      dataModeRef.current = result.dataMode;
      setAnalyzeResult(result);
      setResolved(result.findings.filter((finding) => finding.status === "resolved").map((finding) => finding.id));
      if (result.auditEvents?.length) setAudit((events) => [...events, ...result.auditEvents]);
      await postWorkspaceAction({ action: "sync_analysis", runId: result.runId, ...(activePeriod ? { periodId: activePeriod.id } : {}) });
      showToast(`Corrected invoice revalidated · readiness ${result.score.total}/100`);
      navigate("tasks");
      return true;
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Smart Fix failed");
      return false;
    }
  }, [activePeriod, futureRules, navigate, postWorkspaceAction, resolved, showToast]);

  const activateBusiness = useCallback(async (profileId: string) => {
    const updated = await postWorkspaceAction({ action: "activate_profile", profileId });
    if (!updated) return;
    const profile = updated.profiles.find((candidate) => candidate.id === profileId)!;
    runIdRef.current = null;
    setResolved([]);
    setFilingConsent(false);
    setSubmitted(false);
    dataModeRef.current = profile.isSynthetic ? "SYNTHETIC_DEMO" : "USER_PROVIDED";
    await fetchAnalysis(futureRules, [], undefined, dataModeRef.current, profile.activePeriodId);
  }, [fetchAnalysis, futureRules, postWorkspaceAction]);

  const saveProfile = useCallback(async (profileId: string, profile: ProfileFormValue) => Boolean(await postWorkspaceAction({ action: "update_profile", profileId, profile })), [postWorkspaceAction]);

  const createProfile = useCallback(async (profile: ProfileFormValue) => {
    const updated = await postWorkspaceAction({ action: "create_profile", profile });
    if (!updated) return false;
    const created = updated.profiles.find((candidate) => candidate.id === updated.activeProfileId)!;
    runIdRef.current = null;
    dataModeRef.current = "USER_PROVIDED";
    setResolved([]);
    await fetchAnalysis(futureRules, [], undefined, "USER_PROVIDED", created.activePeriodId);
    showToast("Business profile created with its first VAT period");
    return true;
  }, [fetchAnalysis, futureRules, postWorkspaceAction, showToast]);

  const activatePeriod = useCallback(async (periodId: string) => {
    if (!activeProfile) return;
    const updated = await postWorkspaceAction({ action: "activate_period", profileId: activeProfile.id, periodId });
    if (!updated) return;
    runIdRef.current = null;
    dataModeRef.current = activeProfile.isSynthetic ? "SYNTHETIC_DEMO" : "USER_PROVIDED";
    setResolved([]);
    setFilingConsent(false);
    setSubmitted(false);
    await fetchAnalysis(futureRules, [], undefined, dataModeRef.current, periodId);
    navigate("overview");
  }, [activeProfile, fetchAnalysis, futureRules, navigate, postWorkspaceAction]);

  const createPeriod = useCallback(async (period: PeriodFormValue) => {
    if (!activeProfile) return false;
    const updated = await postWorkspaceAction({ action: "create_period", profileId: activeProfile.id, period });
    if (!updated) return false;
    const profile = updated.profiles.find((candidate) => candidate.id === activeProfile.id)!;
    runIdRef.current = null;
    dataModeRef.current = "USER_PROVIDED";
    setResolved([]);
    setFilingConsent(false);
    setSubmitted(false);
    await fetchAnalysis(futureRules, [], undefined, "USER_PROVIDED", profile.activePeriodId);
    showToast(`${period.label} created and opened`);
    return true;
  }, [activeProfile, fetchAnalysis, futureRules, postWorkspaceAction, showToast]);

  const saveTask = useCallback(async (taskId: string, draft: TaskDraft) => Boolean(await postWorkspaceAction({ action: "update_task", taskId, ...draft })), [postWorkspaceAction]);

  const completeTask = useCallback(async (task: WorkspaceTask, draft: TaskDraft) => {
    if (draft.evidenceNote.trim().length < 8) {
      showToast("Add a short evidence note before completing this task.");
      return false;
    }
    const saved = await postWorkspaceAction({ action: "update_task", taskId: task.id, ...draft, status: "READY_FOR_REVIEW" });
    if (!saved) return false;
    return Boolean(await toggleResolve(task.findingId, draft.evidenceNote));
  }, [postWorkspaceAction, showToast, toggleResolve]);

  const approvePeriod = useCallback(async (reviewer: string) => {
    if (!activePeriod) return false;
    setWorkspaceBusy(true);
    try {
      const updated = await postWorkspaceAction({ action: "approve_period", periodId: activePeriod.id, reviewer });
      if (!updated) return false;
      addAudit("human", "VAT period approved", `${activePeriod.label} passed every closing gate and was approved by ${reviewer}.`);
      showToast(`${activePeriod.label} approved for mock filing`);
      return true;
    } finally {
      setWorkspaceBusy(false);
    }
  }, [activePeriod, addAudit, postWorkspaceAction, showToast]);

  const openEvidence = useCallback((id: string) => {
    setActiveEvidence(id);
    navigate("evidence");
  }, [navigate]);

  const submitMock = useCallback(async () => {
    if (!analyzeResult || !activeProfile || !activePeriod || activePeriod.status !== "APPROVED" || openBlockers.length || !filingConsent || submitted) return;
    try {
      const response = await fetch("/api/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approved: true }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The mock submission was rejected.");
      const updated = await postWorkspaceAction({ action: "record_submission", periodId: activePeriod.id, acknowledgement: data.receiptNumber, readinessScore: analyzeResult.score.total, submittedBy: activeProfile.authorisedReviewer });
      if (!updated) return;
      setReceiptNumber(data.receiptNumber);
      setSubmitted(true);
      if (data.auditEvent) setAudit((events) => [...events, data.auditEvent]);
      setModalOpen(true);
    } catch (error) {
      console.error(error);
      showToast(error instanceof Error ? error.message : "Failed to submit");
    }
  }, [activePeriod, activeProfile, analyzeResult, filingConsent, openBlockers.length, postWorkspaceAction, showToast, submitted]);

  const exportAudit = useCallback(() => {
    if (!analyzeResult || !activeProfile || !activePeriod) return;
    downloadJson("complypilot-audit.json", {
      product: "ComplyPilot RefundShield",
      note: analyzeResult.dataMode === "SYNTHETIC_DEMO" ? "Synthetic demo audit log. No taxpayer data." : "User-provided prototype workspace audit log.",
      organisation: activeProfile.legalName,
      period: activePeriod.label,
      runId: analyzeResult.runId,
      ruleProfile: futureRules ? "v2026.10" : "historical",
      score: analyzeResult.score.total,
      events: audit,
    });
    showToast("Audit log exported");
  }, [activePeriod, activeProfile, analyzeResult, audit, futureRules, showToast]);

  const exportPassport = useCallback(async () => {
    if (!analyzeResult || !activeProfile || !activePeriod) return;
    const exportedAt = new Date();
    const passportEvent: AuditEvent = { time: exportedAt.toLocaleTimeString("en-GB", { hour12: false }), actor: "human", title: "Refund Evidence Passport exported", detail: `A source-dated evidence manifest was exported for ${analyzeResult.runId}.` };
    const passport = {
      schema: "complypilot.refund-evidence-passport.v1",
      passportId: `CP-${analyzeResult.runId}`,
      generatedAt: exportedAt.toISOString(),
      organisation: activeProfile.legalName,
      taxpayerTin: activeProfile.tin,
      vatPeriod: { id: activePeriod.id, label: activePeriod.label, startDate: activePeriod.startDate, endDate: activePeriod.endDate },
      jurisdiction: "Sri Lanka",
      dataMode: analyzeResult.dataMode,
      ruleProfile: futureRules ? "v2026.10" : "historical",
      readiness: { score: analyzeResult.score, gate: analyzeResult.workflow.gate, claimValueUnderReviewLkr: analyzeResult.claimValueUnderReviewLkr },
      evidenceModes: { invoice: analyzeResult.mode, schedule: analyzeResult.scheduleEvidence ? "USER_UPLOADED_CSV" : "NOT_UPLOADED", dataBoundary: analyzeResult.dataMode },
      invoiceExtraction: analyzeResult.invoice,
      vatSchedule: analyzeResult.scheduleEvidence,
      scheduleReconciliation: analyzeResult.scheduleReconciliation,
      findings: analyzeResult.findings,
      savedTasks: activeTasks,
      officialSources: governmentSources.map(({ id, title, url, effectiveFrom, lastVerifiedAt, legalWeight }) => ({ id, title, url, effectiveFrom, lastVerifiedAt, legalWeight })),
      workflow: analyzeResult.workflow,
      auditTrail: [...audit, passportEvent],
      boundaries: { decisionSupportOnly: true, officialIrdRiskRating: false, liveGovernmentSubmission: false, humanApprovalRequired: true },
    };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(passport)));
    const digestHex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    downloadJson(`complypilot-refund-passport-${analyzeResult.runId}.json`, { ...passport, integrity: { algorithm: "SHA-256", digestHex, note: "Tamper-evident content digest; not a government or digital signature." } });
    setAudit((events) => [...events, passportEvent]);
    showToast("Refund Evidence Passport exported");
  }, [activePeriod, activeProfile, activeTasks, analyzeResult, audit, futureRules, showToast]);

  const resetAnalysis = useCallback(async () => {
    if (!activeProfile || !activePeriod) return;
    if (activePeriod.status === "APPROVED" || activePeriod.status === "SUBMITTED") {
      showToast("This period is closed. Its approved analysis is read-only.");
      return;
    }
    runIdRef.current = null;
    const mode: DataMode = activeProfile.isSynthetic ? "SYNTHETIC_DEMO" : "USER_PROVIDED";
    dataModeRef.current = mode;
    setFutureRules(true);
    setResolved([]);
    setNotice2(false);
    setActiveEvidence("supplier");
    setAudit(INITIAL_AUDIT);
    setFilingConsent(false);
    setSubmitted(false);
    setReceiptNumber("");
    setModalOpen(false);
    await fetchAnalysis(true, [], undefined, mode, activePeriod.id);
    navigate("overview");
    showToast("Active-period analysis reset");
  }, [activePeriod, activeProfile, fetchAnalysis, navigate, showToast]);

  if (!workspace || !activeProfile || !activePeriod || !analyzeResult) {
    return (
      <main className="workspace-loading">
        <div className="brand-mark">CP</div>
        <h1>{workspaceError ? "Workspace unavailable" : "Opening your VAT workspace…"}</h1>
        <p>{workspaceError || "Loading business profiles, VAT periods and the current analysis."}</p>
        {workspaceError ? <button className="button primary" onClick={() => window.location.reload()}>Retry</button> : null}
      </main>
    );
  }

  const periodApproved = activePeriod.status === "APPROVED" || activePeriod.status === "SUBMITTED";
  return (
    <div className="shell">
      <Sidebar view={view} onNavigate={navigate} openBlockers={openBlockers.length} smartFixCount={smartFixCount} taskCount={activeTasks.filter((task) => task.status !== "COMPLETED").length} />
      <main className="main">
        <header className="topbar">
          <div className="topbar-title"><strong>{activeProfile.displayName}</strong><span>{activePeriod.label} · {activePeriod.status.replaceAll("_", " ")}</span></div>
          <div className="topbar-actions">
            <span className={`pill ${analyzeResult.dataMode === "USER_PROVIDED" ? "live" : "fallback"}`}><i className="dot" />{analyzeResult.dataMode === "USER_PROVIDED" ? "USER DATA" : "SYNTHETIC DEMO"}</span>
            <span className={`pill ${analyzeResult.mode === "LIVE_QWEN" ? "live" : "fallback"}`} title={analyzeResult.fallbackReason ?? "Fields were extracted by Alibaba Cloud Model Studio for this run."}><i className="dot" />AI: {analyzeResult.mode === "LIVE_QWEN" ? "LIVE QWEN" : "DEMO FALLBACK"}</span>
            <span className={`pill ${analyzeResult.workflow.mode === "LIVE_MULERUN" ? "live" : "fallback"}`} title={analyzeResult.workflow.fallbackReason ?? `MuleRun execution ${analyzeResult.workflow.executionId ?? ""}`}><i className="dot" />Workflow: {analyzeResult.workflow.mode === "LIVE_MULERUN" ? "LIVE MULERUN" : analyzeResult.workflow.muleRunAttempted ? "LOCAL FALLBACK" : "LOCAL"}</span>
            <button className="button" onClick={() => void resetAnalysis()}>Reset analysis</button>
            <button className="button primary" onClick={() => navigate(periodApproved ? "filing" : "period-close")}>{periodApproved ? "Open filing" : "Close period"}</button>
          </div>
        </header>
        <div className="content">
          {view === "overview" ? <OverviewView result={analyzeResult} futureRules={futureRules} files={inboxCount} onAddFiles={addFiles} onToggleResolve={(id) => navigate(id === "invoice" ? "smart-fix" : "tasks")} onQueueRescueActions={queueRescueActions} onOpenEvidence={openEvidence} onExportPassport={exportPassport} onOpenSmartFix={() => navigate("smart-fix")} /> : null}
          {view === "inbox" ? <InvoiceInboxView workspace={workspace} profile={activeProfile} period={activePeriod} busy={uploading} onAddFiles={addFiles} /> : null}
          {view === "tasks" ? <TasksView workspace={workspace} profile={activeProfile} period={activePeriod} onSave={saveTask} onComplete={completeTask} onOpenSmartFix={() => navigate("smart-fix")} /> : null}
          {view === "period-close" ? <PeriodCloseView workspace={workspace} profile={activeProfile} period={activePeriod} result={analyzeResult} busy={workspaceBusy} onApprove={approvePeriod} onOpenProfile={() => navigate("business")} onOpenInbox={() => navigate("inbox")} onOpenTasks={() => navigate("tasks")} onContinue={() => navigate("filing")} /> : null}
          {view === "evidence" ? <EvidenceView result={analyzeResult} active={activeEvidence} onSelect={setActiveEvidence} onBack={() => navigate("overview")} /> : null}
          {view === "smart-fix" ? <SmartFixView result={analyzeResult} onSetProfile={setRuleProfile} onApprove={applySmartFix} onBack={() => navigate("tasks")} /> : null}
          {view === "rules" ? <RulesView result={analyzeResult} futureRules={futureRules} notice2={notice2} onSetProfile={setRuleProfile} onToggleNotice2={toggleNotice2} onAgentEvent={addAudit} /> : null}
          {view === "periods" ? <PeriodsView workspace={workspace} profile={activeProfile} onActivate={activatePeriod} onCreate={createPeriod} onOpenSubmissions={() => navigate("submissions")} /> : null}
          {view === "submissions" ? <SubmissionHistoryView workspace={workspace} profile={activeProfile} /> : null}
          {view === "business" ? <BusinessProfileView workspace={workspace} onActivate={activateBusiness} onSave={saveProfile} onCreate={createProfile} /> : null}
          {view === "filing" ? <FilingView result={analyzeResult} approved={filingConsent} submitted={submitted || activePeriod.status === "SUBMITTED"} periodApproved={periodApproved} periodLabel={activePeriod.label} documentCount={inboxCount} onApprovalChange={setFilingConsent} onSubmit={submitMock} onAgentEvent={(title, detail) => addAudit("agent", title, detail)} /> : null}
          {view === "audit" ? <AuditView events={audit} onExport={exportAudit} /> : null}
        </div>
      </main>
      <Toast message={toast.message} show={toast.show} />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} auditCount={audit.length} receiptNumber={receiptNumber} />
      <DataCopilot runId={analyzeResult.runId} contextVersion={`${activeProfile.id}:${activePeriod.id}:${analyzeResult.dataMode}:${analyzeResult.mode}:${analyzeResult.workflow.mode}:${analyzeResult.score.total}:${analyzeResult.invoice?.invoiceNumber?.value ?? "no-invoice"}:${analyzeResult.scheduleReconciliation.status}:${analyzeResult.findings.map((finding) => `${finding.id}-${finding.status}`).join("|")}`} onAuditEvent={(mode) => addAudit("agent", "Data Copilot answered from the current run", mode === "LIVE_QWEN" ? "Qwen answered using the structured case and official-reference context." : "A deterministic grounded fallback answered because live Qwen was unavailable.")} />
    </div>
  );
}

function downloadJson(fileName: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
