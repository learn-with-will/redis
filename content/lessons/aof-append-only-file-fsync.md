---
slug: aof-append-only-file-fsync
title: The Append-Only File (AOF) and appendfsync Policies
topic: persistence-and-durability
kind: technique
summary: Achieve high data durability by logging mutating commands sequentially with AOF and tuning appendfsync policies.
tags:
  - aof
  - appendfsync
  - durability
  - logging
related:
  - persistence-overview-in-memory
  - aof-rewrite-compaction
  - combining-rdb-and-aof
---
> **In one line:** The Append-Only File (AOF) logs every mutating command sequentially, bounding potential data loss to ~1 second.

## The idea

While RDB snapshots protect against catastrophic failure, losing the last 15 minutes of writes between snapshots is unacceptable for many transactional applications.

The **Append-Only File (AOF)** provides an alternative persistence mechanism: whenever Redis receives a command that mutates the database (`SET`, `HSET`, `LPUSH`, `DEL`), it formats the command in the standard RESP protocol and appends it to an on-disk transaction log (`appendonly.aof`). Upon restart, Redis replays the log from top to bottom, reconstructing the exact original state.

| `appendfsync` Setting | Disk Sync Behavior | Durability Level | Performance Impact |
|---|---|---|---|
| **`always`** | Forces disk write after **every single command** | Maximum (Zero data loss) | **Slowest** (bounded by physical disk I/O) |
| **`everysec`** (Default) | Flushes write buffer to disk **once per second** | High (Lose at most ~1s of data) | **Excellent** (virtually indistinguishable from RAM) |
| **`no`** | Leaves disk flushing entirely to the operating system | Unpredictable (OS flushes ~30s) | Fastest (relies on kernel buffers) |

> **Tip:** The default `appendfsync everysec` policy is the gold standard for production Redis: it offers exceptional write throughput while bounding data loss to at most 1 second of writes during a crash.

## See it

Enabling and inspecting AOF persistence in `redis-cli`:

```bash
# Check if AOF is currently enabled
CONFIG GET appendonly
# Returns:
# 1) "appendonly"
# 2) "yes"

# Check active disk sync policy
CONFIG GET appendfsync
# Returns:
# 1) "appendfsync"
# 2) "everysec"

# Dynamically enable AOF without restarting the server
CONFIG SET appendonly yes
# Returns: OK

# Query AOF file metrics
INFO persistence
# Displays: aof_current_size, aof_base_size, aof_pending_rewrite
```

When enabled at runtime, Redis immediately forks a background worker to create the initial AOF file before logging subsequent incoming commands.

## Go deeper

The AOF file format uses the standard human-readable RESP protocol:
```text
*3
$3
SET
$4
user
$4
Alex

```

Because the format is plain text, an operator can open an AOF file in a text editor to inspect history or manually delete an errant `FLUSHALL` command before booting a server.

## Watch out

- `appendfsync always` forces a synchronous disk flush on every single write, dropping server throughput from 100,000 ops/sec to ~2,000 ops/sec.
- AOF files grow continuously over time and must be compacted via background rewrites.

## Remember

- AOF logs every write command sequentially in standard RESP wire format.
- `appendfsync everysec` delivers the ideal balance between performance and durability.
- Upon restart, Redis replays the AOF log to reconstruct the exact database state.
