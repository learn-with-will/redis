---
slug: persistence-overview-in-memory
title: Durability Guarantees in an In-Memory Database
topic: persistence-and-durability
kind: concept
summary: Redis balances sub-millisecond memory speed with durable disk persistence through RDB snapshots and AOF logs.
tags:
  - persistence
  - durability
  - architecture
  - in-memory
related:
  - rdb-snapshots-save-bgsave
  - aof-append-only-file-fsync
  - combining-rdb-and-aof
---
> **In one line:** Redis achieves durability by asynchronously writing in-memory state to disk using RDB snapshots and Append-Only Files.

## The idea

A persistent myth surrounding Redis is that because it is an in-memory database, all data is irrevocably lost if the server process crashes or loses power.

In reality, Redis is **in-memory first, optionally durable**. It provides two complementary persistence mechanisms that stream memory state onto persistent disk:
1. **RDB (Redis Database File):** Point-in-time binary snapshots of the entire dataset saved at configured intervals.
2. **AOF (Append-Only File):** A sequential append log recording every write command received by the server.

| Dimension | RDB Snapshots | Append-Only File (AOF) | Disabling Persistence |
|---|---|---|---|
| **Mechanism** | Compact binary memory dump | Text log of mutating commands | In-memory only (ephemeral) |
| **Data Safety** | Potential loss of last minutes of writes | Potential loss of at most ~1 second (`everysec`) | All data lost on process restart |
| **Restart Speed** | Extremely fast (direct binary load) | Slower (must replay commands) | Instant (starts empty) |
| **Disk Overhead** | Minimal; highly compressed file | Larger; requires periodic compaction | Zero disk utilization |

> **Note:** Durability in Redis is a configurable spectrum. You can run Redis purely as a volatile cache, or tune it to achieve durability comparable to traditional SQL databases.

## See it

Inspecting active persistence configurations in `redis-cli`:

```bash
# Check current persistence mode and status
INFO persistence
# Shows:
# rdb_last_bgsave_status:ok
# rdb_last_save_time:1763321400
# aof_enabled:1
# aof_current_size:1048576

# Trigger an immediate background persistence snapshot
BGSAVE
# Returns: "Background saving started"

# Check the exact directory where persistence files are stored
CONFIG GET dir
# Returns:
# 1) "dir"
# 2) "/data"
```

The `INFO persistence` output confirms whether snapshots and AOF logging are actively protecting your dataset.

## Go deeper

Because write operations execute directly in RAM before persistence occurs, Redis persistence is asynchronous by default.

If a server abruptly loses power, any writes that occurred after the last snapshot or during the un-flushed AOF buffer window are lost. For applications that require strict zero-data-loss guarantees, pairing Redis with a primary relational store (cache-aside pattern) or tuning AOF to `appendfsync always` provides the necessary guarantees.

## Watch out

- Running Redis without persistence means restarting the container or operating system wipes the entire database.
- Writing to disk requires sufficient disk space; a full disk prevents Redis from saving data and halts incoming writes.

## Remember

- Redis is in-memory first, but optionally durable via RDB snapshots and AOF logs.
- RDB produces compact point-in-time binary backups ideal for disaster recovery.
- AOF logs sequential write commands to minimize potential data-loss windows.
