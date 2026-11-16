---
slug: combining-rdb-and-aof
title: "Dual Persistence: Combining RDB Snapshots with AOF"
topic: persistence-and-durability
kind: pattern
summary: Harness maximum reliability and rapid reboot speeds by running RDB snapshots alongside AOF persistence simultaneously.
tags:
  - rdb
  - aof
  - dual-persistence
  - reliability
related:
  - rdb-snapshots-save-bgsave
  - aof-append-only-file-fsync
  - rdb-and-aof-disaster-recovery
---
> **In one line:** Run RDB and AOF together to get the disaster recovery benefits of snapshots with the 1-second durability of AOF.

## The idea

Production database engineering often presents a trade-off: RDB provides compact disaster-recovery backups and lightning-fast boot times, but risks losing recent data. AOF provides maximum durability (~1-second loss window), but produces larger files that take longer to replay on startup.

The recommended production pattern is **Dual Persistence**: enabling both RDB snapshots and AOF logging simultaneously.

| Role | Mechanism Used | Why It Is Included |
|---|---|---|
| **High Durability** | AOF (`appendfsync everysec`) | Bounds data loss to at most 1 second during unexpected crashes |
| **Cold Storage Backups** | RDB (`BGSAVE`) | Periodic binary snapshots copied to remote cloud storage for disaster recovery |
| **Server Startup** | Replays AOF | **Redis automatically loads AOF upon boot** because it contains the most complete dataset |

> **Important:** When both RDB and AOF are enabled, Redis **always loads the AOF file on startup** because it is guaranteed to be the most up-to-date representation of your data.

## See it

Configuring dual persistence in `redis.conf`:

```text
# 1. Configure RDB Snapshot Rules
save 3600 1
save 300 100
save 60 10000
dbfilename dump.rdb

# 2. Enable Append-Only File with 1-second sync
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec

# 3. Enable Hybrid Persistence (RDB preamble inside AOF)
aof-use-rdb-preamble yes
```

In `redis-cli`, verify that dual persistence is active and inspect the preamble setting:

```bash
# Check if hybrid persistence is active
CONFIG GET aof-use-rdb-preamble
# Returns:
# 1) "aof-use-rdb-preamble"
# 2) "yes"

# Inspect overall persistence status
INFO persistence
```

Notice the directive **`aof-use-rdb-preamble yes`**. This enables **Hybrid Persistence** (introduced in Redis 4.0 and enabled by default in modern Redis).

## Go deeper

**Hybrid Persistence** combines the best of both worlds inside the AOF file itself:
- When an AOF rewrite occurs, Redis writes the base dataset in **RDB binary format** at the beginning of the file.
- Any writes received *during* the rewrite are appended in standard **RESP text format** at the end.

Upon reboot, Redis loads the binary RDB header in seconds, then replays only the tiny incremental RESP tail, slashing server reboot times from minutes to seconds while retaining full AOF durability.

## Watch out

- Enabling both mechanisms requires monitoring disk I/O; ensure high-speed SSD storage is provisioned.
- Never delete the AOF file assuming Redis will automatically fall back to loading `dump.rdb`; if AOF is enabled, an empty AOF causes Redis to boot with an empty dataset.

## Remember

- Dual persistence combines RDB cold backups with AOF 1-second write safety.
- Redis prioritizes loading AOF upon startup because it contains the most complete data.
- Hybrid persistence (`aof-use-rdb-preamble yes`) accelerates server startup times dramatically.
