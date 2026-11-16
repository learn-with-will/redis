---
slug: asynchronous-replication-tradeoffs
title: Asynchronous Replication Tradeoffs
topic: scaling-and-clustering
kind: concept
summary: Explore the CAP theorem implications, replication lag, and window of vulnerability in Redis asynchronous replication.
tags:
  - cap-theorem
  - replication-lag
  - consistency
related:
  - replication-architecture-primary-replica
  - full-vs-partial-resynchronization
---
> **In one line:** Redis replication prioritizes low-latency throughput over strict consistency, creating a small window for data loss during primary crashes.

## The idea
Redis replication is asynchronous by default. When a client executes a write command like `SET user:1 "Alice"`, the primary executes the command, returns an immediate acknowledgment `+OK` to the client, and only then streams the write command to connected replicas.

This design delivers sub-millisecond response times because network round-trips to replicas do not sit on the critical path of write commands. However, it means Redis acts as an AP (Available and Partition-tolerant) system rather than a strongly consistent CP system.

```text
Client                     Primary                    Replica
  |                           |                          |
  |--- SET order:9 "paid" --->|                          |
  |<------- +OK --------------| (Immediate ack)          |
  |                           |---- async repl stream -->|
  |                           |                          |=== Lag ===
  |                           |                          x (Crash!)
```

## See it
Inspect replication lag by comparing the master offset with the replica acknowledgment offset:

```bash
# Query the primary for connected replica metrics
127.0.0.1:6379> INFO replication
# Replication
role:master
connected_slaves:2
master_repl_offset:284920
slave0:ip=127.0.0.1,port=6380,state=online,offset=284920,lag=0
slave1:ip=127.0.0.1,port=6381,state=online,offset=284600,lag=2

# Check memory overhead dedicated to replication
127.0.0.1:6379> INFO memory
used_memory_overhead:3145728
```

## Go deeper
Notice in the output above that `slave1` has an offset of `284600` with `lag=2` seconds, while the primary is at `284920`. If the primary crashes before `slave1` receives those 320 bytes, any unpropagated writes will be permanently lost unless another replica caught up.

To control this risk, Redis provides safety guardrails in `redis.conf`: `min-replicas-to-write <n>` and `min-replicas-max-lag <sec>`. When enabled, the primary checks connected replicas before every write. If fewer than `n` replicas have pinged the primary within the maximum lag window, the primary enters a safe protective mode and rejects incoming write operations with an error, preventing silent data loss accumulation.

> **Note:** Redis provides `min-replicas-to-write <n>` and `min-replicas-max-lag <sec>` settings. When configured, the primary rejects writes if fewer than `n` replicas are healthy and within the maximum lag window.

## Watch out
* `min-replicas-to-write` does not guarantee zero data loss; it merely bounds the window of exposure by stopping writes when lag grows too large.
* Replicas serving stale read traffic during high replication lag can cause read-your-writes anomalies in client applications.

## Remember
* Primary nodes acknowledge writes immediately before streaming them to replicas for high performance.
* If a primary suffers sudden hardware failure before writes reach replicas, unpropagated writes are permanently lost.
* Use `min-replicas-to-write` and `min-replicas-max-lag` to halt writes if replication health degrades below thresholds.
