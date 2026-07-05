"""Weekly digest builder + graceful SMTP degradation."""

from src.services.digest import build_digest, send_email, smtp_configured


def test_digest_subject_leads_with_money_found():
    digest = build_digest("digest-session")
    assert "£1,250" in digest["subject"]
    assert digest["findings_count"] > 0
    assert "/books" in digest["text"]
    assert "/account" in digest["html"]  # opt-out link


def test_digest_lists_findings_in_body():
    digest = build_digest("digest-session")
    assert "INV-0001" in digest["text"]
    assert "INV-0001" in digest["html"]


def test_send_email_degrades_when_unconfigured(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert smtp_configured() is False
    assert send_email("a@b.com", "s", "t", "<p>h</p>") is False
