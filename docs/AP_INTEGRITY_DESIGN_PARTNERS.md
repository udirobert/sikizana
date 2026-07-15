# AP Integrity Design-Partner Runbook

## Purpose

Turn the AP Integrity wedge into evidence: a connected Xero customer finds a
plausible exception, verifies it, and records the outcome. This is a
measurement and learning loop, not a broad feature launch.

The product remains read-only. Sikizana identifies a risk and its source
records; the customer decides whether to seek a credit, refund, or correction.

## Demo and first review

Anonymous demo mode contains one intentionally seeded duplicate-payment
scenario: two £680 payments for `BILL-0001` from Bean There Coffee Roasters,
one day apart with the same reference. It exists only in Sikizana's mock data
and is labelled `DEMO` in the UI. It demonstrates the exact workflow we need
partners to use with their own Xero data:

1. Open **Check for duplicate payments** from the Siki demo prompts.
2. Inspect the two source records and the proposed review action.
3. On a connected account, set the finding to `confirmed` or `dismissed` and
   record the confirmed value or dismissal reason.
4. Ask the customer to verify the accounting source outside Sikizana before
   contacting a supplier. Sikizana never sends a message or changes Xero data.

## Partner cohort

Recruit three to five authenticated Xero customers with enough supplier bill
and payment history to make the review meaningful. Start with an owner or the
bookkeeper who can inspect original source records and resolve an exception.

Before inviting a cohort, set `AP_INTEGRITY_USER_IDS` on the production server
to their Sikizana user IDs. This makes the cohort explicit. Keep
`AP_INTEGRITY_DISABLED=true` available as the global kill switch. Do not add a
user to the allowlist until they have consented to AP scans.

## Weekly scorecard

Review these numbers per partner and per rule each week:

| Metric | Definition | Why it matters |
| --- | --- | --- |
| Reviewed candidates | `confirmed` + `dismissed` findings | Whether the evidence is actionable |
| Precision | confirmed / reviewed candidates | Whether rules earn attention |
| Confirmed value | Sum of confirmed amounts | The customer outcome and future proof point |
| Time to first review | Connection to first disposition | Whether activation works |
| Dismissal reason | Customer-entered reason | Rule-calibration input, not a vanity metric |

The existing `ap_finding_reviews` records, AP summary in findings, and audit
history are the source of truth. Do not create a parallel analytics store for
this cohort.

## Exit criteria

Keep the scope to deterministic duplicate bills and payments until partners
can consistently explain the evidence, dispositions produce useful calibration
data, and confirmed value materially exceeds the cost of review. Only then
extend supplier-change controls and payment anomalies. Construction document
review, mailbox access, and procurement workflows remain separate pilots.
