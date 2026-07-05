"""
Agent tools running against the deterministic mock data (demo mode is
forced by conftest, so these never touch a real Xero org).
"""

from src.services.xero_service import XeroService
from src.tools.xero_tools import (
    create_xero_journal_entry,
    find_discrepancies,
    get_savings_opportunities,
    get_tax_insights,
    propose_journal_entry,
)


def test_mode_is_demo():
    assert XeroService("any-session").mode() == "demo"


def test_find_discrepancies_reports_mock_issues():
    result = find_discrepancies()
    assert "UNRECONCILED" in result
    assert "OVERDUE" in result


def test_tax_insights_estimates_corporation_tax():
    result = get_tax_insights()
    assert "TAX INSIGHTS" in result
    assert "Corporation Tax" in result


def test_savings_opportunities_uses_parsed_pl():
    result = get_savings_opportunities()
    # The mock café runs at a loss, so margin analysis must fire —
    # this fails if the P&L parsing regresses to computing zeros.
    assert "MARGIN" in result or "SAVINGS" in result


def test_propose_journal_entry_requires_valid_accounts():
    ok = propose_journal_entry("Fix misposted rent", "600", "090", 100.0)
    assert "PROPOSED JOURNAL ENTRY" in ok
    bad = propose_journal_entry("Nope", "999", "090", 100.0)
    assert bad.startswith("Error")


def test_demo_journal_write_is_honest():
    result = create_xero_journal_entry("Test entry", "600", "090", 50.0)
    assert "SIMULATED" in result
    assert "nothing was written" in result
    assert "✓ Journal entry posted" not in result


def test_service_demo_journal_flags_not_posted():
    result = XeroService("any-session").create_manual_journal("Test", "600", "090", 10.0)
    assert result["posted"] is False
    assert result["mode"] == "demo"
    assert "Simulated" in result["message"]


def test_tools_coerce_string_amounts():
    """LLMs pass numeric args as strings — tools must coerce, not crash."""
    from src.tools.xero_tools import draft_invoice_reminder

    proposed = propose_journal_entry("Fix rent", "600", "090", "1200")
    assert "PROPOSED JOURNAL ENTRY" in proposed
    assert "1,200.00" in proposed

    simulated = create_xero_journal_entry("Fix rent", "600", "090", "50.5")
    assert "SIMULATED" in simulated

    email = draft_invoice_reminder(
        contact_name="Catering Co", amount="1250", invoice_number="INV-0001", days_overdue="15"
    )
    assert "1,250.00" in email
