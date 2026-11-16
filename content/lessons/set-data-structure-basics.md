---
slug: set-data-structure-basics
title: "Redis Sets: Unordered Collections of Unique Members"
topic: sets-and-sorted-sets
kind: concept
summary: Redis Sets store unordered unique string members, providing O(1) membership testing and deduplication.
tags:
  - sets
  - uniqueness
  - membership
  - deduplication
related:
  - set-membership-and-manipulation
  - set-algebra-sinter-sunion-sdiff
  - set-modeling-patterns
---
> **In one line:** A Redis Set is an unordered collection of unique strings that guarantees no duplicate members can exist.

## The idea

When modeling unique entities—such as active user IDs, product tags, online IP addresses, or following lists—storing items in an array or list forces application code to search sequentially to prevent duplicate entries.

A Redis **Set** enforces strict uniqueness at the storage engine level. If you add the string `"apple"` to a set ten times, the set retains exactly one copy. Furthermore, checking whether an element exists inside a Set executes in constant $O(1)$ time, regardless of whether the set contains five items or five million items.

| Feature | Redis List | Redis Set |
|---|---|---|
| **Ordering** | Insertion order preserved | Unordered |
| **Duplicates** | Allowed (can contain duplicates) | Strictly forbidden (deduplicated) |
| **Membership Check (`is_in`)** | $O(N)$ linear traversal | $O(1)$ constant time lookup |
| **Internal Encoding** | Quicklist / Listpack | Intset (for integers) or Hashtable |

> **Note:** Because Sets are unordered, querying elements does not guarantee any deterministic order unless explicitly sorted.

## See it

Creating a set and observing automatic deduplication in `redis-cli`:

```bash
# Add members to a unique tags set
SADD article:101:tags "redis" "database" "performance"
# Returns: (integer) 3

# Attempt to re-add existing members along with a new one
SADD article:101:tags "redis" "nosql" "database"
# Returns: (integer) 1 (only "nosql" was newly added!)

# Verify total unique count
SCARD article:101:tags
# Returns: (integer) 4

# Check membership in O(1)
SISMEMBER article:101:tags "performance"
# Returns: (integer) 1

SISMEMBER article:101:tags "javascript"
# Returns: (integer) 0
```

Notice that `SADD` returns the count of *newly added* members, automatically ignoring elements that already exist in the set.

## Go deeper

When all members of a Set can be parsed as 64-bit signed integers and the member count stays below `set-max-intset-entries` (default: 512), Redis encodes the set as an **intset**. 

An `intset` is an extremely compact, sorted contiguous binary array of integers without pointer overhead. As soon as a non-integer string is added or the size exceeds the threshold, Redis automatically converts the set into a standard internal `hashtable`.

## Watch out

- Calling `SMEMBERS` on a set holding millions of elements returns the entire collection at once, freezing the server; use `SSCAN` instead.
- Do not rely on Sets if you need to preserve the chronological insertion order of items; use Lists or Sorted Sets.

## Remember

- Redis Sets guarantee uniqueness and prevent duplicate members automatically.
- Membership verification (`SISMEMBER`) runs in constant $O(1)$ time.
- Sets containing purely integers use the ultra-compact `intset` memory encoding.
