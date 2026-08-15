---
id: lesson-19
slug: high-availability-with-sentinel
title: "High Availability with Sentinel"
level: advanced
order: 19
duration: 22
tags:
  - sentinel
  - high-availability
  - failover
  - quorum
  - monitoring
summary: "Redis Sentinel adds automatic failover to a primary/replica setup: it monitors instances, agrees on failure via a quorum, promotes a replica, and tells clients the new primary. How it differs from Cluster."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Explain what **Sentinel** does: monitoring, notification, automatic failover, and service discovery.
- Describe the **quorum** and the difference between subjective and objective down.
- Trace what happens during an automatic **failover**.
- Distinguish **Sentinel** (HA for one primary) from **Cluster** (sharding).

# Why It Matters

Replication gives you a warm standby, but by itself it won't *do* anything when the primary dies —
someone has to notice, promote a replica, and tell every client where the new primary is. Doing that by
hand at 3 a.m. is exactly what you don't want. **Redis Sentinel** automates it: it watches your
primary and replicas and, on failure, promotes a replica and redirects clients — turning a manual
outage into a brief, automatic recovery.

# Concept Explanation

### What Sentinel is

**Sentinel** is a separate Redis process (run alongside your data instances) that provides high
availability for a **primary/replica** deployment. It has four jobs:

- **Monitoring** — continually check that the primary and replicas are alive and responsive.
- **Notification** — alert operators/systems when something goes wrong.
- **Automatic failover** — if the primary is down, pick a replica, promote it to primary, and
  reconfigure the other replicas to follow the new one.
- **Service discovery** — act as the authority clients ask for "who is the current primary?" Clients
  connect to Sentinel to find the primary rather than hard-coding an address.

You run **multiple** Sentinels (an odd number, at least **three**, on separate machines) so that
Sentinel itself isn't a single point of failure and so failure decisions can be **voted** on.

### Detecting failure: SDOWN, ODOWN, and quorum

A single Sentinel can't be trusted to declare the primary dead on its own — it might just have a
network problem. So Sentinel uses two stages:

- **SDOWN (Subjectively Down)** — *one* Sentinel thinks the primary is unreachable (it stopped
  answering within a timeout).
- **ODOWN (Objectively Down)** — *enough* Sentinels agree the primary is down. "Enough" is the
  **quorum**, a number you configure (e.g. `sentinel monitor mymaster 127.0.0.1 6379 2` sets a quorum
  of 2).

Once the primary is **ODOWN**, the Sentinels coordinate a failover. Note two different thresholds are
at play: the **quorum** decides when to *declare* the primary down, but actually *authorizing* a
failover requires a **majority of the Sentinels** to be reachable and agree (this is why you want at
least three). This majority requirement prevents two isolated Sentinels from both promoting different
replicas during a network split.

### The failover, step by step

1. Sentinels mark the primary **ODOWN** (quorum reached).
2. They elect a leader Sentinel to run the failover.
3. The leader picks the **best replica** (most up-to-date, healthy) and sends it `REPLICAOF NO ONE` to
   promote it to primary.
4. The other replicas are reconfigured to replicate the **new** primary.
5. Sentinel updates its view, so clients that ask "who's the primary?" now get the new address. The old
   primary, if it comes back, is demoted to a replica of the new one.

Because the underlying replication is **asynchronous** (previous lesson), a failover can still lose
writes the old primary acked but hadn't replicated — Sentinel automates *availability*, not perfect
durability.

### Sentinel vs. Cluster

This is a common confusion, so state it plainly: **Sentinel and Cluster solve different problems.**

- **Sentinel** = high availability for a **single** primary/replica group. All the data is on the
  primary (and copied to replicas). Sentinel doesn't shard or split data — it just keeps *one* primary
  available.
- **Cluster** (next lesson) = **sharding** data across many primaries **plus** built-in failover. Use
  it when the dataset or write throughput exceeds one machine.

If your data fits on one node and you just need automatic failover, Sentinel is the simpler choice.

# Key Terminology

- **Sentinel** — a monitoring/failover process for a primary/replica deployment.
- **Quorum** — the number of Sentinels that must agree the primary is down to declare it **ODOWN**.
- **SDOWN / ODOWN** — one Sentinel's subjective "down" / the agreed objective "down".
- **Failover** — promoting a replica to primary and redirecting the rest (and clients).
- **Service discovery** — clients ask Sentinel for the current primary's address.

# Options and Trade-offs

| Concern | Sentinel | Cluster |
| ------- | -------- | ------- |
| **Sharding (split data)** | No — one primary holds all data | Yes — 16384 slots across primaries |
| **Automatic failover** | Yes | Yes |
| **Client complexity** | Client asks Sentinel for the primary | Client must be cluster-aware (follow redirects) |
| **When to use** | Data fits one node; you need HA | Data/throughput exceeds one node |

# Worked Example

A minimal Sentinel configuration and asking Sentinel who the primary is:

```text
# sentinel.conf (each Sentinel)
port 26379
sentinel monitor mymaster 127.0.0.1 6379 2
sentinel down-after-milliseconds mymaster 5000
sentinel failover-timeout mymaster 60000
```

```text
# Ask a running Sentinel for the current primary of "mymaster"
127.0.0.1:26379> SENTINEL get-master-addr-by-name mymaster
1) "127.0.0.1"
2) "6379"
```

`sentinel monitor mymaster ... 2` says: watch the primary named `mymaster`, and a **quorum of 2**
Sentinels must agree it's down. `down-after-milliseconds` sets how long unresponsiveness counts as
down. Clients call `SENTINEL get-master-addr-by-name` to discover the current primary — so after a
failover they get the new address automatically.

# Real World Analogy

Sentinel is a team of **on-call supervisors** watching a shop's manager (the primary). No single
supervisor can fire the manager on a hunch; a **quorum** must agree the manager has truly vanished
(ODOWN). Then the supervisors **promote the best assistant manager** to run the shop, tell the other
staff who's now in charge, and update the front-desk directory so customers are pointed to the new
manager — all without the owner being woken up.

# Examples

## Example 1 — Basic: automatic recovery

A primary crashes at night. Three Sentinels reach quorum, promote the most up-to-date replica, and
reconfigure the rest. Clients querying Sentinel get the new primary's address and reconnect. By
morning the only evidence is a short blip and an alert.

**Why this works:** Sentinel turns a manual, error-prone night-time failover into an automatic one with
service discovery baked in.

## Example 2 — Real-world: clients that survive failover

An app uses a Sentinel-aware client library. On startup and after disconnects, it asks Sentinel for the
current primary instead of hard-coding an IP. When a failover happens, the library transparently
reconnects to the new primary.

**Why this works:** service discovery via Sentinel means the primary's address can change without
redeploying the app.

## Example 3 — Trade-off / pitfall: two Sentinels and a split brain risk

A team runs only **two** Sentinels. A network partition isolates them from each other; neither can form
a majority to authorize a failover, so recovery stalls — or, with a bad setup, competing decisions
cause confusion.

**Why this bites:** failover authorization needs a **majority** of Sentinels. With only two, a single
failure or partition breaks the majority. Run an **odd number, at least three**, on separate hosts.

# Common Mistakes

- **Confusing Sentinel with Cluster.** Sentinel doesn't shard; it keeps one primary highly available.
- **Running too few Sentinels (or on the same host).** You need an odd number, ≥3, spread across
  machines, for reliable quorum/majority.
- **Hard-coding the primary's address in clients.** Use a Sentinel-aware client and service discovery.
- **Expecting zero data loss.** Underlying replication is async, so a failover can still drop
  unreplicated writes.

# Best Practices

- Deploy **≥3 Sentinels** on separate failure domains; set the **quorum** thoughtfully (commonly a
  majority).
- Use a **Sentinel-aware client** so apps discover the current primary and survive failovers.
- Tune `down-after-milliseconds` and `failover-timeout` to your network — too low causes false
  failovers, too high slows recovery.
- Pair with durable **persistence** and understand the residual **async loss** window.
- Choose **Cluster** instead when you need to shard data or scale writes beyond one node.

# Summary

- **Sentinel** provides **high availability** for a **primary/replica** deployment: monitoring,
  notification, **automatic failover**, and **service discovery**.
- Failure is declared in two stages — **SDOWN** (one Sentinel) then **ODOWN** (a **quorum** agrees);
  authorizing a failover also needs a **majority** of Sentinels, so run an **odd number ≥3**.
- On failover, Sentinel promotes the best replica, reconfigures the others, and points clients to the
  new primary. Async replication means some writes can still be lost.
- **Sentinel ≠ Cluster:** Sentinel keeps **one** primary available; **Cluster** shards data across many.

# Flash Cards

Q: What four jobs does Redis Sentinel perform?
A: Monitoring instances, notification on problems, automatic failover, and service discovery (telling clients the current primary).

Q: What is the quorum in Sentinel?
A: The number of Sentinels that must agree the primary is down (ODOWN) before a failover is initiated.

Q: What's the difference between SDOWN and ODOWN?
A: SDOWN is one Sentinel subjectively considering the primary down; ODOWN is enough Sentinels (the quorum) objectively agreeing it's down.

Q: Why should you run at least three Sentinels on separate hosts?
A: Authorizing a failover needs a majority of Sentinels; with three on separate hosts a single failure or partition still leaves a working majority.

Q: How is Sentinel different from Redis Cluster?
A: Sentinel provides HA/failover for a single non-sharded primary; Cluster shards data across many primaries and also handles failover.

Q: Does Sentinel prevent all data loss during failover?
A: No — the underlying replication is asynchronous, so writes the old primary acked but didn't replicate can still be lost.

# Exercises

### Easy
Read the sentinel.conf example in the lesson. In one sentence each, explain what `sentinel monitor
mymaster 127.0.0.1 6379 2` and `down-after-milliseconds 5000` control.

### Medium
Explain the two-stage down detection (SDOWN → ODOWN) and why a single Sentinel isn't allowed to trigger
a failover on its own. What real-world problem does requiring a quorum prevent?

### Challenging
You have a dataset that comfortably fits on one machine but must survive a node failure with minimal
downtime. Argue why Sentinel (not Cluster) is the right tool, sketch how many Sentinels you'd run and
where, and describe what a client does to find the primary after a failover.

# Further Reading

- Redis — *High availability with Redis Sentinel*: <https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/>
- Redis — *Sentinel* command reference: <https://redis.io/commands/sentinel/>
- Redis — *Replication* (the layer Sentinel manages): <https://redis.io/docs/latest/operate/oss_and_stack/management/replication/>
