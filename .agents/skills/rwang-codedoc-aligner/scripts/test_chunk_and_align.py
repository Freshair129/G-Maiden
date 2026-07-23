import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("chunk_and_align.py")
SPEC = importlib.util.spec_from_file_location("chunk_and_align", MODULE_PATH)
ALIGNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ALIGNER)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def finding():
    return {
        "file": "source.py",
        "doc_link": "docs/spec.md#section",
        "severity": "MEDIUM",
        "conflict_desc": "Document differs from source.",
        "remediation": "Update the documented contract.",
    }


class CodeDocEnvelopeTests(unittest.TestCase):
    def test_request_disables_thinking_and_uses_findings_schema(self):
        captured = {}

        def fake_urlopen(request, timeout):
            captured.update(json.loads(request.data.decode("utf-8")))
            return FakeResponse({"response": "[]", "done_reason": "stop", "thinking": None})

        with patch.object(ALIGNER.urllib.request, "urlopen", fake_urlopen):
            result = ALIGNER.query_local_llm("no conflicts")

        self.assertEqual("[]", result["response"])
        self.assertFalse(captured["think"])
        self.assertEqual(ALIGNER.FINDING_SCHEMA, captured["format"])

    def test_thinking_only_empty_final_response_fails_closed(self):
        with patch.object(ALIGNER.urllib.request, "urlopen", lambda *_, **__: FakeResponse({"response": "", "thinking": "[]", "done_reason": "stop"})):
            with self.assertRaisesRegex(ALIGNER.LLMQueryError, "no final response"):
                ALIGNER.query_local_llm("review")

    def test_length_truncation_fails_closed(self):
        with patch.object(ALIGNER.urllib.request, "urlopen", lambda *_, **__: FakeResponse({"response": "[]", "done_reason": "length"})):
            with self.assertRaisesRegex(ALIGNER.LLMQueryError, "length"):
                ALIGNER.query_local_llm("review")

    def test_valid_empty_and_finding_are_schema_valid(self):
        self.assertEqual(([], True), ALIGNER.parse_findings({"response": "[]"}))
        self.assertEqual(([finding()], True), ALIGNER.parse_findings({"response": json.dumps([finding()])}))

    def test_prose_and_schema_invalid_payloads_are_rejected(self):
        self.assertEqual(([], False), ALIGNER.parse_findings({"response": "no conflict"}))
        self.assertEqual(([], False), ALIGNER.parse_findings({"response": json.dumps([{"severity": "HIGH"}])}))


if __name__ == "__main__":
    unittest.main()
