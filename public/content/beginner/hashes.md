---
id: lesson-05
slug: hashes
title: "Hashes"
level: beginner
order: 5
duration: 20
tags:
  - hashes
  - objects
  - fields
  - modeling
  - data-types
summary: "The Redis Hash type: a map of field-value pairs under one key, ideal for modeling objects. Learn HSET/HGET/HGETALL/HINCRBY, when a hash beats many string keys, and its memory advantages."
---

# Learning Objectives

By the end of this lesson you will be able to:

- Store and read field-value pairs with `HSET`, `HGET`, `HMGET`, and `HGETALL`.
- Model an **object** (like a user) as a single hash key.
- Update numeric fields atomically with `HINCRBY` / `HINCRBYFLOAT`.
- Decide when a **hash** is a better fit than many separate **string** keys.
- Avoid the pitfall of `HGETALL` on very large hashes.

# Why It Matters

Applications are full of objects: a user, a product, a session, a config record. Storing each
object as a pile of loose string keys (`user:1:name`, `user:1:email`, `user:1:age`) works, but
it scatters one thing across many keys. A **Hash** keeps all the fields of one object together
under a single key — cleaner to manage, cheaper in memory, and fetchable in one command.

# Concept Explanation

### What a Hash is

A Redis **Hash** is a collection of **field → value** pairs stored under one key — essentially a
small dictionary nested inside a key. Both fields and values are strings.

```text
127.0.0.1:6379> HSET user:1 name "Ada" email "ada@example.com" age 36
(integer) 3
127.0.0.1:6379> HGET user:1 email
"ada@example.com"
127.0.0.1:6379> HGETALL user:1
1) "name"
2) "Ada"
3) "email"
4) "ada@example.com"
5) "age"
6) "36"
```

`HSET` sets one or more fields and returns the number of **new** fields added (existing fields
are updated but not counted). The essential commands:

- `HSET key field value [field value ...]` — set one or more fields.
- `HGET key field` — read one field; `HMGET key f1 f2 ...` — read several.
- `HGETALL key` — every field and value (O(N) in the number of fields).
- `HDEL key field [field ...]` — remove fields.
- `HEXISTS key field` — does a field exist?
- `HKEYS` / `HVALS` / `HLEN` — all field names / all values / field count.
- `HINCRBY key field n` / `HINCRBYFLOAT key field n` — atomically add to a numeric field.

> Note: the old `HMSET` command is deprecated — `HSET` now accepts multiple field-value pairs,
> so use `HSET` for everything.

### Why hashes beat scattered string keys

Storing an object as one hash instead of many strings has real advantages:

- **One key to manage.** Delete the object with a single `DEL user:1`; expire the whole object
  with one TTL. With scattered strings you'd juggle many keys.
- **Fetch the whole object at once** with `HGETALL`, or a few fields with `HMGET`.
- **Memory efficiency.** Small hashes are stored in a compact encoding (a *listpack*), which uses
  noticeably less memory than the equivalent set of separate string keys. Redis switches to a
  full hash-table encoding automatically once a hash grows past configurable thresholds
  (number of fields and value size).

### Atomic field math

Just as `INCR` works on string counters, `HINCRBY` updates a numeric **field** atomically —
great for per-object counters:

```text
127.0.0.1:6379> HINCRBY user:1 login_count 1
(integer) 1
127.0.0.1:6379> HINCRBY user:1 login_count 1
(integer) 2
```

### A note on expiring fields

A TTL (time-to-live) normally applies to a **whole key**, so historically you couldn't expire
one field of a hash. Since **Redis 7.4**, individual hash fields *can* have their own TTLs
(`HEXPIRE` and friends) — a newer capability worth knowing exists, though the whole-key model is
still the common case.

# Key Terminology

- **Hash** — a Redis value that maps field names to values (a dictionary under one key).
- **Field** — a named entry within a hash (e.g. `email`).
- **Listpack encoding** — a compact in-memory layout used for small hashes to save memory.
- **`HGETALL`** — returns all field-value pairs; O(N) in the number of fields.

# Options and Trade-offs

Object with a handful of fields — how to store it:

| Option | What it does | Use when | Watch out for |
| ------ | ------------ | -------- | ------------- |
| **One Hash** (`user:1`) | All fields under one key | Fields belong to one object; you fetch/delete it as a unit | TTL is per-key (field TTLs need Redis 7.4+); `HGETALL` on a giant hash is O(N) |
| **Many Strings** (`user:1:name`, …) | One key per field | Fields are accessed/expired independently | More keys to manage; no one-shot object fetch; more memory |
| **Serialized blob** (JSON string) | Whole object as one string | You always read/write the object whole | Must deserialize to touch one field; no atomic field updates |

# Worked Example

Model a shopping cart's summary as a hash, update a running total atomically, then read it back:

```text
127.0.0.1:6379> HSET cart:42 items 0 total 0.00 currency "USD"
(integer) 3
127.0.0.1:6379> HINCRBY cart:42 items 1
(integer) 1
127.0.0.1:6379> HINCRBYFLOAT cart:42 total 19.99
"19.99"
127.0.0.1:6379> HMGET cart:42 items total currency
1) "1"
2) "19.99"
3) "USD"
127.0.0.1:6379> HGETALL cart:42
1) "items"
2) "1"
3) "total"
4) "19.99"
5) "currency"
6) "USD"
```

One key holds the whole cart summary; `HINCRBY`/`HINCRBYFLOAT` update fields atomically; `HMGET`
grabs exactly the fields you need.

# Real World Analogy

A hash is a **manila folder** with a label on the tab (the key) and labeled sheets inside (the
fields). Everything about one case lives in one folder, so you can pull the whole folder
(`HGETALL`), grab a single sheet (`HGET`), or shred the case in one move (`DEL`). Scattering the
same information as loose pages across the office (separate string keys) means hunting for each
one.

# Examples

## Example 1 — Basic: a user profile

`HSET user:7 name "Sam" plan "pro" theme "dark"`. Read the whole profile with `HGETALL user:7`,
or just the plan with `HGET user:7 plan`. Update the theme with another `HSET user:7 theme
"light"`.

**Why this works:** the profile's fields naturally belong together, so one key with fields is
tidier and cheaper than three string keys.

## Example 2 — Real-world: per-object counters

Track engagement on posts: `HINCRBY post:99 views 1` on each view and `HINCRBY post:99 likes 1`
on each like. All the post's counters sit in one `post:99` hash, updated atomically and read in
one `HGETALL`.

**Why this works:** grouping related counters under one key keeps the data cohesive and lets you
fetch the whole stats block at once.

## Example 3 — Trade-off / pitfall: `HGETALL` on a massive hash

A hash accumulates millions of fields (say, one field per user in a global map). Calling
`HGETALL` returns *all* of them in one blocking O(N) command, spiking memory and latency.

**Why this bites:** `HGETALL` doesn't paginate. For big hashes use `HSCAN` (a cursor iterator
like `SCAN`) or rethink the model — a single hash isn't meant to be an unbounded table.

# Common Mistakes

- **Using `HMSET`.** It's deprecated; `HSET` takes multiple field-value pairs.
- **`HGETALL` on an ever-growing hash.** It's O(N) and unpaginated; use `HSCAN` or a different
  design for large hashes.
- **Expecting per-field TTLs everywhere.** Whole-key TTL is the norm; per-field expiry needs
  Redis 7.4+.
- **Choosing a hash when fields need independent lifetimes.** If each field should expire on its
  own schedule (pre-7.4), separate string keys may fit better.

# Best Practices

- Model each **object** as a hash keyed like `type:id` (`user:1`, `order:88`).
- Read only what you need with `HGET`/`HMGET`; reserve `HGETALL` for small hashes.
- Use `HINCRBY`/`HINCRBYFLOAT` for per-object counters instead of read-modify-write in your app.
- Keep hashes bounded; iterate large ones with `HSCAN`.

# Summary

- A **Hash** maps **field → value** pairs under one key — ideal for modeling objects.
- `HSET` sets fields (returning the count of new ones); `HGET`/`HMGET`/`HGETALL` read;
  `HDEL`/`HEXISTS`/`HKEYS`/`HVALS`/`HLEN` manage.
- Hashes beat scattered strings for **cohesion, one-shot fetch/delete, and memory** (compact
  listpack encoding for small hashes).
- `HINCRBY`/`HINCRBYFLOAT` update numeric fields **atomically**.
- `HGETALL` is **O(N)** — use `HSCAN` on large hashes; per-field TTLs exist only since Redis 7.4.

# Flash Cards

Q: What does a Redis Hash store?
A: Field-value pairs (a small dictionary) under a single key — perfect for modeling an object.

Q: What does HSET return?
A: The number of NEW fields added (existing fields are updated but not counted).

Q: Give two advantages of one hash over many separate string keys for an object.
A: You can fetch or delete the whole object in one command, and small hashes use less memory via the compact listpack encoding.

Q: Why can HGETALL be dangerous on a very large hash?
A: It returns every field-value pair in one O(N) blocking command; use HSCAN to iterate large hashes instead.

Q: Which command atomically adds to a numeric hash field?
A: HINCRBY (or HINCRBYFLOAT for floating-point values).

Q: Does a TTL normally apply to a hash field or the whole hash key?
A: The whole key — per-field TTLs (HEXPIRE) exist only since Redis 7.4.

# Exercises

### Easy
`HSET book:1 title "Dune" author "Herbert" year 1965`. Read the title with `HGET`, all fields
with `HGETALL`, and the field count with `HLEN`.

### Medium
Track counters on `post:1`: `HINCRBY post:1 views 1` a few times and `HINCRBY post:1 likes 1`
once. Then `HMGET post:1 views likes` to read both at once. Explain why these updates are safe
under concurrency.

### Challenging
Model the same user two ways: (a) as one hash `user:1` with `name`, `email`, `age`; (b) as three
string keys `user:1:name`, `user:1:email`, `user:1:age`. Write down how you'd delete the whole
user and how you'd set a 1-hour expiry on the whole user in each design, and say which is
simpler.

# Further Reading

- Redis — *Redis Hashes*: <https://redis.io/docs/latest/develop/data-types/hashes/>
- Redis — *HSET* / *HGETALL* / *HINCRBY*: <https://redis.io/commands/hset/>
- Redis — *HSCAN* (iterating large hashes): <https://redis.io/commands/hscan/>
