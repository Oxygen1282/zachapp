from core.email_config import FRONTEND_BASE_URL

# ---------------------------------------------------------------------------
# EMAIL TEMPLATE BUILDERS
#
# These build the HTML BODY strings for customer emails. They own the wording
# and layout of what the customer sees; the email service owns delivery. Keeping
# them here means "change what the estimate email says" is a one-file edit,
# separate from send logic and from the Resend plumbing.
#
# Design note: this is intentionally simple inline-styled HTML. Email clients
# (Gmail, Outlook) are notoriously bad at CSS — no external stylesheets, limited
# selectors — so email HTML uses inline styles and basic tags. Don't refactor
# this into a stylesheet; it won't render in mail clients.
# ---------------------------------------------------------------------------


# Build the estimate email body.
#
# Params:
#   client_name    – who we're greeting ("Hi Dan,")
#   estimate_number – the frozen estimate number, for the subject/reference
#   public_token   – the estimate's permanent token; becomes the View button link
#
# The "View Estimate" button points at the customer estimate page:
#   {FRONTEND_BASE_URL}/estimate/{public_token}
# FRONTEND_BASE_URL is env-driven (tunnel URL now, app.radpw.com later), so the
# link is always correct for the current environment with no code change.
def build_estimate_email(client_name: str, job_type: str, estimate_number: str | None, public_token: str) -> str:

    # The full customer-facing link. This is the SAME route the app already
    # serves for the public estimate view (/estimate/:token in the frontend
    # router) — the email just gives the customer a button to reach it.
    view_url = f"{FRONTEND_BASE_URL}/estimate/{public_token}"

    # A readable reference for the body. estimate_number can technically be None,
    # but by the time we email, send_estimate has assigned one — still, guard it
    # so the text never says "Estimate #None".
    reference = f"Estimate #{estimate_number[4:]}" if estimate_number else "your estimate"

    # Inline-styled HTML. The button is an <a> styled to look like a button,
    # because real <button> elements don't work in email. Colors kept simple.
    return f"""
    <div
        style="
            font-family: Arial, sans-serif;
            color: #222;
            max-width: 600px;
        "
        <p>Hi {client_name},</p>

        <p>Your estimate from {job_type} is ready to view. Click the
        button below to review the details, approve it, or request changes. 
        Dont hesitate to call 330-419-6860, reply, or email zachr@radpw.com
        with questions.</p>

        <p style="margin: 28px 0;">
            <a href="{view_url}"
                style="
                    background-color: #2563eb;
                    color: #ffffff;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    display: inline-block;
                    font-weight: bold;
                "
            >
                View {reference}
            </a>
        </p>

        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #555;">{view_url}</p>
        
        <p>Sincerely,<br>{job_type}</p>
    </div>
    """

# Build the invoice email body.
#
# Unlike the estimate email, this has NO "view" button yet — the customer
# invoice page doesn't exist (it's the future payment page). The invoice PDF is
# ATTACHED to the email instead, so the customer receives the actual document.
# When the payment page lands, a "Pay Now" button gets added here pointing at
# {FRONTEND_BASE_URL}/pay/{token} (or similar), alongside the attachment.
#
# Params:
#   client_name    – who we're greeting
#   invoice_number – the frozen invoice number, for the body reference
def build_invoice_email(client_name: str, invoice_number: str | None, job_type: str, public_token: str) -> str:

    reference = f"Invoice #{invoice_number}" if invoice_number else "your invoice"

    # Stable pay link -> Caddy -> backend mints a fresh Stripe session -> redirect.
    # Never expires (a new session is created on each click).
    pay_url = f"{FRONTEND_BASE_URL}/api/public/invoices/{public_token}/pay"

    return f"""
    <div 
        style="
            font-family: Arial, sans-serif;
            color: #222;
            max-width: 600px;
        "
    >
        <p>Hi {client_name},</p>

        <p>Please find {reference} from {job_type} attached to this email
        as a PDF. It includes the full details of the work and amount due.</p>

        <p style="margin: 28px 0;">
            <a href="{pay_url}"
                style="
                    background-color: #16a34a;
                    color: #ffffff;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    display: inline-block;
                    font-weight: bold;
                "
            >
                Pay {reference} Online
            </a>
        </p>

        <p>If you have any questions about this invoice, or you would like to pay another way; 
        just reply to this email and we'll be happy to help.</p>

        <p>Thank you for your business,<br>{job_type}</p>
    </div>
    """