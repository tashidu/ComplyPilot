"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

type Source = { id: string; title: string; url: string };
type ChatMode = "LIVE_MODEL" | "DEMO_FALLBACK";
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: ChatMode;
  /** Which model actually answered, e.g. "OpenAI gpt-4o". */
  model?: string;
  fallbackReason?: string | null;
  sources?: Source[];
  toolsUsed?: string[];
  proposals?: Proposal[];
};

/**
 * A draft the copilot prepared. It is not saved: the user reviews it and
 * applies it into the matching form, which is where it becomes a record.
 */
type Proposal = {
  kind: "invoice_draft" | "ledger_draft";
  summary: string;
  fields: Record<string, unknown>;
  reviewNotes: string[];
};

const STARTER: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Ask me about VAT registration, TIN/PIN, required documents, your saved application progress, or this period's invoice evidence.",
};

const QUICK_QUESTIONS = [
  "How do I register for VAT?",
  "How do I connect to the RAMIS Web API?",
  "What is my input and output VAT balance?",
  "Draft a tax invoice for 250,000 of consultancy",
  "What is 18% VAT on 450,000?",
];

export function DataCopilot({
  runId,
  contextVersion,
  onAuditEvent,
  onApplyProposal,
}: {
  runId: string;
  contextVersion: string;
  onAuditEvent?: (mode: ChatMode, model?: string) => void;
  /** Opens the matching form pre-filled with a draft the copilot prepared. */
  onApplyProposal?: (kind: Proposal["kind"], fields: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
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
          model: data.model,
          fallbackReason: data.fallbackReason,
          sources: data.sources,
          toolsUsed: data.toolsUsed,
          proposals: data.proposals,
        },
      ]);
      onAuditEvent?.(mode, data.model);
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
        <section
          className={`copilot-panel${expanded ? " expanded" : ""}`}
          role="dialog"
          aria-label="ComplyPilot VAT Copilot"
        >
          <header className="copilot-head">
            <button
              className="copilot-expand"
              onClick={() => setExpanded((value) => !value)}
              aria-pressed={expanded}
              aria-label={expanded ? "Shrink the copilot" : "Expand the copilot to full screen"}
              title={expanded ? "Shrink" : "Expand to full screen"}
            >
              {expanded ? "⤡" : "⤢"}
            </button>
            <img src="/bot-icon.png" alt="Copilot" className="copilot-mark" aria-hidden="true" />
            <div className="copilot-head-text">
              <strong>VAT Copilot</strong>
              <span>Grounded in your profile + official sources</span>
            </div>
            <button className="copilot-close" onClick={() => setOpen(false)} aria-label="Close data copilot">×</button>
          </header>

          <div className="copilot-boundary">
            No IRD credentials · structured workspace data may be sent to configured Qwen
          </div>

          <div className="copilot-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`copilot-message ${message.role}`} key={message.id}>
                <div className="copilot-bubble">
                  <p>{message.content}</p>
                  {message.mode ? (
                    <span
                      className={`copilot-mode ${message.mode === "LIVE_MODEL" ? "live" : "fallback"}`}
                      title={message.fallbackReason ?? undefined}
                    >
                      {message.mode === "LIVE_MODEL" ? "Live model" : "Demo fallback"}
                    </span>
                  ) : null}
                </div>
                {message.toolsUsed?.length ? (
                  <div className="copilot-tools">
                    <span>Used</span>
                    {Array.from(new Set(message.toolsUsed)).map((tool) => (
                      <code className="mono" key={tool}>{tool}</code>
                    ))}
                  </div>
                ) : null}
                {message.proposals?.map((proposal, index) => (
                  <div className="copilot-proposal" key={`${message.id}-draft-${index}`}>
                    <div className="copilot-proposal-head">
                      <strong>
                        {proposal.kind === "invoice_draft" ? "Draft tax invoice" : "Draft ledger entry"}
                      </strong>
                      <span className="tag warn">NOT SAVED</span>
                    </div>
                    <p>{proposal.summary}</p>
                    <dl className="copilot-proposal-fields">
                      {Object.entries(proposal.fields)
                        .filter(([, value]) => value !== "" && value !== null && value !== undefined)
                        .slice(0, 8)
                        .map(([key, value]) => (
                          <div key={key}>
                            <dt>{key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</dt>
                            <dd className="mono">{Array.isArray(value) ? `${value.length} line(s)` : String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                    {proposal.reviewNotes.length ? (
                      <ul className="copilot-proposal-notes">
                        {proposal.reviewNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    ) : null}
                    {/* Applying opens the matching form pre-filled. Saving stays a
                        deliberate act in that form, not a click in a chat window. */}
                    <button
                      className="button small"
                      onClick={() => onApplyProposal?.(proposal.kind, proposal.fields)}
                    >
                      Review in the form →
                    </button>
                  </div>
                ))}
                {message.sources?.length ? (
                  <div className="copilot-sources">
                    <span>Sources</span>
                    {message.sources.map((source) => (
                      <a className="mono" href={source.url} target="_blank" rel="noreferrer" key={source.id} title={source.title}>
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
              placeholder="Ask a VAT question…"
              aria-label="Question for VAT Copilot"
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
        aria-label={open ? "Close VAT copilot" : "Ask ComplyPilot about VAT"}
      >
        <img src="/bot-icon.png" alt="Copilot" className="copilot-launcher-mark" />
        <span>{open ? "Close" : "Ask VAT Copilot"}</span>
      </button>
    </>
  );
}
