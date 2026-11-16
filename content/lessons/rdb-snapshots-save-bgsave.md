---
slug: rdb-snapshots-save-bgsave
title: "Point-in-Time Snapshots: RDB, BGSAVE, and Forking"
topic: persistence-and-durability
kind: technique
summary: Create compact binary point-in-time snapshots using background forks with BGSAVE without blocking main thread clients.
tags:
  - rdb
  - bgsave
  - snapshots
  - fork
related:
  - persistence-overview-in-memory
  - bgsave-fork-and-copy-on-write
  - aof-append-only-file-fsync
---
> **In one line:** `BGSAVE` forks a background child process to write a compact point-in-time binary snapshot (`dump.rdb`) to disk.

## The idea

The **RDB (Redis Database File)** persistence format produces a single, highly compressed binary snapshot representing the exact state of the database at a specific moment in time.

To save this snapshot without freezing active client connections, Redis uses the Linux `fork()` system call. The parent process continues executing client commands, while a child process writes the memory dump to a temporary file, atomically replacing the old `dump.rdb` file upon completion.

| Snapshot Command | Execution Model | Impact on Clients | Production Usage |
|---|---|---|---|
| **`SAVE`** | Synchronous | **Freezes server completely** until dump finishes | **Never use in production** |
| **`BGSAVE`** | Asynchronous | Child process saves snapshot; main thread stays responsive | **Standard production command** |
| **Automatic Save** | Triggered by `save` rules | Runs `BGSAVE` automatically based on time & changes | Configured in `redis.conf` |

> **Watch out:** The synchronous `SAVE` command blocks the main execution thread completely. Never run `SAVE` in a live production environment!

## See it

Triggering and configuring RDB snapshots in `redis-cli`:

```bash
# BAD: Blocks the single-threaded server completely!
# SAVE

# GOOD: Forks a child process to snapshot asynchronously
BGSAVE
# Returns: "Background saving started"

# Check if background save concluded successfully
LASTSAVE
# Returns: (integer) 1763321500 (Unix timestamp of last successful snapshot)

# Inspect automatic snapshot rules in redis.conf:
CONFIG GET save
# Returns:
# 1) "save"
# 2) "3600 1 300 100 60 10000"
```

The string `"3600 1 300 100 60 10000"` defines automatic snapshot rules:
- Save after 3600 seconds (1 hour) if at least 1 key changed.
- Save after 300 seconds (5 min) if at least 100 keys changed.
- Save after 60 seconds (1 min) if at least 10,000 keys changed.

## Go deeper

RDB snapshots have substantial advantages:
1. **Compact File Size:** Data is encoded in a compressed binary format (using LZF compression), minimizing backup storage footprints.
2. **Lightning-Fast Restores:** Loading an RDB snapshot on startup is orders of magnitude faster than replaying millions of individual commands from an AOF file.
3. **Disaster Recovery:** A single `dump.rdb` file can be easily copied to Amazon S3, Google Cloud Storage, or another data center for cold storage backups.

## Watch out

- If the server crashes between snapshots, all writes performed since the last snapshot are lost.
- On Linux, `BGSAVE` requires memory headroom for copy-on-write; ensure `vm.overcommit_memory = 1` is configured in the OS.

## Remember

- `BGSAVE` uses OS background child forks to persist binary snapshots without blocking.
- `SAVE` is synchronous and must never be used in live production environments.
- RDB snapshots are ideal for disaster recovery and fast server reboot recovery.
