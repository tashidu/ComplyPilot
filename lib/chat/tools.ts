import { z } from "zod";
import {
  calculateVat,
  resolveTransactionVat,
  scheduleFor,
  summariseVatPeriod,
  totalInvoiceLines,
} from "../vat-operations";
import { governmentSources, vatInvoiceRulePack, vatRates } from "../government-data";
import { selectInvoiceRuleProfile } from "../rules/rule-selection";
import { resolveInvoiceDirection } from "../rules/invoice-direction";
import { filterInvoices, summariseInvoices } from "../vat-invoice-register";
import { transactionsForSchedule, validateOfficialSchedule } from "../vat-schedule-export";
import type { AnalyzeResult } from "../types";
import type { BusinessWorkspace } from "../workspace/workspace";

/**
 * What the VAT copilot may do on its own, and what it may only propose.
 *
 * The split is the one the rest of the product already uses. Reading and
 * calculating change nothing, so the copilot does them freely. Anything that
 * would create a record - a tax invoice, a ledger entry - comes back as a draft
 * for a person to review and save. A language model deciding by itself to issue
 * a tax invoice is not a feature.
 *
 * Every number a tool returns comes from the same deterministic functions the
 * rest of the app uses. The model picks the tool and explains the result; it
 * never does the arithmetic.
 */

export type ToolContext = {
  analysis: AnalyzeResult;
  workspace: BusinessWorkspace;
};

export type ToolProposal = {
  kind: "invoice_draft" | "ledger_draft";
  summary: string;
  /** Pre-filled values for the matching form. The user reviews and saves. */
  fields: Record<string, unknown>;
  /** What a person must check before saving, in their own words. */
  reviewNotes: string[];
};

export type ToolResult = {
  /** Returned to the model so it can continue its answer. */
  content: string;
  /** Surfaced to the user as a reviewable draft, when the tool proposes one. */
  proposal?: ToolProposal;
};

const money = (value: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR" }).format(value);

const TREATMENTS = ["STANDARD_18", "ZERO_RATED", "EXEMPT", "OUT_OF_SCOPE"] as const;

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "get_case_position",
      description:
        "The current run's readiness score, open blockers, claim value under review and filing gate. Use before answering anything about where this case stands.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "calculate_vat",
      description:
        "Deterministically compute VAT on a net amount. Always use this rather than doing the arithmetic yourself.",
      parameters: {
        type: "object",
        properties: {
          netAmountLkr: { type: "number", description: "Net amount in LKR, excluding VAT." },
          treatment: { type: "string", enum: TREATMENTS },
        },
        required: ["netAmountLkr", "treatment"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_period_position",
      description:
        "Output VAT, input VAT, disallowed input, and whether the period is payable or in excess credit.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "lookup_rule",
      description:
        "Look up the invoice rule pack, the VAT rates, or the official sources. Cite what this returns; never answer a rule question from memory.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", enum: ["invoice_format", "vat_rates", "sources"] },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "check_invoice_direction",
      description:
        "Decide from the two TINs whether an invoice is a sale the business issued or a purchase a supplier issued. Determines whether it may be corrected here or must go back to the supplier.",
      parameters: {
        type: "object",
        properties: {
          sellerTin: { type: "string" },
          buyerTin: { type: "string" },
        },
        required: ["sellerTin", "buyerTin"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_invoices",
      description:
        "Search the tax invoices this business has generated, by number, purchaser, TIN or status, and get the register totals. Use for questions about what has been issued, what is still draft, and what was voided. Void invoices are excluded from the money totals.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Invoice number, purchaser name, TIN or classification code. Omit to list all." },
          status: { type: "string", enum: ["ALL", "DRAFT", "ISSUED", "VOID"] },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_schedule_status",
      description:
        "State of the official IRD Schedule 01 and 02 for the active period: how many rows each carries, whether a batch has been built and approved, and every validation issue blocking it. Use for questions about whether the schedules are ready to file and what is stopping them.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_tax_invoice",
      description:
        "Prepare a compliant tax invoice for the user to review and save. Issues nothing. Use when the user asks to create or generate an invoice.",
      parameters: {
        type: "object",
        properties: {
          purchaserName: { type: "string" },
          purchaserTin: { type: "string", description: "Nine digits, or empty when unknown." },
          purchaserAddress: { type: "string" },
          invoiceDate: { type: "string", description: "YYYY-MM-DD" },
          supplyDate: { type: "string", description: "YYYY-MM-DD" },
          treatment: { type: "string", enum: TREATMENTS },
          lines: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                quantity: { type: "number" },
                unitPriceLkr: { type: "number" },
              },
              required: ["description", "quantity", "unitPriceLkr"],
            },
          },
        },
        required: ["purchaserName", "invoiceDate", "treatment", "lines"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "draft_ledger_entry",
      description:
        "Prepare a VAT ledger transaction for the user to review and save. Records nothing.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["OUTPUT", "INPUT_LOCAL", "INPUT_IMPORT"] },
          treatment: { type: "string", enum: TREATMENTS },
          supplyType: { type: "string", enum: ["GOODS", "SERVICES"] },
          counterpartyName: { type: "string" },
          counterpartyTin: { type: "string" },
          invoiceNumber: { type: "string" },
          invoiceDate: { type: "string", description: "YYYY-MM-DD" },
          description: { type: "string" },
          netAmountLkr: { type: "number" },
          statedVatAmountLkr: {
            type: "number",
            description:
              "For a purchase, the VAT printed on the supplier invoice. Ask for it rather than assuming 18 per cent.",
          },
        },
        required: ["kind", "treatment", "counterpartyName", "invoiceDate", "netAmountLkr"],
      },
    },
  },
];

const LineSchema = z.object({
  description: z.string().trim().min(1).max(240),
  quantity: z.number().finite().positive(),
  unitPriceLkr: z.number().finite().min(0),
});

/** The profile the copilot is answering for. */
function activeProfileOf(ctx: ToolContext) {
  return (
    ctx.workspace.profiles.find((item) => item.id === ctx.workspace.activeProfileId) ??
    ctx.workspace.profiles[0]
  );
}

function activePeriod(ctx: ToolContext) {
  const profile = activeProfileOf(ctx);
  return ctx.workspace.periods.find((item) => item.id === profile?.activePeriodId);
}

/**
 * This profile's transactions in its active period.
 *
 * Every figure the copilot quotes has to be scoped the same way the VAT return
 * is, or it answers a question about October with a number covering every
 * period the business has ever recorded.
 */
function periodTransactions(ctx: ToolContext) {
  const profile = activeProfileOf(ctx);
  const period = activePeriod(ctx);
  return ctx.workspace.vatTransactions.filter(
    (item) => item.profileId === profile?.id && item.periodId === period?.id,
  );
}

export function runTool(name: string, rawArgs: unknown, ctx: ToolContext): ToolResult {
  const args = (rawArgs ?? {}) as Record<string, any>;
  const profile =
    ctx.workspace.profiles.find((item) => item.id === ctx.workspace.activeProfileId) ??
    ctx.workspace.profiles[0];

  switch (name) {
    case "get_case_position": {
      const open = ctx.analysis.findings.filter((finding) => finding.status === "open");
      return {
        content: JSON.stringify({
          readinessScore: ctx.analysis.score.total,
          gate: ctx.analysis.workflow.gate,
          claimValueUnderReviewLkrM: ctx.analysis.claimValueUnderReviewLkr,
          openBlockers: open.map((finding) => ({
            id: finding.id,
            title: finding.title,
            description: finding.description,
            ruleId: finding.ruleId,
            lkrAtRiskM: finding.amountLkrM,
          })),
          dataMode: ctx.analysis.dataMode,
          extractionMode: ctx.analysis.mode,
        }),
      };
    }

    case "calculate_vat": {
      const result = calculateVat(Number(args.netAmountLkr), args.treatment);
      return {
        content: JSON.stringify({
          ...result,
          note: `${money(result.netAmountLkr)} net at ${result.vatRate}% is ${money(result.vatAmountLkr)} VAT, ${money(result.grossAmountLkr)} gross.`,
        }),
      };
    }

    case "get_period_position": {
      // Scoped to this profile's active period. Summing every transaction in
      // the workspace would answer "what is my output VAT" with an all-time,
      // all-businesses total - a number that is wrong in a way nobody reading
      // the reply would catch.
      const summary = summariseVatPeriod(periodTransactions(ctx));
      return {
        content: JSON.stringify({
          ...summary,
          period: activePeriod(ctx)?.label ?? "no active period",
          position:
            summary.excessInputCreditLkr > 0
              ? `Excess input credit of ${money(summary.excessInputCreditLkr)} - a refund position.`
              : `VAT payable of ${money(summary.vatPayableLkr)}.`,
        }),
      };
    }

    case "lookup_rule": {
      if (args.topic === "vat_rates") {
        return {
          content: JSON.stringify({ rates: vatRates.rates, guardrail: vatRates.guardrail }),
        };
      }
      if (args.topic === "sources") {
        return {
          content: JSON.stringify(
            governmentSources.map((source) => ({
              id: source.id,
              title: source.title,
              effectiveFrom: source.effectiveFrom,
              url: source.url,
            })),
          ),
        };
      }
      return {
        content: JSON.stringify({
          id: vatInvoiceRulePack.id,
          version: vatInvoiceRulePack.version,
          effectiveFrom: vatInvoiceRulePack.effectiveFrom,
          sourceIds: vatInvoiceRulePack.sourceIds,
          requiredFields: vatInvoiceRulePack.fields
            .filter((field: any) => field.required)
            .map((field: any) => field.label),
          optionalFields: vatInvoiceRulePack.fields
            .filter((field: any) => !field.required)
            .map((field: any) => field.label),
        }),
      };
    }

    case "check_invoice_direction": {
      return {
        content: JSON.stringify(
          resolveInvoiceDirection(args.sellerTin, args.buyerTin, profile?.tin),
        ),
      };
    }

    case "find_invoices": {
      const profile = activeProfileOf(ctx);
      const all = ctx.workspace.generatedInvoices.filter((item) => item.profileId === profile?.id);
      const matches = filterInvoices(all, { query: args.query, status: args.status ?? "ALL" });
      return {
        content: JSON.stringify({
          register: summariseInvoices(all),
          matchCount: matches.length,
          // Capped: the model needs enough to answer, not the whole register
          // pasted into its context.
          invoices: matches.slice(0, 20).map((item) => ({
            invoiceNumber: item.invoiceNumber,
            invoiceDate: item.invoiceDate,
            status: item.status,
            purchaserName: item.purchaserName,
            purchaserTin: item.purchaserTin,
            treatment: item.treatment,
            netTotalLkr: item.netTotalLkr,
            vatTotalLkr: item.vatTotalLkr,
            grossTotalLkr: item.grossTotalLkr,
            voidReason: item.status === "VOID" ? item.voidReason : undefined,
          })),
          truncated: matches.length > 20,
          note: "Void invoices stay listed but contribute nothing to the register money totals.",
        }),
      };
    }

    case "get_schedule_status": {
      const profile = activeProfileOf(ctx);
      const period = activePeriod(ctx);
      if (!period) return { content: JSON.stringify({ error: "This profile has no active VAT period." }) };
      const transactions = periodTransactions(ctx);
      const batches = ctx.workspace.vatScheduleBatches.filter(
        (item) => item.profileId === profile?.id && item.periodId === period.id,
      );
      const schedules = (["01", "02"] as const).map((code) => {
        const rows = transactionsForSchedule(transactions, code);
        const issues = validateOfficialSchedule(transactions, period, code);
        const batch = batches.find((item) => item.code === code);
        return {
          code,
          name: code === "01" ? "Output / sales" : "Local input / purchases",
          rowCount: rows.length,
          batchStatus: batch?.status ?? "NOT_BUILT",
          submissionType: batch?.submissionType,
          versionNumber: batch?.versionNumber,
          fileName: batch?.fileName,
          errors: issues.filter((issue) => issue.severity === "ERROR"),
          warnings: issues.filter((issue) => issue.severity === "WARNING"),
        };
      });
      return {
        content: JSON.stringify({
          period: period.label,
          periodStatus: period.status,
          schedules,
          blocking: schedules.filter((item) => item.errors.length > 0).map((item) => item.code),
          note: "Errors must be fixed in the ledger before a schedule is built. ComplyPilot prepares the file; an authorised person uploads it to e-Services.",
        }),
      };
    }

    case "draft_tax_invoice": {
      const parsedLines = z.array(LineSchema).min(1).max(40).safeParse(args.lines);
      if (!parsedLines.success) {
        return {
          content: JSON.stringify({
            error: "Each line needs a description, a quantity and a unit price.",
          }),
        };
      }
      const treatment = args.treatment ?? "STANDARD_18";
      const lines = parsedLines.data.map((line) => ({
        ...line,
        ...calculateVat(line.quantity * line.unitPriceLkr, treatment),
      }));
      const totals = totalInvoiceLines(lines, treatment);

      const reviewNotes = [
        "The serial is assigned when you save, from this business's own sequence.",
        `Computed by the rule engine: ${money(totals.netTotalLkr)} net, ${money(totals.vatTotalLkr)} VAT.`,
        selectInvoiceRuleProfile(args.invoiceDate).reason,
      ];
      if (!args.purchaserTin) {
        reviewNotes.push(
          "The purchaser TIN is missing and was not invented. Add it before issuing.",
        );
      }

      return {
        content: JSON.stringify({
          drafted: true,
          netTotalLkr: totals.netTotalLkr,
          vatTotalLkr: totals.vatTotalLkr,
          grossTotalLkr: totals.grossTotalLkr,
          note: "A draft was prepared for the user to review and save. Nothing has been issued.",
        }),
        proposal: {
          kind: "invoice_draft",
          summary: `Tax invoice to ${args.purchaserName} - ${money(totals.grossTotalLkr)} including ${money(totals.vatTotalLkr)} VAT`,
          fields: {
            purchaserName: args.purchaserName ?? "",
            purchaserTin: args.purchaserTin ?? "",
            purchaserAddress: args.purchaserAddress ?? "",
            invoiceDate: args.invoiceDate ?? "",
            supplyDate: args.supplyDate ?? args.invoiceDate ?? "",
            treatment,
            lines: parsedLines.data,
            netTotalLkr: totals.netTotalLkr,
            vatTotalLkr: totals.vatTotalLkr,
            grossTotalLkr: totals.grossTotalLkr,
          },
          reviewNotes,
        },
      };
    }

    case "draft_ledger_entry": {
      const kind = args.kind ?? "OUTPUT";
      const treatment = args.treatment ?? "STANDARD_18";
      const supplyType = args.supplyType ?? "GOODS";
      const amounts = resolveTransactionVat({
        kind,
        netAmountLkr: Number(args.netAmountLkr),
        treatment,
        statedVatAmountLkr:
          args.statedVatAmountLkr === undefined ? null : Number(args.statedVatAmountLkr),
      });

      const reviewNotes: string[] = [];
      if (kind !== "OUTPUT" && args.statedVatAmountLkr === undefined) {
        reviewNotes.push(
          "No VAT amount from the supplier invoice was given, so the expected tax was used. Enter the figure printed on the invoice before saving.",
        );
      }
      if (amounts.statedVatVariance) {
        reviewNotes.push(
          `The supplier charged ${money(amounts.statedVatVariance.statedLkr)} where ${money(amounts.statedVatVariance.expectedLkr)} was expected. Only what was charged is claimable; query the difference with the supplier.`,
        );
      }

      return {
        content: JSON.stringify({
          drafted: true,
          ...amounts,
          scheduleCode: scheduleFor(kind, treatment, supplyType),
          note: "A draft was prepared for the user to review and save. Nothing has been recorded.",
        }),
        proposal: {
          kind: "ledger_draft",
          summary: `${kind === "OUTPUT" ? "Sale to" : "Purchase from"} ${args.counterpartyName} - ${money(amounts.netAmountLkr)} net, ${money(amounts.vatAmountLkr)} VAT`,
          fields: {
            kind,
            treatment,
            supplyType,
            counterpartyName: args.counterpartyName ?? "",
            counterpartyTin: args.counterpartyTin ?? "",
            invoiceNumber: args.invoiceNumber ?? "",
            invoiceDate: args.invoiceDate ?? "",
            description: args.description ?? "",
            netAmountLkr: amounts.netAmountLkr,
            statedVatAmountLkr: amounts.vatAmountLkr,
            scheduleCode: scheduleFor(kind, treatment, supplyType),
          },
          reviewNotes,
        },
      };
    }

    default:
      return { content: JSON.stringify({ error: `Unknown tool ${name}.` }) };
  }
}
