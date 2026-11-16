---
slug: redis-cluster-sharding-hash-slots
title: Redis Cluster Sharding and Hash Slots
topic: scaling-and-clustering
kind: concept
summary: Master horizontal sharding with Redis Cluster, the 16384 hash slots model, and CRC16 key-to-node mapping.
tags:
  - cluster
  - sharding
  - hash-slots
related:
  - replication-architecture-primary-replica
  - single-threaded-execution
---
> **In one line:** Redis Cluster scales writes and memory horizontally by dividing the keyspace into 16,384 deterministic hash slots.

## The idea
While replication and Sentinel scale reads and provide high availability, they do not scale write throughput or memory capacity—all writes still hit a single primary node.

**Redis Cluster** provides horizontal partitioning (sharding) across multiple primary nodes. Every key belongs to one of exactly **16,384 hash slots**. The slots are distributed among the primary nodes in the cluster.

$$	ext{slot} = 	ext{CRC16}(	ext{key}) \pmod{16384}$$

| Primary Node | Assigned Hash Slots | Approximate Allocation |
| :--- | :--- | :--- |
| **Node A** | 0 to 5460 | 5,461 slots (33.3%) |
| **Node B** | 5461 to 10922 | 5,462 slots (33.3%) |
| **Node C** | 10923 to 16383 | 5,461 slots (33.3%) |

## See it
Inspect hash slot allocation and cluster topology using `CLUSTER NODES` and `CLUSTER KEYSLOT`:

```bash
# Calculate which hash slot a key maps to
127.0.0.1:7000> CLUSTER KEYSLOT "user:1000"
(integer) 12454

127.0.0.1:7000> CLUSTER KEYSLOT "orders:recent"
(integer) 3491

# Inspect cluster topology and slot ranges
127.0.0.1:7000> CLUSTER SLOTS
1) 1) (integer) 0
   2) (integer) 5460
   3) 1) "127.0.0.1"
      2) (integer) 7000
2) 1) (integer) 5461
   2) (integer) 10922
   3) 1) "127.0.0.1"
      2) (integer) 7001
3) 1) (integer) 10923
   2) (integer) 16383
   3) 1) "127.0.0.1"
      2) (integer) 7002

# Query the node owning a specific slot
127.0.0.1:7000> CLUSTER NODES
```

## Go deeper
Why are there exactly 16,384 slots instead of 65,536? 16,384 slots require only 2KB of heartbeat packet payload (`16384 / 8` bits). Nodes exchange heartbeats continuously via a cluster bus; using 65,536 slots would require 8KB packets, creating excessive network overhead.

When scaling up a cluster, you can add a fourth node and execute `redis-cli --cluster reshard` to move slots non-destructively from the existing three nodes to the new node while the cluster continues servicing read and write requests with minimal latency impact.

> **Tip:** Redis Cluster requires at least 3 primary nodes to form a stable, fault-tolerant cluster capable of electing leaders.

## Watch out
* Redis Cluster does not support multiple logical databases; only database 0 (`SELECT 0`) is permitted.
* Multi-key operations (`MGET`, `MSET`, `SUNION`) are permitted only if all keys map to the exact same hash slot.

## Remember
* Redis Cluster partitions data deterministically across 16,384 hash slots using CRC16 modulo 16384.
* Each primary owns a subset of slots; adding or removing nodes migrates slots between instances.
* A production cluster requires a minimum of 3 primary nodes, typically paired with 3 replicas.
