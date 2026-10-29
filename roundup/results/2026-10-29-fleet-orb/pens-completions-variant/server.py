#!/usr/bin/env python3
# pens v1/completions — agent-as-endpoint, sub-DNS middleware, filesystem registry.
# Real backend: rhodochrosite router :25193 (OpenAI-compatible, bare model IDs).
# Model ID grammar: [wrapper.]*<model>[.pens.local] — wrappers compose left-to-right.
# Failures: finish_reason=error + audited to audit.jsonl, never swallowed.
import json, uuid, time, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

UPSTREAM = "http://127.0.0.1:25193/v1/chat/completions"
WRAPPERS = {}  # name -> fn(prompt, text) -> text

def w_audit(p, t): return f"[AUDITED]{t}"
def w_reverse(p, t): return t[::-1]
def w_upper(p, t): return t.upper()
WRAPPERS.update(audit=w_audit, reverse=w_reverse, upper=w_upper)

def infer(prompt, model):
    body = json.dumps({"model": model, "messages": [{"role": "user", "content": prompt}], "max_tokens": 200}).encode()
    req = urllib.request.Request(UPSTREAM, data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + __import__("os").environ.get("RHODO_API_KEY", "")})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["choices"][0]["message"]["content"]

class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/v1/models":
            out = {"object": "list", "data": [{"id": f"{w}.pens.local", "object": "model", "owned_by": "pens"} for w in WRAPPERS] +
                   [{"id": "pens.local", "object": "model", "owned_by": "pens", "dns": "pens.local"}]}
            self._json(out)
        else:
            self.send_error(404)
    def do_POST(self):
        try:
            data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            model = data.get("model", "pens.local").removesuffix(".pens.local")
            prompt = data.get("prompt") or next((m["content"] for m in reversed(data.get("messages", [])) if m.get("role") == "user"), "")
            parts = model.split(".")
            backend, chain = parts[-1], [w for w in parts[:-1] if w in WRAPPERS]
            text = infer(prompt, backend)
            for w in chain: text = WRAPPERS[w](prompt, text)
            self._json(self._resp(model, text, "stop"))
            self._audit(model, prompt, text)
        except Exception as e:
            text = f"[AGENT FAILED AUDITED] {type(e).__name__}: {e}"
            self._json(self._resp(data.get("model", "?"), text, "error"))
            self._audit(data.get("model", "?"), prompt if 'prompt' in dir() else "", text, err=str(e))
    def _resp(self, model, text, fr):
        return {"id": f"cmpl-{uuid.uuid4().hex[:24]}", "object": "text_completion", "created": int(time.time()),
                "model": model, "choices": [{"text": text, "index": 0, "logprobs": None, "finish_reason": fr}],
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}}
    def _audit(self, model, prompt, text, err=None):
        with open("/home/toxic/pens/v1/completions/audit.jsonl", "a") as f:
            f.write(json.dumps({"time": time.time(), "model": model, "prompt": prompt, "error": err}) + "\n")
    def _json(self, o):
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(json.dumps(o).encode())
    def log_message(self, *a): return

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8766), H).serve_forever()
