---
slug: sentinel-configuration-and-split-brain
title: Sentinel Configuration and Split-Brain Prevention
topic: scaling-and-clustering
kind: pitfall
summary: Mitigate network partition split-brain risks using min-replicas-to-write and appropriate Sentinel placement.
tags:
  - split-brain
  - network-partition
  - sentinel-config
related:
  - sentinel-architecture-and-quorum
  - automatic-failover-workflow
---
> **In one line:** Split-brain occurs when a partitioned primary accepts writes while Sentinel promotes a new primary, causing lost updates.

## The idea
A **split-brain scenario** occurs when a network partition isolates the primary node from both Sentinels and replicas. The majority partition elects a new primary, while the minority partition continues accepting writes to the old primary.

When the network partition heals, the old primary is demoted to a replica of the new primary. Its dataset is completely overwritten with the new primary's RDB snapshot, resulting in the permanent loss of all writes made to the old primary during the partition.

```text
[Minority Partition]                  [Majority Partition]
Client A -> Old Primary (Port 6379)    Sentinel 1, 2 + Replica 1
Writes accepted! (DANGER)              Sentinel promotes Replica 1 -> New Primary
                                       Client B -> New Primary (Port 6380)
----------------- Network Heals -----------------
Old Primary demoted to replica -> Wipes local data -> Writes from Client A LOST!
```

## See it
Protect against split-brain by configuring `min-replicas-to-write` on all Redis instances:

```text
# redis.conf

# Require at least 1 healthy replica to acknowledge writes
min-replicas-to-write 1

# Maximum acceptable lag in seconds before refusing writes
min-replicas-max-lag 10
```

Verify how the isolated primary behaves when replicas are unreachable:

```bash
# When replica count drops below min-replicas-to-write
127.0.0.1:6379> SET user:100 "active"
(error) NOREPLICAS Not enough good replicas to write.

# Read commands continue to work normally
127.0.0.1:6379> GET user:99
"cached_value"

# Check connected replicas count
127.0.0.1:6379> INFO replication
connected_slaves:0
```

## Go deeper
With `min-replicas-to-write 1` and `min-replicas-max-lag 10`, an isolated primary in a minority partition detects within 10 seconds that no replica is sending heartbeats. It immediately begins rejecting write operations with `NOREPLICAS`.

Physical topology is equally critical: never deploy an even number of Sentinels, and never place all Sentinels in the same failure domain as the primary. Distribute Sentinels across three independent availability zones (AZ1, AZ2, AZ3) so any single AZ loss leaves a functional two-thirds majority to achieve quorum and vote.

> **Note:** This bounds the window of potential lost writes to a maximum of 10 seconds instead of the entire duration of the partition.

## Watch out
* If all replicas in a healthy single-datacenter deployment crash, `min-replicas-to-write` will reject all writes until at least one replica recovers.
* Ensure Sentinels are distributed across odd counts of failure domains (e.g. 1 in AZ-A, 1 in AZ-B, 1 in AZ-C).

## Remember
* Split-brain causes permanent write loss when an isolated primary's dataset is overwritten after network recovery.
* Configure `min-replicas-to-write` and `min-replicas-max-lag` to halt writes when replica heartbeats disappear.
* Distribute Sentinel processes across multiple availability zones to ensure majority quorums reflect true health.
