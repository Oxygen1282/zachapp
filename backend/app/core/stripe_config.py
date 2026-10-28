import os 

# ---------------------------------------------------------------------------
# STRIPE CONFIGURATION
#
# All Stripe settings, read once from environment variables. Everything that
# talks to Stripe imports from here — ONE place that knows the secret key, the
# webhook secret, and the redirect base URL. Same pattern as email_config.py.
#
# Set in backend/.env (gitignored). The keys are SECRETS — never commit them,
# never put them in docker-compose.yml (which is in git). Even the TEST key is
# treated like a credential out of habit; the LIVE key is guarded strictly.
# ---------------------------------------------------------------------------

# The Stripe SECRET key. Authenticates every server-side Stripe call. Test mode
# keys start with "sk_test_"; live keys "sk_live_". We develop with the test key
# (fake cards, no real money); go-live swaps it for the live key — no code change.
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")

# The webhook signing secret ("whsec_..."). Stripe signs every webhook it sends;
# we verify that signature so a forged request can't fake a "payment succeeded"
# event and mark an invoice paid. This comes from a DIFFERENT place than the API
# key (the Stripe CLI prints it when you start `stripe listen`, or the dashboard
# gives one per registered webhook endpoint). We'll wire this up in the webhook
# piece — it's here now so all Stripe config lives together. Empty until then.
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

# The public base URL of the FRONTEND, used to build the success/cancel redirect
# URLs Stripe sends the customer back to after checkout. Env-driven so it swaps
# cleanly across environments (tunnel URL now, app.radpw.com later). We already
# have FRONTEND_BASE_URL for email; reuse the same value here for consistency so
# there's one source of truth for "where the frontend lives."
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost")

# Is Stripe configured? If there's no secret key, we're in a half-configured
# state (e.g. before the key is added). The payment service checks this and
# reports a clean error instead of making a doomed API call — same graceful
# degradation as EMAIL_ENABLED. Lets you wire the flow before the key is live.
STRIPE_ENABLED = bool(STRIPE_SECRET_KEY)