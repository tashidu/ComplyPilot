import OpenAI from "openai";

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TEXTS = 20;

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
};

/**
 * Generates Qwen embeddings for a small, pre-filtered candidate set.
 * It returns null when Model Studio is not configured or unavailable so the
 * explainable local matcher can continue without pretending AI ran.
 */
export async function embedCandidateTexts(texts: string[]): Promise<EmbeddingResult | null> {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey || texts.length < 2 || texts.length > MAX_TEXTS) return null;

  const baseURL =
    process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
  const model = process.env.QWEN_EMBEDDING_MODEL || "qwen3.7-text-embedding";
  const openai = new OpenAI({ apiKey, baseURL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });

  try {
    const response = await openai.embeddings.create({
      model,
      input: texts,
      dimensions: 1024,
      encoding_format: "float",
    });
    const vectors = [...response.data]
      .sort((left, right) => left.index - right.index)
      .map((item) => item.embedding);
    return vectors.length === texts.length ? { vectors, model } : null;
  } catch (error) {
    console.warn(
      "[semantic-reconciliation] Qwen embedding unavailable; using local similarity:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return Math.max(0, Math.min(1, dot / Math.sqrt(leftMagnitude * rightMagnitude)));
}
