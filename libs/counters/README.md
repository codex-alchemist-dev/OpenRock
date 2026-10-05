# @openrock/counters

Sharded two-level counters (category -> subject) with size accounting vs the 32KB property limit and batched flush.

STATUS: stub. Every API function currently throws "not implemented"; the shape below is the contract to implement.

## API

- `increment`
- `get`
- `flush`
- `sizeReport`
