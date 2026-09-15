"use client";

import { FormEvent, useState } from "react";
import type { AuthUser, UserRole } from "@/lib/auth/types";
import { PageHead } from "./ui";

export function AccountView({ user, onAuthenticated }: { user: AuthUser | null; onAuthenticated: (user: AuthUser | null) => void }) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", role: "OWNER" as UserRole, password: "" });
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
        body: JSON.stringify(mode === "login" ? { email: form.email, password: form.password } : form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The account request failed.");
      onAuthenticated(data.user);
      window.location.reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The account request failed.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    onAuthenticated(null);
    window.location.reload();
  }

  if (user) {
    const initials = user.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
    return (
      <>
        <PageHead eyebrow="Secure workspace" title="Your account" lead="Your business workspace is now tied to this account instead of an eight-hour guest browser session." />
        <article className="card pad profile-card">
          <div className="profile-card-avatar">{initials}</div>
          <div className="profile-card-details">
            <span className="tag ok">Signed in</span>
            <h2>{user.fullName}</h2>
            <p>{user.email} · {user.phone}</p>
            <p className="subtle">Role: {user.role.replaceAll("_", " ").toLowerCase()}</p>
          </div>
          <button className="button" disabled={busy} onClick={logout}>{busy ? "Signing out…" : "Sign out"}</button>
        </article>
        <div className="notice-box"><strong>Account boundary</strong><p>Login protects this hackathon prototype workspace. It is not your IRD e-Services login and ComplyPilot never asks for your IRD PIN or password.</p></div>
      </>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-form-pane">
        <div className="auth-form-inner">
          <div className="auth-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>
              Create account
            </button>
            <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>
              Sign in
            </button>
          </div>

          <h1 className="auth-heading">{mode === "register" ? "Create your account" : "Welcome back"}</h1>
          <p className="auth-lead">
            {mode === "register"
              ? "Save business profiles, registration progress, invoice evidence and filing periods in one private workspace."
              : "Sign in to pick up your business workspace exactly where you left off."}
          </p>

          <form onSubmit={submit}>
            {mode === "register" ? (
              <div className="workspace-form-grid">
                <label><span>Full name</span><input autoComplete="name" required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
                <label><span>Phone number</span><input autoComplete="tel" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
                <label className="span-two"><span>Your role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}><option value="OWNER">Business owner</option><option value="ACCOUNTANT">Accountant</option><option value="FINANCE">Finance team</option><option value="TAX_AGENT">Tax agent</option></select></label>
              </div>
            ) : null}
            <div className="workspace-form-grid auth-credentials">
              <label className="span-two"><span>Email address</span><input type="email" autoComplete="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label className="span-two"><span>Password {mode === "register" ? "— minimum 8 characters" : ""}</span><input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 8 : undefined} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
            </div>
            {error ? <p className="form-error" role="alert">{error}</p> : null}
            <button className="button primary auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create secure workspace" : "Sign in"}</button>
          </form>

          <p className="auth-boundary-note">Never enter an IRD password, PIN or payment credential here.</p>
        </div>
      </div>

      <aside className="auth-visual-pane" aria-hidden="true">
        <div className="auth-brand">
          <div className="auth-brand-mark">CP</div>
          <div>
            <strong>ComplyPilot</strong>
            <small>RefundShield</small>
          </div>
        </div>
        <div className="auth-visual-content">
          <span className="auth-visual-eyebrow">One-time setup</span>
          <h2>What this unlocks</h2>
          <ol className="auth-benefits">
            <li><strong>Reusable business identity</strong><span>Fill stable TIN, entity and contact details once.</span></li>
            <li><strong>VAT registration progress</strong><span>Return later without restarting the document checklist.</span></li>
            <li><strong>Team-ready records</strong><span>Keep period tasks and evidence attached to one account.</span></li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
