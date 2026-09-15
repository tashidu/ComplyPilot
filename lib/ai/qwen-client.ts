import OpenAI from "openai";
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

/**
 * Pulls the JSON object out of whatever the model actually said.
 *
 * Asking for JSON only is not a guarantee. The same prompt returns a bare
 * object on one call and `Here is the invoice data:` followed by a fenced block
 * on the next, and a reply that is 95% correct JSON behind one sentence of
 * preamble should not cost the user their extraction.
 *
 * A fenced block wins when there is one, since that is unambiguously the
 * payload. Otherwise the first balanced object is taken, tracking string state
 * so a brace inside an address or a supplier name does not end it early. A
 * truncated reply leaves the braces unbalanced and returns null rather than a
 * half-object that would fail validation further away from the cause.
 */
export function extractJsonObject(text: string): string | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fence ? fence[1] : text).trim();

  const start = candidate.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return candidate.slice(start, index + 1);
    }
  }
  return null;
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

  // json_object, not json_schema. The vision models accept a strict json_schema
  // response format and then ignore it, answering in prose - and because that
  // is a success, not an error, a schema-first attempt has no failure to fall
  // back from. The shape is carried by the prompt instead and enforced below by
  // zod, which is the guarantee that actually holds either way.
  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 4096,
    });
    content = response.choices[0]?.message?.content ?? null;
  } catch (jsonError) {
    // Older deployments reject response_format outright. The prompt alone still
    // asks for JSON, and the parser below tolerates a fence around it.
    try {
      const response = await openai.chat.completions.create({
        model,
        messages,
        temperature: 0.1,
        max_tokens: 4096,
      });
      content = response.choices[0]?.message?.content ?? null;
    } catch (plainError) {
      const detail = plainError instanceof Error ? plainError.message : String(plainError);
      throw new ExtractionError(`Model Studio request failed: ${detail}`);
    }
  }

  if (!content) {
    throw new ExtractionError("Model Studio returned an empty response.");
  }

  const json = extractJsonObject(content);
  if (!json) {
    throw new ExtractionError(
      "Model Studio returned a reply with no complete JSON object in it. The answer may have been cut short.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
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
