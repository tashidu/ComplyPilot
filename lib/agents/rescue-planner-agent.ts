import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { Finding, RescueAction, RescuePlan, Score } from "../types";
import { calculateClaimValue, calculateReadiness } from "./readiness-agent";

const NarrativeSchema = z.object({
  headline: z.string().min(1).max(120),
  explanation: z.string().min(1).max(600),
});

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

async function qwenNarrative(
  actions: RescueAction[],
  actualScore: number,
  simulatedScore: number,
  actualLkrAtRisk: number,
): Promise<z.infer<typeof NarrativeSchema> | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || actions.length === 0) return null;
  const baseURL =
    process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_RESCUE_MODEL || process.env.QWEN_CHAT_MODEL || "qwen-plus";
  const client = new OpenAI({ apiKey, baseURL, timeout: 20_000, maxRetries: 1 });
  const facts = {
    actualScore,
    simulatedScore,
    actualLkrAtRisk,
    actions: actions.map(({ rank, findingId, title, requiredAction, scoreGain, lkrAtRisk }) => ({
      rank,
      findingId,
      title,
      requiredAction,
      scoreGain,
      lkrAtRisk,
    })),
  };
  const messages = [
    {
      role: "system" as const,
      content:
        "You are the ComplyPilot Refund Rescue Planner. Return JSON only. Explain the supplied deterministic plan in plain business English. Do not change numbers, reorder actions, predict an IRD risk category, guarantee a refund date, or invent evidence. Keep the explanation under 70 words.",
    },
    { role: "user" as const, content: `JSON facts:\n${JSON.stringify(facts)}` },
  ];

  let content: string | null = null;
  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      response_format: zodResponseFormat(NarrativeSchema, "rescue_narrative"),
      temperature: 0.1,
    });
    content = response.choices[0]?.message?.content ?? null;
  } catch {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      content = response.choices[0]?.message?.content ?? null;
    } catch (error) {
      console.warn(
        "[refund-rescue] Qwen narrative unavailable; using deterministic explanation:",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  }

  if (!content) return null;
  try {
    const parsed = NarrativeSchema.safeParse(JSON.parse(stripCodeFence(content)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function createRescuePlan(findings: Finding[], score: Score): Promise<RescuePlan> {
  const open = findings
    .filter((finding) => finding.status === "open")
    .sort(
      (left, right) =>
        right.amountLkrM - left.amountLkrM || right.scoreGain - left.scoreGain,
    );
  const actions = open.map<RescueAction>((finding, index) => ({
    rank: index + 1,
    findingId: finding.id,
    title: finding.title,
    requiredAction: finding.graph.at(-1)?.detail ?? finding.description,
    scoreGain: finding.scoreGain,
    lkrAtRisk: finding.amountLkrM,
  }));
  const simulatedFindings = findings.map((finding) =>
    finding.status === "open" ? { ...finding, status: "resolved" as const } : finding,
  );
  const simulatedScore = calculateReadiness(simulatedFindings).total;
  const actualLkrAtRisk = calculateClaimValue(findings);
  const simulatedLkrAtRisk = calculateClaimValue(simulatedFindings);
  const deterministicHeadline =
    actions.length === 0
      ? "No open evidence actions remain"
      : `${actions.length} actions could protect LKR ${actualLkrAtRisk.toFixed(1)}M in this scenario`;
  const deterministicExplanation =
    actions.length === 0
      ? "The current evidence package can move to an authorised human reviewer."
      : `Start with ${actions[0].requiredAction}. The what-if view moves readiness from ${score.total} to ${simulatedScore} without changing the actual case.`;
  const narrative = await qwenNarrative(actions, score.total, simulatedScore, actualLkrAtRisk);

  return {
    mode: narrative ? "LIVE_QWEN" : "DETERMINISTIC",
    fallbackReason: narrative
      ? null
      : process.env.DASHSCOPE_API_KEY
        ? "Qwen did not return a valid rescue narrative; deterministic plan retained."
        : "DASHSCOPE_API_KEY is not set; deterministic plan retained.",
    headline: narrative?.headline ?? deterministicHeadline,
    explanation: narrative?.explanation ?? deterministicExplanation,
    actualScore: score.total,
    simulatedScore,
    actualLkrAtRisk,
    simulatedLkrAtRisk,
    actions,
    disclaimer:
      "ComplyPilot what-if model only. It does not reproduce the IRD's risk rating or guarantee a refund or payment date.",
  };
}
