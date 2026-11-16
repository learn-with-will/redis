---
slug: redis-json-document-storage
title: Native JSON Document Storage with JSON.SET and JSON.GET
topic: advanced-data-types
kind: api
summary: Store, query, and mutate nested JSON documents natively in Redis using JSON.SET, JSON.GET, and JSONPath.
tags:
  - json
  - redis-8
  - jsonpath
  - document-store
related:
  - query-engine-secondary-indexing
  - hash-structure-and-field-values
  - redis-8-unified-stack
---
> **In one line:** Store and manipulate nested JSON documents natively in Redis using JSONPath syntax via `JSON.SET` and `JSON.GET`.

## The idea

While Redis Hashes model flat objects effectively, real-world data often involves nested arrays, boolean flags, and multi-level hierarchical trees (such as user profile settings, product catalogs, or API payloads). In classic Redis, developers serialized JSON into opaque strings, requiring full document downloads to modify a single nested attribute.

With **Redis 8**, the capabilities formerly known as RedisJSON are integrated directly into core Redis. You can parse, store, validate, and manipulate nested JSON documents natively on the server.

| Operation | Command Example | JSONPath Syntax | Description |
|---|---|---|---|
| **Create / Update** | `JSON.SET user:42 $ '{"name":"Alex"}'` | `$` (Root) | Stores JSON document at specified path |
| **Retrieve** | `JSON.GET user:42 $.profile.email` | `$.path` | Extracts specific nested property |
| **Array Append** | `JSON.ARRAPPEND user:42 $.tags "dev"` | `$.array` | Appends item directly to nested array |
| **Atomic Number** | `JSON.NUMINCRBY user:42 $.views 1` | `$.number` | Increments nested numeric property |
| **Delete** | `JSON.DEL user:42 $.temporary_token` | `$.path` | Deletes specific nested JSON property |

> **Tip:** The `$` symbol denotes the document root in standard JSONPath syntax.

## See it

Storing, querying, and updating nested JSON structures in `redis-cli`:

```bash
# Store a rich nested customer document
JSON.SET customer:1001 $ '{
  "name": "Maya Lin",
  "email": "maya@design.org",
  "orders": 12,
  "address": { "city": "Seattle", "zip": "98101" },
  "tags": ["vip", "architect"]
}'
# Returns: OK

# Query only the nested city field
JSON.GET customer:1001 $.address.city
# Returns: "["Seattle"]"

# Atomically increment orders count in-place
JSON.NUMINCRBY customer:1001 $.orders 1
# Returns: "[13]"

# Append a new tag to the nested array
JSON.ARRAPPEND customer:1001 $.tags '"design"'
# Returns: 3 (new array length)

# Inspect the full updated document
JSON.GET customer:1001
```

Notice that `JSON.NUMINCRBY` and `JSON.ARRAPPEND` mutate nested elements in-place without serializing or rewriting the rest of the customer object.

## Go deeper

Under the hood, Redis parses JSON text into an internal binary tree structure (tree representation). Modifying a nested property only updates that specific branch of the binary tree rather than re-encoding the entire document.

Furthermore, native JSON documents in Redis 8 integrate seamlessly with the Query Engine, allowing secondary indexing and full-text search across nested JSONPath fields.

## Watch out

- Storing massive multi-megabyte JSON trees can lead to CPU spikes when evaluating complex JSONPath filters.
- JSON keys and property names are case-sensitive; verify JSONPath casing in application queries.

## Remember

- Redis 8 integrates native JSON document storage directly into open-source Redis.
- Use JSONPath syntax (`$.property`) to read and mutate nested fields in-place.
- Eliminates client-side serialization overhead for complex hierarchical data structures.
