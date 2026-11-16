---
slug: aof-rewrite-compaction
title: Compacting Transaction Logs with Background AOF Rewrite
topic: persistence-and-durability
kind: technique
summary: Prevent AOF log bloat by compacting historical mutations into minimal current-state commands using BGREWRITEAOF.
tags:
  - aof
  - bgrewriteaof
  - compaction
  - performance
related:
  - aof-append-only-file-fsync
  - bgsave-fork-and-copy-on-write
  - combining-rdb-and-aof
---
> **In one line:** `BGREWRITEAOF` compacts bloated command logs in the background, rebuilding the file using only the minimal commands needed.

## The idea

Because the AOF file logs every write command sequentially, it grows continuously over time. Consider an integer counter incremented 1,000,000 times:
```bash
INCR page:views # ... repeated 1,000,000 times!
```
The raw AOF file stores one million individual `INCR` commands consuming over 30 megabytes of disk space. Yet, the final state of the database is simply `page:views = 1000000`, which could be expressed as a single command: `SET page:views 1000000`.

To prevent disk exhaustion, Redis provides **AOF Compaction** via the `BGREWRITEAOF` command.

| State | Commands in Log | Disk Footprint | Replay Time |
|---|---|---|---|
| **Before Rewrite** | 1,000,000 historical mutations (`INCR`, `HSET`, `DEL`) | 50 MB | 15 seconds on reboot |
| **After Rewrite** | 1 snapshot command (`SET page:views 1000000`) | 35 bytes | < 1 millisecond on reboot |

> **Tip:** Automatic rewrites trigger when the file size grows by a configured percentage over the base size.

## See it

Triggering and configuring automatic AOF rewrites in `redis-cli`:

```bash
# Trigger a background AOF compaction manually
BGREWRITEAOF
# Returns: "Background append only file rewriting started"

# Check status of the rewrite operation
INFO persistence
# Look for: aof_rewrite_in_progress:0, aof_last_bgrewrite_status:ok

# Inspect automatic rewrite configuration thresholds:
CONFIG GET auto-aof-rewrite-percentage
# Returns: "100" (Triggers when file size grows 100% larger than base size)

CONFIG GET auto-aof-rewrite-min-size
# Returns: "67108864" (64 MB minimum size before rewrites trigger)
```

The configuration tells Redis: automatically rewrite the AOF file whenever its size exceeds 64 MB AND has doubled (100% growth) since the last rewrite.

## Go deeper

In **Redis 7.0+**, the AOF engine was refactored into a **Multi-Part AOF** architecture:
- **Base file:** A compact snapshot generated during the last rewrite (optionally stored in binary RDB format).
- **Incremental files:** Small append logs recording writes that occurred *since* the base file was generated.
- **Manifest file:** Coordinates and tracks the active base and incremental file parts.

This multi-part design eliminated the historical copy-on-write memory overhead and disk I/O bottlenecks associated with legacy monolithic AOF rewrites. Rather than duplicating huge files, Redis simply opens a fresh incremental file while the background child process compiles the new base file.

## Watch out

- Running `BGREWRITEAOF` while a `BGSAVE` snapshot is actively executing queues the rewrite until the snapshot finishes.
- Insufficient disk headroom during rewrites causes the compaction process to fail; ensure at least 2x current AOF size in free disk space.

## Remember

- `BGREWRITEAOF` rebuilds the AOF log using the minimum commands required to represent current memory.
- Automatic compaction triggers when the file doubles in size and exceeds `auto-aof-rewrite-min-size`.
- Multi-Part AOF in Redis 7+ splits logs into base and incremental parts for non-blocking compaction.
