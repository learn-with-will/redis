---
slug: list-range-and-inspection
title: Inspecting Lists with LRANGE, LLEN, and LINDEX
topic: lists-and-hashes
kind: api
summary: Inspect and paginate lists using LRANGE, query elements by index with LINDEX, and check lengths with LLEN.
tags:
  - lists
  - lrange
  - llen
  - lindex
  - pagination
related:
  - list-data-structure-basics
  - capped-lists-with-ltrim
  - blocking-list-pops
---
> **In one line:** Query list lengths in $O(1)$ with `LLEN` and retrieve paginated element slices with `LRANGE`.

## The idea

Beyond pushing and popping items, applications often need to display lists on user interfaces: displaying the last 10 audit events, rendering timeline feeds, or inspecting queue lengths.

Redis provides non-destructive inspection commands that read elements without removing them from the list.

| Command | Arguments | Time Complexity | Return Value |
|---|---|---|---|
| `LLEN key` | Key | $O(1)$ | Integer count of elements (0 if key does not exist) |
| `LRANGE key start stop` | Key, integer bounds | $O(S + N)$ where $S$ is offset, $N$ is count | Array of elements within specified range |
| `LINDEX key index` | Key, integer index | $O(N)$ where $N$ is distance from head/tail | Element at index or `nil` if out of bounds |
| `LPOS key element` | Key, target string | $O(N)$ | Zero-based index of the matching element |

> **Tip:** `LRANGE` is zero-indexed and inclusive. Specifying `0 -1` retrieves every element from the start to the end of the list.

## See it

Inspecting, measuring, and paginating list items:

```bash
# Populate a timeline of user notifications
RPUSH user:1001:notifications "Welcome!" "Email verified" "Payment received" "Invoice ready"

# Check total length in constant time
LLEN user:1001:notifications
# Returns: (integer) 4

# Fetch the first two notifications (indices 0 and 1)
LRANGE user:1001:notifications 0 1
# Returns:
# 1) "Welcome!"
# 2) "Email verified"

# Retrieve the single latest notification (tail index -1)
LINDEX user:1001:notifications -1
# Returns: "Invoice ready"

# Find the position of a specific element
LPOS user:1001:notifications "Payment received"
# Returns: (integer) 2
```

Negative offsets work from the end of the list backwards: `-1` is the last element, `-2` the second-to-last element, allowing efficient access to recent additions.

## Go deeper

Because Redis quicklists are doubly-linked, `LINDEX` optimizes by seeking from whichever end is closest to the requested index. Seeking index `2` in a list of 10,000 items scans forward from the head; seeking index `-2` scans backward from the tail.

However, executing `LRANGE 500000 500010` on a list with one million items forces Redis to traverse 500,000 pointers across internal quicklist nodes before collecting the 10 requested items. For deep pagination, sorted sets or streams are structurally superior.

## Watch out

- Running `LRANGE key 0 -1` on a list containing hundreds of thousands of items transfers massive network payloads and freezes the event loop.
- Modifying a list while paginating with index offsets can cause duplicate or missed elements across pages.

## Remember

- `LLEN` returns the list length in constant $O(1)$ time.
- `LRANGE` extracts elements using inclusive, zero-based or negative offsets.
- Deep pagination on massive linked lists degrades to $O(N)$ seeking latency.
