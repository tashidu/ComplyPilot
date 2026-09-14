import type { InvoiceExtraction } from "../ai/extraction-schema";
import { vatInvoiceRulePack } from "../government-data";
import type { SmartFixAction, SmartFixPlan } from "../types";
import { validateInvoiceRules } from "./document-agent";

const DISCLAIMER =
  "AI-assisted draft only. Missing registration facts are never invented, invoice sequence must be verified, and an authorised human or supplier must approve any correction.";

function proposalFor(
  key: string,
): { value: string | number | boolean | null; decision: SmartFixAction["decision"]; reason: string } {
  if (key === "invoiceTitle") {
    return {
      value: "TAX INVOICE",
      decision: "AI_DRAFT",
      reason: "The active rule pack requires a conspicuous TAX INVOICE title.",
    };
  }
  if (key === "currency") {
    return {
      value: "LKR",
      decision: "AI_DRAFT",
      reason: "The active rule pack requires values to be stated in Sri Lankan Rupees.",
    };
  }
  if (key === "invoiceNumber") {
    return {
      value: null,
      decision: "NEEDS_HUMAN",
      reason: "The agent can validate the format, but an authorised user must confirm the real invoice sequence.",
    };
  }
  return {
    value: null,
    decision: "NEEDS_HUMAN",
    reason: "This is a source fact. The agent must obtain it from an authorised human or supporting evidence.",
  };
}

function applyDraftValue(
  draft: Record<string, unknown>,
  extractionPath: string,
  value: string | number | boolean | null,
) {
  if (value === null || extractionPath.startsWith("lineItems[].")) return;
  const key = extractionPath.split(".")[0];
  const current = draft[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    draft[key] = { ...(current as Record<string, unknown>), value, source: "AI correction draft" };
  }
}

export function createSmartFixPlan(
  extraction: InvoiceExtraction | null,
  isFutureRules: boolean,
): SmartFixPlan {
  if (!extraction) {
    return {
      status: "NO_INVOICE",
      actions: [],
      autoDraftCount: 0,
      humanInputCount: 0,
      draftInvoice: null,
      disclaimer: DISCLAIMER,
    };
  }

  if (!isFutureRules) {
    return {
      status: "NOT_APPLICABLE",
      actions: [],
      autoDraftCount: 0,
      humanInputCount: 0,
      draftInvoice: extraction as unknown as Record<string, unknown>,
      disclaimer: `The ${vatInvoiceRulePack.version} rule pack is not active for this scenario. ${DISCLAIMER}`,
    };
  }

  const issues = validateInvoiceRules(extraction);
  const draft = structuredClone(extraction) as unknown as Record<string, unknown>;
  const actions = issues.map<SmartFixAction>((issue) => {
    const proposal = proposalFor(issue.key);
    applyDraftValue(draft, issue.extractionPath, proposal.value);
    return {
      field: issue.key,
      label: issue.label,
      observedValue: issue.value,
      suggestedValue: proposal.value,
      decision: proposal.decision,
      reason: proposal.reason,
      confidence: issue.confidence,
      ruleId: "DOC-021",
      sourceIds: vatInvoiceRulePack.sourceIds,
    };
  });

  return {
    status: actions.length === 0 ? "COMPLIANT" : "NEEDS_REVIEW",
    actions,
    autoDraftCount: actions.filter((action) => action.decision === "AI_DRAFT").length,
    humanInputCount: actions.filter((action) => action.decision === "NEEDS_HUMAN").length,
    draftInvoice: draft,
    disclaimer: DISCLAIMER,
  };
}
