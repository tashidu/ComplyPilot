"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuditView } from "@/components/audit-view";
import { AccountView } from "@/components/account-view";
import { WelcomeGate } from "@/components/welcome-gate";
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
import { RamisApiView, type RamisApiDraft } from "@/components/ramis-api-view";
import { InvoiceRegisterView } from "@/components/invoice-register-view";
import { VatInvoiceBuilder, type VatInvoiceDraft } from "@/components/vat-invoice-builder";
import { VatLedgerView, type VatTransactionDraft } from "@/components/vat-ledger-view";
import { VatLifecycleView } from "@/components/vat-lifecycle-view";
import { VatReturnView } from "@/components/vat-return-view";
import { VatSchedulesView } from "@/components/vat-schedules-view";
import { VatRegistrationView, type RegistrationDraft } from "@/components/vat-registration-view";
import { Modal, Toast } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkflowTrace } from "@/components/workflow-trace";
import { type AuditEvent } from "@/lib/demo";
import { governmentSources } from "@/lib/government-data";
import type { AnalyzeResult, DataMode } from "@/lib/types";
import type { AuthUser } from "@/lib/auth/types";
import type { BusinessWorkspace, GeneratedVatInvoice, VatScheduleCode, VatTransaction, WorkspaceTask } from "@/lib/workspace/workspace";

type TaskDraft = Pick<WorkspaceTask, "assignedTo" | "evidenceNote" | "status">;

/** Remembers that this browser chose to continue without an account. */
const GUEST_CHOICE_KEY = "cp_guest_choice";

export default function Page() {
  const [view, setView] = useState<ViewId>("lifecycle");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Cosmetic only (which shortcut hint to print); both Cmd+B and Ctrl+B
  // always work regardless of this value, so a wrong guess during SSR is
  // harmless and self-corrects once mounted.
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);
  const [futureRules, setFutureRules] = useState(true);
  const [resolved, setResolved] = useState<string[]>([]);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [workspace, setWorkspace] = useState<BusinessWorkspace | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  /**
   * Whether the welcome screen has been answered. Null until the browser has
   * been read, so the server render and the first client render agree.
   */
  const [guestChoice, setGuestChoice] = useState<boolean | null>(null);
  /**
   * A draft the copilot prepared, waiting to be reviewed in its form. The token
   * makes each handover land once, so returning to the view later does not
   * silently refill a form the user has since edited.
   */
  const [copilotDraft, setCopilotDraft] = useState<
    { kind: "invoice_draft" | "ledger_draft"; token: string; fields: Record<string, unknown> } | null
  >(null);
  const [workspaceError, setWorkspaceError] = useState("");
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice2, setNotice2] = useState(false);
  const [activeEvidence, setActiveEvidence] = useState("supplier");
  const [audit, setAudit] = useState<AuditEvent[]>([]);
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

  /**
   * Records something that happened.
   *
   * Written to the screen immediately and to the workspace behind it, so the
   * trail survives a reload. A trail that only lives in React state is not an
   * audit trail; it is a transcript that disappears when the tab does. The
   * persist is deliberately not awaited - an entry failing to store must never
   * be able to block the action it was describing.
   */
  const addAudit = useCallback((actor: AuditEvent["actor"], title: string, detail: string) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setAudit((events) => [...events, { time, actor, title, detail }]);
    void fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "append_audit_events", events: [{ actor, title, detail }] }),
    }).catch(() => {
      // Storage is best-effort; the entry is already on screen.
    });
  }, []);

  const navigate = useCallback((next: ViewId) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // Drawer collapse: Cmd+B on macOS, Ctrl+B elsewhere - matches the app bar's
  // hamburger toggle so either method works from anywhere in the app.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
    // localStorage is read here rather than during render: it does not exist on
    // the server, and reading it in render would desync hydration. A browser
    // that blocks storage simply sees the welcome screen again.
    try {
      setGuestChoice(window.localStorage.getItem(GUEST_CHOICE_KEY) === "1");
    } catch {
      setGuestChoice(false);
    }
  }, []);

  const applyCopilotProposal = useCallback(
    (kind: "invoice_draft" | "ledger_draft", fields: Record<string, unknown>) => {
      setCopilotDraft({ kind, fields, token: `${kind}-${Date.now()}` });
      navigate(kind === "invoice_draft" ? "invoice-builder" : "vat-ledger");
      addAudit(
        "agent",
        kind === "invoice_draft" ? "Copilot drafted a tax invoice" : "Copilot drafted a ledger entry",
        "Prepared for review in the form. Nothing was issued or recorded by the copilot.",
      );
      showToast("Draft opened for review - check it, then save");
    },
    [addAudit, navigate, showToast],
  );

  const chooseGuest = useCallback(() => {
    try {
      window.localStorage.setItem(GUEST_CHOICE_KEY, "1");
    } catch {
      // Storage is unavailable; the visitor continues and is asked again next
      // visit. Entry is never blocked on being able to remember the answer.
    }
    setGuestChoice(true);
  }, []);

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
        // The stored trail, replayed. Without this the persist would be
        // write-only and the screen would still start blank on every reload.
        setAudit(
          (nextWorkspace.auditEvents ?? []).map((event) => ({
            time: new Date(event.at).toLocaleTimeString("en-GB", { hour12: false }),
            actor: event.actor,
            title: event.title,
            detail: event.detail,
          })),
        );
        setAuthUser((data.user as AuthUser | null) ?? null);
        const profile = nextWorkspace.profiles.find((candidate) => candidate.id === nextWorkspace.activeProfileId) ?? nextWorkspace.profiles[0];
        const period = nextWorkspace.periods.find((candidate) => candidate.id === profile.activePeriodId);
        dataModeRef.current = profile.isSynthetic ? "SYNTHETIC_DEMO" : "USER_PROVIDED";
        const completedFindingIds = period
          ? nextWorkspace.tasks.filter((task) => task.periodId === period.id && task.status === "COMPLETED").map((task) => task.findingId)
          : [];
        runIdRef.current = period?.runId ?? null;
        // fetchAnalysis reports its own failures and resolves to null rather
        // than throwing, so the catch below never sees one. Without this check
        // a failed first analysis left the app on "Opening your VAT workspace"
        // for good: no message, and no Retry, because that button only appears
        // once an error has been recorded.
        const analysis = await fetchAnalysis(true, completedFindingIds, undefined, dataModeRef.current, period?.id);
        if (cancelled) return;
        if (!analysis) {
          setWorkspaceError(
            "Your business data loaded, but the first analysis did not complete, so the workspace could not open. Retry, or check that the analysis service is reachable.",
          );
        }
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

  const saveVatRegistration = useCallback(async (application: RegistrationDraft) => {
    if (!activeProfile) return false;
    const updated = await postWorkspaceAction({ action: "save_vat_registration", profileId: activeProfile.id, application });
    if (updated) showToast("VAT registration progress saved");
    return Boolean(updated);
  }, [activeProfile, postWorkspaceAction, showToast]);

  const confirmVatRegistration = useCallback(async (effectiveDate: string, certificateReference: string) => {
    if (!activeProfile) return false;
    const updated = await postWorkspaceAction({ action: "confirm_vat_registration", profileId: activeProfile.id, effectiveDate, certificateReference });
    if (updated) showToast("VAT registration confirmation saved");
    return Boolean(updated);
  }, [activeProfile, postWorkspaceAction, showToast]);

  const saveRamisApiProfile = useCallback(async (integration: RamisApiDraft) => {
    if (!activeProfile) return false;
    const updated = await postWorkspaceAction({ action: "save_ramis_api_profile", profileId: activeProfile.id, integration });
    if (updated) showToast("RAMIS API onboarding record saved");
    return Boolean(updated);
  }, [activeProfile, postWorkspaceAction, showToast]);

  const createVatTransaction = useCallback(async (transaction: VatTransactionDraft) => {
    if (!activeProfile || !activePeriod) return false;
    const updated = await postWorkspaceAction({ action: "create_vat_transaction", profileId: activeProfile.id, periodId: activePeriod.id, transaction });
    if (updated) showToast("Transaction added to the VAT ledger");
    return Boolean(updated);
  }, [activePeriod, activeProfile, postWorkspaceAction, showToast]);

  const saveScheduleDetails = useCallback(async (code: VatScheduleCode, entries: { transactionId: string; values: Record<string, string> }[]) => {
    if (!activeProfile) return false;
    setWorkspaceBusy(true);
    try {
      const updated = await postWorkspaceAction({ action: "save_schedule_details", profileId: activeProfile.id, code, entries });
      if (updated) {
        showToast(`Schedule ${code} details saved`);
        addAudit("human", "Schedule details supplied", `${entries.length} row(s) on schedule ${code} were completed with facts read from the source documents.`);
      }
      return Boolean(updated);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [activeProfile, addAudit, postWorkspaceAction, showToast]);

  const buildVatSchedules = useCallback(async () => {
    if (!activeProfile || !activePeriod) return false;
    setWorkspaceBusy(true);
    const updated = await postWorkspaceAction({ action: "build_vat_schedules", profileId: activeProfile.id, periodId: activePeriod.id });
    setWorkspaceBusy(false);
    if (updated) showToast("IRD Schedule 01 and 02 built from the current ledger");
    return Boolean(updated);
  }, [activePeriod, activeProfile, postWorkspaceAction, showToast]);

  const approveVatSchedule = useCallback(async (batchId: string) => {
    if (!activeProfile) return false;
    setWorkspaceBusy(true);
    const updated = await postWorkspaceAction({ action: "approve_vat_schedule", batchId, reviewer: activeProfile.authorisedReviewer || "Authorised reviewer" });
    setWorkspaceBusy(false);
    if (updated) showToast("Schedule approved with a saved human review record");
    return Boolean(updated);
  }, [activeProfile, postWorkspaceAction, showToast]);

  const confirmScheduleVerification = useCallback(async (batchId: string) => {
    setWorkspaceBusy(true);
    const updated = await postWorkspaceAction({ action: "confirm_schedule_verification", batchId });
    setWorkspaceBusy(false);
    if (updated) showToast("External IRD verifier pass recorded");
    return Boolean(updated);
  }, [postWorkspaceAction, showToast]);

  const issueVatInvoice = useCallback(async (invoice: GeneratedVatInvoice) => {
    if (!activeProfile) return false;
    setWorkspaceBusy(true);
    try {
      const updated = await postWorkspaceAction({ action: "issue_vat_invoice", profileId: activeProfile.id, invoiceId: invoice.id });
      if (updated) {
        showToast(`${invoice.invoiceNumber} marked issued`);
        addAudit("human", "Tax invoice issued", `${invoice.invoiceNumber} was marked as issued to ${invoice.purchaserName}.`);
      }
      return Boolean(updated);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [activeProfile, addAudit, postWorkspaceAction, showToast]);

  const voidVatInvoice = useCallback(async (invoice: GeneratedVatInvoice, reason: string) => {
    if (!activeProfile) return false;
    setWorkspaceBusy(true);
    try {
      const updated = await postWorkspaceAction({ action: "void_vat_invoice", profileId: activeProfile.id, invoiceId: invoice.id, reason });
      if (updated) {
        showToast(`${invoice.invoiceNumber} voided`);
        addAudit("human", "Tax invoice voided", `${invoice.invoiceNumber} was withdrawn and its output VAT removed from the period. Reason: ${reason}`);
      }
      return Boolean(updated);
    } finally {
      setWorkspaceBusy(false);
    }
  }, [activeProfile, addAudit, postWorkspaceAction, showToast]);

  const deleteVatTransaction = useCallback(async (transaction: VatTransaction) => {
    if (!activeProfile) return false;
    const updated = await postWorkspaceAction({ action: "delete_vat_transaction", profileId: activeProfile.id, transactionId: transaction.id });
    if (updated) {
      showToast("Transaction removed from the ledger");
      addAudit("human", "VAT ledger entry removed", `${transaction.invoiceNumber} (${transaction.kind}) was deleted before the period closed.`);
    }
    return Boolean(updated);
  }, [activeProfile, addAudit, postWorkspaceAction, showToast]);

  /**
   * Opens a new draft carrying an existing invoice's details.
   *
   * This is the replacement half of void-and-reissue, and the correction path
   * for anything already issued: the original keeps its number and its void
   * reason, and the copy is saved as a fresh serial rather than overwriting a
   * document the purchaser may already hold.
   */
  const duplicateVatInvoice = useCallback((invoice: GeneratedVatInvoice) => {
    setCopilotDraft({
      kind: "invoice_draft",
      token: `duplicate-${invoice.id}-${Date.now()}`,
      fields: {
        invoiceDate: invoice.invoiceDate,
        supplyDate: invoice.supplyDate,
        classificationCode: invoice.classificationCode,
        treatment: invoice.treatment,
        supplyType: invoice.supplyType,
        purchaserName: invoice.purchaserName,
        purchaserTin: invoice.purchaserTin,
        purchaserAddress: invoice.purchaserAddress,
        placeOfSupply: invoice.placeOfSupply,
        paymentMode: invoice.paymentMode,
        lines: invoice.lines.map((line) => ({ description: line.description, quantity: line.quantity, unitPriceLkr: line.unitPriceLkr })),
      },
    });
    navigate("invoice-builder");
    addAudit("human", "Tax invoice duplicated", `A new draft was prefilled from ${invoice.invoiceNumber}. It receives its own serial when saved.`);
    showToast("Draft prefilled - review it, then save");
  }, [addAudit, navigate, showToast]);

  const createVatInvoice = useCallback(async (invoice: VatInvoiceDraft): Promise<GeneratedVatInvoice | null> => {
    if (!activeProfile || !activePeriod) return null;
    const updated = await postWorkspaceAction({ action: "create_vat_invoice", profileId: activeProfile.id, periodId: activePeriod.id, invoice });
    if (!updated) return null;
    const generated = updated.generatedInvoices.find((item) => item.profileId === activeProfile.id && item.periodId === activePeriod.id) ?? null;
    if (generated) showToast(`${generated.invoiceNumber} generated and added to output VAT`);
    return generated;
  }, [activePeriod, activeProfile, postWorkspaceAction, showToast]);

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
    setAudit([]);
    setFilingConsent(false);
    setSubmitted(false);
    setReceiptNumber("");
    setModalOpen(false);
    await fetchAnalysis(true, [], undefined, mode, activePeriod.id);
    navigate("overview");
    showToast("Active-period analysis reset");
  }, [activePeriod, activeProfile, fetchAnalysis, navigate, showToast]);

  // The welcome screen precedes the workspace load, so a visitor sees a choice
  // immediately instead of a spinner. A signed-in visitor never sees it.
  if (guestChoice === null) return null;
  if (!authUser && !guestChoice) {
    return (
      <WelcomeGate
        onGuest={chooseGuest}
        onAuthenticated={(user) => {
          setAuthUser(user);
          chooseGuest();
        }}
      />
    );
  }

  if (!workspace || !activeProfile || !activePeriod || !analyzeResult) {
    return (
      <main className="workspace-loading">
        <img src="/logo.png" alt="ComplyPilot" className="brand-mark" />
        <h1>{workspaceError ? "Workspace unavailable" : "Opening your VAT workspace…"}</h1>
        <p>{workspaceError || "Loading business profiles, VAT periods and the current analysis."}</p>
        {workspaceError ? <button className="button primary" onClick={() => window.location.reload()}>Retry</button> : null}
      </main>
    );
  }

  const periodApproved = activePeriod.status === "APPROVED" || activePeriod.status === "SUBMITTED";
  return (
    <div className={`shell${sidebarCollapsed ? " collapsed" : ""}`}>
      <Sidebar view={view} onNavigate={navigate} openBlockers={openBlockers.length} smartFixCount={smartFixCount} taskCount={activeTasks.filter((task) => task.status !== "COMPLETED").length} collapsed={sidebarCollapsed} user={authUser} />
      <main className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button drawer-toggle"
            onClick={() => setSidebarCollapsed((current) => !current)}
            aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
            aria-pressed={sidebarCollapsed}
            title={`${sidebarCollapsed ? "Expand" : "Collapse"} navigation (${isMac ? "⌘B" : "Ctrl+B"})`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="topbar-title"><strong>{activeProfile.displayName}</strong><span>{activePeriod.label} · {activePeriod.status.replaceAll("_", " ")}</span></div>
          <div className="topbar-actions">

            <ThemeToggle />
            <button className="account-chip" onClick={() => navigate("account")} title={authUser ? authUser.email : "Guest demo session"}><span>{authUser ? authUser.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() : "G"}</span>{authUser ? authUser.fullName.split(" ")[0] : "Guest"}</button>
            <button className="button" onClick={() => void resetAnalysis()}>Reset analysis</button>
            <button className="button primary" onClick={() => navigate(periodApproved ? "filing" : "period-close")}>{periodApproved ? "Open filing" : "Close period"}</button>
          </div>
        </header>
        <div className="content-shell">
        <div className="content">
          {view === "lifecycle" ? <VatLifecycleView user={authUser} workspace={workspace} profile={activeProfile} onNavigate={navigate} /> : null}
          {view === "account" ? <AccountView user={authUser} onAuthenticated={setAuthUser} /> : null}
          {view === "vat-registration" ? <VatRegistrationView workspace={workspace} profile={activeProfile} onSave={saveVatRegistration} onOpenProfile={() => navigate("business")} onConfirmRegistration={confirmVatRegistration} /> : null}
          {view === "ramis-api" ? <RamisApiView workspace={workspace} profile={activeProfile} onSave={saveRamisApiProfile} onOpenRegistration={() => navigate("vat-registration")} /> : null}
          {view === "vat-ledger" ? <VatLedgerView workspace={workspace} profile={activeProfile} period={activePeriod} onSave={createVatTransaction} onDelete={deleteVatTransaction} onCreateInvoice={() => navigate("invoice-builder")} extraction={analyzeResult?.invoice ?? null} extractionMode={analyzeResult?.mode} prefill={copilotDraft?.kind === "ledger_draft" ? copilotDraft : null} /> : null}
          {view === "vat-schedules" ? <VatSchedulesView workspace={workspace} profile={activeProfile} period={activePeriod} busy={workspaceBusy} onBuild={buildVatSchedules} onApprove={approveVatSchedule} onVerify={confirmScheduleVerification} onSaveDetails={saveScheduleDetails} onOpenLedger={() => navigate("vat-ledger")} onOpenReturn={() => navigate("vat-return")} /> : null}
          {view === "invoice-register" ? <InvoiceRegisterView workspace={workspace} profile={activeProfile} busy={workspaceBusy} onIssue={issueVatInvoice} onVoid={voidVatInvoice} onDuplicate={duplicateVatInvoice} onCreate={() => navigate("invoice-builder")} /> : null}
          {view === "invoice-builder" ? <VatInvoiceBuilder profile={activeProfile} period={activePeriod} generated={workspace.generatedInvoices.filter((item) => item.profileId === activeProfile.id && item.periodId === activePeriod.id)} onSave={createVatInvoice} prefill={copilotDraft?.kind === "invoice_draft" ? copilotDraft : null} /> : null}
          {view === "vat-return" ? <VatReturnView workspace={workspace} profile={activeProfile} period={activePeriod} onOpenLedger={() => navigate("vat-ledger")} onOpenSchedules={() => navigate("vat-schedules")} onClosePeriod={() => navigate("period-close")} onFile={() => navigate("filing")} /> : null}
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
        {view === "overview" ? (
          <aside className="trace-rail" aria-label="Pipeline trace">
            <WorkflowTrace result={analyzeResult} />
          </aside>
        ) : null}
        </div>
      </main>
      <Toast message={toast.message} show={toast.show} />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} auditCount={audit.length} receiptNumber={receiptNumber} />
      <DataCopilot runId={analyzeResult.runId} contextVersion={`${activeProfile.id}:${activePeriod.id}:${workspace.vatRegistrations.find((item) => item.profileId === activeProfile.id)?.updatedAt ?? "no-registration"}:${workspace.vatTransactions.filter((item) => item.periodId === activePeriod.id).length}:${workspace.generatedInvoices.length}:${analyzeResult.dataMode}:${analyzeResult.mode}:${analyzeResult.workflow.mode}:${analyzeResult.score.total}:${analyzeResult.invoice?.invoiceNumber?.value ?? "no-invoice"}:${analyzeResult.scheduleReconciliation.status}:${analyzeResult.findings.map((finding) => `${finding.id}-${finding.status}`).join("|")}`} onApplyProposal={applyCopilotProposal} onAuditEvent={(mode, model) => addAudit("agent", "VAT Copilot answered from trusted context", mode === "LIVE_MODEL" ? `${model ?? "The configured model"} answered using the business, registration, case and official-reference context.` : "A deterministic grounded fallback answered because no conversational model was reachable.")} />
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
