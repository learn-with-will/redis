---
slug: keyspace-notifications
title: Keyspace Notifications with Pub/Sub
topic: security-and-operations
kind: technique
summary: Configure Redis keyspace notifications to emit Pub/Sub events when keys expire, delete, or change in real time.
tags:
  - keyspace-notifications
  - pubsub
  - events
  - expiry
related:
  - expire-and-ttl-basics
  - pubsub-commands-publish-subscribe
---
> **In one line:** Keyspace notifications publish real-time Pub/Sub events whenever keys are modified, expired, or deleted.

## The idea
Applications frequently need to react when state changes in Redis—for example, cleaning up database records when a cache key expires, or invalidating microservice caches when a key is modified.

**Keyspace notifications** allow clients to subscribe to Pub/Sub channels to receive events about operations affecting the keyspace. 
There are two flavors of event channels:
1. **Keyspace events (`__keyspace@<db>__:<key>`):** Focus on the key, receiving the command executed (e.g. `del`, `expired`).
2. **Keyevent events (`__keyevent@<db>__:<event>`):** Focus on the operation, receiving the key name that triggered it.

## See it
Enable expired and generic event notifications in `redis.conf` or via `CONFIG SET`:

```bash
# Enable Keyevent events for Expired (x) and Generic/Del (g) events
127.0.0.1:6379> CONFIG SET notify-keyspace-events "KEx"
OK

# Terminal A: Subscribe to all expired key events in database 0
$ redis-cli
127.0.0.1:6379> PSUBSCRIBE "__keyevent@0__:expired"
Reading messages... (press Ctrl-C to quit)
1) "pmessage"
2) "__keyevent@0__:expired"
3) "__keyevent@0__:expired"
4) "user:temp_session:99"

# Terminal B: Set a key with a 2-second expiration to trigger the event
$ redis-cli
127.0.0.1:6379> SET user:temp_session:99 "data" EX 2
OK
```

## Go deeper
Keyspace notifications are disabled by default (`notify-keyspace-events ""`) because generating Pub/Sub messages consumes a small amount of CPU time for every write operation.

| Flag Character | Event Type Enabled |
| :--- | :--- |
| `K` | Keyspace events (publish to `__keyspace@<db>__:<key>`) |
| `E` | Keyevent events (publish to `__keyevent@<db>__:<event>`) |
| `g` | Generic commands (`DEL`, `EXPIRE`, `RENAME`) |
| `$` | String commands |
| `x` | Expired events (generated when a key expires) |
| `A` | Alias for all events (`g$lshztexe`) |

When an application subscribes to `__keyevent@0__:expired`, it receives a message every time a TTL lapses. However, understand the delivery guarantee: Redis does not guarantee that the expiration notification fires the exact millisecond the key expires. The event only fires when Redis actively scans and purges the key, or when a client attempts to read the expired key.

> **Tip:** Do not rely on expired events for time-critical workflows. Redis delivers expiration events only when the key is actively accessed or collected by the periodic background eviction cycle.

## Watch out
* Pub/Sub delivery is "fire and forget"; if your subscriber disconnects, missed expiration events are lost forever.
* Enabling `KEA` (all events) on high-write systems can generate massive Pub/Sub network volume.

## Remember
* Keyspace notifications publish Pub/Sub events on key mutations and expirations.
* Configure `notify-keyspace-events` with flag strings like `Ex` for expired key events.
* Expiration events fire when Redis collects the key, not necessarily the exact millisecond the TTL hits zero.
