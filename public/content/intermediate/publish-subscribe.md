---
id: lesson-10
slug: publish-subscribe
title: "Publish/Subscribe"
level: intermediate
order: 10
duration: 20
tags:
  - pubsub
  - messaging
  - channels
  - real-time
  - fire-and-forget
summary: "Redis Pub/Sub messaging: publishers send to channels, subscribers receive in real time. Learn SUBSCRIBE/PUBLISH/PSUBSCRIBE, the fire-and-forget (at-most-once) delivery model, and when to choose Streams instead."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Send and receive messages on **channels** with `PUBLISH`, `SUBSCRIBE`, and `PSUBSCRIBE`.
- Explain Pub/Sub's **fire-and-forget** (at-most-once) delivery and its consequences.
- Understand what a subscribed connection can and cannot do.
- Decide between **Pub/Sub** and **Streams** for a messaging problem.

# Why It Matters

Pub/Sub is Redis's simplest messaging tool: a way to broadcast an event to everyone currently
listening, instantly. It's perfect for real-time fan-out — live notifications, chat, cache-
invalidation signals, "something changed, refresh" pings between services. But its simplicity
comes with a sharp edge: messages aren't stored, so anyone not listening at the moment misses
them. Knowing that boundary is the whole lesson.

# Concept Explanation

### Channels, publishers, and subscribers

In **Publish/Subscribe (Pub/Sub)**, messages are sent to named **channels**. **Publishers** send
without knowing who (if anyone) is listening; **subscribers** register interest in channels and
receive every message published while they're subscribed. Publishers and subscribers are fully
**decoupled** — they never reference each other, only the channel name.

- `SUBSCRIBE channel [channel ...]` — start receiving messages on one or more channels.
- `UNSUBSCRIBE [channel ...]` — stop.
- `PUBLISH channel message` — send a message; returns the **number of subscribers that received
  it**.
- `PSUBSCRIBE pattern [pattern ...]` — subscribe by glob **pattern** (e.g. `news.*`).
- `PUNSUBSCRIBE [pattern ...]` — unsubscribe patterns.

```text
# Connection A
127.0.0.1:6379> SUBSCRIBE news
1) "subscribe"
2) "news"
3) (integer) 1
# ...A now waits for messages...
1) "message"
2) "news"
3) "Redis 8 released"

# Connection B
127.0.0.1:6379> PUBLISH news "Redis 8 released"
(integer) 1
```

`PUBLISH` returned `1` because one subscriber received the message. If nobody were subscribed, it
would return `0` — and the message would simply be gone.

### Fire-and-forget: at-most-once delivery

This is the defining property: **Pub/Sub does not store messages.** A message is delivered *only*
to clients subscribed **at the moment it's published**. There is:

- **No persistence** — messages aren't written to disk or kept in memory after delivery.
- **No replay / history** — a subscriber that connects later cannot see past messages.
- **No acknowledgement** — the publisher learns only *how many* clients received it, not that they
  processed it.

So delivery is **at-most-once**: a subscriber that's offline, slow, or reconnecting will miss
messages, and they're not coming back. If losing a message is unacceptable, Pub/Sub is the wrong
tool — use **Streams** (next lesson), which persist entries and support replay and
acknowledgements.

### The subscribed-connection rule

When a connection enters subscribe mode on the classic **RESP2** protocol, it becomes dedicated to
messaging: it can only issue `SUBSCRIBE`/`UNSUBSCRIBE`/`PSUBSCRIBE`/`PUNSUBSCRIBE` (plus `PING`
and `QUIT`) until it unsubscribes. That's why clients typically use a **separate connection** for
subscribing. The newer **RESP3** protocol lifts this restriction by delivering messages as
out-of-band "push" replies, letting one connection do both.

### Pub/Sub in a Cluster: sharded channels

In Redis Cluster, ordinary Pub/Sub messages are broadcast to all nodes, which doesn't scale well.
**Sharded Pub/Sub** (`SSUBSCRIBE` / `SPUBLISH` / `SUNSUBSCRIBE`, added in Redis 7.0) confines a
channel to the shard that owns it, so publishing stays local and scales with the cluster. Use the
sharded variants when running Pub/Sub at scale on Cluster.

# Key Terminology

- **Channel** — a named topic messages are published to and subscribed from.
- **Fire-and-forget** — send without storage or acknowledgement; undelivered messages are lost.
- **At-most-once** — each message reaches a given subscriber zero or one time, never redelivered.
- **Pattern subscription** — subscribing to many channels at once via a glob pattern
  (`PSUBSCRIBE`).
- **Sharded Pub/Sub** — Cluster-friendly Pub/Sub (`SPUBLISH`/`SSUBSCRIBE`) scoped to one shard.

# Options and Trade-offs

Two messaging models in Redis:

| Feature | Pub/Sub | Streams |
| ------- | ------- | ------- |
| **Storage** | None (fire-and-forget) | Persistent append-only log |
| **Late/offline subscribers** | Miss messages | Can read history / catch up |
| **Delivery** | At-most-once | At-least-once (with consumer groups + acks) |
| **Replay** | No | Yes (`XRANGE`, re-read by ID) |
| **Best for** | Real-time fan-out where loss is OK | Durable event pipelines, work queues |

# Worked Example

A cache-invalidation broadcast: when data changes, tell every app server to drop a cached key.

```text
# Each app server, on startup (separate connection)
127.0.0.1:6379> SUBSCRIBE cache:invalidate
1) "subscribe"
2) "cache:invalidate"
3) (integer) 1

# The service that updated the data
127.0.0.1:6379> PUBLISH cache:invalidate "profile:42"
(integer) 3
```

Three app servers were subscribed, so all three receive `profile:42` and evict it. Note the
weakness: an app server that was *restarting* at that instant wouldn't get the message and could
keep serving a stale value — which is exactly why cache invalidation over Pub/Sub is usually
paired with TTLs as a safety net.

# Real World Analogy

Pub/Sub is a **live radio broadcast**. The station transmits on a frequency (channel); whoever has
a radio tuned in right now hears it. If your radio is off, you miss the show — there's no rewind,
no recording, and the DJ only knows *how many* radios are on, not whether anyone was listening. A
**Stream**, by contrast, is a **podcast**: recorded once and available to play (and replay) any
time.

# Examples

## Example 1 — Basic: live notifications

A web app subscribes each user's browser (via a backend relay) to `notify:user:42`. When someone
comments, the backend `PUBLISH notify:user:42 "new comment"`, and connected clients see it
instantly.

**Why this works:** the audience is online *now*, and a missed notification during a disconnect is
acceptable — a perfect fit for fire-and-forget.

## Example 2 — Real-world: pattern subscriptions for a dashboard

An ops dashboard runs `PSUBSCRIBE metrics.*` and receives everything published to `metrics.cpu`,
`metrics.mem`, `metrics.io`, and so on with one subscription.

**Why this works:** pattern subscriptions let one consumer follow a whole family of channels
without enumerating them.

## Example 3 — Trade-off / pitfall: a payment queue over Pub/Sub

A team sends "process this payment" over Pub/Sub. One day the worker restarts for two seconds;
several payment messages are published during that window and are **gone** — no worker got them,
and there's no record to replay.

**Why this bites:** payments must not be lost, but Pub/Sub is at-most-once with no persistence.
This needs Streams (with consumer groups and acks) or a real queue.

# Common Mistakes

- **Using Pub/Sub for work that can't be lost.** No persistence, no replay, no acks — use Streams.
- **Subscribing and running commands on the same RESP2 connection.** A subscribed RESP2 connection
  is limited to (un)subscribe commands; use a separate connection (or RESP3).
- **Assuming `PUBLISH`'s return means "processed."** It's the count of clients that *received* the
  message, not that they handled it.
- **Plain Pub/Sub at scale on Cluster.** Prefer sharded Pub/Sub (`SPUBLISH`/`SSUBSCRIBE`) so
  messages don't fan out to every node.

# Best Practices

- Choose Pub/Sub only when **losing a message is acceptable** and you need instant fan-out to
  current listeners.
- Use a **dedicated connection** for subscriptions (or RESP3 push).
- Back real-time cache invalidation with **TTLs** so a missed message can't strand stale data
  forever.
- On Cluster at scale, use **sharded Pub/Sub**.
- If you find yourself wanting history, acknowledgements, or catch-up, switch to **Streams**.

# Summary

- **Pub/Sub** decouples publishers and subscribers via named **channels**; `SUBSCRIBE`/
  `PSUBSCRIBE` receive, `PUBLISH` sends (returning the receiver count).
- Delivery is **fire-and-forget / at-most-once**: no storage, no replay, no acks — offline
  subscribers miss messages.
- A subscribed **RESP2** connection can only do (un)subscribe; **RESP3** allows both on one
  connection.
- **Sharded Pub/Sub** (`SPUBLISH`/`SSUBSCRIBE`, Redis 7.0+) scales Pub/Sub on Cluster.
- For durability, replay, or acknowledgements, use **Streams** instead.

# Flash Cards

Q: What is the delivery guarantee of Redis Pub/Sub?
A: Fire-and-forget / at-most-once — messages aren't stored, so only clients subscribed at publish time receive them.

Q: What does PUBLISH return?
A: The number of clients that received the message (not confirmation that they processed it).

Q: Why can't a late-joining subscriber see past Pub/Sub messages?
A: Pub/Sub has no persistence or history — messages exist only in transit to current subscribers.

Q: What does PSUBSCRIBE let you do?
A: Subscribe to many channels at once using a glob pattern, e.g. PSUBSCRIBE metrics.*.

Q: When should you use Streams instead of Pub/Sub?
A: When you need durability, replay/catch-up, or acknowledgements (at-least-once delivery) — anything that can't tolerate lost messages.

Q: What is sharded Pub/Sub for?
A: Scaling Pub/Sub on Redis Cluster by keeping a channel on the shard that owns it (SPUBLISH/SSUBSCRIBE, Redis 7.0+).

# Exercises

### Easy
Open two `redis-cli` sessions. In one, `SUBSCRIBE room1`. In the other, `PUBLISH room1 "hello"`.
Watch the message arrive and note the number `PUBLISH` returned.

### Medium
With a subscriber on `PSUBSCRIBE news.*`, publish to `news.sports` and `news.tech` from another
connection and confirm both arrive. Then stop the subscriber, publish again, restart the
subscriber — and explain why the message published while it was down never appears.

### Challenging
Design a "data changed → invalidate cache" system with Pub/Sub. Identify the failure mode when an
app server is restarting during a publish, and describe two safeguards (e.g. TTLs, or switching to
Streams) that make it robust. Which would you choose and why?

# Further Reading

- Redis — *Redis Pub/Sub*: <https://redis.io/docs/latest/develop/interact/pubsub/>
- Redis — *SUBSCRIBE* / *PUBLISH* / *PSUBSCRIBE*: <https://redis.io/commands/subscribe/>
- Redis — *SPUBLISH* (sharded Pub/Sub): <https://redis.io/commands/spublish/>
- Redis — *Streams* (the durable alternative): <https://redis.io/docs/latest/develop/data-types/streams/>
