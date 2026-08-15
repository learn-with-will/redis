---
id: lesson-18
slug: replication
title: "Replication"
level: advanced
order: 18
duration: 22
tags:
  - replication
  - primary-replica
  - consistency
  - scaling-reads
  - availability
summary: "Redis replication: a primary streams changes to read-only replicas with REPLICAOF. Learn full vs partial resync, why replication is asynchronous (and what that means for consistency and failover), and how to scale reads."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Set up a **primary/replica** relationship with `REPLICAOF` and read from replicas.
- Explain **asynchronous** replication and its consequences for consistency and failover.
- Distinguish **full** resynchronization from **partial** resync.
- Use `WAIT` to ask for stronger acknowledgement — and know its limits.

# Why It Matters

A single Redis instance is a single point of failure and a single machine's worth of read capacity.
**Replication** copies your data to one or more other instances, giving you a warm standby for
availability and extra nodes to serve reads. But Redis replication is **asynchronous**, which has real
implications: understand them and you'll design correctly; ignore them and you'll be surprised by lost
writes after a failover.

# Concept Explanation

### Primary and replicas

In Redis replication one instance is the **primary** (leader) and one or more are **replicas**
(followers). A replica holds a copy of the primary's data and, by default, is **read-only**
(`replica-read-only yes`). You point a replica at a primary with:

```text
127.0.0.1:6380> REPLICAOF 127.0.0.1 6379
OK
```

(`REPLICAOF NO ONE` promotes a replica back to an independent primary; the command was historically
`SLAVEOF`.) The replica connects, gets a copy of the dataset, and then receives a continuous stream of
the primary's writes to stay up to date. Replicas can even have **their own replicas** (chained
replication), spreading the load of feeding many followers.

### Full vs partial resynchronization

When a replica first connects (or reconnects after being far behind), it does a **full sync**: the
primary produces an RDB snapshot, sends it to the replica, and then streams the writes that happened
since. Full syncs are relatively expensive (a snapshot + transfer).

For brief disconnects, Redis avoids a full resync with **partial resynchronization**: the primary
keeps a **replication backlog** (a buffer of recent writes) tagged with a **replication ID** and an
**offset**. If a reconnecting replica's offset is still within the backlog, the primary just sends the
missing slice (`PSYNC`) instead of a whole new snapshot. This makes short network blips cheap to
recover from.

### Asynchronous replication (the crucial property)

By default, a primary **acknowledges a write to the client as soon as it applies it locally** — it does
**not** wait for replicas to confirm. Replication happens **asynchronously** in the background. The
consequences:

- **A failover can lose writes.** If the primary acknowledges some writes and then crashes before those
  writes reach a replica, and that replica is promoted, the acknowledged-but-unreplicated writes are
  **gone**. Redis replication is **not strongly consistent**.
- **Replicas can lag.** A read from a replica may return slightly **stale** data (it hasn't received
  the latest writes yet). This is usually fine for caching but not for read-after-write correctness.

This is a deliberate trade: asynchronous replication keeps writes fast. If you need stronger
guarantees, you adjust, but you can't fully eliminate the window.

### `WAIT`: asking for acknowledgement

`WAIT numreplicas timeout` blocks the client until at least `numreplicas` replicas have acknowledged all
your writes so far (or the timeout elapses), returning how many acked. It **reduces** the window in
which a write could be lost on failover — but it is **not** a full consistency guarantee: it doesn't
make replication synchronous for everyone, doesn't guarantee durability to disk, and a partition can
still cause trouble. Use it to strengthen critical writes, not as a magic "now it's consistent" switch.

### Scaling reads

Because replicas hold a full copy and serve reads, you can send read traffic to them to scale read
throughput — send writes to the primary, spread reads across replicas. Just remember the **lag**: a
value written to the primary may not be on a replica yet, so don't read-after-write from a replica when
you need to see your own write immediately.

# Key Terminology

- **Primary / replica** — the leader that takes writes / the read-only follower(s) that copy it.
- **`REPLICAOF`** — makes an instance replicate a given primary (`REPLICAOF NO ONE` promotes it).
- **Full resync** — snapshot + stream sent to a replica on first/again-far-behind connect.
- **Partial resync** — sending just the missed writes from the replication **backlog** (via `PSYNC`).
- **Asynchronous replication** — the primary doesn't wait for replicas before acking writes.
- **`WAIT`** — block until N replicas acknowledge; reduces (not eliminates) the loss window.

# Options and Trade-offs

| Goal | Approach | Trade-off |
| ---- | -------- | --------- |
| **Read scaling** | Send reads to replicas | Replicas can be stale (lag) |
| **Warm standby / availability** | Keep replicas ready to promote | Async means a failover can lose recent writes |
| **Stronger write safety** | `WAIT n timeout` on critical writes | Slower; still not full consistency or durability |
| **Automatic failover** | Add **Sentinel** or **Cluster** (next lessons) | More moving parts to operate |

# Worked Example

Attach a replica, confirm it's syncing, and see the read-only behavior:

```text
# On the replica (port 6380)
127.0.0.1:6380> REPLICAOF 127.0.0.1 6379
OK
127.0.0.1:6380> INFO replication
# Replication
role:replica
master_host:127.0.0.1
master_link_status:up
slave_read_only:1
master_repl_offset:5120

# Writing to a replica is refused
127.0.0.1:6380> SET k "v"
(error) READONLY You can't write against a read only replica.

# The primary, meanwhile
127.0.0.1:6379> INFO replication
# Replication
role:master
connected_slaves:1
slave0:ip=127.0.0.1,port=6380,state=online,offset=5120,lag=0
```

The replica shows `role:replica`, a healthy `master_link_status:up`, and refuses writes; the primary
reports one connected, online replica at the same offset (no lag right now).

# Real World Analogy

Replication is a **head office (primary) dictating updates to branch offices (replicas)**. The branches
keep synchronized copies and can answer customer questions (reads), taking load off head office. But
because the memos go out **after** head office has already acted (asynchronous), a branch might be a few
memos behind, and if head office burns down before the latest memos are delivered, whoever takes over
never learns about those last changes.

# Examples

## Example 1 — Basic: offloading reads

A read-heavy analytics dashboard points its queries at two replicas while the application writes to the
primary. Read capacity roughly multiplies with the number of replicas, and the primary is freed up for
writes.

**Why this works:** replicas hold full copies and serve reads independently, so read throughput scales
horizontally.

## Example 2 — Real-world: fast recovery from a blip

A replica's network hiccups for two seconds. Because its offset is still within the primary's
replication backlog, it reconnects and does a **partial** resync — just the missed writes — instead of
transferring a whole new snapshot.

**Why this works:** the backlog + offset let Redis resume exactly where the replica left off, avoiding
an expensive full sync for short outages.

## Example 3 — Trade-off / pitfall: lost writes on failover

A primary acknowledges 50 orders, then crashes before they replicate. A replica missing those 50 is
promoted. The 50 acknowledged orders are gone, and the app that got "OK" now can't find them.

**Why this bites:** asynchronous replication means an ack doesn't guarantee the write reached a replica.
For critical writes, use `WAIT` (to shrink the window) and durable persistence — and understand the
guarantee is still not absolute.

# Common Mistakes

- **Assuming an acknowledged write is safely replicated.** It isn't by default — replication is async.
- **Reading your own recent write from a lagging replica.** You may not see it yet; read from the
  primary when you need read-after-write.
- **Treating `WAIT` as full consistency.** It reduces the loss window but doesn't make Redis strongly
  consistent or guarantee disk durability.
- **Writing to a replica.** Replicas are read-only by default; writes are refused with `READONLY`.

# Best Practices

- Use replicas to **scale reads** and as **warm standbys**, but design around **lag** and the
  **async loss window**.
- For critical writes, combine durable **persistence** (AOF) with **`WAIT`** to strengthen safety —
  while knowing the guarantee isn't absolute.
- Don't do **read-after-write from replicas** unless staleness is acceptable.
- For **automatic failover**, add **Sentinel** (single primary) or **Cluster** (sharded) — replication
  alone doesn't promote a replica for you.

# Summary

- Redis replication copies a **primary's** data to read-only **replicas** (`REPLICAOF`); replicas can
  serve reads and act as warm standbys, and can be chained.
- First/again-behind connections do a **full resync** (snapshot + stream); short reconnects use
  **partial resync** from the **replication backlog** via `PSYNC`.
- Replication is **asynchronous**: the primary acks before replicas confirm, so **failover can lose
  writes** and replica reads can be **stale**. It is **not strongly consistent**.
- **`WAIT n timeout`** shrinks the loss window by requiring replica acks, but is not full consistency or
  durability.
- Replication alone doesn't fail over — **Sentinel** or **Cluster** adds that.

# Flash Cards

Q: What command makes an instance replicate another, and what does REPLICAOF NO ONE do?
A: REPLICAOF host port points it at a primary; REPLICAOF NO ONE promotes it back to an independent primary.

Q: Why can a failover lose recently acknowledged writes?
A: Replication is asynchronous — the primary acks a write before replicas confirm it, so writes not yet replicated are lost if that primary dies and a behind replica is promoted.

Q: What's the difference between full and partial resynchronization?
A: A full resync sends a whole snapshot plus the stream; a partial resync sends only the writes missed since the replica's offset, using the primary's replication backlog.

Q: Are Redis replicas writable by default?
A: No — replicas are read-only by default (replica-read-only), and writes are refused with a READONLY error.

Q: What does WAIT do, and what does it NOT guarantee?
A: WAIT blocks until N replicas acknowledge your writes (shrinking the loss window); it does not make replication fully synchronous, strongly consistent, or guarantee disk durability.

Q: Why be careful reading your own recent write from a replica?
A: Replicas can lag, so a value just written to the primary may not be on the replica yet — read from the primary when you need read-after-write.

# Exercises

### Easy
Start a second Redis on port 6380 and run `REPLICAOF 127.0.0.1 6379`. On the replica, run `INFO
replication` and confirm `role:replica` and `master_link_status:up`. Try a `SET` on the replica and
note the error.

### Medium
Write a key on the primary and immediately `GET` it on the replica. Usually it's there — explain why it
*might* occasionally not be, in terms of replication lag, and when that would matter.

### Challenging
Describe, step by step, how a primary crash can lose acknowledged writes with async replication. Then
explain what `WAIT 1 100` before critical writes changes about the risk — and why it still isn't a full
guarantee.

# Further Reading

- Redis — *Replication*: <https://redis.io/docs/latest/operate/oss_and_stack/management/replication/>
- Redis — *REPLICAOF*: <https://redis.io/commands/replicaof/>
- Redis — *WAIT*: <https://redis.io/commands/wait/>
