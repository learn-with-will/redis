---
slug: expire-and-ttl-basics
title: Setting Time-to-Live with EXPIRE and TTL
topic: expiration-and-memory
kind: api
summary: Attach automatic expiration lifetimes to keys using EXPIRE and query remaining duration with TTL.
tags:
  - expiration
  - ttl
  - pexpire
  - caching
related:
  - persist-and-clearing-ttl
  - passive-vs-active-expiration
  - configuring-maxmemory
---
> **In one line:** Set automatic time-to-live expirations on keys using `EXPIRE` and check remaining time with `TTL`.

## The idea

One of the defining superpowers of Redis as a caching layer is its ability to automatically purge data when its validity expires. Setting a **Time-To-Live (TTL)** ensures transient data—such as user sessions, password reset tokens, or cached API responses—cleans up automatically without requiring scheduled cron jobs or manual deletion scripts.

Redis tracks expirations with millisecond precision, maintaining internal expiration metadata alongside the keyspace dictionary.

| Command | Time Resolution | Return Value | Purpose |
|---|---|---|---|
| `EXPIRE key seconds` | Seconds (integer) | `1` if set, `0` if key missing | Sets TTL duration in seconds |
| `PEXPIRE key milliseconds` | Milliseconds (integer) | `1` if set, `0` if key missing | Sets fine-grained TTL duration in milliseconds |
| `TTL key` | Seconds | Integer remaining seconds | Queries remaining lifetime in seconds |
| `PTTL key` | Milliseconds | Integer remaining milliseconds | Queries remaining lifetime in milliseconds |

> **Tip:** The return codes for `TTL` and `PTTL` carry special sentinel meanings: `-1` means the key exists with no expiration, and `-2` means the key does not exist.

## See it

Configuring and querying key time-to-live lifetimes:

```bash
# Store an authentication session token
SET session:user_78 "valid_auth_token"

# Attach a 60-second expiration window
EXPIRE session:user_78 60
# Returns: (integer) 1

# Check remaining time to live
TTL session:user_78
# Returns: (integer) 58

# Check precision in milliseconds
PTTL session:user_78
# Returns: (integer) 57842

# Create a permanent key without expiration
SET config:app_name "Portal"
TTL config:app_name
# Returns: (integer) -1 (Key exists forever)

# Query a non-existent key
TTL missing_key
# Returns: (integer) -2 (Key does not exist)
```

Once the countdown reaches zero, the key expires and subsequent `GET` requests return `(nil)`.

## Go deeper

Redis 7.0 introduced conditional modifier flags to `EXPIRE`:
- `NX`: Set expiration only if the key currently has **no** expiration.
- `XX`: Set expiration only if the key **already** has an existing expiration.
- `GT`: Set expiration only if the new expiration is **greater than** the current one.
- `LT`: Set expiration only if the new expiration is **less than** the current one.

These flags allow applications to extend session lifetimes only when appropriate without issuing multiple round-trips.

## Watch out

- Writing a new value to a key using basic `SET` clears any existing expiration unless the `KEEPTTL` flag is explicitly provided.
- Do not mistake a `-1` return value from `TTL` for an error; it signifies a healthy, permanent key.

## Remember

- `EXPIRE` sets key lifetimes in seconds; `PEXPIRE` in milliseconds.
- `TTL` returns remaining seconds, `-1` for permanent keys, and `-2` for non-existent keys.
- Basic writes (`SET`) overwrite and strip existing TTLs unless using `KEEPTTL`.
