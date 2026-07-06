"""
The chase ladder — escalating reminder emails for overdue invoices.

Five stages, timed off the invoice due date:
  1. Friendly reminder        (due +3 days)   — mirroring, assume oversight
  2. Firm follow-up           (due +15 days)  — calibrated question
  3. Final notice             (due +31 days)  — labeling; statutory interest
                                                + fixed-sum compensation claimed
  4. Debt recovery warning    (due +61 days)  — no-oriented question; 7-day deadline
  5. Letter Before Action     (due +75 days)  — Pre-Action Protocol for Debt
                                                Claims elements; last step before
                                                Small Claims / a collection agency

Interest and compensation figures come from services/rates.py — the same
numbers every other surface quotes. The templates are used both by the
scheduled chase runner (jobs/run_chases.py) and can inform the agent's
one-off drafts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from src.services.rates import (
    STATUTORY_INTEREST_APR,
    daily_statutory_interest,
    fixed_sum_compensation,
)

# Days after the due date at which each stage fires.
STAGE_OFFSETS: dict[int, int] = {1: 3, 2: 15, 3: 31, 4: 61, 5: 75}
FINAL_STAGE = 5
# Minimum gap between two sends to the same debtor, whatever the ladder says.
MIN_GAP_DAYS = 3

STAGE_LABELS: dict[int, str] = {
    1: "Friendly reminder",
    2: "Firm follow-up",
    3: "Final notice (interest + compensation)",
    4: "Debt recovery warning",
    5: "Letter Before Action",
}


def stage_for_days_overdue(days: int) -> int:
    """The stage an invoice belongs at right now, given days overdue."""
    for stage in range(FINAL_STAGE, 0, -1):
        if days >= STAGE_OFFSETS[stage]:
            return stage
    return 1


def next_send_date(due: date, stage: int, today: date, last_send: date | None = None) -> date:
    """When the given stage should fire: its ladder date, never in the past,
    and never sooner than MIN_GAP_DAYS after the previous send (an invoice
    already deep in the ladder must not get two emails back-to-back)."""
    ladder = due + timedelta(days=STAGE_OFFSETS[stage])
    when = max(ladder, today)
    if last_send is not None:
        when = max(when, last_send + timedelta(days=MIN_GAP_DAYS))
    return when


@dataclass
class ChaseEmail:
    stage: int
    subject: str
    body: str


def _money(v: float) -> str:
    return f"£{v:,.2f}"


def build_chase_email(
    stage: int,
    contact_name: str,
    amount: float,
    invoice_number: str,
    days_overdue: int,
    sender_name: str = "",
    invoice_date: str = "",
) -> ChaseEmail:
    """Build the email for a ladder stage. Interest/compensation figures are
    computed here from the shared rates — never trusted from a model."""
    interest = daily_statutory_interest(amount) * max(days_overdue, 0)
    compensation = fixed_sum_compensation(amount)
    total_claim = amount + interest + compensation
    signature = sender_name or "[Your name]"

    if stage <= 1:
        subject = f"Friendly reminder: Invoice {invoice_number}"
        body = f"""Dear {contact_name},

I hope you're doing well. Just a quick reminder that invoice {invoice_number}
for {_money(amount)} was due {days_overdue} day{"s" if days_overdue != 1 else ""} ago.

I'd really appreciate it if you could settle this at your earliest convenience.
If you've already paid, please disregard this email.

If there's an issue or you need to discuss payment terms, just let me know —
I'm happy to help.

Best regards,
{signature}
"""
    elif stage == 2:
        subject = f"Overdue invoice {invoice_number} — {days_overdue} days past due"
        body = f"""Dear {contact_name},

This is a follow-up regarding invoice {invoice_number} for {_money(amount)},
which is now {days_overdue} days overdue.

I've not yet received payment or heard from you regarding this invoice.
How would you like to resolve this? I'm open to discussing payment terms
if that would help.

I value our business relationship, but I do need this resolved promptly.

Regards,
{signature}
"""
    elif stage == 3:
        subject = f"FINAL NOTICE: Invoice {invoice_number} — {days_overdue} days overdue"
        body = f"""Dear {contact_name},

Despite previous reminders, invoice {invoice_number} for {_money(amount)}
remains unpaid and is now {days_overdue} days overdue.

It seems like there may be a cash flow constraint on your end. I understand
that can happen — but I need to address this now.

Under the Late Payment of Commercial Debts (Interest) Act 1998 I am entitled to:
  - Statutory interest at {STATUTORY_INTEREST_APR}% per annum (Bank Rate + 8%):
    {_money(interest)} accrued to date
  - Fixed-sum debt recovery compensation of £{compensation} per invoice

That brings the total now due to {_money(total_claim)}.

Please arrange payment within 7 days. If I do not receive payment or a
satisfactory response, I will take further steps to recover the debt.

Regards,
{signature}
"""
    elif stage == 4:
        subject = f"Debt recovery: Invoice {invoice_number} — {days_overdue} days overdue"
        body = f"""Dear {contact_name},

Invoice {invoice_number} for {_money(amount)} is now {days_overdue} days
overdue. Despite multiple reminders, no payment has been received.

The total amount due under the Late Payment of Commercial Debts (Interest)
Act 1998 is {_money(total_claim)}, comprising the invoice ({_money(amount)}),
statutory interest at {STATUTORY_INTEREST_APR}% per annum ({_money(interest)}),
and £{compensation} fixed-sum recovery compensation.

Would it be a terrible idea to settle this now, before I begin formal
recovery — a Letter Before Action followed by court proceedings or referral
to a debt collection agency?

Payment within 7 days will close this matter completely.

Regards,
{signature}
"""
    else:  # stage 5 — Letter Before Action
        subject = f"LETTER BEFORE ACTION — Invoice {invoice_number}"
        issued = f" issued {invoice_date}" if invoice_date else ""
        body = f"""Dear {contact_name},

LETTER BEFORE ACTION

This letter is sent in accordance with pre-action conduct requirements and
is my final communication before I begin court proceedings to recover the
debt below.

THE DEBT
  Invoice: {invoice_number}{issued}
  Principal amount: {_money(amount)} — now {days_overdue} days overdue
  Statutory interest ({STATUTORY_INTEREST_APR}% p.a. under the Late Payment of
  Commercial Debts (Interest) Act 1998): {_money(interest)} and accruing daily
  Fixed-sum recovery compensation: £{compensation}
  TOTAL NOW DUE: {_money(total_claim)}

WHAT YOU NEED TO DO
Pay the total above, or contact me to agree a payment plan, within 14 days
of the date of this letter. (If you are a sole trader, the Pre-Action
Protocol for Debt Claims gives you 30 days and I will provide the Protocol's
Information Sheet and Reply Form on request.)

IF YOU DO NOT RESPOND
I will issue a claim without further notice — through the County Court
(Money Claims service) — and will seek the debt, interest, compensation,
court fees, and any further costs the court allows. A judgment may affect
your credit rating.

If you dispute this debt, tell me why in writing within the same period,
with any supporting documents.

I would prefer to resolve this without court action. Payment or a workable
proposal within the deadline closes the matter completely.

Yours sincerely,
{signature}
"""

    return ChaseEmail(stage=stage, subject=subject, body=body)


def escalation_checklist(amount: float) -> str:
    """What to do after the ladder is exhausted — surfaced to the USER, not
    the debtor, when stage 5 gets no response."""
    interest_note = f"{STATUTORY_INTEREST_APR}% p.a."
    route = (
        "Money Claim Online (small claims track, for debts under £10,000): "
        "fees start around £35-£455 depending on the amount, you don't need "
        "a solicitor, and you can claim the debt + interest + compensation + fee."
        if amount < 10000
        else "County Court claim (fast/multi track for £10,000+) — worth a fixed-fee "
        "solicitor's letter first; or a debt collection agency (typically 8-15% "
        "commission, no win no fee)."
    )
    return (
        "LADDER EXHAUSTED — NEXT STEPS:\n"
        f"1. Court route: {route}\n"
        "2. Debt collection agency: faster and hands-off, but costs commission "
        "and can end the customer relationship.\n"
        "3. Keep records: every email in this sequence is dated and recorded — "
        "that's your evidence of reasonable pre-action conduct.\n"
        f"4. Interest keeps accruing at {interest_note} until payment or judgment.\n"
        "5. Weigh it commercially: if the debt is small, a write-off plus firing "
        "the customer is sometimes cheaper than the chase."
    )
