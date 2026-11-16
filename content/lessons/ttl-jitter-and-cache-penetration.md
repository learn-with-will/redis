---
slug: ttl-jitter-and-cache-penetration
title: Preventing Cache Penetration with Null Values and Bloom Filters
topic: caching-patterns
kind: technique
summary: Protect relational databases from malicious queries for non-existent records using cached nulls and Bloom filters.
tags:
  - cache-penetration
  - bloom-filter
  - null-caching
  - security
related:
  - cache-aside-pattern
  - time-series-and-probabilistic-data
  - cache-invalidation-strategies
---
> **In one line:** Cache penetration occurs when queries for non-existent records bypass Redis and overwhelm the database; prevent it with cached nulls or Bloom filters.

## The idea

In a standard Cache-Aside setup, if a requested key does not exist in Redis, the application queries the primary database.

What happens if an attacker or malfunctioning client sends 100,000 requests per second querying for non-existent IDs (e.g., `user:random_fake_uuid_99999`)?
1. Redis returns `nil` (Cache Miss).
2. Application queries the SQL database.
3. Database confirms the record does not exist.
4. Because the record does not exist, nothing is cached in Redis!
5. The next request repeats the exact same cycle, bypassing Redis completely and crashing the database. This vulnerability is called **Cache Penetration**.

| Defense Mechanism | How It Works | Strengths | Trade-offs |
|---|---|---|---|
| **Cache Null Values** | Store `SET user:fake_id "" EX 60` on missing DB query | Extremely simple to implement | Consumes memory if millions of distinct fake IDs are queried |
| **Bloom Filter Defense** | Pre-filter queries using an in-memory Bloom filter | Rejects non-existent IDs in $O(1)$ with zero DB queries | Small false-positive rate; requires index maintenance |

> **Tip:** If caching null values, always attach a short TTL (e.g., 30–60 seconds) so if a record is created later, it becomes visible quickly.

## See it

Implementing cached null defense and Bloom filter verification in `redis-cli`:

```bash
# Scenario 1: Cache Null Value Defense
# Query DB for non-existent user 99999 -> Returns Nothing!
# Cache a null sentinel value with a short 60-second TTL
SET user:99999 "SENTINEL_NULL" EX 60
# Returns: OK

# Subsequent attacks for user 99999 hit Redis immediately:
GET user:99999
# Returns: "SENTINEL_NULL" -> Application returns 404 without touching SQL database!

# Scenario 2: Bloom Filter Defense
# Populate Bloom filter with all existing valid user IDs
BF.ADD valid_users "1001"
BF.ADD valid_users "1002"

# Incoming query for fake user ID 88888:
BF.EXISTS valid_users "88888"
# Returns: (integer) 0 (Guaranteed to NOT exist in database!)
# Application immediately returns 404 without querying SQL database!
```

The Bloom filter blocks the non-existent query at the perimeter, shielding the SQL database from malicious traffic.

## Go deeper

Comparing the two defenses:
- **Null Caching** is effective when queries repeatedly request the *same* small set of invalid IDs.
- **Bloom Filters** are required when an attacker generates *random, infinite unique fake IDs*. Caching nulls for billions of random strings would exhaust Redis RAM, whereas a Bloom filter tracks hundreds of millions of IDs in a fixed 20 MB footprint.

## Watch out

- Forgetting to attach an expiration to cached null values prevents newly registered users from logging in until manual purge.
- Bloom filters can produce false positives (reporting an ID exists when it does not), but they **never** produce false negatives.

## Remember

- Cache penetration occurs when queries for non-existent records repeatedly bypass the cache.
- Cache null sentinel values with short TTLs (30–60s) for repeated invalid queries.
- Use Redis Bloom filters to reject arbitrary non-existent IDs at the perimeter.
