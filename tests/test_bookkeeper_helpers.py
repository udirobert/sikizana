from src.agents.bookkeeper import (
    _TOOL_DEFS,
    _TOOL_FUNCS,
    _conversation_key,
    _generate_status_message,
    _summarize_tool_result,
)
from src.services.payment_store import load_conversation, save_conversation


def test_every_advertised_tool_is_executable():
    """A tool in _TOOL_DEFS but not _TOOL_FUNCS makes the model hallucinate
    calls that fail — the Zana persona bug. Keep them in lockstep."""
    def_names = {d["function"]["name"] for d in _TOOL_DEFS}
    assert def_names == set(_TOOL_FUNCS)


def test_status_message_matches_topic():
    assert "P&L" in _generate_status_message("show me my profit this month")
    assert "invoices" in _generate_status_message("who owes me money?")
    assert _generate_status_message("xyzzy") == "Looking into your books…"


def test_conversations_are_session_scoped():
    """Same thread id, different sessions → different stored histories."""
    key_a = _conversation_key("session-a", "t1")
    key_b = _conversation_key("session-b", "t1")
    assert key_a != key_b
    save_conversation(key_a, [{"role": "user", "content": "private"}])
    assert load_conversation(key_b) == []
    assert load_conversation(key_a) == [{"role": "user", "content": "private"}]


def test_conversation_survives_reload():
    """Histories live in SQLite — restarts and multiple workers share them."""
    key = _conversation_key("s1", "thread-9")
    messages = [{"role": "user", "content": "hi"}, {"role": "assistant", "content": "hello"}]
    save_conversation(key, messages)
    assert load_conversation(key) == messages


def test_summarize_truncates_long_results():
    assert len(_summarize_tool_result("unknown_tool", "x" * 500)) <= 80
