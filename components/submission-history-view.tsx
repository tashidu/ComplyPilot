"use client";

import type { BusinessProfile, BusinessWorkspace } from "@/lib/workspace/workspace";
import { PageHead } from "./ui";

export function SubmissionHistoryView({
  workspace,
  profile,
}: {
  workspace: BusinessWorkspace;
  profile: BusinessProfile;
}) {
  const periodIds = new Set(workspace.periods.filter((period) => period.profileId === profile.id).map((period) => period.id));
  const submissions = workspace.submissions
    .filter((item) => periodIds.has(item.periodId))
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));

  return (
    <>
      <PageHead
        eyebrow={profile.displayName}
        title="Submission history"
        lead="An immutable-looking prototype ledger of period approvals and simulator acknowledgements. Live RAMIS entries are labelled separately when authorised integration becomes available."
      />
      <div className="submission-list">
        {submissions.map((submission) => {
          const period = workspace.periods.find((candidate) => candidate.id === submission.periodId);
          const failed = submission.status === "FAILED";
          return (
            <article className="card pad submission-card" key={submission.id}>
              <div className="submission-main">
                <span className={`submission-icon ${failed ? "bad" : "ok"}`}>{failed ? "!" : "✓"}</span>
                <div>
                  <div className="chip-row"><span className={`tag ${failed ? "bad" : "ok"}`}>{submission.status.replaceAll("_", " ")}</span><span className="tag">{submission.submissionType.replaceAll("_", " ")}</span></div>
                  <h2>{period?.label ?? "Archived VAT period"}</h2>
                  <p>{submission.note}</p>
                </div>
              </div>
              <dl className="submission-meta">
                <div><dt>Acknowledgement</dt><dd>{submission.acknowledgement}</dd></div>
                <div><dt>Readiness</dt><dd>{submission.readinessScore}/100</dd></div>
                <div><dt>Submitted by</dt><dd>{submission.submittedBy}</dd></div>
                <div><dt>Recorded</dt><dd>{new Date(submission.submittedAt).toLocaleString("en-LK")}</dd></div>
              </dl>
            </article>
          );
        })}
        {submissions.length === 0 ? <article className="card pad empty-state">No submission records exist for this business profile yet.</article> : null}
      </div>
    </>
  );
}
