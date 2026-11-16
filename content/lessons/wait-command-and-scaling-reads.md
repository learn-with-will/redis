---
slug: wait-command-and-scaling-reads
title: Scaling Reads and the WAIT Command
topic: scaling-and-clustering
kind: technique
summary: Master the synchronous WAIT command to confirm replica propagation and configure read replica routing safely.
tags:
  - wait
  - synchronous-replication
  - read-scaling
related:
  - asynchronous-replication-tradeoffs
  - replication-architecture-primary-replica
---
> **In one line:** The WAIT command synchronously blocks the client until a write has propagated to a specified number of replicas.

## The idea
Although Redis replication is asynchronous by default, applications sometimes require higher durability guarantees for critical transactions (such as financial credits or user password changes).

The `WAIT` command transforms asynchronous write workflows into semi-synchronous ones. It blocks the caller until the current write offset has been acknowledged by at least `numreplicas` nodes, or until a specified millisecond timeout elapses.

| Parameter | Type | Meaning |
| :--- | :--- | :--- |
| `numreplicas` | Integer | Minimum count of replicas that must acknowledge the write offset |
| `timeout` | Milliseconds | Maximum time to block (0 means wait indefinitely) |

## See it
Issue a critical write followed immediately by a `WAIT` command:

```bash
# Set key on primary
127.0.0.1:6379> SET user:10:account_balance "500.00"
OK

# Block until at least 2 replicas acknowledge the write, timeout after 1000ms
127.0.0.1:6379> WAIT 2 1000
(integer) 2

# Example when replica quorum cannot be met within timeout
127.0.0.1:6379> WAIT 5 500
(integer) 2

# Confirm that subsequent operations proceed normally
127.0.0.1:6379> GET user:10:account_balance
"500.00"
```

## Go deeper
`WAIT` returns the actual number of replicas that acknowledged the offset. If the return value is less than the requested count, the timeout expired before all requested replicas caught up.

When architecting high-throughput systems, engineers separate client connection pools into distinct write pools and read pools. The write pool targets the single primary node, while the read pool balances queries across replicas using round-robin DNS or proxy load balancers like HAProxy or Envoy.

Because `WAIT` introduces synchronous waiting intervals into an otherwise fully asynchronous pipeline, benchmark your tail latencies (p99) carefully before applying it globally across web requests. In practice, reserve `WAIT` for rare, high-consequence state changes where durability takes precedence over raw request throughput.

> **Tip:** `WAIT` does not make Redis a strongly consistent distributed datastore; if a failover occurs during a partition, a promoted replica that did not receive the write can still cause data divergence.

## Watch out
* `WAIT` blocks only the issuing client connection; other clients can continue reading and writing on the primary concurrently.
* Never use `timeout 0` in production environments, as an unexpected replica network failure could block the client connection forever.

## Remember
* `WAIT numreplicas timeout` blocks until the current write reaches the specified number of replicas.
* The command returns the count of replicas that successfully synchronized before the timeout expired.
* Always supply a non-zero timeout to avoid hanging client connection threads when replicas fail.
