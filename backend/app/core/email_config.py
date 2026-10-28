import os 

# ---------------------------------------------------------------------------
# EMAIL CONFIGURATION
#
# All email-related settings, read once from environment variables. Everything
# that sends mail imports from here, so there's exactly ONE place that knows
# what the from-address is, what the API key is, etc. Mirrors how the app
# treats DATABASE_URL — config comes from the environment, never hardcoded,
# so the same code runs unchanged across localhost / tunnel / real server.
#
# These are set in docker-compose (the backend service's `environment:` block).
# The API key is a SECRET — it must live in an env var / gitignored file,
# never committed. (Your .gitignore already ignores .env / *.env.)
# ---------------------------------------------------------------------------

# The Resend API key. This authenticates every send. Without it, Resend rejects
# the request. Kept out of source control — set it in the environment only.
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")

# The address customers see in the "From" field. Must be on a domain you've
# verified with Resend (radpw.com), or Resend refuses to send. We picked
# actionrequired@radpw.com.
MAIL_FROM = os.getenv("MAIL_FROM", "actionrequired@radpw.com")

# A human-friendly name shown alongside the from-address in most mail clients,
# e.g. "Rad Power Washing <actionrequired@radpw.com>". Purely cosmetic.
MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "Rad Power Washing")

# Where customer REPLIES go. The from-address (actionrequired@) is a send-only
# mailbox nobody watches; when a customer hits "reply", it should reach a real
# inbox Zach reads. That's his Google Workspace address, zachr@radpw.com.
MAIL_REPLY_TO = os.getenv("MAIL_REPLY_TO", "zachr@radpw.com")

# The public base URL of the FRONTEND, used to build customer-facing links in
# emails (e.g. the "View Estimate" button -> {base}/estimate/{token}).
# Env-driven so it swaps cleanly: the trycloudflare URL now, app.radpw.com later,
# with NO code change. No trailing slash (we add the path ourselves).
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost")

# Convenience flag: is email actually configured? If there's no API key, we're
# in a half-configured state (e.g. before the domain verifies). The email
# service checks this and reports a clean failure instead of making a doomed
# API call. This is what lets you TEST the send flow before Resend is live —
# the invoice still "sends", email just reports "failed", per the design.
EMAIL_ENABLED = bool(RESEND_API_KEY)