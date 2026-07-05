from src.agents.bookkeeper import (
    _TOOL_DEFS,
    _TOOL_FUNCS,
    _generate_status_message,
    _get_conversation,
    _summarize_tool_result,
)


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
    a = _get_conversation("session-a", "t1")
    b = _get_conversation("session-b", "t1")
    a.append({"role": "user", "content": "private"})
    assert b == []
    assert _get_conversation("session-a", "t1") == a


def test_conversation_lru_eviction():
    import src.agents.bookkeeper as bk

    bk._conversations.clear()
    for i in range(bk._MAX_CONVERSATIONS + 5):
        _get_conversation(f"s{i}", None)
    assert len(bk._conversations) <= bk._MAX_CONVERSATIONS
    assert "s0:default" not in bk._conversations


def test_summarize_truncates_long_results():
    assert len(_summarize_tool_result("unknown_tool", "x" * 500)) <= 80
