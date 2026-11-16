---
slug: list-data-structure-basics
title: "The Redis List: Doubly-Linked Lists and Push/Pop"
topic: lists-and-hashes
kind: concept
summary: Redis Lists are ordered sequences of strings supporting constant-time O(1) push and pop operations at both ends.
tags:
  - lists
  - lpush
  - rpush
  - queues
  - stacks
related:
  - list-range-and-inspection
  - capped-lists-with-ltrim
  - blocking-list-pops
---
> **In one line:** A Redis List is an ordered sequence of strings optimized for instant $O(1)$ push and pop operations at both ends.

## The idea

Unlike arrays in languages like JavaScript or Python, which store elements in contiguous memory blocks, a Redis **List** is historically implemented as a doubly-linked list of memory blocks (specifically a **quicklist** composed of internal listpacks).

This underlying architecture means that inserting an element at the very beginning (`head`) or at the very end (`tail`) of a list with 10 million items takes the exact same sub-microsecond time as inserting into an empty list.

| Command | Insertion Point | Time Complexity | Return Value |
|---|---|---|---|
| `LPUSH key val [val ...]` | Left / Head | $O(1)$ per element | New length of the list after insertion |
| `RPUSH key val [val ...]` | Right / Tail | $O(1)$ per element | New length of the list after insertion |
| `LPOP key [count]` | Left / Head | $O(N)$ for $N$ popped elements | Popped elements or `nil` if list is empty |
| `RPOP key [count]` | Right / Tail | $O(N)$ for $N$ popped elements | Popped elements or `nil` if list is empty |

> **Note:** Because a List is a linked structure, pushing and popping from the ends is $O(1)$, but accessing elements by index in the middle of a massive list is $O(N)$.

## See it

Using a Redis List to model standard Queue (FIFO) and Stack (LIFO) access patterns:

```bash
# Model a FIFO Queue (Push to Right, Pop from Left)
RPUSH jobs:queue "job_101" "job_102" "job_103"
# Returns: (integer) 3

# Worker consumes the oldest job from the head
LPOP jobs:queue
# Returns: "job_101"

# Model a LIFO Stack (Push to Left, Pop from Left)
LPUSH navigation:history "home.html"
LPUSH navigation:history "profile.html"
LPUSH navigation:history "settings.html"

# User clicks 'Back', popping the most recently visited page
LPOP navigation:history
# Returns: "settings.html"
```

Notice that Redis Lists naturally support both First-In-First-Out queues and Last-In-First-Out stacks without any architectural adjustments.

## Go deeper

When an operation attempts to push to a non-existent key, Redis automatically creates an empty list before inserting the elements. Conversely, when the last element is popped from a list, Redis automatically removes the key from the keyspace dictionary.

Under the hood, Redis encodes lists using a **quicklist**: a doubly-linked list where each node is a byte-compressed `listpack`. This hybrid structure avoids the extreme memory pointer overhead of traditional linked lists while preserving $O(1)$ head and tail operations.

## Watch out

- Pushing millions of items into a list without trimming or consuming them consumes unbounded RAM.
- Accessing elements in the middle of very long lists using index lookups causes CPU spikes.

## Remember

- Redis Lists provide $O(1)$ constant-time insertion and removal at both head and tail.
- Pairing `RPUSH` with `LPOP` implements a clean First-In-First-Out (FIFO) queue.
- Empty lists are automatically deallocated and deleted from the keyspace.
