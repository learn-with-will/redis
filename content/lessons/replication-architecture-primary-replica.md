---
slug: replication-architecture-primary-replica
title: Primary-Replica Replication Architecture
topic: scaling-and-clustering
kind: concept
summary: Understand Redis master-replica topology, unidirectional synchronization, read scaling, and the REPLICAOF command.
tags:
  - replication
  - replicaof
  - architecture
related:
  - single-threaded-execution
  - persistence-overview-in-memory
---
> **In one line:** Redis replication creates read-only mirrors of a primary node using non-blocking asynchronous data streams.

## The idea
Redis uses a primary-replica (formerly master-slave) architecture to scale read throughput and provide high availability. A single primary node handles all write operations, while one or more replica nodes maintain exact in-memory copies of the primary's dataset.

Replication in Redis is strictly unidirectional: writes flow from primary to replicas. Replicas are read-only by default (`replica-read-only yes`), preventing accidental state drift. Furthermore, replication is non-blocking on the primary: the primary continues serving client queries while streaming updates to connected replicas.

| Role | Operations Handled | Network Direction | Default Port |
| :--- | :--- | :--- | :--- |
| **Primary** | Reads and writes | Streams writes to replicas | 6379 |
| **Replica** | Read-only queries | Connects outbound to primary | 6380+ |

## See it
You configure a replica dynamically using the `REPLICAOF` command or persist it in `redis.conf`:

```bash
# On the replica instance (e.g. running on port 6380)
127.0.0.1:6380> REPLICAOF 127.0.0.1 6379
OK

# Verify replication link state
127.0.0.1:6380> INFO replication
# Replication
role:replica
master_host:127.0.0.1
master_port:6379
master_link_status:up
master_last_io_seconds_ago:1
slave_repl_offset:142857

# Promote replica back to standalone primary
127.0.0.1:6380> REPLICAOF NO ONE
OK
```

## Go deeper
When a replica connects to a primary, they establish a long-lived TCP connection. The primary sends commands to the replica asynchronously in the background. The replica periodically sends heartbeat ACKs containing its replication offset, allowing the primary to detect network drops and track synchronization progress across all mirrors.

In distributed setups, replicas can themselves have replicas, forming a hierarchical tree of nodes. This chained replication topology helps avoid overloading the primary node's outbound network interface when replicating across dozens of read-heavy analytical nodes across multiple data centers.

> **Tip:** By distributing read queries (`GET`, `LRANGE`, `HGETALL`) across multiple read-only replicas, an application can scale read operations horizontally while leaving the primary free to process writes.

## Watch out
* Replicas can return stale data if replication lag occurs or during network partitioning between primary and replicas.
* In Redis, replication alone does not provide automatic failover; if the primary crashes, a human or an orchestrator like Sentinel must promote a replica.

## Remember
* Primary nodes handle writes and stream changes asynchronously to read-only replicas.
* The `REPLICAOF host port` command dynamically attaches an instance to a primary, while `REPLICAOF NO ONE` promotes it.
* Replication scales read throughput and data redundancy but requires external coordination for automated failover.
