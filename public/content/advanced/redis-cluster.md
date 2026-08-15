---
id: lesson-20
slug: redis-cluster
title: "Redis Cluster"
level: advanced
order: 20
duration: 26
tags:
  - cluster
  - sharding
  - hash-slots
  - hash-tags
  - scaling
summary: "Redis Cluster shards data across 16384 hash slots on multiple primaries, each with replicas. Learn how keys map to slots (CRC16), MOVED/ASK redirects, hash tags for multi-key ops, and Cluster's consistency limits."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Explain how Redis Cluster **shards** data across **16384 hash slots**.
- Compute which slot a key lands in and why it isn't consistent hashing.
- Handle **`MOVED`** and **`ASK`** redirects and use **hash tags** for multi-key operations.
- Describe Cluster's **consistency limits** and how it differs from Sentinel.

# Why It Matters

Replication and Sentinel keep *one machine's worth* of data available. When your dataset or write
throughput outgrows a single node, you need to **shard** — split the data across many nodes.
**Redis Cluster** does this automatically, spreading keys over multiple primaries (each with replicas)
and routing clients to the right node. It also changes some rules: multi-key commands and consistency
behave differently, and knowing that up front saves painful surprises.

# Concept Explanation

### Sharding with 16384 hash slots

Redis Cluster divides the keyspace into a fixed **16384 hash slots**. Every key is assigned to a slot
by a hash of its name:

```text
slot = CRC16(key) mod 16384
```

Each **primary** node in the cluster owns a **subset of the slots** (for example, with three primaries,
roughly slots 0–5460, 5461–10922, and 10923–16383). To store or fetch a key, its slot tells you which
node is responsible. Note this is **fixed-slot sharding**, *not* consistent hashing — slots are an
explicit mapping you can move between nodes.

Each primary typically has one or more **replicas** for failover: if a primary fails, the cluster
promotes one of its replicas (Cluster has built-in failover, like Sentinel but integrated).

### How clients find the right node: MOVED and ASK

A cluster-aware client learns the slot→node map and sends each command to the node owning that key's
slot. If it guesses wrong (or the map changed), the node replies with a **redirect**:

- **`MOVED <slot> <host:port>`** — "this slot now lives on that node." The client updates its map and
  retries there. `MOVED` means a **stable** relocation.
- **`ASK <slot> <host:port>`** — "this slot is **being migrated**; for this one request, ask that node."
  `ASK` is a **temporary** redirect during resharding and doesn't change the client's map.

```text
127.0.0.1:7000> GET user:42
(error) MOVED 3999 127.0.0.1:7001
```

Good client libraries handle these redirects for you, so you rarely see them directly — but recognizing
them is key to understanding cluster behavior.

### Resharding

You can **reshard** a live cluster — move slots (and their keys) from one node to another — to add
capacity or rebalance. During migration, requests for keys in a moving slot may get `ASK` redirects.
Redis provides tooling (`redis-cli --cluster`) to add nodes and move slots.

### Multi-key operations and hash tags

Here's a rule that trips people up: a multi-key command (like `MGET`, `SINTER`, or a transaction over
several keys) only works if **all the keys are in the same slot** — otherwise the cluster can't run it
on one node and returns a **`CROSSSLOT`** error.

To force related keys into the same slot, use a **hash tag**: if a key name contains a substring in
`{...}`, only that substring is hashed. So `{user:42}:profile` and `{user:42}:cart` both hash on
`user:42` and land in the **same slot**, letting you run multi-key operations on them.

```text
127.0.0.1:7000> MSET {user:42}:name "Ada" {user:42}:age "36"
OK
```

Design keys that must be used together with a shared hash tag.

### Consistency and other limits

Cluster is powerful but has boundaries you must respect:

- **Not strongly consistent.** Like plain replication, writes to a primary replicate to its replicas
  **asynchronously**, so a failover or partition can lose recently acknowledged writes.
- **One logical database only.** Cluster uses database 0; the `SELECT` multiple-database feature isn't
  available.
- **Multi-key ops need same-slot keys** (hash tags), as above.
- **Client must be cluster-aware** (or connect through a proxy) to follow redirects.

Cluster trades some simplicity and consistency for **horizontal scale** of both memory and throughput.

# Key Terminology

- **Hash slot** — one of 16384 buckets; a key's slot is `CRC16(key) mod 16384`.
- **Shard / primary** — a node owning a subset of slots (with replicas for failover).
- **`MOVED` / `ASK`** — redirects: a permanent slot relocation / a temporary during-migration hint.
- **Hash tag** — a `{...}` substring that forces keys into the same slot.
- **`CROSSSLOT` error** — a multi-key command whose keys span different slots.

# Options and Trade-offs

| Need | Use | Why |
| ---- | --- | --- |
| **Data fits one node; want HA** | Sentinel + replication | Simpler; no sharding rules to obey |
| **Data/throughput exceeds one node** | Cluster | Shards across primaries; scales horizontally |
| **Multi-key ops across related keys in Cluster** | Hash tags | Keeps those keys in one slot |
| **Strong consistency / rich transactions** | A different datastore | Cluster is async and not strongly consistent |

# Worked Example

See a redirect, then use a hash tag so a multi-key command works on one slot:

```text
# Without a hash tag, related keys may land on different slots
127.0.0.1:7000> MGET user:42:name user:42:age
(error) CROSSSLOT Keys in request don't hash to the same slot

# With a hash tag, both keys hash on "user:42" -> same slot
127.0.0.1:7000> MSET {user:42}:name "Ada" {user:42}:age "36"
OK
127.0.0.1:7000> MGET {user:42}:name {user:42}:age
1) "Ada"
2) "36"

# A single-key command routed to the wrong node returns MOVED
127.0.0.1:7000> GET some:key
(error) MOVED 866 127.0.0.1:7001
```

The first `MGET` fails because the two keys are in different slots; adding `{user:42}` forces both into
the same slot, so the multi-key command succeeds. The `MOVED` shows the cluster redirecting a key to its
owning node.

# Real World Analogy

Redis Cluster is a **chain of warehouses**, each responsible for a fixed range of aisle numbers (slots
0–16383). To find an item you compute its aisle (`CRC16(key) mod 16384`) and go to the warehouse that
owns that aisle. If you show up at the wrong warehouse, they tell you which one has it (`MOVED`). You
can't pull two items in one trip unless they're in the **same warehouse** — so if two items are always
picked together, you label them to share an aisle (a **hash tag**).

# Examples

## Example 1 — Basic: scaling past one machine

A dataset grows to 200 GB — too big for one node. A three-primary cluster splits the slots so each node
holds roughly a third, and adding a fourth primary (with resharding) grows capacity further.

**Why this works:** Cluster spreads slots (and thus keys and memory) across nodes, so total capacity is
the sum of the nodes.

## Example 2 — Real-world: keeping a user's keys together

An app stores several keys per user and sometimes reads them together. By naming them
`{user:<id>}:profile`, `{user:<id>}:cart`, etc., all of one user's keys share a slot, so `MGET` and
transactions over them work within the cluster.

**Why this works:** the hash tag pins related keys to one slot, satisfying the same-slot requirement for
multi-key commands.

## Example 3 — Trade-off / pitfall: assuming Cluster is strongly consistent

A team moves a payment ledger to Cluster expecting bank-grade consistency. During a network partition a
failover promotes a replica that was slightly behind, and a few acknowledged writes vanish.

**Why this bites:** Cluster replicates asynchronously and is **not** strongly consistent — failovers and
partitions can lose recent writes. Data needing strict consistency belongs in a system designed for it.

# Common Mistakes

- **Multi-key commands across different slots.** They raise `CROSSSLOT`; use hash tags to co-locate keys.
- **Using a non-cluster-aware client.** It won't follow `MOVED`/`ASK` redirects and will fail or
  misroute.
- **Expecting multiple databases.** Cluster is single-database (db 0) — `SELECT` doesn't apply.
- **Assuming strong consistency.** Cluster is async; failover/partition can lose writes.
- **Reaching for Cluster when Sentinel suffices.** If data fits one node, Cluster adds needless
  complexity.

# Best Practices

- Adopt Cluster when you genuinely need to **shard** (data or write throughput beyond one node).
- Use **hash tags** to group keys that must be operated on together; otherwise keep operations
  single-key.
- Run a **cluster-aware client** (or a proxy) that handles redirects and caches the slot map.
- Give each primary **replicas** for failover, and understand the **async** loss window.
- For strict consistency or rich cross-key transactions, use a system built for that — not Cluster.

# Summary

- **Redis Cluster** shards the keyspace into **16384 hash slots**; a key's slot is `CRC16(key) mod
  16384`, and each **primary** owns a range of slots (with replicas for failover) — **not** consistent
  hashing.
- Clients are routed via **`MOVED`** (permanent slot move) and **`ASK`** (temporary, during
  resharding); cluster-aware clients handle these.
- **Multi-key commands need same-slot keys**; use **hash tags** `{...}` to co-locate related keys
  (else `CROSSSLOT`).
- Cluster is **not strongly consistent** (async replication) and uses a **single database**; it trades
  simplicity for **horizontal scale**.
- **Sentinel** keeps one primary available; **Cluster** shards across many — pick based on whether you
  need to scale past one node.

# Flash Cards

Q: How many hash slots does Redis Cluster use, and how is a key's slot computed?
A: 16384 slots; a key's slot is CRC16(key) mod 16384.

Q: What's the difference between a MOVED and an ASK redirect?
A: MOVED means the slot has permanently relocated (update your map and retry there); ASK is a temporary redirect for one request while a slot is being migrated.

Q: Why might a multi-key command fail in Redis Cluster, and how do you fix it?
A: If the keys are in different slots you get a CROSSSLOT error; use a hash tag {...} so the keys hash to the same slot.

Q: Is Redis Cluster strongly consistent?
A: No — replication within the cluster is asynchronous, so a failover or partition can lose recently acknowledged writes.

Q: How many logical databases does Redis Cluster support?
A: One (database 0) — the multiple-database SELECT feature is not available in Cluster.

Q: When should you choose Cluster over Sentinel?
A: When your data or write throughput exceeds a single node and you need to shard; if data fits one node, Sentinel is simpler.

# Exercises

### Easy
Explain in your own words what `CRC16(key) mod 16384` computes and why the result (0–16383) matters for
locating a key in a cluster.

### Medium
Given keys `order:1001:items` and `order:1001:total` that you want to `MGET` together in a cluster,
rewrite them with a hash tag so they share a slot, and explain what error you'd get without it.

### Challenging
You're deciding between Sentinel and Cluster for a service. Data is 40 GB and fits one node comfortably,
but you need failover. Then a year later data grows to 400 GB. Describe which you'd choose at each stage
and what changes for your application code when moving to Cluster (redirects, multi-key ops, databases,
consistency).

# Further Reading

- Redis — *Redis Cluster specification*: <https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/>
- Redis — *Scale with Redis Cluster*: <https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/>
- Redis — *Keyspace & hash tags* (in the cluster spec): <https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/#hash-tags>
