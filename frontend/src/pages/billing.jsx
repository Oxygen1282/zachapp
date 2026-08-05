import { useState, useEffect } from "react";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { isOwner } from "../auth/permissions";

import SearchFilter from "../components/SearchFilter";

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

const NEW_ITEM = "__new__";

// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                                  LINE-ITEM EDITOR (MODELED ON AddressEditor): A LIST OF OBJECTS
//
// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function LineItemEditor({ items, catalog, onChange }) {
    
    // Which catalog item is selected in the dropdown: "" (none), a catalog id,
    // or NEW_ITEM. Kept as a string because <select> values are strings.
    const [selectedCatalogId, setSelectedCatalogId] = useState("");

    // Fields for the line being built.
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [quantity, setQuantity] = useState("");

    // Are we entering a brand-new catalog item (vs. picking an existing one)?
    const isNew = selectedCatalogId === NEW_ITEM;

    // When the dropdown changes, fill name/description from the chosen catalog
    // item (locked), or clear them for a new item.
    function handleSelect(value) {
        setSelectedCatalogId(value)

        if (value === "" || value === NEW_ITEM) {
            setName("");
            setDescription("");
        } else {
            const item = catalog.find((c) => String(c.id) === value);
            if (item) {
                setName(item.name);
                setDescription(item.description ?? "");
            }
        }
        // Price/quantity always reset on a fresh selection.
        setUnitPrice("");
        setQuantity("");
    }

    // ----------- Validation -------------
    const priceNum = Number(unitPrice);
    const qtyNum = Number(quantity);

    const priceValid = unitPrice !== "" && !isNaN(priceNum) && priceNum >= 0;
    const qtyValid = quantity !== "" && !isNaN(qtyNum) && qtyNum > 0;
    const nameValid = name.trim() !== "";

    // For a NEW item, block a name that already exists in the catalog.
    const nameCollision = isNew && catalog.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    const canAdd = selectedCatalogId !== "" && nameValid && priceValid && qtyValid && !nameCollision;

    function handleAdd() {
        onChange([
            ...items,
            {
                name: name,
                description: description,
                unit_price: priceNum,
                quantity: qtyNum,
            },
        ]);
        // Reset for the next line
        setSelectedCatalogId("");
        setName("");
        setDescription("");
        setUnitPrice("");
        setQuantity("");
    }

    function handleRemoveLine(index) {
        onChange(items.filter((_, i) => i !== index));
    }

    const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);

    return (
        <div 
            style={{
                border: "1px solid #ccc",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "12px"
            }}
        >
            
            <strong>Line Items</strong> (subtotal: ${subtotal.toFixed(2)})

            <br /><br />

            {/* Lines already added to this invoice */}
            {items.length === 0 && (
                <div 
                    style={{
                        color: "#888",
                        marginBottom: "10px"
                    }}
                >
                    No line items yet.
                </div>
            )}

            {items.map((it, index) => (
                <div 
                    key={index}
                    style={{
                        display: "flex", 
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                        gap: "10px",
                    }}
                >
                    <div>
                        <strong>{it.name}</strong> — {it.quantity} × ${Number(it.unit_price).toFixed(2)} = ${(it.unit_price * it.quantity).toFixed(2)}
                        <div 
                            style={{
                                fontSize: "0.85em",
                                color: "#555",
                            }}
                        >
                            {it.description}
                        </div>
                    </div>
                    <button onClick={() => handleRemoveLine(index)}>Remove</button>
                </div>
            ))}

            <hr />

            {/* Catalog picker */}
            <label>Item</label>
            <select value={selectedCatalogId} onChange={(e) => handleSelect(e.target.value)}>
                <option value="">-- Select an Item --</option>
                {catalog.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value={NEW_ITEM}>+ New Item</option>
            </select>

            {selectedCatalogId !== "" && (
                <div style={{ marginTop: "10px" }}>

                    {/* Name: editable only for a new item */}
                    <label>Name</label>
                    <input 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!isNew}
                    />

                    {nameCollision && (
                        <div 
                            style={{
                                color: "red",
                                marginTop: "4px",
                            }}
                        >
                            An item with that name already exists
                        </div>
                    )}

                    <br /><br />

                    {/* Description: full text, editable only for a new item */}
                    <label>Description</label>
                    {isNew ? (
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            style={{
                                width: "100%",
                                minHeight: "80px"
                            }}
                        />
                    ) : (
                        // Existing Item: show the WHOLE description, read-only, fully readable.
                        <div 
                            style={{
                                border: "1px solid #ddd",
                                borderRadius: "4px",
                                padding: "8px",
                                background: "#fafafa",
                                fontSize: "0.9em",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {description}
                        </div>
                    )}

                    <br />

                    <label>Unit Price</label>
                    <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />

                    <label>Quantity</label>
                    <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />

                    <br /><br />

                    <button onClick={handleAdd} disabled={!canAdd}>Add Line</button>
                
                </div>
            )}

        </div>
    );
}

// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                                      CATALOG MANAGER: EDIT/ADD/DELETE CATALOG ITEMS
//
// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function CatalogManager({ catalog, onChanged, onClose }) {

    // null = not editing; "new" = adding; a number = editing that item's id.
    const [editingId, setEditingId] = useState(null);
    const [draftName, setDraftName] = useState("");
    const[draftDescription, setDraftDescription] = useState("");
    const [error, setError] = useState("");

    function startNew() {
        setEditingId("new");
        setDraftName("");
        setDraftDescription("");
        setError("");
    }

    function startEdit(item) {
        setEditingId(item.id);
        setDraftName(item.name);
        setDraftDescription(item.description ?? "");
        setError("");
    }

    function cancel() {
        setEditingId(null);
        setError("");
    }

    async function saveDraft() {
        setError("");
        const payload = { name: draftName, description: draftDescription };

        try {
            let response;
            if (editingId === "new") {
                response = await apiFetch(`/items/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                response = await apiFetch(`/items/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to save item");
            }
            await onChanged();  // reload the catalog in the parent
            setEditingId(null);
        } catch (err) {
            setError(err.message);
        }
    }

    async function deleteItem(id) {
        try {
            await apiFetch(`/items/${id}`, {
                method: "DELETE",
            });
            await onChanged();
        } catch (err) {
            console.error("Falied to delete item", err);
        }
    }

    return (
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
                zIndex: 10000,
            }}
        >
            <div 
                style={{
                    backgroundColor: "white",
                    padding: "20px",
                    borderRadius: "10px",
                    width: "700px",
                    maxHeight: "90vh",
                    overflowY: "auto",
                }}
            >

                <h2>Catalog Items</h2>

                <button onClick={startNew}>Add New Item</button>

                <hr />

                {/* Edit / add form */}
                {editingId !== null && (
                    <div 
                        style={{ 
                            border: "1px solid #ccc",
                            borderRadius: "6px",
                            padding: "12px",
                            marginBottom: "16px",
                        }}
                    >
                        <label>Name</label>
                        <input 
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            style={{ width: "100% "}}
                        />

                        <br /><br />

                        <label>Description</label>
                        <textarea
                            value={draftDescription}
                            onChange={(e) => setDraftDescription(e.target.value)}
                            style={{
                                width: "100%",
                                minHeight: "100px"
                            }}
                        />

                        {error && <div style={{ color: "red", marginTop: "6px" }}>{error}</div>}

                        <br /><br />

                        <button onClick={saveDraft} disabled={draftName.trim() === ""}>Save</button>
                        <button onClick={cancel} style={{ marginLeft: "10px" }}>Cancel</button>
                    </div>
                )}

                {/* Full list, full descriptions */}
                {catalog.map((item) => (
                    <div 
                        key={item.id}
                        style={{
                            borderBottom: "1px solid #eee",
                            padding: "10px 0",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                        }}
                    >
                        <div>
                            <strong>{item.name}</strong>
                            <div 
                                style={{
                                    fontSize: "0.9em",
                                    color: "#555",
                                    whiteSpace: "pre-wrap"
                                }}
                            >
                                {item.description}
                            </div>
                        </div>
                        <div 
                            style={{
                                display: "flex", 
                                gap: "6px",
                                flexShrink: 0,
                                alignItems: "flex-start",
                            }}
                        >
                            <button onClick={() => startEdit(item)}>Edit</button>
                            <button onClick={() => deleteItem(item.id)}>Delete</button>
                        </div>
                    </div>
                ))}

                <hr />

                <button onClick={onClose}>Close</button>

            </div>
        </div>
    );
}

// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                              INLINE TAX-LOCATION MANAGER (EXPANDS INSIDE THE INVOICE POPUP)
//
// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function TaxManager({ taxLocations, onChanged, selectedTaxId, onSelectedDeleted }) {

    const [expanded, setExpanded] = useState(false);

    // null = not editing; "new" = adding; a number = editing that id
    const [editingId, setEditingId] = useState(null);
    const [draftName, setDraftName] = useState("");
    const [draftPercentage, setDraftPercentage] = useState("");
    const [error, setError] = useState("");

    function startNew() {
        setEditingId("new");
        setDraftName("");
        setDraftPercentage("");
        setError("");
    }

    function startEdit(loc) {
        setEditingId(loc.id);
        setDraftName(loc.name);
        setDraftPercentage(loc.percentage);
        setError("");
    }

    function cancel() {
        setEditingId(null);
        setError("");
    }

    // Percentage must be a valid non-negative number (matches backend Field(ge=0)).
    const pctNum = Number(draftPercentage);
    const canSave =
        draftName.trim() !== "" &&
        draftPercentage !== "" && !isNaN(pctNum) && pctNum >= 0;

    async function saveDraft() {
        setError("");
        const payload = { name: draftName, percentage: pctNum };

        try {
            let response;
            if (editingId === "new") {
                response = await apiFetch(`/tax_locations/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                response = await apiFetch(`/tax_locations/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to save tax location");
            }

            await onChanged();
            setEditingId(null);
        } catch (err) {
            setError(err.message);
        }
    }

    async function deleteLocation(id) {
        try {
            await apiFetch(`/tax_locations/${id}`, {
                method: "DELETE",
            });

            // If the invoice currently has this tax selected, clear it — the
            // selection just became invalid.
            if (String(id) === selectedTaxId) {
                onSelectedDeleted();
            }

            await onChanged();
        } catch (err) {
            console.error("Failed to delete tax location:", err);
        }
    }

    return (
        <div style={{ marginTop: "6px" }}>

            <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                style={{ fontSize: "0.85em" }}
            >
                {expanded ? "Hide Tax Management" : "Manage Tax Locations"}
            </button>

            {expanded && (
                <div 
                    style={{
                        border: "1px solid #ccc",
                        borderRadius: "6px",
                        padding: "12px",
                        marginTop: "8px",
                    }}
                >
                    <button onClick={startNew}>Add New</button>

                    {editingId !== null && (
                        <div 
                            style={{
                                marginTop: "10px",
                                borderBottom: "1px solid #eee",
                                paddingBottom: "10px",
                            }}
                        >
                            <label>County Name</label>
                            <input 
                                value={draftName}
                                onChange={(e) => setDraftName(e.target.value)}
                            />

                            <br /><br />

                            <label>Tax %</label>
                            <input
                                type="number"
                                value={draftPercentage}
                                onChange={(e) => setDraftPercentage(e.target.value)}
                            />

                            {error && <div style={{ color: "red", marginTop: "6px" }}>{error}</div>}

                            <br /><br />

                            <button onClick={saveDraft} disabled={!canSave}>Save</button>
                            <button onClick={cancel} style={{ marginLeft: "8px" }}>Cancel</button>
                        </div>
                    )}

                    <div style={{ marginTop: "10px" }}>
                        {taxLocations.length === 0 && (
                            <div style={{ color: "#888" }}>No tax locations yet.</div>
                        )}
                        {taxLocations.map((loc) => (
                            <div 
                                key={loc.id}
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "6px",
                                }}
                            >
                                <span>{loc.name} ({loc.percentage}%)</span>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: "6px",
                                    }}
                                >
                                    <button onClick={() => startEdit(loc)}>Edit</button>
                                    <button onClick={() => deleteLocation(loc.id)}>Delete</button>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>
            )}

        </div>
    );
}

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
        if (value === undefined || value === null) {
             return "—";
        }
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
                                    <a 
                                        href={`${API_URL}/invoices/${inv.id}/pdf`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View
                                    </a>
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
                                    <a
                                        href={`${API_URL}/invoices/${selectedInvoice.id}/pdf`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        <button>View PDF</button>
                                    </a>
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