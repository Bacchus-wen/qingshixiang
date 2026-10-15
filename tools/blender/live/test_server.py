"""Protocol tests with in-memory sockets; no Blender or network required.

These check exec/protocol behavior only. smoke_test.py checks actual bpy/rendering.
"""
import importlib.util
import io
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("blender_live_server_test", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"bpy": types.ModuleType("bpy"),
                              "mathutils": types.SimpleNamespace(Vector=object)}):
    spec.loader.exec_module(server)


class MemorySocket:
    def __init__(self, data):
        self.input = io.BytesIO(data)
        self.output = bytearray()

    def makefile(self, *_args):
        return self.input

    def sendall(self, data):
        self.output.extend(data)

    def settimeout(self, _timeout):
        pass


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        server.GLOBALS.clear()
        server.GLOBALS.update(server.namespace())
        self.service = types.SimpleNamespace(stopping=False)

    def send(self, request, raw=False, headers=""):
        body = request if raw else json.dumps(request).encode()
        sock = MemorySocket(f"POST / HTTP/1.0\r\nContent-Length: {len(body)}\r\n{headers}\r\n".encode() + body)
        with patch.object(server.Handler, "log_message"):
            server.Handler(sock, ("127.0.0.1", 12345), self.service)
        head, payload = bytes(sock.output).split(b"\r\n\r\n", 1)
        self.assertIn(b"200 OK", head)
        data = json.loads(payload)
        self.assertEqual(set(data), {"ok", "stdout", "error", "result"})
        return data

    def test_persistent_globals_and_function_scope(self):
        self.assertTrue(self.send({"code": "counter = 2\ndef read_counter(): return counter"})["ok"])
        result = self.send({"code": "counter += 1; result = read_counter(); print('persisted')"})
        self.assertEqual(result["result"], 3)
        self.assertEqual(result["stdout"], "persisted\n")
        self.assertIsNone(self.send({"code": "pass"})["result"])

    def test_exception_retains_prior_mutations_and_recovers(self):
        response = self.send({"code": "counter = 7; print('before'); raise ValueError('intentional')"})
        self.assertFalse(response["ok"])
        self.assertIn("Traceback", response["error"])
        self.assertIn("ValueError: intentional", response["error"])
        self.assertEqual(response["stdout"], "before\n")
        self.assertEqual(self.send({"code": "result = counter"})["result"], 7)

    def test_system_exit_does_not_end_session(self):
        self.assertFalse(self.send({"code": "raise SystemExit(3)"})["ok"])
        self.assertTrue(self.send({"code": "result = 1"})["ok"])

    def test_serialization_errors_are_structured(self):
        for code in ("result = object()", "result = float('nan')"):
            response = self.send({"code": code})
            self.assertFalse(response["ok"])
            self.assertIn("Traceback", response["error"])
        self.assertTrue(self.send({"code": "pass"})["ok"])

    def test_bad_requests_do_not_end_session(self):
        for body in (b"{", b"[]", b'{"code":4}', b'{"action":"missing"}'):
            self.assertFalse(self.send(body, raw=True)["ok"])
        self.assertTrue(self.send({"code": "pass"})["ok"])

    def test_browser_request_rejected_before_execution(self):
        response = self.send({"code": "should_not_exist = True"}, headers="Origin: https://example.org\r\n")
        self.assertFalse(response["ok"])
        self.assertNotIn("should_not_exist", server.GLOBALS)

    def test_stop_sets_loop_flag(self):
        self.assertTrue(self.send({"action": "stop"})["ok"])
        self.assertTrue(self.service.stopping)


if __name__ == "__main__":
    unittest.main()
