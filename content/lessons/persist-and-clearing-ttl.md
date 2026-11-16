---
slug: persist-and-clearing-ttl
title: Removing Expiration with PERSIST and Overwriting Keys
topic: expiration-and-memory
kind: technique
summary: Remove timeouts with PERSIST, preserve TTLs during updates with KEEPTTL, and understand mutation side-effects.
tags:
  - persist
  - keepttl
  - expiration
  - mutations
related:
  - expire-and-ttl-basics
  - passive-vs-active-expiration
  - absolute-expiration-and-expiretime
---
> **In one line:** Convert a temporary key into a permanent one with `PERSIST`, and use `KEEPTTL` to avoid accidentally clearing expirations during updates.

## The idea

When caching objects, business logic often requires promoting a temporary key into a permanent record—for instance, when a guest shopping cart converts into a confirmed customer order. Redis provides the `PERSIST` command to remove the timeout from a key, converting it back into a permanent entry.

Equally important is understanding how mutating commands interact with existing expirations. If a key has an active TTL and you run a standard `SET` command to update its value, **Redis removes the expiration by default**.

| Mutation Action | Command Example | Effect on Existing Key Expiration |
|---|---|---|
| **Remove TTL explicitly** | `PERSIST key` | Removes timeout; key becomes permanent |
| **Standard Overwrite** | `SET key new_val` | **Clears TTL!** Key becomes permanent |
| **Preserve TTL Overwrite** | `SET key new_val KEEPTTL` | Updates value while **retaining current TTL** |
| **In-place Field Mutation** | `HSET key field val` | **Preserves TTL**; modifying fields does not reset TTL |
| **List Push / Pop** | `LPUSH key val` | **Preserves TTL**; container mutations do not reset TTL |

> **Watch out:** Unintentionally dropping TTLs via `SET` is one of the most common causes of silent memory leaks in production caching layers.

## See it

Removing timeouts and updating values while preserving TTLs:

```bash
# Create an ephemeral cache key with a 120-second timeout
SET upload:job_91 "processing" EX 120
TTL upload:job_91
# Returns: (integer) 118

# Promote the job record to permanent storage
PERSIST upload:job_91
# Returns: (integer) 1

TTL upload:job_91
# Returns: (integer) -1 (Timeout removed; key is permanent!)

# Re-attach an expiration for demonstration
EXPIRE upload:job_91 60

# Update value while strictly preserving remaining TTL
SET upload:job_91 "completed" KEEPTTL
# Returns: OK

TTL upload:job_91
# Returns: (integer) 57 (TTL was successfully preserved!)
```

The `KEEPTTL` modifier prevents the updated value from silently clearing the remaining 57 seconds.

## Go deeper

Only commands that replace the entire key object (such as `SET` or `GETSET`) remove expiration timeouts. Commands that modify elements *inside* an existing data structure—such as `HSET`, `LPUSH`, `SADD`, or `ZADD`—do **not** reset or clear the parent key's TTL.

`PERSIST` returns `1` if the timeout was successfully removed, and `0` if the key did not exist or had no associated expiration.

## Watch out

- Renaming a key with `RENAME` transfers the original expiration to the new key name, overwriting any TTL the target key previously held.
- Forgetting `KEEPTTL` during cached value updates causes keys to persist indefinitely, eventually filling server RAM.

## Remember

- `PERSIST` removes timeouts and makes keys permanent in constant $O(1)$ time.
- Standard `SET` commands strip active TTLs unless `KEEPTTL` is supplied.
- In-place mutations (`HSET`, `LPUSH`, `SADD`) preserve existing key expiration timers.
