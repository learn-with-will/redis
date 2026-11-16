---
slug: client-side-caching-tracking
title: Server-Assisted Client-Side Caching with Tracking
topic: caching-patterns
kind: technique
summary: Achieve sub-microsecond in-memory reads inside application process memory using Redis tracking and client-side caching.
tags:
  - client-side-caching
  - tracking
  - invalidation
  - performance
related:
  - cache-aside-pattern
  - cache-invalidation-strategies
  - pipelining-rtt-reduction
---
> **In one line:** Client-side caching stores hot records directly in application memory, using Redis tracking to receive invalidation messages when keys change.

## The idea

Even though Redis responds in sub-millisecond time, fetching a key still requires a network TCP round-trip (typically 0.5ms to 2ms depending on network topology).

What if the application could store the most frequently read keys directly inside its **local process RAM** (e.g., in a local Java, Go, or Node.js memory map) for sub-microsecond access, while guaranteeing that local copies are invalidated when another client modifies the key in Redis?

Redis 6.0 introduced **Server-Assisted Client-Side Caching** via the `CLIENT TRACKING` protocol.

| Cache Tier | Storage Location | Read Latency | Network Cost |
|---|---|---|---|
| **Primary Database (SQL)** | Disk on DB server | 5ms – 50ms | Full network round-trip |
| **Redis Cache** | RAM on Redis server | ~500 microseconds | Network round-trip over LAN |
| **Client-Side Cache** | **RAM inside application process** | **< 1 microsecond (nanoseconds)** | **Zero network I/O!** |

> **Tip:** Redis remembers which keys your client connection has read and sends an asynchronous invalidation message as soon as another client mutates them.

## See it

Observing server-assisted invalidation tracking in `redis-cli`:

```bash
# Terminal 1 (Application Client): Enable tracking on current connection
CLIENT TRACKING on
# Returns: OK

# Terminal 1 reads a hot key
GET system:config:maintenance_mode
# Returns: "false"
# Application stores "false" in local process memory!

# Terminal 2 (Administrator): Mutates the key
SET system:config:maintenance_mode "true"
# Returns: OK

# Terminal 1 immediately receives an asynchronous invalidation message from Redis:
# -> Invalidation message: "system:config:maintenance_mode"
# Application immediately purges the key from its local process RAM!
```

Terminal 1's local cache is updated immediately without polling, ensuring local memory never serves stale data.

## Go deeper

Redis provides two tracking modes:
1. **Default Mode (Key Tracking):** Redis remembers the exact keys each client read using an internal invalidation table. When a key changes, Redis alerts only clients that previously queried that specific key.
2. **BCAST Mode (Broadcasting):** Redis does not track per-client keys (saving server memory). Instead, clients register prefix subscriptions (e.g., `PREFIX users:`), and Redis broadcasts invalidation messages whenever any key matching the prefix is mutated.

In high-scale systems with millions of keys, **BCAST mode** prevents server memory bloat.

## Watch out

- Invalidation messages can arrive slightly after a local read under heavy network congestion; design applications to tolerate brief eventual consistency.
- In BCAST mode, frequent writes to a tracked prefix generate high invalidation network traffic.

## Remember

- Client-side caching delivers sub-microsecond reads directly from application process memory.
- `CLIENT TRACKING on` instructs Redis to send invalidation messages when read keys mutate.
- BCAST mode scales efficiently by broadcasting invalidations based on key prefixes.
