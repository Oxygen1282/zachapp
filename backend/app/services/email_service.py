import httpx 

from dataclasses import dataclass 

from core.email_config import(
    RESEND_API_KEY,
    MAIL_FROM,
    MAIL_FROM_NAME,
    MAIL_REPLY_TO,
    EMAIL_ENABLED,
)

# Resend's send endpoint. One URL, POST JSON, get a result. That's the whole API
# surface we need. Documented at resend.com/docs.
RESEND_ENDPOINT = "https://api.resend.com/emails"

# ---------------------------------------------------------------------------
# The result of an attempted send.
#
# We return this instead of raising on failure. WHY: per the app's design, a
# failed email must NOT unwind the invoice/estimate send. So the service NEVER
# throws on a delivery problem — it hands back success=True/False and lets the
# caller decide what to do (set email_status, offer a resend). The caller never
# has to wrap us in try/except to protect its own transaction.
# ---------------------------------------------------------------------------
@dataclass
class EmailResult:
    success: bool 
    # A short human-readable reason when success is False (logged / surfaced to
    # the owner as "why didn't it send"). Empty on success.
    error: str = ""

# ---------------------------------------------------------------------------
# Send one email, optionally with a single PDF attachment.
#
# This is the ONLY function the rest of the app calls to send mail. Estimates
# and invoices build their subject/body/attachment and hand it here; they know
# nothing about Resend. Swap providers someday = rewrite THIS function only.
#
# Params:
#   to_email      – the recipient (the client's email)
#   subject       – email subject line
#   html_body     – the email body as HTML (we build these in template helpers)
#   attachment_bytes / attachment_filename – optional PDF to attach (invoices).
#                   Both must be provided together, or neither.
# ---------------------------------------------------------------------------
async def send_email(
    to_email: str,
    subject: str, 
    html_body: str,
    attachment_bytes: bytes | None = None,
    attachment_filename: str | None = None,
) -> EmailResult:

    # Guard 1: is email even configured? Before the Resend domain is verified /
    # the API key is set, EMAIL_ENABLED is False. Rather than fire a doomed
    # request, we short-circuit with a clear failure. THIS is what lets you test
    # the whole send flow today — the invoice sends, this returns success=False
    # with a clear reason, and email_status shows "failed". No crash.
    if not EMAIL_ENABLED:
        return EmailResult(success=False, error="Email is not configured (no API key).")

    # Build the JSON payload Resend expects. "from" combines the display name and
    # address into one RFC-style string: 'Name <addr@domain>'. reply_to routes
    # customer replies to Zach's real inbox, separate from the send-only "from".
    payload = {
        "from": f"{MAIL_FROM_NAME} <{MAIL_FROM}>",
        "to": [to_email],           # Resend wants a LIST even for one recipient
        "reply_to": MAIL_REPLY_TO,
        "subject": subject,
        "html": html_body,
    }

    # Attach a PDF if one was provided. Resend takes attachments as a list of
    # {filename, content} where content is the raw bytes base64-encoded. We only
    # ever send one (the invoice PDF), but the API shape is a list.
    if attachment_bytes is not None and attachment_filename is not None:
        import base64 
        payload["attachments"] = [
            {
                "filename": attachment_filename,
                # base64-encode the PDF bytes, then decode to a str so it's
                # JSON-serializable (JSON can't hold raw bytes).
                "content": base64.b64encode(attachment_bytes).decode("utf-8"),
            }
        ]

    # The API key goes in the Authorization header as a Bearer token.
    headers = {
        "Authorization": f"Bearer {RESEND_API_KEY}",
        "Content-Type": "application/json",
    }

    # Make the call with an ASYNC http client so we don't block the event loop
    # (the whole backend is async; a sync network call here would stall the
    # server for every other request during the send). Timeout guards against
    # the provider hanging — if Resend is slow/down, we fail fast rather than
    # freezing the request. ANY exception (network error, timeout) is caught and
    # turned into a failure result — we never let it propagate and unwind the
    # caller's invoice/estimate send.
    try: 
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(RESEND_ENDPOINT, json=payload, headers=headers)

        # Resend returns 2xx on success. Anything else = it rejected the send
        # (bad address, unverified domain, etc.). Capture the body as the reason.
        if response.status_code >= 200 and response.status_code < 300:
            return EmailResult(success=True)
        else:
            return EmailResult(
                success=False,
                error=f"Resend returned {response.status_code}: {response.text}",
            )

    except Exception as exc:
        # Network failure, timeout, DNS, anything. Never raises to the caller —
        # the invoice/estimate send stays intact; this is just reported.
        return EmailResult(success=False, error=f"Email send failed: {exc}")