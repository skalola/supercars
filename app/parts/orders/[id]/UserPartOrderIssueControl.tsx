"use client";

import { useState, useTransition } from "react";
import { reportUserPartOrderIssueAction } from "@/app/actions/user-part-orders";
import type { UserPartOrderIssueType } from "@/lib/parts/user-part-order-issue-policy";

const ISSUE_OPTIONS: Array<{ value: UserPartOrderIssueType; label: string }> = [
  { value: "NOT_RECEIVED", label: "Not received" },
  { value: "DAMAGED", label: "Damaged in transit" },
  { value: "NOT_AS_DESCRIBED", label: "Not as described" },
  { value: "WRONG_ITEM", label: "Wrong item" },
  { value: "OTHER", label: "Other issue" },
];

export default function UserPartOrderIssueControl({ orderId, canReport, issue }: { orderId: string; canReport: boolean; issue: { issueType: string; status: string; description: string; adminNote: string | null } | null }) {
  const [open, setOpen] = useState(false);
  const [issueType, setIssueType] = useState<UserPartOrderIssueType>("NOT_RECEIVED");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (issue) return <section className="part-order-issue-status"><div><span>Reported issue</span><h2>{label(issue.issueType)}</h2></div><b data-status={issue.status}>{label(issue.status)}</b><p>{issue.description}</p>{issue.adminNote ? <small>Admin response: {issue.adminNote}</small> : <small>SUPERCAR DASH will review this record. Payment changes require a separate authorized Stripe action.</small>}</section>;
  if (!canReport) return null;

  function submit() {
    startTransition(async () => {
      const result = await reportUserPartOrderIssueAction(orderId, { issueType, description });
      setMessage(result.ok ? "Issue reported for review." : result.error || "Could not report this issue.");
      if (result.ok) setOpen(false);
    });
  }

  return <>
    <div className="part-order-report-row"><div><strong>Problem with this order?</strong><span>Create a review record without automatically changing payment state.</span></div><button onClick={() => setOpen(true)}>Report issue</button></div>
    {message ? <p className="part-order-message" role="status">{message}</p> : null}
    {open ? <div className="part-order-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><div className="part-order-confirm part-order-issue-modal" role="dialog" aria-modal="true"><span>Transaction support</span><h2>Report an order issue</h2><label>Issue type<select value={issueType} onChange={(event) => setIssueType(event.target.value as UserPartOrderIssueType)}>{ISSUE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>What happened?<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={6} maxLength={1500} placeholder="Include the condition, delivery details, and what resolution you discussed with the other party." /></label><p>This report does not automatically refund or reverse a payment.</p><div><button disabled={pending} onClick={() => setOpen(false)}>Cancel</button><button className="is-danger" disabled={pending || description.trim().length < 20} onClick={submit}>{pending ? "Submitting..." : "Submit report"}</button></div></div></div> : null}
  </>;
}

function label(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
