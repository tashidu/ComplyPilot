/**
 * Which model answers which kind of question.
 *
 * Two providers are configured, and the split is by what each is actually
 * better at rather than by preference:
 *
 *   - Qwen keeps the vision work. It reads the invoice image, and it drives the
 *     filing agent from screenshots. That is the model this product was built
 *     around and the one whose extraction is validated end to end.
 *   - Qwen also keeps embeddings, and this one is not a preference at all:
 *     vectors from different models are not comparable, so swapping the
 *     embedding provider silently invalidates every similarity score computed
 *     against vectors produced by the other one.
 *   - OpenAI takes the conversational and explanatory work - the copilot's tool
 *     loop and the rescue narrative - where multi-step tool calling is the
 *     thing being relied on.
 *
 * Every choice degrades rather than fails. With no OPENAI_API_KEY the chat and
 * reasoning tasks fall back to Qwen and the product behaves exactly as it did
 * before; with no DASHSCOPE_API_KEY the caller gets null and handles it, which
 * is what the existing deterministic fallbacks are for.
 */

export type AiTask = "vision" | "embedding" | "chat" | "reasoning";

export type ProviderChoice = {
  provider: "qwen" | "openai";
  apiKey: string;
  baseURL: string;
  model: string;
};

const QWEN_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

function qwen(model: string): ProviderChoice | null {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) return null;
  return {
    provider: "qwen",
    apiKey,
    baseURL: process.env.DASHSCOPE_BASE_URL || QWEN_DEFAULT_BASE_URL,
    model,
  };
}

function openai(): ProviderChoice | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return {
    provider: "openai",
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL,
    model: process.env.OPENAI_MODEL || "gpt-4o",
  };
}

export function resolveProvider(task: AiTask): ProviderChoice | null {
  switch (task) {
    // Vision and embeddings stay on Qwen whether or not OpenAI is configured.
    case "vision":
      return qwen(process.env.QWEN_MODEL || "qwen-vl-plus");
    case "embedding":
      return qwen(process.env.QWEN_EMBEDDING_MODEL || "text-embedding-v3");
    case "chat":
      return openai() ?? qwen(process.env.QWEN_CHAT_MODEL || "qwen-plus");
    case "reasoning":
      return (
        openai() ??
        qwen(process.env.QWEN_RESCUE_MODEL || process.env.QWEN_CHAT_MODEL || "qwen-plus")
      );
  }
}

/** For the UI badge and the audit trail: which model actually answered. */
export function providerLabel(choice: ProviderChoice | null): string {
  if (!choice) return "no model configured";
  return `${choice.provider === "openai" ? "OpenAI" : "Qwen"} ${choice.model}`;
}
