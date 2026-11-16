---
slug: hash-tags-multi-key-operations
title: Hash Tags and Multi-Key Operations in Cluster
topic: scaling-and-clustering
kind: technique
summary: Use hash tags ({user_id}) to force co-located keys into identical hash slots for multi-key queries and transactions.
tags:
  - hash-tags
  - cluster
  - multi-key
related:
  - redis-cluster-sharding-hash-slots
  - transactions-multi-and-exec
---
> **In one line:** Enclosing part of a key in curly braces `{tag}` forces Redis to hash only that substring, co-locating related keys onto the same node.

## The idea
In Redis Cluster, commands that operate on multiple keys simultaneously—such as `MGET`, `MSET`, transactions (`MULTI`/`EXEC`), or Lua scripts—fail with a `CROSSSLOT` error if the keys reside on different cluster nodes.

To perform multi-key operations safely in a clustered environment, you must ensure all involved keys map to the exact same hash slot. Redis achieves this through **Hash Tags**.

If a key contains `{...}`, only the text inside the first pair of curly braces is passed to the CRC16 hash function.

```text
Key Name: user:{1001}:profile  -> Hashes: "1001" -> Slot 5821 (Node B)
Key Name: user:{1001}:orders   -> Hashes: "1001" -> Slot 5821 (Node B)
Key Name: user:{1001}:cart     -> Hashes: "1001" -> Slot 5821 (Node B)
```

## See it
Observe the difference in hash slot calculation with and without hash tags:

```bash
# Without hash tags, keys hash to different slots:
127.0.0.1:7000> CLUSTER KEYSLOT user:1001:profile
(integer) 7914
127.0.0.1:7000> CLUSTER KEYSLOT user:1001:orders
(integer) 3962

# Attempting multi-key operation fails across different slots
127.0.0.1:7000> MGET user:1001:profile user:1001:orders
(error) CROSSSLOT Keys in request don't hash to the same slot

# With hash tags, both keys hash to the identical slot:
127.0.0.1:7000> CLUSTER KEYSLOT user:{1001}:profile
(integer) 5821
127.0.0.1:7000> CLUSTER KEYSLOT user:{1001}:orders
(integer) 5821

# Multi-key command succeeds!
127.0.0.1:7000> MSET user:{1001}:profile "data" user:{1001}:orders "list"
OK
```

## Go deeper
Hash tag rules are precise: Redis hashes the substring between the first `{` and the first subsequent `}`. If nothing appears between `{}` (e.g. `user:{}:profile`), the whole string is hashed as normal.

Hash tags also enable multi-key transactions and atomic scripts on clustered environments. For example, if you maintain a shopping cart, a user balance, and an order history all tagged with `{user:1001}`, a single `MULTI`/`EXEC` block or Lua script can read and write across all three keys atomically without triggering `CROSSSLOT` exceptions.

> **Tip:** Use hash tags for co-locating user data, tenant data, or shopping carts so your application can run atomic Lua scripts and transactions without CROSSSLOT errors.

## Watch out
* Avoid coarse hash tags like `{all}` or `{system}`. They cause all keys to map to a single slot, creating severe hot-spotting that destroys horizontal scaling.
* Only the first occurrence of `{` and `}` counts; nested braces are treated as literal characters.

## Remember
* Multi-key commands and transactions in Redis Cluster require all keys to share the same hash slot.
* Braces `{tag}` force Redis to compute the CRC16 hash exclusively on the substring inside the brackets.
* Use fine-grained identifiers (such as user or entity IDs) to prevent hot-spot skew on individual cluster nodes.
