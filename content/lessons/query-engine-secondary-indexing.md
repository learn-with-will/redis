---
slug: query-engine-secondary-indexing
title: Secondary Indexing and Full-Text Search with the Query Engine
topic: advanced-data-types
kind: technique
summary: Build secondary indexes across Hashes and JSON documents with FT.CREATE and execute search queries using FT.SEARCH.
tags:
  - search
  - query-engine
  - indexing
  - redis-8
  - ft-search
related:
  - redis-json-document-storage
  - vector-sets-and-similarity-search
  - redis-8-unified-stack
---
> **In one line:** The Redis Query Engine creates secondary indexes over Hashes and JSON documents, enabling multi-field search via `FT.SEARCH`.

## The idea

Classic Redis requires developers to know the exact primary key to retrieve data (`GET user:1001`). If you needed to find "all users in Seattle with more than 10 orders", you had to manually maintain secondary Set indexes or scan the entire database.

In **Redis 8**, the Query Engine (formerly RediSearch) provides native secondary indexing and full-text search across both Hashes and JSON documents. You define an index over key prefixes, and Redis automatically indexes matching documents as they are created or updated.

| Field Type | Definition Keyword | Capabilities | Example Query Syntax |
|---|---|---|---|
| **TEXT** | `AS name TEXT` | Stemming, full-text tokenization, scoring | `@name:designer` |
| **TAG** | `AS status TAG` | Exact string matching, multi-value tags | `@status:{active \| pending}` |
| **NUMERIC** | `AS price NUMERIC` | Range filtering ($>, <, =, BETWEEN$) | `@price:[100 500]` |
| **GEO** | `AS location GEO` | Longitude/Latitude distance radius | `@location:[lon lat radius km]` |
| **VECTOR** | `AS embedding VECTOR` | Vector similarity search (HNSW/FLAT) | `*=>[KNN 5 @embedding $vec]` |

> **Tip:** Secondary indexes update synchronously in the background as keys are modified, ensuring zero lag between writes and searchability.

## See it

Creating an index and querying products in `redis-cli`:

```bash
# 1. Create a secondary index over JSON products matching prefix "product:"
FT.CREATE idx:products ON JSON PREFIX 1 product: SCHEMA   $.title AS title TEXT   $.category AS category TAG   $.price AS price NUMERIC

# 2. Add product documents
JSON.SET product:1 $ '{"title":"Mechanical Keyboard","category":"electronics","price":120.00}'
JSON.SET product:2 $ '{"title":"Ergonomic Office Chair","category":"furniture","price":350.00}'
JSON.SET product:3 $ '{"title":"Wireless Gaming Mouse","category":"electronics","price":75.00}'

# 3. Search: Electronics costing less than $100
FT.SEARCH idx:products "@category:{electronics} @price:[-inf 100]"
# Returns:
# 1) (integer) 1 (Total matching documents)
# 2) "product:3"
# 3) 1) "$"
#    2) "{"title":"Wireless Gaming Mouse","category":"electronics","price":75.0}"
```

`FT.SEARCH` executes multi-criteria filtering across fields without requiring client-side scans.

## Go deeper

The Query Engine features an inverted index with tokenization, stemming (normalizing "running" to "run"), phonetic matching, and configurable stop-words.

You can combine text search with exact numeric filtering in a single expressive query:
```bash
# Search for "keyboard" in title within category electronics
FT.SEARCH idx:products "keyboard @category:{electronics}"
```

This functionality eliminates the need to run separate search servers like Elasticsearch for operational data.

## Watch out

- Creating indexes over high-write keyspaces adds CPU and memory overhead for maintaining the inverted index.
- Always use `TAG` instead of `TEXT` for identifiers, status codes, and enum values to avoid tokenization overhead.

## Remember

- `FT.CREATE` defines secondary indexes across Hashes and JSON documents.
- `FT.SEARCH` executes multi-field, numeric range, and full-text queries.
- Indexes update in real time on the server, eliminating the need for external search clusters.
