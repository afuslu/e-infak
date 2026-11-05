# Production deployment checklist

## Required environment

Set these values in the backend environment before enabling live payments:

- `ENVIRONMENT=production`, `DEBUG=false`, and a 32+ character `SECRET_KEY`
- `TENANT_PROXY_SECRET`: a 32+ character secret shared only by Next.js and the API
- `PAYMENT_CALLBACK_BASE_URL=https://api.e-infak.org` (or the public API gateway)
- `PAYMENTS_LIVE_ENABLED=true` only after each tenant has its Ziraat Pay credential map
- `SENTRY_DSN` for production error alerts

Set `TENANT_PROXY_SECRET` and `INTERNAL_API_URL` in the Next.js environment. Browser requests are routed through `/api/backend/*`; do not expose the backend directly to browsers.

## Domains

- `https://hicretdernegi.org` → Next.js web app
- `https://kardeslikpayi.org` → Next.js web app
- `https://e-infak.org` → E-İnfak platform portal
- The payment callback domain must forward `/api/v1/payments/ziraatpay/return` to the backend without rewriting the POST body.

Run the deployment smoke test with `PUBLIC_DOMAINS=hicretdernegi.org,kardeslikpayi.org bash scripts/post_deploy_smoke.sh`. It verifies local health checks plus the public HTTPS entry points.

## Release gate

Run `make quality`, complete a Ziraat Pay sandbox payment and callback, then verify one card and one transfer donation per tenant. Confirm Sentry receives a test exception only in a non-production environment.
