import os 
from datetime import timedelta 

from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML 

from models.invoice import Invoice 

# Where the template + logo live, and where finished PDFs get written.
TEMPLATE_DIR = "/app/app/templates"
OUTPUT_DIR = "/app/invoice_files"   # the mounted volume 

# Jinja environment, pointed at the templates folder. Created once at import
# and reused — loading the environment per-call would be wasteful.
_jinja_env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))

# Turn a client name + invoice number into a safe filename, e.g.
# "Dan Surrell" + "2026013" -> "dan_surrell_2026013.pdf". Lowercased, spaces
# to underscores, and stripped of anything that isn't alphanumeric/underscore
# so the OS never chokes on odd characters in a client's name.
def _build_filename(client_name: str, invoice_number: str) -> str:
    safe_name = "".join(
        c if c.isalnum() else "_"
        for c in client_name.lower()
    ).strip("_")
    return f"{safe_name}_{invoice_number}.pdf"

# Build the flat dict of values the template expects, out of the invoice and
# its related objects. This is the ONE place that decides how each field is
# presented (dates formatted, due date computed, is_paid derived).
def _build_context(invoice: Invoice, client_name: str, job_address: str) -> dict:

    # Due date display: "On Completion", or issued + due_days as a date.
    if invoice.due_type == "days" and invoice.due_days is not None and invoice.date_issued:
        due_date = invoice.date_issued + timedelta(days=invoice.due_days)
        due_display = due_date.strftime("%b %d, %Y")
    else: due_display = "On Completion"

    issued_display = invoice.date_issued.strftime("%b %d, %Y") if invoice.date_issued else ""

    paid_display = invoice.date_paid.strftime("%b %d, %Y") if invoice.date_paid else ""

    # Which watermark (if any) to stamp: green PAID, red VOID, or none.
    if invoice.status == "Paid":
        watermark = "paid"
    elif invoice.status == "Void":
        watermark = "void"
    else: 
        watermark = ""

    return {
        "client_name": client_name,
        "job_address": job_address,

        "invoice_number": invoice.invoice_number,
        "invoice_title": invoice.invoice_title,
        "issued_date": issued_display,
        "due_display": due_display,
        "paid_date": paid_display,

        "items": invoice.items,     # the template loops over these

        "subtotal": invoice.subtotal,
        "tax_name": invoice.tax_name,
        "tax_percentage": invoice.tax_percentage,
        "tax_amount": invoice.tax_amount,
        "total": invoice.total,

        "disclaimer": invoice.disclaimer,

        "watermark": watermark,
    }

# Render an invoice to a PDF on disk. Returns the file path to store in
# invoice.pdf_path. Called at send (is_paid False) and again at mark-paid
# (is_paid True) — same function, the status in the invoice decides the stamp.
def generate_invoice_pdf(invoice: Invoice, client_name: str, job_address: str) -> str:

    # 1. Fill the template with this invoice's data.
    template = _jinja_env.get_template("invoice.html")
    html_string = template.render(_build_context(invoice, client_name, job_address))

    # 2. Make sure the output directory exists (the volume is mounted, but the
    #    folder may not exist on a fresh volume).
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # 3. build the destination path.
    filename = _build_filename(client_name, invoice.invoice_number)
    output_path = os.path.join(OUTPUT_DIR, filename)

    # 4. Render HTML -> PDF. base_url is the KEY line for the logo: it tells
    #    WeasyPrint where relative paths (like "logo.png" in the template)
    #    resolve from — the templates folder, where logo.png lives.
    HTML(string=html_string, base_url=TEMPLATE_DIR).write_pdf(output_path)

    # 5. Hand back the path so the caller can store it on the invoice
    return output_path