---
slug: hash-structure-and-field-values
title: Redis Hashes for Structured Object Modeling
topic: lists-and-hashes
kind: concept
summary: Redis Hashes map field-value pairs under a single key, perfectly modeling objects and reducing memory overhead.
tags:
  - hashes
  - modeling
  - objects
  - data-types
related:
  - hash-crud-hset-hget-hdel
  - hash-bulk-and-counters
  - hash-memory-efficiency
---
> **In one line:** A Redis Hash is an in-memory dictionary of field-value pairs under a single key, ideal for modeling domain objects.

## The idea

When modeling entities like users, products, or server configurations, developers commonly face a dilemma: should the object be serialized as a JSON string under a single key, split across multiple string keys, or stored in a structured container?

A Redis **Hash** maps field names to values within a single top-level key. Rather than serializing and re-uploading an entire JSON document to change an email address, you update the specific field in-place with a single microsecond operation.

| Modeling Strategy | Example Storage Format | Pros | Cons |
|---|---|---|---|
| **Serialized JSON String** | `SET user:1001 '{"name":"Ali","age":30}'` | Simple single key | Must fetch and rewrite entire payload to update one field |
| **Scattered String Keys** | `SET user:1001:name "Ali"`<br>`SET user:1001:age "30"` | Granular field updates | Enormous memory pointer overhead across millions of keys |
| **Redis Hash** | `HSET user:1001 name "Ali" age "30"` | **In-place field updates & compact memory** | Fields cannot hold nested data types (strings only) |

> **Note:** Values inside a Redis Hash must be strings or numbers; a Hash field cannot hold another nested Redis List or Hash.

## See it

Modeling and inspecting a user entity using a Redis Hash:

```bash
# Create a user object with multiple fields
HSET user:1001 name "Marcus Brody" email "marcus@museum.org" status "active" visits 1
# Returns: (integer) 4

# Retrieve a single field
HGET user:1001 email
# Returns: "marcus@museum.org"

# Check if a specific field exists
HEXISTS user:1001 status
# Returns: (integer) 1

# List all field names in the hash
HKEYS user:1001
# Returns:
# 1) "name"
# 2) "email"
# 3) "status"
# 4) "visits"
```

Each field inside the hash can be queried and mutated independently of all other fields.

## Go deeper

Small hashes (under 128 fields and 64 bytes per field by default) are internally encoded as a **listpack**—a compact, serialized flat byte array without pointer overhead.

This optimization makes storing 1,000 entities with 10 fields each inside Hashes dramatically more memory-efficient than storing 10,000 separate string keys.

## Watch out

- Redis Hashes do not support nested structures; attempting to store nested arrays requires JSON strings or the RedisJSON module.
- Running `HGETALL` on a hash with hundreds of thousands of fields can block the server; use `HSCAN` for large hashes.

## Remember

- Hashes map field-value pairs under a single top-level Redis key.
- Fields can be read and mutated in-place without serializing the full object.
- Compact internal listpack encoding makes Hashes significantly more memory-efficient than individual string keys.
