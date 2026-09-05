import { NextResponse } from "next/server";
import {
  customsReference,
  governmentDataSummary,
  governmentSources,
  inactiveVatSnapshot,
  refundRiskRules,
  vatInvoiceRulePack,
  vatRates,
  vatSchedules,
} from "@/lib/government-data";

export async function GET() {
  return NextResponse.json(
    {
      summary: governmentDataSummary,
      sources: governmentSources,
      rulePacks: {
        invoice: vatInvoiceRulePack,
        rates: vatRates,
        refund: refundRiskRules,
      },
      schedules: vatSchedules,
      snapshots: { inactiveVat: inactiveVatSnapshot },
      customs: customsReference,
      boundaries: {
        publicReferenceDataOnly: true,
        containsTaxpayerRecords: false,
        liveGovernmentIntegration: false,
        requiresHumanReview: true,
      },
    },
    {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    },
  );
}
