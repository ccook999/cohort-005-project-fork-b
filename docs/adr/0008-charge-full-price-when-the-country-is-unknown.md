# Charge full price when the request carries no country

Purchasing-power prices depend on the buyer's country. Behind Cloudflare the request carries it in the `CF-IPCountry` header; when it doesn't, `resolveCountry` returns no country and the buyer is charged full price. A page never waits on a network call to learn the country.

## Considered Options

- **Look up the first `X-Forwarded-For` address on ip-api.com.** Tried and removed: the course list, the purchase page and every lesson page for a discounted purchase waited on a plain-HTTP call limited to 45 requests a minute.
- **Bundle a MaxMind GeoLite2 database.** Rejected: it needs a licence key, a download of tens of megabytes, and an update every month.

## Consequences

A Student outside Cloudflare's reach is overcharged, which is exactly the Student purchasing-power pricing is for. That is the accepted cost of never blocking a page on a lookup.
