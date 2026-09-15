import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../lib/ai/qwen-client";

describe("finding the JSON in a model reply", () => {
  it("takes a bare object as it stands", () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it("recovers the object from behind a sentence of preamble", () => {
    // The real failure this was written for: qwen-vl-plus answers
    // "Here is the invoice data extracted as JSON:" and then fences the payload,
    // which a startsWith("```") check never strips.
    const reply = 'Here is the invoice data extracted as JSON:\n\n```json\n{"invoiceTitle":{"value":"TAX INVOICE"}}\n```';
    expect(extractJsonObject(reply)).toBe('{"invoiceTitle":{"value":"TAX INVOICE"}}');
  });

  it("handles a fence with no language tag", () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("ignores prose that follows the object", () => {
    expect(extractJsonObject('{"a":1}\n\nLet me know if you need anything else.')).toBe('{"a":1}');
  });

  it("keeps nested objects whole", () => {
    const json = '{"a":{"b":{"c":1}},"d":2}';
    expect(extractJsonObject(`noise ${json} more noise`)).toBe(json);
  });

  it("does not end the object on a brace inside a string", () => {
    // A supplier name or address can legitimately contain a brace.
    const json = '{"sellerName":{"value":"Acme } Ltd","confidence":90}}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("does not end the object on an escaped quote inside a string", () => {
    const json = '{"source":"he said \\"88 Export Avenue\\" here","n":{"v":1}}';
    expect(extractJsonObject(json)).toBe(json);
  });

  it("returns null for a reply cut short mid-object", () => {
    // Better to say the answer was truncated than to hand a half-object to the
    // schema and report the failure somewhere further from the cause.
    expect(extractJsonObject('{"invoiceTitle":{"value":"TAX INV')).toBeNull();
  });

  it("returns null when there is no object at all", () => {
    expect(extractJsonObject("I cannot read this image.")).toBeNull();
    expect(extractJsonObject("")).toBeNull();
  });

  it("survives an array at the top of a fenced block", () => {
    expect(extractJsonObject('```json\n[1,2]\n```')).toBeNull();
  });
});
