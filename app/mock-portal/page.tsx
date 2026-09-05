"use client";

import { useState } from "react";
import "./portal.css";

/**
 * A mock tax portal that the GUI agent operates.
 *
 * This is NOT the Inland Revenue Department portal and never contacts it. It
 * exists so the filing loop can be demonstrated end to end against a system we
 * control, which is also the only responsible way to test portal automation.
 *
 * Element ids are stable because the agent addresses controls by id.
 */

type Step = "login" | "form" | "otp" | "receipt";

const VALID_OTP = "482913";

export default function MockPortalPage() {
  const [step, setStep] = useState<Step>("login");
  const [error, setError] = useState<string | null>(null);

  const [tin, setTin] = useState("");
  const [password, setPassword] = useState("");
  const [period, setPeriod] = useState("");
  const [inputVat, setInputVat] = useState("");
  const [outputVat, setOutputVat] = useState("");
  const [refund, setRefund] = useState("");
  const [otp, setOtp] = useState("");
  const [ack, setAck] = useState("");

  function signIn() {
    if (!tin.trim() || !password.trim()) {
      setError("Taxpayer Identification Number and password are both required.");
      return;
    }
    setError(null);
    setStep("form");
  }

  function continueToOtp() {
    if (!period.trim() || !inputVat.trim() || !outputVat.trim() || !refund.trim()) {
      setError("All return fields are mandatory.");
      return;
    }
    setError(null);
    setStep("otp");
  }

  function submit() {
    if (otp.trim() !== VALID_OTP) {
      setError("The one-time password is incorrect or has expired.");
      return;
    }
    setError(null);
    setAck(`ACK-2026-${Math.floor(100000 + Math.random() * 899999)}`);
    setStep("receipt");
  }

  return (
    <div className="portal">
      <header className="portal-bar">
        <div className="portal-crest" aria-hidden="true">
          ☘
        </div>
        <div>
          <strong>Revenue e-Filing Portal</strong>
          <span>VAT Return and Refund Claim Submission</span>
        </div>
        <div className="portal-demo-flag">MOCK PORTAL — NOT THE IRD</div>
      </header>

      <main className="portal-body">
        <div className="portal-card">
          <div className="portal-steps">
            <span className={step === "login" ? "on" : ""}>1. Sign in</span>
            <span className={step === "form" ? "on" : ""}>2. Return details</span>
            <span className={step === "otp" ? "on" : ""}>3. Verify</span>
            <span className={step === "receipt" ? "on" : ""}>4. Acknowledgement</span>
          </div>

          {error ? (
            <div className="portal-error" id="portal-error" role="alert">
              {error}
            </div>
          ) : null}

          {step === "login" ? (
            <>
              <h1>Sign in to e-Filing</h1>
              <p className="lede">Use the taxpayer credentials issued for this demo environment.</p>
              <div className="portal-field">
                <label htmlFor="tin">Taxpayer Identification Number (TIN)</label>
                <input id="tin" value={tin} onChange={(e) => setTin(e.target.value)} />
              </div>
              <div className="portal-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="portal-actions">
                <button id="signin" onClick={signIn}>
                  Sign in
                </button>
              </div>
            </>
          ) : null}

          {step === "form" ? (
            <>
              <h1>VAT return and refund claim</h1>
              <p className="lede">Enter the values exactly as they appear on the filed schedules.</p>
              <div className="portal-field">
                <label htmlFor="period">Taxable period</label>
                <input id="period" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div className="portal-row">
                <div className="portal-field">
                  <label htmlFor="inputVat">Input VAT (LKR)</label>
                  <input
                    id="inputVat"
                    value={inputVat}
                    onChange={(e) => setInputVat(e.target.value)}
                  />
                </div>
                <div className="portal-field">
                  <label htmlFor="outputVat">Output VAT (LKR)</label>
                  <input
                    id="outputVat"
                    value={outputVat}
                    onChange={(e) => setOutputVat(e.target.value)}
                  />
                </div>
              </div>
              <div className="portal-field">
                <label htmlFor="refund">Refund claimed (LKR)</label>
                <input id="refund" value={refund} onChange={(e) => setRefund(e.target.value)} />
              </div>
              <div className="portal-actions">
                <button id="continue" onClick={continueToOtp}>
                  Continue to verification
                </button>
              </div>
            </>
          ) : null}

          {step === "otp" ? (
            <>
              <h1>Identity verification</h1>
              <p className="lede">
                A one-time password has been sent to the registered mobile number. An automated
                agent cannot complete this step.
              </p>
              <div className="portal-field">
                <label htmlFor="otp">One-time password</label>
                <input id="otp" inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} />
              </div>
              <div className="portal-actions">
                <button id="submit" onClick={submit}>
                  Submit return
                </button>
              </div>
              <p className="portal-note">Demo environment code: {VALID_OTP}</p>
            </>
          ) : null}

          {step === "receipt" ? (
            <>
              <h1>Return submitted</h1>
              <p className="lede">Retain this acknowledgement for your records.</p>
              <div className="portal-receipt">
                Acknowledgement: <span className="portal-ack" id="ack">{ack}</span>
                <br />
                Taxable period: {period}
                <br />
                Refund claimed: LKR {refund}
                <br />
                Status: RECEIVED (MOCK)
                <br />
                Live IRD action: NONE
              </div>
              <p className="portal-note">
                This acknowledgement was produced by a mock portal for demonstration purposes and
                has no legal effect.
              </p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
