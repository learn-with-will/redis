---
slug: cluster-failover-and-limitations
title: Cluster Failover and Architectural Limitations
topic: scaling-and-clustering
kind: concept
summary: Examine how Redis Cluster executes automated failover without Sentinel, and understand key architectural limitations.
tags:
  - cluster
  - failover
  - limitations
related:
  - redis-cluster-sharding-hash-slots
  - sentinel-architecture-and-quorum
---
> **In one line:** Redis Cluster manages its own internal replica failover via node consensus without needing separate Sentinel processes.

## The idea
In Redis Cluster, you do not deploy Redis Sentinel. Instead, the cluster nodes monitor each other directly over the cluster bus (port offset +10000, e.g. port 16379 for port 6379) using a gossip protocol.

When a primary node fails:
1. Replicas and other primaries detect the primary is unreachable (`PFAIL` -> `FAIL`).
2. A replica of the failed primary requests votes from the surviving primaries.
3. If a majority of surviving primaries vote in favor, the replica promotes itself to primary and assumes ownership of the failed primary's hash slots.
4. The new primary broadcasts a `PONG` packet announcing the configuration change.

```text
Primary A (Failed) ------ Node B (Primary) [Votes YES]
       |                      |
Replica A-1 (Candidate) - Node C (Primary) [Votes YES]
       |
[Promoted to Primary for Slots 0..5460]
```

## See it
Trigger a manual, zero-downtime failover on a replica node using `CLUSTER FAILOVER`:

```bash
# Connect to a replica node
$ redis-cli -p 7003

# Execute coordinated graceful failover
127.0.0.1:7003> CLUSTER FAILOVER
OK

# Check node role status
127.0.0.1:7003> CLUSTER NODES
7003myself,master - 0 1620000000 4 connected 0-5460
7000master,slave 7003 0 1620000000 1 connected

# Verify replication info
127.0.0.1:7003> INFO replication
role:master
```

## Go deeper
`CLUSTER FAILOVER` pauses write clients on the primary, waits for the replica to catch up with replication offset, and promotes the replica with zero data loss—ideal for OS patching and maintenance.

| Feature / Limit | Standalone / Sentinel | Redis Cluster |
| :--- | :--- | :--- |
| **Multiple Databases** | Yes (`SELECT 0..15`) | No (Database 0 only) |
| **Cross-slot Multi-Key** | Yes (all keys accessible) | No (must use hash tags) |
| **Failover Coordinator** | Separate Sentinel daemons | Built-in primary consensus |
| **Horizontal Sharding** | Manual / Application-layer | Native (16,384 slots) |

When designing architectures, remember that Redis Cluster adds operational complexity compared to standalone or Sentinel topologies. Choose Cluster primarily when single-node memory or write bandwidth becomes a true hardware bottleneck.

> **Tip:** If more than half of the master nodes fail simultaneously, Redis Cluster cannot reach quorum to elect new masters and halts cluster operations.

## Watch out
* If a primary fails and has no attached replica, the cluster enters failure state and rejects all queries unless `cluster-require-full-coverage no` is set.
* Multi-key transactions (`MULTI`/`EXEC`) cannot span across nodes.

## Remember
* Redis Cluster has native distributed failure detection and auto-failover, removing the need for Sentinel.
* Surviving primary nodes vote on replica promotion via internal gossip protocol communication.
* Redis Cluster limits operations to database 0 and prohibits multi-key operations across differing hash slots.
