---
slug: persistence-tradeoffs-decision-guide
title: Persistence Architecture Trade-offs and Decision Matrix
topic: persistence-and-durability
kind: pattern
summary: "Choose the optimal persistence configuration based on workload requirements: pure cache, mixed, or primary datastore."
tags:
  - architecture
  - persistence
  - decision-matrix
  - trade-offs
related:
  - combining-rdb-and-aof
  - persistence-overview-in-memory
  - cache-aside-pattern
---
> **In one line:** Match your persistence settings to your workload: disable persistence for pure caches, or use dual persistence for primary stores.

## The idea

There is no universal persistence configuration that fits every workload. Enabling aggressive disk syncing on a volatile web cache wastes disk I/O and server CPU. Conversely, running an in-memory session database without persistence invites catastrophic data loss on restart.

System architects select persistence configurations by evaluating four primary criteria:
1. Can the data be reconstructed from another source?
2. What is the acceptable data-loss window (Recovery Point Objective - RPO)?
3. What is the acceptable reboot recovery duration (Recovery Time Objective - RTO)?
4. What is the write throughput volume?

| Workload Category | Recommended Persistence | `appendonly` | `save` (RDB) | Expected Data Loss on Crash |
|---|---|---|---|---|
| **Pure Ephemeral Cache** | None (Disabled) | `no` | `""` (Disabled) | 100% (Cache warms up on restart) |
| **Session Store** | Dual Persistence | `yes` (`everysec`) | `300 100` | At most 1 second of writes |
| **Analytics / Metrics** | Periodic RDB Snapshots | `no` | `900 1 300 10` | Writes since last snapshot (~5 min) |
| **Primary Datastore** | Dual + Hybrid AOF | `yes` (`everysec`) | `3600 1` | At most 1 second of writes |

> **Tip:** For pure caching layers, completely disabling persistence maximizes write throughput and eliminates disk storage requirements.

## See it

Configuring a pure in-memory cache with zero disk persistence in `redis.conf`:

```text
# Disable RDB snapshots completely
save ""

# Disable Append-Only File completely
appendonly no
```

In `redis-cli`, verify that all persistence engines are disabled:
```bash
CONFIG GET save
# Returns:
# 1) "save"
# 2) ""

CONFIG GET appendonly
# Returns:
# 1) "appendonly"
# 2) "no"

INFO persistence
# Confirms both engines inactive; maximum memory throughput unlocked!
```

With persistence disabled, Redis operates as a purely volatile memory store with zero disk I/O overhead.

## Go deeper

When configuring high-availability setups with primary and secondary replicas, some architectures disable persistence on the primary node to maximize write performance and delegate all RDB snapshots to a dedicated read-only replica.

**Extreme Warning:** If persistence is disabled on the primary and the primary host restarts automatically (e.g., via systemd), the primary boots completely empty! The primary will immediately synchronize its empty state to all replicas, wiping the entire cluster. If disabling persistence on the primary, disable automatic service restarts.

## Watch out

- Never disable persistence on a primary node if automatic process supervisors (systemd, Docker restart) are enabled without Sentinel.
- Do not set `appendfsync always` unless legally mandated; standard disks cannot sustain high write volumes with synchronous fsync.

## Remember

- Pure caching tiers achieve maximum performance by disabling persistence entirely (`save ""` and `appendonly no`).
- Transactional and session stores should run dual persistence with `appendfsync everysec`.
- Be cautious when delegating persistence exclusively to replicas to prevent empty-primary wiping loops.
