---
slug: absolute-expiration-and-expiretime
title: Absolute Expiration with EXPIREAT and EXPIRETIME
topic: expiration-and-memory
kind: api
summary: Set absolute Unix epoch expiration targets with EXPIREAT and inspect exact expiration timestamps with EXPIRETIME.
tags:
  - expireat
  - expiretime
  - unix-timestamp
  - api
related:
  - expire-and-ttl-basics
  - persist-and-clearing-ttl
  - passive-vs-active-expiration
---
> **In one line:** Set key expirations to specific Unix timestamps using `EXPIREAT` and inspect expiration targets with `EXPIRETIME`.

## The idea

While relative durations (`EXPIRE key 3600`) work well for standard caches, real-world systems often operate on fixed calendar boundaries: expiring a coupon at midnight UTC, invalidating a daily token at 08:00 AM, or scheduling batch jobs to expire on the hour.

Using relative offsets requires calculating remaining seconds on client machines, creating synchronization bugs if client clocks drift. Redis resolves this with absolute Unix epoch expiration commands: `EXPIREAT` and `EXPIRETIME`.

| Command | Arguments | Resolution | Description |
|---|---|---|---|
| `EXPIREAT key timestamp` | Key and Unix timestamp (seconds) | Seconds | Expires key at exact Unix epoch timestamp |
| `PEXPIREAT key timestamp-ms` | Key and Unix timestamp (ms) | Milliseconds | Expires key at exact millisecond Unix epoch |
| `EXPIRETIME key` | Key | Seconds | Returns absolute Unix epoch timestamp when key expires |
| `PEXPIRETIME key` | Key | Milliseconds | Returns absolute millisecond Unix epoch |

> **Tip:** If the specified Unix timestamp is already in the past, Redis deletes the key immediately (equivalent to calling `DEL`).

## See it

Scheduling an exact expiration target in `redis-cli`:

```bash
# Set a flash sale discount code
SET promo:black_friday "50_PERCENT_OFF"

# Set expiration to Unix timestamp 1767225600 (Jan 1, 2026 00:00:00 UTC)
EXPIREAT promo:black_friday 1767225600
# Returns: (integer) 1

# Query the exact absolute expiration timestamp
EXPIRETIME promo:black_friday
# Returns: (integer) 1767225600

# Query relative seconds remaining until that timestamp
TTL promo:black_friday
# Returns: (integer) 345600

# Query precision in milliseconds with PEXPIRETIME
PEXPIRETIME promo:black_friday
# Returns: (integer) 1767225600000

# Non-existent keys return -2; permanent keys return -1
EXPIRETIME missing_key
# Returns: (integer) -2
```

Notice that `EXPIRETIME` returns the exact epoch timestamp previously stored, enabling clients to sync calendar deadlines across distributed microservices.

## Go deeper

Redis internally stores **all** key expirations as absolute 64-bit millisecond Unix epoch timestamps, regardless of whether you set them using relative (`EXPIRE`) or absolute (`EXPIREAT`) commands.

This internal representation ensures that saving and loading RDB snapshots or streaming replication logs to secondary replicas preserves the exact expiration deadline without time-drift anomalies.

## Watch out

- Ensure your Redis server host clock is synchronized with NTP (Network Time Protocol); significant host clock skew breaks expiration scheduling.
- Submitting an epoch timestamp in milliseconds to `EXPIREAT` instead of `PEXPIREAT` schedules the expiration hundreds of years in the future.

## Remember

- `EXPIREAT` sets key expiration to a fixed Unix epoch timestamp.
- `EXPIRETIME` returns the absolute epoch timestamp when a key will be purged.
- Redis internally stores all timeouts as absolute millisecond timestamps.
