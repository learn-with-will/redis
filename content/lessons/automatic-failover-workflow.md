---
slug: automatic-failover-workflow
title: The Automatic Failover Workflow
topic: scaling-and-clustering
kind: pattern
summary: "Step through the step-by-step Sentinel failover sequence: leader election, replica selection, promotion, and reconfiguration."
tags:
  - sentinel
  - failover
  - raft-voting
related:
  - sentinel-architecture-and-quorum
  - replication-architecture-primary-replica
---
> **In one line:** When a primary fails, Sentinels elect a leader via Raft-style consensus to promote the best replica and reconfigure the cluster.

## The idea
When a Redis primary crashes, the Sentinel cluster executes an automated, coordinated sequence of steps to restore write availability without data corruption.

The failover workflow follows four strict phases:
1. **Failure Agreement:** Sentinels transition from SDOWN to ODOWN once quorum is reached.
2. **Leader Election:** Sentinels vote using a Raft-like protocol to designate one Sentinel as the failover coordinator.
3. **Replica Selection:** The elected Sentinel evaluates all replicas and chooses the one with the highest replication offset (least data loss).
4. **Promotion and Reconfiguration:** The leader promotes the selected replica to primary and instructs remaining replicas to follow it.

```text
[Crash Detected] -> [ODOWN Reached] -> [Elect Leader Sentinel]
                                              |
[Update Configs] <- [Reconfigure Replicas] <- [Promote Best Replica]
```

## See it
Inspect the failover logs recorded by Sentinel during an automated promotion:

```text
1:X 15:30:00.100 # +sdown master mymaster 127.0.0.1 6379
1:X 15:30:05.105 # +odown master mymaster 127.0.0.1 6379 #quorum 2/2
1:X 15:30:05.106 # +try-failover master mymaster 127.0.0.1 6379
1:X 15:30:05.110 # +vote-for-leader a1b2c3d4 1
1:X 15:30:05.120 # +elected-leader master mymaster 127.0.0.1 6379
1:X 15:30:05.125 # +failover-state-select-slave master mymaster 127.0.0.1 6379
1:X 15:30:05.200 # +selected-slave slave 127.0.0.1:6380
1:X 15:30:05.201 * +failover-state-send-slaveof-noone slave 127.0.0.1:6380
1:X 15:30:05.250 * +failover-end master mymaster 127.0.0.1 6379
1:X 15:30:05.255 # +switch-master mymaster 127.0.0.1 6379 127.0.0.1 6380
```

## Go deeper
How does Sentinel choose which replica to promote? It checks criteria in strict priority order:
1. Replicas with `replica-priority 0` are never promoted.
2. Replica with lowest `replica-priority` number wins.
3. If priorities tie, the replica with the higher processed replication offset wins (less data loss).
4. If offsets tie, the replica with the lexicographically smaller Run ID wins.

Once selected, the leader sends `REPLICAOF NO ONE` to promote the chosen replica. It then issues `REPLICAOF <new-ip> <new-port>` to the remaining replicas. During this step, the leader monitors the reconfiguration progress, broadcasting status updates to all Sentinel nodes and client application listeners.

This deterministic election ensures minimal data loss and guarantees that all Sentinels converge on the exact same promoted node without human intervention.

> **Tip:** You can set `replica-priority 0` on read-only reporting replicas to ensure Sentinel never promotes them to write primaries.

## Watch out
* When the old crashed primary comes back online, Sentinel automatically reconfigures it as a replica of the new primary.
* Replicas synchronize one by one (or in batches defined by `parallel-syncs`) to avoid overloading the new primary.

## Remember
* Sentinel failover proceeds from ODOWN to leader election, replica selection, and role reassignment.
* The replica with the highest replication offset is prioritized for promotion to minimize data loss.
* Old primaries that recover are automatically demoted to replicas of the newly elected primary.
