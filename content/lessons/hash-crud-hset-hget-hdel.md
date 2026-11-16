---
slug: hash-crud-hset-hget-hdel
title: Manipulating Hash Fields with HSET, HGET, and HDEL
topic: lists-and-hashes
kind: api
summary: Master fundamental Hash CRUD commands to create, read, update, and delete individual and multiple fields.
tags:
  - hashes
  - hset
  - hget
  - hdel
  - api
related:
  - hash-structure-and-field-values
  - hash-bulk-and-counters
  - hash-memory-efficiency
---
> **In one line:** Manage entity attributes in-place using `HSET`, `HGET`, `HDEL`, and `HLEN` in constant $O(1)$ time.

## The idea

Redis Hashes provide a dedicated API for CRUD (Create, Read, Update, Delete) operations at the field level. Because each field functions like an isolated key inside the parent hash dictionary, operations on specific fields execute in constant $O(1)$ time.

Modern Redis combines single-field and multi-field writes into the versatile `HSET` command (superseding the deprecated `HMSET`).

| Command | Arguments | Time Complexity | Return Value / Behavior |
|---|---|---|---|
| `HSET key field val [field val ...]` | Key and pairs | $O(N)$ for $N$ fields | Number of fields that were newly added |
| `HGET key field` | Key and field | $O(1)$ | String value or `nil` if field/key missing |
| `HDEL key field [field ...]` | Key and fields | $O(N)$ for $N$ fields | Number of fields that were actually deleted |
| `HLEN key` | Key | $O(1)$ | Total count of fields in the hash |
| `HSTRLEN key field` | Key and field | $O(1)$ | Byte length of the specified field's value |

> **Tip:** If the parent key does not exist when `HSET` is called, Redis creates an empty hash before adding the fields.

## See it

Executing everyday field manipulations on a customer shopping cart:

```bash
# Add multiple items and prices to a shopping cart hash
HSET cart:user_88 item_apple "1.50" item_bread "2.25" item_milk "3.00"
# Returns: (integer) 3

# Check how many distinct items are in the cart
HLEN cart:user_88
# Returns: (integer) 3

# Read the price of bread
HGET cart:user_88 item_bread
# Returns: "2.25"

# Update bread price in-place (overwrites existing field)
HSET cart:user_88 item_bread "2.50"
# Returns: (integer) 0 (0 indicates an existing field was updated, not added)

# Remove the apple item from the cart
HDEL cart:user_88 item_apple
# Returns: (integer) 1

# Verify apple was removed
HEXISTS cart:user_88 item_apple
# Returns: (integer) 0
```

Notice that `HSET` returns `1` when a field is newly created, and `0` when an existing field's value is overwritten.

## Go deeper

When the final remaining field inside a Hash is deleted using `HDEL`, Redis automatically deallocates the entire hash container and purges the top-level key from the keyspace dictionary.

Conversely, calling `HSET` on an existing key that holds a different data type (such as a List or Set) returns a `-WRONGTYPE Operation against a key holding the wrong kind of value` error.

## Watch out

- Calling `HGET` on a non-existent field returns `(nil)`, which applications must handle gracefully.
- Deleting fields one-by-one in high-throughput loops adds unnecessary round-trips; pass multiple field arguments to `HDEL`.

## Remember

- `HSET` creates new fields and overwrites existing ones in $O(1)$ time.
- `HGET` retrieves single field values without transferring the rest of the hash.
- Removing all fields from a Hash automatically deletes the parent key from the database.
