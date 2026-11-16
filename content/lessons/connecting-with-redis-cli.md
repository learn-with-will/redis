---
slug: connecting-with-redis-cli
title: "Essential redis-cli Commands: PING, ECHO, and INFO"
topic: fundamentals
kind: tool
summary: Master the primary command-line interface tool to inspect server health, test latency, and query diagnostic metrics.
tags:
  - redis-cli
  - cli
  - tooling
  - monitoring
related:
  - installing-and-running-redis
  - the-resp-protocol
  - logical-databases-select
---
> **In one line:** The `redis-cli` tool is your primary interactive shell for issuing commands, debugging latency, and inspecting server metrics.

## The idea

`redis-cli` is the official command-line interface distributed alongside Redis. It provides an interactive REPL (Read-Eval-Print Loop) environment supporting autocomplete, command history navigation, syntax highlighting, and execution piping.

When first interacting with a running server, three basic commands establish connectivity and assess instance state: `PING`, `ECHO`, and `INFO`.

| Command | Syntax | Output / Return Value | Purpose |
|---|---|---|---|
| **PING** | `PING [message]` | `PONG` or echoed message | Confirms server availability and measures round-trip time |
| **ECHO** | `ECHO message` | String message | Returns input string; useful in scripts and healthchecks |
| **INFO** | `INFO [section]` | Multi-line text key-value pairs | Displays hardware, memory, client, and replication metrics |
| **DBSIZE** | `DBSIZE` | Integer count | Returns the total count of keys stored in the active database |

> **Tip:** You can execute single commands without entering the interactive prompt by passing them as arguments: `redis-cli PING`.

## See it

Open an interactive terminal session and query basic server diagnostics:

```bash
# Launch interactive CLI
redis-cli

# Test connectivity and latency
127.0.0.1:6379> PING
PONG

127.0.0.1:6379> ECHO "Testing Redis CLI connection"
"Testing Redis CLI connection"

# Inspect memory consumption
127.0.0.1:6379> INFO memory
# Memory
used_memory:1048576
used_memory_human:1.00M
used_memory_rss:4194304
mem_fragmentation_ratio:4.00

# Check number of keys stored
127.0.0.1:6379> DBSIZE
(integer) 42
```

The `INFO memory` command highlights exact byte allocation and the memory fragmentation ratio, warning you before server memory limits are reached.

## Go deeper

`redis-cli` includes several specialized operational modes accessible via command-line flags:
- `--stat`: Continuously outputs running statistics (requests per second, memory, clients) every second.
- `--bigkeys`: Scans the entire keyspace using non-blocking iterators to find the largest keys by data type.
- `--latency`: Runs continuous ping requests to record latency spikes and network jitter.
- `--scan`: Iterates over keys matching a pattern without blocking the main event thread.

## Watch out

- Calling `INFO` without a section argument returns hundreds of lines of metrics, which can be noisy in automated scripts.
- Avoid passing sensitive passwords directly via command-line arguments (`-a password`) in shared shell environments.

## Remember

- `redis-cli` is the default diagnostic and management utility for interacting with Redis.
- `PING` and `ECHO` provide lightweight health checks for container orchestrators and load balancers.
- `INFO [section]` surfaces critical operational metrics including memory usage and client connections.
