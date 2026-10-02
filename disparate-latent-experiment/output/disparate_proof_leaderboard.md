# Disparate Domain Information Density & Sched-Jitter Leaderboard

Proving that raw token velocity obscures true semantic transmission rate and scheduling jitter.

| Model | Workload | Raw (tok/s) | True Info (Bytes/s) | Bytes/Token | TTFT (ms) | ITL Jitter (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `local-herd:tiny` | Kernel & Memory Telemetry | **1000** | **0 B/s** | 0 B/t | 23.0ms | 0ms |
| `local-herd:tiny` | Asynchronous Concurrency Proofs | **1000** | **0 B/s** | 0 B/t | 3.5ms | 0ms |
| `local-herd:tiny` | High-Perplexity Disparate Intelligence | **1000** | **0 B/s** | 0 B/t | 9.8ms | 0ms |
| `local-herd:qwen3.5-9b-i1-q4km-64k` | Kernel & Memory Telemetry | **1000** | **0 B/s** | 0 B/t | 14.7ms | 0ms |
| `local-herd:qwen3.5-9b-i1-q4km-64k` | Asynchronous Concurrency Proofs | **1000** | **0 B/s** | 0 B/t | 2.8ms | 0ms |
| `local-herd:qwen3.5-9b-i1-q4km-64k` | High-Perplexity Disparate Intelligence | **1000** | **0 B/s** | 0 B/t | 2.3ms | 0ms |
