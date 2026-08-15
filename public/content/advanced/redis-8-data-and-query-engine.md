---
id: lesson-23
slug: redis-8-data-and-query-engine
title: "The Redis 8 Data and Query Engine"
level: advanced
order: 23
duration: 24
tags:
  - redis-8
  - json
  - query-engine
  - vector-search
  - probabilistic
summary: "Beyond the core types: JSON documents, the Query Engine (secondary indexing and search), probabilistic structures, time series, and Vector Sets for similarity search — all now part of Redis Open Source 8 (formerly Redis Stack)."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Explain what capabilities **Redis 8** folded in from the former **Redis Stack**.
- Store and query **JSON** documents.
- Describe the **Query Engine** for secondary indexing, full-text, and **vector search**.
- Recognize the **probabilistic** types and **time series**, and what **Vector Sets** are for.

# Why It Matters

The core data types (strings, hashes, sets, sorted sets, streams) take you a very long way — but modern
applications also want to store JSON documents, **search** and **filter** data by its contents (not just
by key), find **similar** items with vector embeddings (the backbone of semantic search and AI
features), and handle time-series metrics. Historically these lived in separate add-on modules called
**Redis Stack**. **Redis 8 brought them into Redis Open Source itself**, so this power is available out
of the box. Knowing what's there stops you from reinventing it in your app.

# Concept Explanation

### From "Redis Stack" to Redis Open Source 8

For several years, capabilities beyond the core were shipped as **modules** and bundled as **Redis
Stack**: RedisJSON, the search/query engine (RediSearch), probabilistic structures (RedisBloom), and
time series (RedisTimeSeries). With **Redis 8 (2025)**, these were integrated into **Redis Open
Source**, and Redis 8 also introduced a new native type, **Vector Sets**. So on a current Redis 8, these
features are part of the product rather than separate downloads. (On older versions you'd install Redis
Stack or the individual modules.)

Let's tour what they give you.

### JSON documents

Redis can store **JSON** as a native value and read or update **parts** of it by path, instead of
serializing/deserializing a whole blob yourself:

```text
127.0.0.1:6379> JSON.SET user:1 $ '{"name":"Ada","roles":["admin"],"age":36}'
OK
127.0.0.1:6379> JSON.GET user:1 $.name
"[\"Ada\"]"
127.0.0.1:6379> JSON.ARRAPPEND user:1 $.roles '"editor"'
(integer) 2
```

`JSON.SET`/`JSON.GET` use **JSONPath** (`$` is the root) so you can fetch or modify a single field or
array element without touching the rest of the document — much nicer than storing JSON in a plain
string.

### The Query Engine: search and secondary indexing

Core Redis finds values **by key**. The **Query Engine** lets you find them **by content**: you create
an **index** over your hashes or JSON documents, then run queries that filter, do full-text search, sort,
and aggregate.

```text
127.0.0.1:6379> FT.CREATE idx:users ON JSON PREFIX 1 user: SCHEMA $.name AS name TEXT $.age AS age NUMERIC
OK
127.0.0.1:6379> FT.SEARCH idx:users "@age:[30 40]"
...
```

`FT.CREATE` defines a **secondary index** (here over JSON docs keyed `user:*`, indexing `name` as text
and `age` as a number); `FT.SEARCH` then queries by those fields — something plain Redis can't do without
maintaining your own index structures by hand. The Query Engine also powers **vector search** (see
below).

### Probabilistic data structures

Beyond the HyperLogLog you already met, Redis 8 includes a family of **probabilistic** structures that
trade a little accuracy for big space savings:

- **Bloom filter** (`BF.ADD` / `BF.EXISTS`) — approximate **set membership**. It can say "definitely not
  present" or "probably present": **no false negatives, but possible false positives**. Great for "have
  we seen this before?" checks (e.g. avoid re-processing) at scale.
- **Cuckoo filter** (`CF.*`) — similar to Bloom but supports deletion.
- **Count-Min sketch** (`CMS.*`) — approximate **frequency** counts for many items.
- **Top-K** (`TOPK.*`) — track the most frequent items.

### Time series

**Time series** (`TS.CREATE`, `TS.ADD`, `TS.RANGE`) store timestamped numeric samples efficiently, with
features like **labels** (to select series), **retention** (auto-drop old data), and **downsampling /
compaction** (roll raw points into averages over time). It's purpose-built for metrics and sensor data.

### Vector Sets: similarity search for AI

**Vector Sets** are a **new native data type introduced in Redis 8** for **vector similarity search**.
You store high-dimensional **vectors** (embeddings produced by an ML model) and ask for the ones **most
similar** to a query vector. This is the engine behind **semantic search**, **recommendations**, and
**retrieval-augmented generation (RAG)** for AI apps — finding items by *meaning* rather than exact
match. (Vector similarity is also available through the Query Engine's vector fields; Vector Sets are a
dedicated, set-like type for it.)

# Key Terminology

- **Redis Stack** — the former bundle of modules (JSON, search, probabilistic, time series) now folded
  into Redis Open Source 8.
- **JSONPath** — the `$`-rooted path syntax used to address parts of a JSON value.
- **Secondary index** — an index that lets you query by a value's **fields/content**, not just its key.
- **Bloom filter** — probabilistic membership with **no false negatives, possible false positives**.
- **Vector Set / vector search** — finding items whose embedding vectors are most **similar** to a query.

# Options and Trade-offs

| Capability | Solves | Instead of… |
| ---------- | ------ | ----------- |
| **JSON** | Store/update nested documents by path | Serializing a blob into a String |
| **Query Engine** | Query by content, full-text, aggregate | Hand-built secondary indexes in sets/sorted sets |
| **Bloom/Cuckoo** | "Have we seen this?" at scale | A huge Set (exact but memory-heavy) |
| **Time series** | Metrics with retention/downsampling | Manually bucketing sorted sets |
| **Vector Sets / vector search** | Semantic similarity for AI | A separate vector database |

# Worked Example

Store a JSON document and query it by field with a secondary index:

```text
127.0.0.1:6379> JSON.SET product:1 $ '{"title":"Red Shoes","price":59.99,"tags":["shoes","red"]}'
OK
127.0.0.1:6379> FT.CREATE idx:products ON JSON PREFIX 1 product: SCHEMA $.title AS title TEXT $.price AS price NUMERIC
OK
127.0.0.1:6379> FT.SEARCH idx:products "@price:[0 60] shoes"
1) (integer) 1
2) "product:1"
3) 1) "$"
   2) "{\"title\":\"Red Shoes\",\"price\":59.99,\"tags\":[\"shoes\",\"red\"]}"
```

The document is stored as JSON; the index makes `title` searchable and `price` filterable; and the query
finds products under $60 matching "shoes" — a content query core Redis alone couldn't do without you
maintaining index structures manually.

# Real World Analogy

The core types are the **shelves** of a warehouse — you retrieve a box if you know its exact shelf label
(the key). The Query Engine adds a **catalog and search desk**: now you can ask "show me all red items
under $60" without knowing shelf labels. **Vector search** is a **"find me things like this one" desk**:
hand over a sample and get the most similar items back. And the probabilistic tools are the **quick
clipboard check** at the door — "have we seen this shipment before?" — answered instantly without
searching every shelf.

# Examples

## Example 1 — Basic: partial JSON updates

An order document is stored with `JSON.SET order:9 $ '{...}'`. When the status changes, `JSON.SET order:9
$.status '"shipped"'` updates just that field — no read-modify-write of the whole document.

**Why this works:** native JSON with JSONPath lets you address and change one field server-side.

## Example 2 — Real-world: semantic search for a help center

Article text is embedded into vectors and stored for vector similarity search. A user's question is
embedded and matched against them, returning the most *semantically similar* articles — even when they
share no keywords.

**Why this works:** vector similarity finds items by meaning, powering semantic search and RAG, which
keyword matching can't do.

## Example 3 — Trade-off / pitfall: expecting a Bloom filter to be exact

A team uses a Bloom filter to decide "have we emailed this user?" and treats a "probably present" as
certain. Occasionally a false positive means a user who *wasn't* emailed is skipped.

**Why this bites:** Bloom filters have **possible false positives** (though never false negatives). Use
them where a rare false positive is acceptable; for exactness, use a Set or a database.

# Common Mistakes

- **Reinventing search/indexing in app code** when the **Query Engine** already provides secondary
  indexes and full-text.
- **Serializing whole JSON blobs into Strings** when native **JSON** allows partial, path-based updates.
- **Treating probabilistic results as exact.** Bloom/Cuckoo/Count-Min/Top-K are approximate by design.
- **Assuming these features exist everywhere.** They're in **Redis 8** (or older Redis Stack/modules) —
  confirm your deployment has them.

# Best Practices

- Use **JSON** for documents you update field-by-field; use the **Query Engine** when you need to query
  by **content** rather than key.
- Reach for **probabilistic** structures when approximate answers at low memory are acceptable
  (dedup checks, frequency, membership).
- Use **time series** for metrics needing retention and downsampling instead of hand-rolled buckets.
- Use **Vector Sets / vector search** for **semantic** similarity (search, recommendations, RAG).
- Verify your **version** — these are Redis 8 (Open Source) features; older setups used Redis Stack or
  separate modules.

# Summary

- **Redis 8** folded the former **Redis Stack** capabilities into Redis Open Source and added **Vector
  Sets**.
- **JSON** stores documents you can read/update **by path** (JSONPath) instead of as opaque blobs.
- The **Query Engine** builds **secondary indexes** over hashes/JSON for **filtering, full-text, and
  vector search** — querying by content, not just key.
- **Probabilistic** types (Bloom, Cuckoo, Count-Min, Top-K) give approximate membership/frequency at low
  memory; **time series** handles metrics with retention and downsampling.
- **Vector Sets / vector search** power **semantic similarity** for search, recommendations, and RAG —
  key building blocks for AI apps.

# Flash Cards

Q: What did Redis 8 do with the former "Redis Stack" capabilities?
A: It folded them (JSON, the Query Engine/search, probabilistic structures, time series) into Redis Open Source, and added the new Vector Sets type.

Q: What does the Query Engine let you do that core Redis alone cannot?
A: Query data by its content — create secondary indexes over hashes/JSON and run filtering, full-text, and vector searches, rather than looking up only by key.

Q: What accuracy guarantee does a Bloom filter give?
A: No false negatives but possible false positives — it can say "definitely not present" or "probably present."

Q: What are Vector Sets used for?
A: Vector similarity search — finding items whose embedding vectors are most similar to a query, powering semantic search, recommendations, and RAG.

Q: Why use native JSON instead of storing a JSON string?
A: You can read and update individual fields by JSONPath server-side, without deserializing and rewriting the whole document.

Q: Should you rely on these features being present on any Redis?
A: No — they're part of Redis 8 (Open Source); older deployments needed Redis Stack or the separate modules, so verify your version.

# Exercises

### Easy
If you have Redis 8, run `JSON.SET u $ '{"name":"Sam","age":30}'` then `JSON.GET u $.name`. Explain how
this differs from storing the JSON in a plain String and using `GET`.

### Medium
Describe, in words, how you'd make product hashes searchable by a `category` field and a `price` range
using the Query Engine (`FT.CREATE` an index, then `FT.SEARCH`). What could you query that plain Redis
key lookups couldn't?

### Challenging
Design a "similar articles" feature: outline how you'd turn article text into vectors, store them for
vector similarity search, and query for the nearest matches to a user's question. Explain why this finds
relevant articles that a keyword search would miss — and note one cost of the approach.

# Further Reading

- Redis — *What's new in Redis 8*: <https://redis.io/docs/latest/develop/whats-new/8-0/>
- Redis — *JSON*: <https://redis.io/docs/latest/develop/data-types/json/>
- Redis — *Redis Query Engine / Search*: <https://redis.io/docs/latest/develop/interact/search-and-query/>
- Redis — *Vector Sets*: <https://redis.io/docs/latest/develop/data-types/vector-sets/>
- Redis — *Probabilistic data types*: <https://redis.io/docs/latest/develop/data-types/probabilistic/>
