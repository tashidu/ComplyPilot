"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Source = { id: string; title: string; url: string };
type ChatMode = "LIVE_QWEN" | "DEMO_FALLBACK";
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: ChatMode;
  fallbackReason?: string | null;
  sources?: Source[];
};

const STARTER: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask me about this run's score, blockers, invoice extraction, VAT Schedule match, or bundled official sources.",
};

const QUICK_QUESTIONS = [
  "Why is this case blocked?",
  "Is the VAT Schedule matched?",
  "What changed in October 2026?",
  "Which official sources apply?",
];

export function DataCopilot({
  runId,
  contextVersion,
  onAuditEvent,
}: {
  runId: string;
  contextVersion: string;
  onAuditEvent?: (mode: ChatMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([STARTER]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([STARTER]);
    setInput("");
  }, [runId, contextVersion]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy, open]);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  async function ask(question: string) {
    const content = question.trim();
    if (!content || busy) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    };
    const conversation = [...messages, userMessage];
    setMessages(conversation);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          messages: conversation
            .filter((message) => message.id !== "welcome")
            .slice(-10)
            .map(({ role, content: messageContent }) => ({ role, content: messageContent })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The data copilot could not answer.");

      const mode = data.mode as ChatMode;
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.answer,
          mode,
          fallbackReason: data.fallbackReason,
          sources: data.sources,
        },
      ]);
      onAuditEvent?.(mode);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "The data copilot could not answer.",
          mode: "DEMO_FALLBACK",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void ask(input);
    }
  }

  return (
    <>
      {open ? (
        <section className="copilot-panel" role="dialog" aria-label="ComplyPilot Data Copilot">
          <header className="copilot-head">
            <div className="copilot-mark" aria-hidden="true">CP</div>
            <div>
              <strong>Data Copilot</strong>
              <span>Grounded in this analysis run</span>
            </div>
            <button className="copilot-close" onClick={() => setOpen(false)} aria-label="Close data copilot">×</button>
          </header>

          <div className="copilot-boundary">
            Decision support only · structured run data may be sent to configured Qwen
          </div>

          <div className="copilot-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`copilot-message ${message.role}`} key={message.id}>
                <div className="copilot-bubble">
                  <p>{message.content}</p>
                  {message.mode ? (
                    <span
                      className={`copilot-mode ${message.mode === "LIVE_QWEN" ? "live" : "fallback"}`}
                      title={message.fallbackReason ?? undefined}
                    >
                      {message.mode === "LIVE_QWEN" ? "Live Qwen" : "Demo fallback"}
                    </span>
                  ) : null}
                </div>
                {message.sources?.length ? (
                  <div className="copilot-sources">
                    <span>Sources</span>
                    {message.sources.map((source) => (
                      <a href={source.url} target="_blank" rel="noreferrer" key={source.id} title={source.title}>
                        {source.id}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {busy ? (
              <div className="copilot-message assistant">
                <div className="copilot-bubble copilot-typing" aria-label="Data Copilot is answering">
                  <i /><i /><i />
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {messages.length === 1 ? (
            <div className="copilot-prompts">
              {QUICK_QUESTIONS.map((question) => (
                <button key={question} onClick={() => void ask(question)}>{question}</button>
              ))}
            </div>
          ) : null}

          <form className="copilot-form" onSubmit={submit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 800))}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this case…"
              aria-label="Question for Data Copilot"
              rows={2}
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send question">↑</button>
          </form>
        </section>
      ) : null}

      <button
        className="copilot-launcher"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Close data copilot" : "Ask ComplyPilot about your data"}
      >
        <span className="copilot-launcher-mark">CP</span>
        <span>{open ? "Close" : "Ask your data"}</span>
      </button>
    </>
  );
}
