"""Structured findings — the books-page panel / digest data source."""

from src.services.findings import build_findings


def test_findings_from_mock_books():
    data = build_findings("test-session")
    assert data["mode"] == "demo"
    assert data["clean"] is False
    # The mock café has one overdue sales invoice (INV-0001, £1,250);
    # only money owed TO the business counts as found
    assert data["money_found"] == 1250.0
    assert data["counts"]["overdue"] == 1
    assert data["counts"]["unreconciled"] == 4
    duplicate_payment = next(f for f in data["findings"] if f["kind"] == "ap_duplicate_payment")
    assert duplicate_payment["amount"] == 680.0
    assert len(duplicate_payment["evidence"]) == 2


def test_every_finding_has_an_action_prompt():
    data = build_findings("test-session")
    for f in data["findings"]:
        assert f["action"]["prompt"], f"finding {f['id']} has no action prompt"
        assert f["action"]["label"]
        assert f["severity"] in ("high", "medium", "low")


def test_findings_sorted_by_severity_then_amount():
    data = build_findings("test-session")
    ranks = [{"high": 0, "medium": 1, "low": 2}[f["severity"]] for f in data["findings"]]
    assert ranks == sorted(ranks)


def test_overdue_invoice_prompt_names_the_invoice():
    data = build_findings("test-session")
    chase = next(f for f in data["findings"] if f["kind"] == "overdue_invoice")
    assert "INV-0001" in chase["action"]["prompt"]
    assert "1,250" in chase["action"]["prompt"]
