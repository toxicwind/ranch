# examples

Runnable proof that the ranch works. Everything here runs against the live
estate on `127.0.0.1` — copy, paste, watch it answer.

| Script | What it does | Needs |
|---|---|---|
| [`health-check.sh`](health-check.sh) | The 30-second proof: every core service answers `200` on `/health`, plus the live herd model count | nothing |
| [`herd-chat.sh`](herd-chat.sh) | Chat with a local model through herd's OpenAI-compatible API | nothing |
| [`flock-free.sh`](flock-free.sh) | Route by **strategy** (`free`) — flock picks the best free-tier provider | `FLOCK_KEY` env |

```sh
./examples/health-check.sh
./examples/herd-chat.sh "why is the sky blue?"
FLOCK_KEY=... ./examples/flock-free.sh "why is the sky blue?"
```

Every example is expected to exit 0 on a healthy estate. If one doesn't,
that's a bug — [report it](https://github.com/toxicwind/ranch/issues/new?labels=bug).
