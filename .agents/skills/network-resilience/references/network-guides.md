# Network Resilience Guides

## Timeouts
- Use AbortController for fetch
- Set reasonable per-endpoint timeouts

## Retries
- Retry only transient failures
- Exponential backoff with max attempts

## Offline Handling
- Detect offline state
- Provide user-facing messaging

## Idempotency
- Ensure retries do not duplicate side effects
