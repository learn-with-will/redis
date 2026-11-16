---
slug: sentinel-architecture-and-quorum
title: Sentinel Architecture and Quorum
topic: scaling-and-clustering
kind: concept
summary: Understand how Redis Sentinel instances monitor nodes, elect leaders, and reach quorum to achieve automated high availability.
tags:
  - sentinel
  - high-availability
  - quorum
related:
  - replication-architecture-primary-replica
  - asynchronous-replication-tradeoffs
---
> **In one line:** Redis Sentinel is a distributed monitoring system that automatically detects primary failures and promotes healthy replicas.

## The idea
Redis Sentinel provides automated high availability without manual intervention. Sentinels run as separate standalone processes that monitor Redis primaries and replicas, notify administrators or clients of state changes, and execute automated failover.

To avoid false alarms caused by transient network glitches, Sentinel uses a two-stage failure detection mechanism:
1. **Subjective Down (SDOWN):** A single Sentinel detects that a primary is unreachable for `down-after-milliseconds`.
2. **Objective Down (ODOWN):** A configured number of Sentinels (the `quorum`) agree that the primary is unreachable.

| Component | Responsibility | Recommended Minimum Count |
| :--- | :--- | :--- |
| **Sentinel Nodes** | Monitor health, elect leader, execute failover | 3 nodes (odd number) |
| **Primary Node** | Process writes and stream to replicas | 1 node |
| **Replica Nodes** | Replicate primary and serve reads | 2+ nodes |

## See it
Configure a Sentinel instance in `sentinel.conf` with a quorum of 2 across 3 Sentinels:

```text
# Port for Sentinel communication
port 26379

# Monitor primary named 'mymaster' at 127.0.0.1:6379 with a quorum of 2
sentinel monitor mymaster 127.0.0.1 6379 2

# Declare SDOWN after 5 seconds of unresponsiveness
sentinel down-after-milliseconds mymaster 5000

# Maximum failover duration
sentinel failover-timeout mymaster 60000

# Number of replicas reconfigured in parallel after failover
sentinel parallel-syncs mymaster 1

# Specify authorization password for primary
sentinel auth-pass mymaster SecretPassword123
```

## Go deeper
Sentinels discover each other and replicas automatically via Redis Pub/Sub channels on the primary (`__sentinel__:hello`). You do not need to configure other Sentinels or replicas in `sentinel.conf`—only the primary IP and port.

Every two seconds, Sentinels publish their identity, IP, port, and current view of the master to `__sentinel__:hello`. All other monitoring Sentinels receive this message, update their roster of peers, and dynamically establish direct TCP connections to each other. This gossip protocol guarantees that adding a new Sentinel node requires zero configuration updates on existing nodes.

> **Tip:** Always deploy at least 3 Sentinel nodes in distinct physical availability zones or failure domains to prevent split-brain consensus failures.

## Watch out
* A quorum of 2 in a 3-node Sentinel setup means at least 2 Sentinels must agree to declare ODOWN, and a majority (2 out of 3) must vote to authorize a failover leader.
* Sentinels do not act as data proxies; client applications communicate with Sentinels only to discover the active primary address.

## Remember
* Sentinel monitors Redis nodes and coordinates automated failover when primaries crash.
* Quorum is the number of Sentinels that must confirm a primary is down before declaring ODOWN.
* Always deploy an odd number of Sentinels (at least 3) across independent physical failure zones.
