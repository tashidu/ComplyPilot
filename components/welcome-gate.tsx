"use client";

import { useState, type FormEvent } from "react";
import type { AuthUser, UserRole } from "@/lib/auth/types";

/**
 * The first screen a visitor sees.
 *
 * An account is offered, never required. Anyone evaluating this product should
 * reach a working demo in one click, so "Continue as guest" is a peer of the
 * sign-in form rather than a link buried under it. Guest mode is the full
 * product against the synthetic case; the account only makes the workspace
 * outlive the browser session.
 */

export function WelcomeGate({
  onGuest,
  onAuthenticated,
}: {
  onGuest: () => void;
  onAuthenticated: (user: AuthUser) => void;
}) {
  const [mode, setMode] = useState<"register" | "login">("login");
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    role: "OWNER" as UserRole,
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "login" ? { email: form.email, password: form.password } : form,
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The account request failed.");
      onAuthenticated(data.user as AuthUser);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-brand">
          <span className="brand-mark">CP</span>
          <div>
            <strong>ComplyPilot</strong>
            <small>REFUNDSHIELD</small>
          </div>
        </div>

        <h1>VAT compliance and refund readiness for Sri Lankan businesses</h1>
        <p className="gate-lead">
          Check invoice evidence against the rule in force on its date, before filing.
        </p>

        {/* Guest first: an evaluator should not have to read past a form. */}
        <button className="button primary wide gate-guest" onClick={onGuest}>
          Continue as guest →
        </button>
        <p className="gate-guest-note">
          Opens the full product on a synthetic demo case. No account, no email, nothing to
          install.
        </p>

        <div className="gate-divider">
          <span>or keep your work</span>
        </div>

        <div className="gate-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "login"}
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === "register"}
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="gate-form">
          {mode === "register" ? (
            <>
              <label>
                Full name
                <input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  required
                  autoComplete="name"
                />
              </label>
              <label>
                Phone number
                <input
                  className="mono"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                  autoComplete="tel"
                />
              </label>
              <label>
                Your role
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                >
                  <option value="OWNER">Business owner</option>
                  <option value="ACCOUNTANT">Accountant</option>
                  <option value="FINANCE">Finance team</option>
                  <option value="TAX_AGENT">Tax agent</option>
                </select>
              </label>
            </>
          ) : null}

          <label>
            Email address
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password{mode === "register" ? " — minimum 8 characters" : ""}
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>

          {error ? <p className="gate-error">{error}</p> : null}

          <button className="button wide" type="submit" disabled={busy}>
            {busy
              ? "Working…"
              : mode === "register"
                ? "Create secure workspace"
                : "Sign in"}
          </button>
        </form>

        <p className="gate-warning">
          Never enter an IRD password, PIN or payment credential here.
        </p>
      </div>
    </div>
  );
}
