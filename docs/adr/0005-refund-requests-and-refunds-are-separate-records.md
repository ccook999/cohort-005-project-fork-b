# Refund Requests and Refunds are separate records

The `refunds` table used to hold Refund Requests, with the refunded amount added to the same row. We split it into `refund_requests`, which holds the buyer's ask and the Platform Admin's final decision, and `refunds`, which is created only when a request is approved and holds the amount and its Pending, Issued or Failed state. The glossary treats these as two things with separate lifecycles: a Refund can fail and later be Issued while its approved request stays the same. Keeping both on one row would mix two state machines and make "the `refunds` table" mean the wrong thing.

## Consequences

- Existing `refunds` rows migrate to `refund_requests`. Any already-approved rows also need a matching `refunds` row.
- At most one Refund per Purchase, because no new Refund Request can be raised once one has been approved.
