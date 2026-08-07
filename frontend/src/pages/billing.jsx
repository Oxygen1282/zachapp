import { useState, useEffect } from "react";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { isOwner } from "../auth/permissions";

import SearchFilter from "../components/SearchFilter";
import TaxManager from "../components/TaxManager";
import CatalogManager from "../components/CatalogManager";
import LineItemEditor from "../components/LineItemEditor";

const API_URL = "http://localhost:8000";

const cellStyle = {
    border: "1px solid black",
    padding: "8px",
};

const EMPTY_LINE = {
    name: "",
    description: "",
    unit_price: "",
    quantity: "",
};

// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                              BILLINGS PAGE
//
// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function Billing() {
    const { permissions } = useAuth();

    if (!isOwner(permissions)) {
        return <div style={{ padding: "20px" }}>You don't have access to this page.</div>
    }

    const [invoices, setInvoices] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [clients, setClients] = useState([]);
    const [taxLocations, setTaxLocations] = useState([]);

    const [catalog, setCatalog] = useState([]);
    const [showCatalog, setShowCatalog] = useState(false);

    const [showPopup, setShowPopup] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    // Current search filter: which column, and the (lowercased) search text.
    const [filter, setFilter] = useState({ column: "client", text: "" });

    const filterColumns = [
        { value: "client", label: "Client" },
        { value: "invoice_number", label: "Invoice #" },
        { value: "title", label: "Title" },
    ];

    const [actionError, setActionError] = useState("");

    const [editData, setEditData] = useState({
        job_id: "",
        invoice_title: "",
        disclaimer: "",
        due_type: "on_completion",
        due_days: null,
        tax_location_id: "",
        items: [],
    });

    useEffect(() => {
        loadData();
    }, []);

    // ------ API helpers ------

    async function loadData() {
        try {
            const [invRes, jobRes, clientsRes, taxRes, catalogRes] = await Promise.all([
                apiFetch(`/invoices/`),
                apiFetch(`/jobs/`),
                apiFetch(`/clients/`),
                apiFetch(`/tax_locations/`),
                apiFetch(`/items/`),
            ]);

            setInvoices(await invRes.json());
            setJobs(await jobRes.json());
            setClients(await clientsRes.json());
            setTaxLocations(await taxRes.json());
            setCatalog(await catalogRes.json());
        } catch (error) {
            console.error("Failed to load billing data:", error);
        }
    }

    async function createInvoiceInDatabase(payload) {
        const response = await apiFetch(`/invoices/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return await response.json();
    }

    async function sendInvoiceInDatabase(id) {
        const response = await apiFetch(`/invoices/${id}/send`, {
            method: "POST",
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to send invoice");
        }
        return await response.json();
    }

    async function markPaidInDatabase(id) {
        const response = await apiFetch(`/invoices/${id}/paid`, {
            method: "POST",
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed ot mark paid");
        }
        return await response.json();
    }

    async function voidInvoiceInDatabase(id) {
        const response = await apiFetch(`/invoices/${id}/void`, {
            method: "POST",
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to void invoice");
        }
        return await response.json();
    }

    async function updateInvoiceInDatabase(id, payload) {
        const response = await apiFetch(`/invoices/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return await response.json();
    }

    async function deleteInvoiceFromDatabase(id) {
        await apiFetch(`/invoices/${id}`, {
            method: "DELETE",
        });
    }

    // --------- Helpers -----------

    // Look up client name via a job (invoice -> job -> client).
    const clientsById = {};
    clients.forEach((c) => { clientsById[c.id] = c; });

    const jobsById = {};
    jobs.forEach((j) => { jobsById[j.id] = j; });

    function clientNameForInvoice(invoice) {
        const job = jobsById[invoice.job_id];
        if (!job) return "—";
        return clientsById[job.client_id]?.name ?? "—";
    }

    function money(value) {
        if (value === undefined || value === null) return "—";
        return `$${Number(value).toFixed(2)}`;
    }

    const filteredInvoices = invoices.filter((inv) => {
        if (filter.text === "") return true;

        let value = "";

        if (filter.column === "client") value = clientNameForInvoice(inv) ?? "";
        else if (filter.column === "invoice_number") value = inv.invoice_number ?? "";
        else if (filter.column === "title") value = inv.invoice_title ?? "";
        return String(value).toLowerCase().includes(filter.text);
    });

    // ------ Handlers ---------

    function createInvoice() {
        setActionError("");
        setSelectedInvoice({ id: null, status: "Draft" });
        setEditData({
            job_id: "",
            invoice_title: "",
            disclaimer: "",
            due_type: "on_completion",
            due_days: null,
            tax_location_id: "",
            items: [],
        });
        setShowPopup(true);
    }

    function handleInvoiceClick(invoice) {
        setActionError("");
        setSelectedInvoice(invoice);
        setEditData({
            job_id: String(invoice.job_id),
            invoice_title: invoice.invoice_title ?? "",
            disclaimer: invoice.disclaimer ?? "",
            due_type: invoice.due_type,
            due_days: invoice.due_days,
            tax_location_id: invoice.tax_location_id ? String(invoice.tax_location_id) : "",
            items: invoice.items.map((it) => ({
                name: it.name,
                description: it.description ?? "",
                unit_price: it.unit_price,
                quantity: it.quantity,
            })),
        });
        setShowPopup(true);
    }

    // The due-terms default-to-30 behavior
    function handleDueTypeChange(value) {
        setEditData({
            ...editData,
            due_type: value,
            due_days: value === "days" ? (editData.due_days || 30) : null,
        });
    }

    async function handleSend() {
        setActionError("");
        try {
            await sendInvoiceInDatabase(selectedInvoice.id);
            await loadData();
            setShowPopup(false);
        } catch (error) {
            setActionError(error.message);
        }
    }

    async function handleMarkPaid() {
        setActionError("");
        try {
            await markPaidInDatabase(selectedInvoice.id);
            await loadData();
            setShowPopup(false);
        } catch (error) {
            setActionError(error.message)
        }
    }

    async function handleVoid() {
        setActionError("");
        try {
            await voidInvoiceInDatabase(selectedInvoice.id);
            await loadData();
            setShowPopup(false);
        } catch (error) {
            setActionError(error.message);
        }
    }

    async function viewPdf(id) {
        try {
            const response = await apiFetch(`/invoices/${id}/pdf`);
            if (!response.ok) throw new Error("Could not load PDF");
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank");
            // Optional: revoke after a delay to free memory
            setTimeout(() => URL.revokeObjectURL(url), 60000);
        } catch (err) {
            console.error("Failed to open PDF:", err)
        }
    }

    // A draft is editable; sent/paid invoices are read-only (enforced in Pass 2's
    // UI, but we guard Save here too).
    const isDraft = selectedInvoice?.status ==="Draft" || selectedInvoice?.id === null;

    const canSave = editData.job_id !== "" && editData.items.length > 0;

    // True if the popup's current edits differ from what's saved in the DB.
    // A brand-new invoice (no id) is always considered "unsaved".
    function computeUnsavedChanges() {
        // New invoice that hasn't been created yet -> nothing saved to match.
        if (!selectedInvoice?.id) return true;

        // Compare each editable field against the saved invoice, normalizing
        // types (editData holds strings; the saved invoice holds numbers/null).
        if (String(selectedInvoice.job_id) !== editData.job_id) return true;
        if ((selectedInvoice.invoice_title ?? "") !== editData.invoice_title) return true;
        if ((selectedInvoice.disclaimer ?? "") !== editData.disclaimer) return true;
        if (selectedInvoice.due_type !== editData.due_type) return true;
        if ((selectedInvoice.due_days ?? null) !== (editData.due_days ?? null)) return true;

        const savedTax = selectedInvoice.tax_location_id ? String(selectedInvoice.tax_location_id) : "";
        if (savedTax !== editData.tax_location_id) return true;

        // Line items: compare count, then each line's fields in order.
        if (selectedInvoice.items.length !== editData.items.length) return true;
        for (let i = 0; i < editData.items.length; i++) {
            const saved = selectedInvoice.items[i];
            const current = editData.items[i];
            if (saved.name !== current.name) return true;
            if ((saved.description ?? "") !== (current.description ?? "")) return true;
            if (Number(saved.unit_price) !== Number(current.unit_price)) return true;
            if (Number(saved.quantity) !== Number(current.quantity)) return true;
        }

        return false;
    }

    const hasUnsavedChanges = computeUnsavedChanges();

    async function saveChanges() {
        setActionError("");

        const payload = {
            job_id: Number(editData.job_id),
            invoice_title: editData.invoice_title || null,
            disclaimer: editData.disclaimer || null,
            due_type: editData.due_type,
            due_days: editData.due_type === "days" ? Number(editData.due_days) : null,
            items: editData.items,
        };

        // Only inclued tax if one is selected.
        if (editData.tax_location_id !== "") {
            payload.tax_location_id = Number(editData.tax_location_id);
        }

        try {
            let saved;
            if (selectedInvoice.id) {
                saved = await updateInvoiceInDatabase(selectedInvoice.id, payload);
            } else {
                saved = await createInvoiceInDatabase(payload);
            }

            // Update selectedInvoice to the freshly-saved version so the dirty
            // check compares against current data (Send becomes enabled, and
            // Save becomes disabled until the next edit).
            setSelectedInvoice(saved);

            // Re-sync editData from the saved invoice, normalized the same way
            // handleInvoiceClick does, so the comparison matches exactly.
            setEditData({
                job_id: String(saved.job_id),
                invoice_title: saved.invoice_title ?? "",
                disclaimer: saved.disclaimer ?? "",
                due_type: saved.due_type,
                due_days: saved.due_days,
                tax_location_id: saved.tax_location_id ? String(saved.tax_location_id) : "",
                items: saved.items.map((it) => ({
                    name: it.name,
                    description: it.description ?? "",
                    unit_price: it.unit_price,
                    quantity: it.quantity,
                })),
            });

            await loadData();   // refresh the table behind the popup
        } catch (error) {
            setActionError(error.message ?? "Failed to save invoice");
        }
    }

    async function deleteInvoice() {
        try {
            if (selectedInvoice.id) {
                await deleteInvoiceFromDatabase(selectedInvoice.id);
            }
            await loadData();
            setShowPopup(false);
            setSelectedInvoice(null);
        } catch (error) {
            console.error("Failed to delete invoice", error);
        }
    }

    // Live subtotal/tax/total preview (server recomputes authoritatively on save).
    const subtotal = editData.items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const selectedTax = taxLocations.find((t) => String(t.id) === editData.tax_location_id);
    const taxAmount = selectedTax ? subtotal * (selectedTax.percentage / 100) : 0;
    const total = subtotal + taxAmount;

    return (
        <div style={{ padding : "20px" }}>

            <button onClick={createInvoice}>New Invoice</button>
            <button onClick={() => setShowCatalog(true)} style={{ marginLeft: "10px" }}>Edit Catalog</button>

            <br /><br />

            <h1>Billing</h1>

            <SearchFilter columns={filterColumns} onChange={setFilter} />

            <table 
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "20px"
                }}
            >
                <thead>
                    <tr>
                        <th style={cellStyle}>Invoice #</th>
                        <th style={cellStyle}>Client</th>
                        <th style={cellStyle}>Title</th>
                        <th style={cellStyle}>Total</th>
                        <th style={cellStyle}>Status</th>
                        <th style={cellStyle}>PDF</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredInvoices.map((inv) => (
                        <tr
                            key={inv.id}
                            onClick={() => handleInvoiceClick(inv)}
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f0f0f0"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ""}
                        >
                            <td style={cellStyle}>{inv.invoice_number ?? "—"}</td>
                            <td style={cellStyle}>{clientNameForInvoice(inv)}</td>
                            <td style={cellStyle}>{inv.invoice_title}</td>
                            <td style={cellStyle}>{money(inv.total)}</td>
                            <td style={cellStyle}>{inv.status}</td>
                            <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                                {inv.pdf_path ? (
                                    <button onClick={() => viewPdf(inv.id)}>View</button>
                                ) : "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {showPopup && (
                <div 
                    style={{
                        position: "fixed",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        backgroundColor: "rgba(0,0,0,.5)",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                    }}
                >
                    <div 
                        style={{
                            backgroundColor: "white",
                            padding: "20px", 
                            borderRadius: "10px",
                            width: "600px",
                            maxHeight: "90vh",
                            overflowY: "auto",
                        }}
                    >
                        <h2>{selectedInvoice?.id ? `Invoice ${selectedInvoice.invoice_number ?? "(Draft)"}` : "New Invoice"}</h2>

                        {!isDraft && (
                            <div 
                                style={{
                                    color: "#a00",
                                    marginBottom: "10px"
                                }}
                            >
                                This invoice has been sent and is read-only. 
                            </div>
                        )}

                        <label>Job</label>
                        <select
                            value={editData.job_id}
                            onChange={(e) => setEditData({ ...editData, job_id: e.target.value })}
                            disabled={!isDraft}
                        >
                            <option value="">-- Select a Job --</option>
                            {jobs.map((j) => (
                                <option key={j.id} value={j.id}>
                                    {clientsById[j.client_id]?.name ?? "?"} — {j.address}
                                </option>
                            ))}
                        </select>

                        <br /><br />

                        <label>Invoice Title</label>
                        <input
                            value={editData.invoice_title}
                            onChange={(e) => setEditData({ ...editData, invoice_title: e.target.value })}
                            disabled={!isDraft}
                        />

                        <br /><br />

                        <label>Due Terms</label>
                        <select 
                            value={editData.due_type}
                            onChange={(e) => handleDueTypeChange(e.target.value)}
                            disabled={!isDraft}
                        >
                            <option value="on_completion">On Completion</option>
                            <option value="days">Specific number of days</option>
                        </select>

                        {editData.due_type === "days" && (
                            <>
                                <br /><br />
                                <label>Due in (days)</label>
                                <input 
                                    type="number"
                                    value={editData.due_days ?? ""}
                                    onChange={(e) => setEditData({ ...editData, due_days: Number(e.target.value) })}
                                    disabled={!isDraft}
                                />
                            </>
                        )}

                        <br /><br />

                        <label>Tax Locations</label>
                        <select 
                            value={editData.tax_location_id}
                            onChange={(e) => setEditData({ ... editData, tax_location_id: e.target.value })}
                            disabled={!isDraft}
                        >
                            <option value="">-- No Tax --</option>
                            {taxLocations.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.name} ({t.percentage}%)
                                </option>
                            ))}
                        </select>

                        {/* Inline tax management — only while editing a draft */}
                        {isDraft && (
                            <TaxManager
                                taxLocations={taxLocations}
                                onChanged={loadData}
                                selectedTaxId={editData.tax_location_id}
                                onSelectedDeleted={() => setEditData({ ...editData, tax_location_id: "" })}
                            />  
                        )}

                        <br /><br />

                        {isDraft ? (
                            <LineItemEditor
                                items={editData.items}
                                catalog={catalog}
                                onChange={(updated) => setEditData({ ...editData, items: updated })}
                            />
                        ) : (
                            <div 
                                style={{
                                    border: "1px solid #ccc",
                                    borderRadius: "6px",
                                    padding: "12px",
                                    marginBottom: "12px",
                                }}
                            >
                                <strong>Line Items</strong>
                                {editData.items.map((it, i) => (
                                    <div key={i}>{it.name} — {it.quantity} × ${Number(it.unit_price).toFixed(2)}</div>
                                ))}
                            </div>
                        )}

                        <label>Disclaimer</label>

                        <textarea
                            value={editData.disclaimer}
                            onChange={(e) => setEditData({ ...editData, disclaimer: e.target.value })}
                            disabled={!isDraft}
                            style={{
                                width: "100%",
                                minHeight: "60px",
                            }}
                        />

                        <div 
                            style={{
                                marginTop: "12px",
                                marginBottom: "12px",
                            }}
                        >
                            <div>Subtotal: {money(subtotal)}</div>
                            {selectedTax && <div>Tax ({selectedTax.name} {selectedTax.percentage}%): {money(taxAmount)}</div>}
                            <strong>Total: {money(total)}</strong>
                        </div>

                        {actionError && (
                            <div 
                                style={{
                                    color: "red",
                                    marginBottom: "10px",
                                }}
                            >
                                {actionError}
                            </div>
                        )}

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: "10px",
                            }}
                        >

                            <div 
                                style={{
                                    display: "flex",
                                    gap: "10px",
                                }}
                            >
                                {/* Draft: Save + Send */}
                                {isDraft && (
                                    <>
                                        <button 
                                            onClick={saveChanges}
                                            disabled={!canSave || !hasUnsavedChanges}
                                        >
                                            Save
                                        </button>

                                        {selectedInvoice?.id && (
                                            <button onClick={handleSend}
                                            disabled={!canSave || hasUnsavedChanges}>
                                                Send
                                            </button>
                                        )}
                                    </>
                                )}
                                
                                {/* Inform User they must Save before sending */}
                                {isDraft && selectedInvoice?.id && hasUnsavedChanges && (
                                    <div 
                                        style={{
                                            color: "#a00",
                                            fontSize: "0.85em",
                                            marginBottom: "6px",
                                        }}
                                    >
                                        You have unsaved changes — save before sending.
                                    </div>
                                )}

                                {/* Sent: Mark Paid */}
                                {selectedInvoice?.status === "Sent" && (
                                    <>
                                        <button onClick={handleMarkPaid}>Mark Paid</button>
                                        <button onClick={handleVoid}>Void</button>
                                    </>
                                )}

                                {/* Sent or Paid: view the PDF */}
                                {(selectedInvoice?.status === "Sent" || selectedInvoice?.status === "Paid" || selectedInvoice?.status === "Void") && (
                                    <button onClick={() => viewPdf(selectedInvoice.id)}>View PDF</button>
                                )}

                                <button onClick={() => setShowPopup(false)}>Close</button>
                            </div>

                            {/* Delete: drafts only */}
                            {selectedInvoice?.id && isDraft && (
                                <button onClick={deleteInvoice}>Delete</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showCatalog && (
                <CatalogManager
                    catalog={catalog}
                    onChanged={loadData}
                    onClose={() => setShowCatalog(false)}
                />
            )}

        </div>
    );
}

export default Billing;