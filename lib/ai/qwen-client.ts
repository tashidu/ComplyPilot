import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { InvoiceExtractionSchema, type InvoiceExtraction } from "./extraction-schema";
import { INVOICE_EXTRACTION_PROMPT } from "./prompts";

/**
 * Image types the Qwen vision models accept. A PDF has to be rendered to an
 * image before it can be sent, so it is rejected here with a clear reason
 * rather than being mislabelled as a JPEG.
 */
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

const REQUEST_TIMEOUT_MS = 45_000;

/** Thrown when extraction cannot produce a validated result. Message is safe to show a user. */
export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Models sometimes wrap JSON in a markdown fence. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
}

export async function extractInvoiceData(
  imageBase64: string,
  mimeType: string,
): Promise<InvoiceExtraction> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  const baseURL =
    process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_MODEL || "qwen-vl-plus";

  if (!apiKey) {
    throw new ExtractionError("DASHSCOPE_API_KEY is not set, so Model Studio was not called.");
  }

  if (!SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    throw new ExtractionError(
      `${mimeType || "This file type"} cannot be sent to the vision model. Upload a JPEG, PNG, WebP or BMP image.`,
    );
  }

  const openai = new OpenAI({ apiKey, baseURL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

  const messages = [
    { role: "system" as const, content: INVOICE_EXTRACTION_PROMPT },
    {
      role: "user" as const,
      content: [
        {
          type: "image_url" as const,
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    },
  ];

  let content: string | null = null;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      response_format: zodResponseFormat(InvoiceExtractionSchema, "invoice_extraction"),
      temperature: 0.1,
    });
    content = response.choices[0]?.message?.content ?? null;
  } catch (schemaError) {
    // Model Studio's OpenAI-compatible endpoint does not always accept strict
    // json_schema output. Fall back to plain JSON mode before giving up.
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.1,
      });
      content = response.choices[0]?.message?.content ?? null;
    } catch (jsonError) {
      const detail = jsonError instanceof Error ? jsonError.message : String(jsonError);
      throw new ExtractionError(`Model Studio request failed: ${detail}`);
    }
  }

  if (!content) {
    throw new ExtractionError("Model Studio returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(content));
  } catch {
    throw new ExtractionError("Model Studio returned a response that was not valid JSON.");
  }

  const validated = InvoiceExtractionSchema.safeParse(parsed);
  if (!validated.success) {
    const issue = validated.error.issues[0];
    throw new ExtractionError(
      `Model output failed schema validation${issue ? `: ${issue.path.join(".")} ${issue.message}` : "."}`,
    );
  }

  return validated.data;
}
