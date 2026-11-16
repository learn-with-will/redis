---
slug: full-vs-partial-resynchronization
title: Full vs. Partial Resynchronization (PSYNC)
topic: scaling-and-clustering
kind: concept
summary: Learn how PSYNC uses replication IDs and circular backlogs to avoid expensive full disk snapshots during reconnects.
tags:
  - psync
  - replication-id
  - repl-backlog
related:
  - replication-architecture-primary-replica
  - rdb-snapshots-save-bgsave
---
> **In one line:** PSYNC avoids full snapshot transfers on reconnect by replaying missing bytes from a circular memory backlog.

## The idea
When a replica connects to a primary, Redis must determine whether it needs a full synchronization or a fast partial resynchronization (`PSYNC`). 

In a **full resync**, the primary forks a background process to generate an RDB snapshot file, streams that RDB over the network to the replica, and the replica wipes its current memory to load the snapshot. This incurs high CPU, memory, and disk I/O.

In a **partial resync**, the primary merely streams the incremental commands that the replica missed during a temporary network blip, completing the catch-up in milliseconds.

| Component | Purpose | Location |
| :--- | :--- | :--- |
| **Replication ID** | Marks a continuous lineage of data history | Primary and all replicas |
| **Replication Offset** | Monotonically increasing byte counter | Tracks synchronization state |
| **Replication Backlog** | In-memory circular ring buffer holding recent writes | Primary memory |

## See it
Observe the PSYNC handshake in primary server logs when a replica reconnects after a short disconnection:

```text
[Primary logs]
1:M 14:02:10.120 * Replica 127.0.0.1:6380 asks for synchronization
1:M 14:02:10.120 * Partial resynchronization request from 127.0.0.1:6380 accepted.
1:M 14:02:10.121 * Sending 1048 bytes of backlog data to replica for offset 142857.

[Replica logs]
2:S 14:02:10.119 * Connecting to MASTER 127.0.0.1:6379
2:S 14:02:10.120 * MASTER <-> REPLICA sync: Receiving 1048 bytes from master to sync
2:S 14:02:10.121 * MASTER <-> REPLICA sync: Master accepted PSYNC request
2:S 14:02:10.122 * MASTER <-> REPLICA sync: Finished with success
```

## Go deeper
The primary maintains `repl-backlog-size` (default 1MB). If a replica disconnects and reconnects while its last known offset is still within the backlog's byte window, a partial resynchronization succeeds. Every connected replica also inherits the master's replication ID and offset, so if a failover occurs, a promoted replica can serve partial resynchronizations to its sibling replicas without forcing full snapshot transfers.

Modern Redis versions also support diskless replication via `repl-diskless-sync yes`. Instead of creating an RDB file on local storage, the primary forks and writes the serialized dataset directly into the network sockets connected to waiting replicas.

> **Tip:** If replicas frequently drop and trigger expensive full RDB resynchronizations, increase `repl-backlog-size` in `redis.conf` to give replicas more time to reconnect.

## Watch out
* If a replica disconnects for longer than the backlog window can retain, the primary is forced to execute a full RDB resync.
* Diskless replication requires configuring `repl-diskless-sync-delay` so multiple reconnecting replicas can join the same streaming transmission.

## Remember
* Redis uses `PSYNC <replid> <offset>` to negotiate synchronization between primary and replica.
* A partial resync succeeds if the replica's replication ID matches and its offset is present in the primary's circular backlog.
* Size `repl-backlog-size` generously according to your write throughput and expected network disconnection windows.
