#!/usr/bin/env python3
import json, os, time, urllib.request

FK = os.popen("secretsmith get --label FREEINFERENCE_API_KEY --show").read()
FK = FK.split("secret: ",1)[1].split("\n")[0].strip()
QDRANT = "http://127.0.0.1:25133"
COLL = "fleet_orb"

def embed(texts):
    body = json.dumps({"model": "bge-m3", "input": texts}).encode()
    req = urllib.request.Request("https://freeinference.org/v1/embeddings", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {FK}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return [d["embedding"] for d in json.load(r)["data"]]

def qdr(path, body=None, method="GET"):
    req = urllib.request.Request(QDRANT+path, data=json.dumps(body).encode() if body else None,
        headers={"Content-Type": "application/json"}, method=method)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

try: qdr(f"/collections/{COLL}")
except Exception:
    qdr(f"/collections/{COLL}", {"vectors": {"size": 1024, "distance": "Cosine"}}, "PUT")

rows = [json.loads(l) for l in open("/tmp/kappa/fleet-orb/race-results.jsonl") if l.strip() and '"model"' in l]
done = 0
for batch in range(0, len(rows), 16):
    chunk = rows[batch:batch+16]
    texts = [f"{r['model']} ms={r['ms']} {r['resp'][:500]}" for r in chunk]
    vecs = embed(texts)
    points = [{"id": batch+i+1, "vector": v, "payload": {
        "model": r["model"], "ms": r["ms"], "resp": r["resp"][:2000]}} for i,(r,v) in enumerate(zip(chunk,vecs))]
    qdr(f"/collections/{COLL}/points?wait=true", {"points": points}, "PUT")
    done += len(chunk)
    print(f"embedded {done}/{len(rows)}", flush=True)
print("QDRANT-SYNC-DONE")
