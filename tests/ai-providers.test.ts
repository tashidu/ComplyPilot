import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { providerLabel, resolveProvider } from "../lib/ai/providers";

const KEYS = ["DASHSCOPE_API_KEY", "OPENAI_API_KEY", "OPENAI_MODEL", "QWEN_MODEL", "QWEN_CHAT_MODEL", "QWEN_EMBEDDING_MODEL"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("which model answers which task", () => {
  it("keeps vision on Qwen even when OpenAI is configured", () => {
    process.env.DASHSCOPE_API_KEY = "qwen-key";
    process.env.OPENAI_API_KEY = "openai-key";
    expect(resolveProvider("vision")).toMatchObject({ provider: "qwen", model: "qwen-vl-plus" });
  });

  it("keeps embeddings on Qwen, because vectors from two models are not comparable", () => {
    process.env.DASHSCOPE_API_KEY = "qwen-key";
    process.env.OPENAI_API_KEY = "openai-key";
    expect(resolveProvider("embedding")?.provider).toBe("qwen");
  });

  it("sends chat and reasoning to OpenAI when its key is present", () => {
    process.env.DASHSCOPE_API_KEY = "qwen-key";
    process.env.OPENAI_API_KEY = "openai-key";
    expect(resolveProvider("chat")).toMatchObject({ provider: "openai", model: "gpt-4o" });
    expect(resolveProvider("reasoning")?.provider).toBe("openai");
  });

  it("falls back to Qwen for chat when OpenAI is not configured", () => {
    // The product has to keep working on one provider; adding a second must
    // not become a dependency.
    process.env.DASHSCOPE_API_KEY = "qwen-key";
    expect(resolveProvider("chat")).toMatchObject({ provider: "qwen", model: "qwen-plus" });
    expect(resolveProvider("reasoning")?.provider).toBe("qwen");
  });

  it("returns null when the provider a task needs has no key", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    // Vision is Qwen-only, so an OpenAI key does not satisfy it.
    expect(resolveProvider("vision")).toBeNull();
    expect(resolveProvider("embedding")).toBeNull();
    expect(resolveProvider("chat")?.provider).toBe("openai");
  });

  it("returns null for everything when nothing is configured", () => {
    for (const task of ["vision", "embedding", "chat", "reasoning"] as const) {
      expect(resolveProvider(task)).toBeNull();
    }
  });

  it("honours an overridden model name", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
    expect(resolveProvider("chat")?.model).toBe("gpt-4o-mini");
  });

  it("names the model that answered, for the badge and the audit trail", () => {
    process.env.OPENAI_API_KEY = "openai-key";
    expect(providerLabel(resolveProvider("chat"))).toBe("OpenAI gpt-4o");
    process.env.DASHSCOPE_API_KEY = "qwen-key";
    expect(providerLabel(resolveProvider("vision"))).toBe("Qwen qwen-vl-plus");
    expect(providerLabel(null)).toBe("no model configured");
  });
});
