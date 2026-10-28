import stripe 

from starlette.concurrency import run_in_threadpool

from fastapi import HTTPException

from core.stripe_config import STRIPE_SECRET_KEY, STRIPE_ENABLED, FRONTEND_BASE_URL, STRIPE_WEBHOOK_SECRET

# ---------------------------------------------------------------------------
# STRIPE CLIENT SETUP
#
# The Stripe SDK is configured globally by setting stripe.api_key once. We do it
# here, at import time, from our config. Every Stripe call in this module then
# uses that key. This is the ONLY module that imports `stripe` directly — the
# rest of the app calls functions here and stays ignorant of Stripe internals.
#
# NOTE: the Stripe Python SDK is SYNCHRONOUS. This app is async, so when we add
# the actual checkout/webhook calls, they'll be run in a threadpool (via
# starlette's run_in_threadpool / asyncio.to_thread) so a blocking network call
# doesn't stall the event loop. Piece 1 makes no calls yet — just sets the key.
# ---------------------------------------------------------------------------

# Set the API key on the SDK. If it's empty (STRIPE_ENABLED is False), calls
# would fail — but the service functions will guard on STRIPE_ENABLED before
# making any call, so an unconfigured state reports cleanly rather than crashing.
stripe.api_key = STRIPE_SECRET_KEY

# A tiny helper the rest of the code can use to check configuration state,
# mirroring how the email side does it. (Re-exported for convenience.)
def is_stripe_configured() -> bool:
    return STRIPE_ENABLED

# ---------------------------------------------------------------------------
# Create a Stripe Checkout Session for an invoice.
#
# Turns an invoice into a hosted Stripe payment page and returns its URL. The
# caller (send flow / a "get pay link" endpoint) puts that URL in the invoice
# email's "Pay Now" button. Stripe hosts the actual card page — we never touch
# card data.
#
# CRITICAL DETAILS:
#  - We charge invoice.total EXACTLY (the frozen, tax-included number). Stripe
#    works in integer CENTS, so we convert dollars -> cents with careful
#    rounding. We do NOT re-sum line items (would risk mismatching the total).
#  - invoice_id is stashed in session metadata so the webhook (Piece 4) can map
#    the payment back to THIS invoice and mark it paid. This is the link between
#    "customer paid" and "which invoice."
#  - The Stripe SDK is SYNCHRONOUS; we run it in a threadpool so it doesn't
#    block the async event loop.
#
# Params:
#   invoice     – the invoice to be paid (must have a frozen total + number)
#   description – the line text shown on Stripe's page (e.g. "Invoice #... — Rad Power Washing")
#
# Returns the hosted checkout URL (a string) for the customer to pay at.
# ---------------------------------------------------------------------------
async def create_checkout_session(invoice, description: str) -> str:

    # Guard: if Stripe isn't configured, fail clearly rather than making a
    # doomed call. (Mirrors the email EMAIL_ENABLED guard.)
    if not STRIPE_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Payments are not configured.",
        )

    # Convert the dollar total to integer CENTS. round() before int() so e.g.
    # 19.99 -> 1999 exactly, not 1998 from float truncation. This is the amount
    # Stripe will charge — it must equal the invoice total to the penny.
    amount_cents = int(round(float(invoice.total) * 100))

    # Sanity guard: never create a session for a zero/negative amount (Stripe
    # rejects it, and it'd be a logic error — a $0 invoice shouldn't be "paid").
    if amount_cents <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invoice total must be greater than zero to collect payment.",
        )

    # Where Stripe sends the customer AFTER checkout. {CHECKOUT_SESSION_ID} is a
    # placeholder Stripe fills in — it lets the success page confirm which
    # session completed. These point at the frontend (env-driven base URL).
    # NOTE: the success page is a nicety; it is NOT how we mark the invoice paid.
    # The WEBHOOK (Piece 4) is the authoritative "paid" signal — never trust the
    # redirect alone (customer can close the tab / hit the URL without paying).
    success_url = f"{FRONTEND_BASE_URL}/pay/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{FRONTEND_BASE_URL}/pay/cancel"

    # Build + create the session. Wrapped so ANY Stripe error becomes a clean
    # HTTPException instead of leaking an SDK exception to the caller.
    try:
        session = await run_in_threadpool(
            lambda: stripe.checkout.Session.create(
                mode="payment",                     # one-time payment (not subscription)
                success_url=success_url,
                cancel_url=cancel_url,
                # Single summary line item for the whole invoice total. We pass
                # price_data inline (no pre-made Stripe Price object needed).
                line_items=[
                    {
                        "quantity": 1,
                        "price_data": {
                            "currency": "usd",
                            "unit_amount": amount_cents,        # the exact total in cents 
                            "product_data": {
                                "name": description,            # e.g. "Invoice #2026014 - Rad Power Washing"
                            },
                        },
                    }
                ],
                # THE LINK to fulfillment: the webhook reads invoice_id back from
                # here to know which invoice this payment settles. Metadata values
                # must be strings.
                metadata={
                    "invoice_id": str(invoice.id), 
                    "invoice_number": str(invoice.invoice_number or ""),
                },
            )
        )
    except Exception as exc:
        # Don't leak raw Stripe errors; surface a clean failure. (Unlike email,
        # a failed checkout-session creation SHOULD be reported to the caller —
        # there's no payment link to give the customer, so the owner needs to know.)
        raise HTTPException(
            status_code=502,
            detail=f"Could not create payment session: {exc}",
        )

    # The hosted checkout URL the customer pays at.
    return session.url 

# ---------------------------------------------------------------------------
# Verify + parse a Stripe webhook.
#
# Takes the RAW request body (exact bytes) and the Stripe-Signature header.
# Verifies the signature against our webhook secret so a forged request can't
# fake a payment. Returns the parsed event on success; raises on bad signature.
#
# This runs synchronously (Stripe SDK); the caller wraps it in a threadpool.
# ---------------------------------------------------------------------------
def verify_webhook(payload: bytes, sig_header: str):
    if not STRIPE_WEBHOOK_SECRET:
        # No secret configured -> we can't verify -> refuse. Better to reject
        # every webhook than to accept unverified ones (which could be forged).
        raise HTTPException(
            status_code=503, detail="Webhook secret not configured"
        )

    try:
        # construct_event does the signature check AND parses the JSON. If the
        # signature is invalid, it raises — which we turn into a 400 so Stripe
        # knows to treat it as rejected.
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except Exception as exc:
        # Bad signature, malformed payload, etc. Reject.
        raise HTTPException(
            status_code=400,
            detail=f"Webhook verification failed: {exc}",
        )

    return event