import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { isOwner } from "../auth/permissions";

import SearchFilter from "../components/SearchFilter";
import TaxManager from "../components/TaxManager";
import CatalogManager from "../components/CatalogManager";
import LineItemEditor from "../components/LineItemEditor";
import PasswordInput from "../components/PasswordInput";


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
//                              ESTIMATES PAGE
//
// -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function Estimates() {
    const { permissions } = useAuth();

    if (!isOwner(permissions)) {
        return <div style={{ padding: "20px" }}>You don't have access to this page.</div>
    }

    const [searchParams, setSearchParams] = useSearchParams();

    const navigate = useNavigate();

    const [estimates, setEstimates] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [clients, setClients] = useState([]);
    const [taxLocations, setTaxLocations] = useState([]);

    const [catalog, setCatalog] = useState([]);
    const [showCatalog, setShowCatalog] = useState(false);

    const [showPopup, setShowPopup] = useState(false);
    const [selectedEstimate, setselectedEstimate] = useState(null);

    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState("");

    // Current search filter: which column, and the (lowercased) search text.
    const [showArchived, setShowArchived] = useState(false);
    const [filter, setFilter] = useState({ column: "client", text: "" });

    const filterColumns = [
        { value: "client", label: "Client" },
        { value: "estimate_number", label: "Estimate #" },
        { value: "title", label: "Title" },
    ];

    const [actionError, setActionError] = useState("");

    const [editData, setEditData] = useState({
        client_id: "",
        job_id: "",
        client_address_id: "",
        estimate_title: "",
        job_type: "Rad Power Washing",
        disclaimer: "",
        tax_location_id: "",
        items: [],
    });

    useEffect(() => {
        loadData();
    }, []);

    // Handle arrival from the jobs table.
    useEffect(() => {
        // "Create Estimate" from a job → open New Estimate prefilled with the job.
        const newJobId = searchParams.get("newJobId");
        if (newJobId && jobs.length > 0 && clients.length > 0) {
            openNewEstimateForJob(Number(newJobId));
            setSearchParams({});
            return;
        }

        // Estimate dropdown → open that estimate's popup.
        const openEstimate = searchParams.get("openEstimate");
        if (openEstimate && estimates.length > 0) {
            const est = estimates.find((e) => e.id === Number(openEstimate));
            if (est) {
                handleEstimateClick(est);
                setSearchParams({});
            }
            return;
        }
    }, [jobs, clients, estimates, searchParams]);

    // ------ API helpers ------

    async function loadData() {
        try {
            const [estRes, jobRes, clientsRes, taxRes, catalogRes] = await Promise.all([
                apiFetch(`/estimates/`),
                apiFetch(`/jobs/`),
                apiFetch(`/clients/`),
                apiFetch(`/tax_locations/`),
                apiFetch(`/items/`),
            ]);

            setEstimates(await estRes.json());
            setJobs(await jobRes.json());
            setClients(await clientsRes.json());
            setTaxLocations(await taxRes.json());
            setCatalog(await catalogRes.json());
        } catch (error) {
            console.error("Failed to load estimates data:", error);
        }
    }

    async function createEstimateInDatabase(payload) {
        const response = await apiFetch(`/estimates/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to crete estimate");
        }
        return await response.json();
    }

    async function sendEstimateInDatabase(id) {
        const response = await apiFetch(`/estimates/${id}/send`, {
            method: "POST",
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to send estimate");
        }
        return await response.json();
    }

    async function toggleArchiveInDatabase(id) {
        const response = await apiFetch(`/estimates/${id}/toggle-archive`, {
            method: "POST",
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to archive estimate");
        }
        return await response.json();
    }

    async function updateEstimateInDatabase(id, payload) {
        const response = await apiFetch(`/estimates/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to update estimate");
        }
        return await response.json();
    }

    async function deleteEstimateInDatabase(id, password) {
        const response = await apiFetch(`/estimates/${id}/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password })
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to delete estimate");
        }
        return await response.json();
    }

    // --------- Helpers -----------

    // Look up client name via a job (estimate -> job -> client).
    const clientsById = {};
    clients.forEach((c) => { clientsById[c.id] = c; });

    const jobsById = {};
    jobs.forEach((j) => { jobsById[j.id] = j; });

    // Estimates have client_id directly — no job hop needed.
    function clientNameForEstimate(estimate) {
        return clientsById[estimate.client_id]?.name ?? "—";
    }

    function money(value) {
        if (value === undefined || value === null) return "—";
        return `$${Number(value).toFixed(2)}`;
    }

    // Show just the 3-digit sequence (drop the year prefix).
    function displayEstimateNumber(fullNumber) {
        if (!fullNumber) return "—"
        return fullNumber.slice(4);
    }

    const filteredEstimates = estimates.filter((est) => {
        // Archive filter: by default hide archived; toggle to show only archived.
        if (showArchived) {
            if (!est.is_archived) return false;     // showing archived: hide active
        } else {
            if (est.is_archived) return false;      // default: hide archived
        }

        if (filter.text === "") return true;

        let value = "";

        if (filter.column === "client") value = clientNameForEstimate(est) ?? "";
        else if (filter.column === "estimate_number") value = est.estimate_number ?? "";
        else if (filter.column === "title") value = est.estimate_title ?? "";
        return String(value).toLowerCase().includes(filter.text);
    });

    // ------ Handlers ---------

    function createEstimate() {
        setActionError("");
        setselectedEstimate({ id: null, status: "Draft" });
        setEditData({
            client_id: "",
            job_id: "",
            client_address_id: "",
            estimate_title: "",
            job_type: "Rad Power Washing",
            disclaimer: "",
            tax_location_id: "",
            items: [],
        });
        setShowPopup(true);
    }

    function handleEstimateClick(estimate) {
        setActionError("");
        setselectedEstimate(estimate);
        setEditData({
            client_id: String(estimate.client_id),
            job_id: estimate.job_id ? String(estimate.job_id) : "",
            client_address_id: "",      // not re-selected on edit (address already frozen)
            estimate_title: estimate.estimate_title ?? "",
            job_type: estimate.job_type ?? "Rad Power Washing",
            disclaimer: estimate.disclaimer ?? "",
            tax_location_id: estimate.tax_location_id ? String(estimate.tax_location_id) : "",
            items: estimate.items.map((it) => ({
                name: it.name,
                description: it.description ?? "",
                unit_price: it.unit_price,
                quantity: it.quantity,
            })),
        });
        setShowPopup(true);
    }

    // Changing the client resets the dependent job/address picks.
    function handleClientChange(clientId) {
        setEditData({
            ...editData,
            client_id: clientId,
            job_id: "",
            client_address_id: "",
        });
    }

    // Picking a job (Flow 2) clears any address pick — the job supplies the address.
    function handleJobChange(jobId) {
        setEditData({
            ...editData,
            job_id: jobId,
            client_address_id: "",
        });
    }

    // Picking an address (Flow 1) clears any job pick — this estimate is job-less.
    function handleAddressChange(addressId) {
        setEditData({
            ...editData,
            client_address_id: addressId,
            job_id: "",
        });
    }

    // This client's jobs (for the Flow-2 job dropdown).
    const clientJobs = jobs.filter(
        (j) => String(j.client_id) === editData.client_id
    );

    // This client's addresses (for the Flow-1 address dropdown).
    const selectedClient = clientsById[Number(editData.client_id)];
    const clientAddresses = selectedClient?.addresses ?? [];

    // Editable when Draft or Awaiting Changes (owner revises after a change request).
    const isEditable = 
        selectedEstimate?.status ==="Draft" ||
        selectedEstimate?.status === "Awaiting Changes" ||
        selectedEstimate?.id === null;

    // New estimate: need client, items, AND an address source (job or address).
    // Existing estimate: address already frozen, so just client + items.
    const hasAddressSource = editData.job_id !== "" || editData.client_address_id !== "";

    const canSave =
        editData.client_id !== "" &&
        editData.items.length > 0 &&
        (selectedEstimate?.id ? true : hasAddressSource);

    async function handleSend() {
        setActionError("");
        try {
            await sendEstimateInDatabase(selectedEstimate.id);
            await loadData();
            setShowPopup(false);
        } catch (error) {
            setActionError(error.message);
        }
    }

    async function handleArchive() {
        setActionError("");
        try {
            await toggleArchiveInDatabase(selectedEstimate.id);
            await loadData();
            setShowPopup(false);
        } catch (error) {
            setActionError(error.message);
        }
    }

    // Called by the Delete button. Drafts delete immediately; others prompt.
    async function handleDeleteClick() {
        if (selectedEstimate?.status === "Draft") {
            // No password needed — delete straight away.
            await doDelete("");
        } else {
            // Non-draft: open the password prompt.
            setDeletePassword("");
            setDeleteError("");
            setShowDeleteConfirm(true);
        }
    }

    async function doDelete(password) {
        setDeleteError("");
        try {
            await deleteEstimateInDatabase(selectedEstimate.id, password);
            await loadData();
            setShowDeleteConfirm(false);
            setShowPopup(false);
            setselectedEstimate(null);
        } catch (error) {
            setDeleteError(error.message);
        }
    }

    // Open New Estimate prefilled from a job (Flow 2). The job's client is set,
    // and the job is selected (so its address is used).
    function openNewEstimateForJob(jobId) {
        const job = jobs.find((j) => j.id === jobId);
        if (!job) return;

        setActionError("");
        setselectedEstimate({ id: null, status: "Draft" });
        setEditData({
            client_id: String(job.client_id),
            job_id: String(job.id),     // Flow 2: job is set
            client_address_id: "",       // address comes from the job
            estimate_title: "",
            job_type: job.job_type,     // inherit from the job
            disclaimer: "",
            tax_location_id: "",
            items: [],
        });
        setShowPopup(true);
    }

    async function viewPdf(id) {
        try {
            const response = await apiFetch(`/estimates/${id}/pdf`);
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

    // True if the popup's current edits differ from what's saved in the DB.
    // A brand-new estimate (no id) is always considered "unsaved".
    function computeUnsavedChanges() {
        // New estimate that hasn't been created yet -> nothing saved to match.
        if (!selectedEstimate?.id) return true;

        // Compare each editable field against the saved estimate, normalizing
        // types (editData holds strings; the saved estimate holds numbers/null).
        if (String(selectedEstimate.client_id) !== editData.client_id) return true;
        if ((selectedEstimate.job_id ? String(selectedEstimate.job_id) : "") !== editData.job_id) return true;
        if ((selectedEstimate.estimate_title ?? "") !== editData.estimate_title) return true;
        if ((selectedEstimate.job_type ?? "") !== editData.job_type) return true;
        if ((selectedEstimate.disclaimer ?? "") !== editData.disclaimer) return true;


        const savedTax = selectedEstimate.tax_location_id ? String(selectedEstimate.tax_location_id) : "";
        if (savedTax !== editData.tax_location_id) return true;

        // Line items: compare count, then each line's fields in order.
        if (selectedEstimate.items.length !== editData.items.length) return true;
        for (let i = 0; i < editData.items.length; i++) {
            const saved = selectedEstimate.items[i];
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
            client_id: Number(editData.client_id),
            estimate_title: editData.estimate_title || null,
            job_type: editData.job_type,
            disclaimer: editData.disclaimer || null,
            items: editData.items,
        };

        // Job (Flow 2) - include only if picked.
        if (editData.job_id !== "") {
            payload.job_id = Number(editData.job_id);
        }
        // Client address (Flow 1) - include only if picked.
        if (editData.client_address_id !== "") {
            payload.client_address_id = Number(editData.client_address_id);
        }
        // Only inclued tax if one is selected.
        if (editData.tax_location_id !== "") {
            payload.tax_location_id = Number(editData.tax_location_id);
        }

        try {
            let saved;
            if (selectedEstimate.id) {
                saved = await updateEstimateInDatabase(selectedEstimate.id, payload);
            } else {
                saved = await createEstimateInDatabase(payload);
            }

            // Update selectedEstimate to the freshly-saved version so the dirty
            // check compares against current data (Send becomes enabled, and
            // Save becomes disabled until the next edit).
            setselectedEstimate(saved);

            // Re-sync editData from the saved estimate, normalized the same way
            // handleestimateClick does, so the comparison matches exactly.
            setEditData({
                client_id: String(saved.client_id),
                job_id: saved.job_id ? String(saved.job_id) : "",
                client_address_id: "",      // Frozen now, not re-selected
                estimate_title: saved.estimate_title ?? "",
                job_type: saved.job_type ?? "Rad Power Washing",
                disclaimer: saved.disclaimer ?? "",
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
            setActionError(error.message ?? "Failed to save estimate");
        }
    }

    // Live subtotal/tax/total preview (server recomputes authoritatively on save).
    const subtotal = editData.items.reduce((s, it) => s + it.unit_price * it.quantity, 0);
    const selectedTax = taxLocations.find((t) => String(t.id) === editData.tax_location_id);
    const taxAmount = selectedTax ? subtotal * (selectedTax.percentage / 100) : 0;
    const total = subtotal + taxAmount;

    // Footer stats.
    const approvedEstimates = estimates.filter((e) => e.status === "Approved");
    const approvedCount = approvedEstimates.length;

    const currentYear = String(new Date().getFullYear());
    const approvedThisYearTotal = approvedEstimates
        .filter((e) => e.estimate_number && e.estimate_number.startsWith(currentYear))
        .reduce((sum, e) => sum + e.total, 0);

    return (
        <div style={{ padding : "20px" }}>

            <button onClick={createEstimate}>New Estimate</button>
            <button onClick={() => setShowCatalog(true)} style={{ marginLeft: "10px" }}>Edit Catalog</button>
            <button onClick={() => setShowArchived(!showArchived)} style={{ marginLeft: "10px" }}>
                {showArchived ? "Show Active" : "Show Archived"}
            </button>

            <br /><br />

            <h1>Estimates</h1>

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
                        <th style={cellStyle}>Estimate #</th>
                        <th style={cellStyle}>Client</th>
                        <th style={cellStyle}>Title</th>
                        <th style={cellStyle}>Total</th>
                        <th style={cellStyle}>Status</th>
                        <th style={cellStyle}>Job</th>
                        <th style={cellStyle}>PDF</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredEstimates.map((est) => (
                        <tr
                            key={est.id}
                            onClick={() => handleEstimateClick(est)}
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f0f0f0"}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ""}
                        >
                            <td style={cellStyle}>{displayEstimateNumber(est.estimate_number)}</td>
                            <td style={cellStyle}>{clientNameForEstimate(est)}</td>
                            <td style={cellStyle}>{est.estimate_title}</td>
                            <td style={cellStyle}>{money(est.total)}</td>
                            <td style={cellStyle}>{est.status}</td>
                            <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                                {est.job_id ? (
                                    <button onClick={() => navigate(`/jobs?openJob=${est.job_id}`)}>
                                        Go to Job
                                    </button>
                                ) : (
                                    <button onClick={() => navigate(`/jobs?fromEstimate=${est.id}`)}>
                                        Convert to Job
                                    </button>
                                )}
                            </td>
                            <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                                {est.pdf_path ? (
                                    <button onClick={() => viewPdf(est.id)}>View</button>
                                ) : "—"}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ----- Footer stats ----- */}
            <div 
                style={{
                    marginTop: "24px",
                    paddingTop: "12px",
                    borderTop: "1px solid #ccc",
                    display: "flex",
                    gap: "32px"
                }}
            >
                <div>
                    <div style={{ fontSize: "0.85em", color: "#777" }}>Total Estimates</div>
                    <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>{estimates.length}</div>
                </div>
                <div>
                    <div style={{ fontSize: "0.85em", color: "#777" }}>Approved</div>
                    <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>{approvedCount}</div>
                </div>
                <div>
                    <div style={{ fontSize: "0.85em", color: "#777" }}>Approved $ This Year</div>
                    <div style={{ fontSize: "1.4em", fontWeight: "bold" }}>{money(approvedThisYearTotal)}</div>
                </div>
            </div>

            {showPopup && (
                <div style={overlayStyle}>
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
                        <h2>
                            {selectedEstimate?.id
                                ? `Estimate ${selectedEstimate.estimate_number ? displayEstimateNumber(selectedEstimate.estimate_number) : "(Draft)"}`
                                : "New Estimate"}
                        </h2>

                        {/* Read-only banner for sent/approved estimates */}
                        {!isEditable && (
                            <div 
                                style={{
                                    color: "#a00",
                                    marginBottom: "10px"
                                }}
                            >
                                This estimate has been sent and is read-only. 
                            </div>
                        )}

                        {/* Change request message — shown when the customer asked for changes */}
                        {selectedEstimate?.status === "Awaiting Changes" && selectedEstimate?.change_request && (
                            <div
                                style={{
                                    border: "1px solid #c80",
                                    background: "#fff8e6",
                                    borderRadius: "6px",
                                    padding: "10px",
                                    marginBottom: "12px"
                                }}
                            >
                                <strong>Customer Requested Changes:</strong>
                                <div 
                                    style={{
                                        whiteSpace: "pre-wrap",
                                        marginTop: "4px"
                                    }}
                                >
                                    {selectedEstimate.change_request}
                                </div>
                            </div>
                        )}

                        {/* Approval info — shown when approved */}
                        {selectedEstimate?.status === "Approved" && (
                            <div 
                                style={{
                                    border: "1px solid #4a8",
                                    background: "#eefaf0",
                                    borderRadius: "6px",
                                    padding: "10px",
                                    marginBottom: "12px"
                                }}
                            >
                                <strong>Approved</strong> — signed by {selectedEstimate.signature}
                                {selectedEstimate.signed_date && ` on ${new Date(selectedEstimate.signed_date).toLocaleDateString()}`}
                            </div>
                        )}

                        <label>Client</label>
                        <select 
                            value={editData.client_id}
                            onChange={(e) => handleClientChange(e.target.value)}
                            disabled={Boolean(selectedEstimate?.id)}
                        >
                            <option value="">-- Select a Client --</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>

                        <br /><br />

                        {/* Flow selection — only when creating (existing estimates have a frozen address) */}
                        {!selectedEstimate?.id && editData.client_id !== "" && (
                            <>
                                <div
                                    style={{
                                        color: "#777",
                                        fontSize: "0.9em",
                                        marginBottom: "6px",
                                    }}
                                >
                                    Pick an existing job, OR a client address for a new one.
                                </div>

                                <label>Job (existing)</label>
                                <select
                                    value={editData.job_id}
                                    onChange={(e) => handleJobChange(e.target.value)}
                                >
                                    <option value="">-- No Job (use an address) --</option>
                                    {clientJobs.map((j) => (
                                        <option key={j.id} value={j.id}>{j.address}</option>
                                    ))}
                                </select>

                                <br /><br />

                                <label>Or Address (new)</label>
                                <select
                                    value={editData.client_address_id}
                                    onChange={(e) => handleAddressChange(e.target.value)}
                                    disabled={editData.job_id !== ""}
                                >
                                    <option value="">-- Select an Address --</option>
                                    {clientAddresses.map((a) => (
                                        <option key={a.id} value={a.id}>
                                            {a.street}{a.street_line2 ? `, ${a.street_line2}` : ""}, {a.city}, {a.state} {a.zip}
                                        </option>
                                    ))}
                                </select>
                            </>
                        )}

                        {/* Existing estimate: show the frozen address as read-only text */}
                        {selectedEstimate?.id && (
                            <>
                                <label>Address</label>
                                <div style={{ marginBottom: "8px" }}>{selectedEstimate.address}</div>
                            </>
                        )}

                        <br /><br />

                        <label>Estimate Title</label>
                        <input
                            value={editData.estimate_title}
                            onChange={(e) => setEditData({ ...editData, estimate_title: e.target.value })}
                            disabled={!isEditable}
                        />

                        <br /><br />

                        <label>Job Type</label>
                        <select 
                            value={editData.job_type}
                            onChange={(e) => setEditData({ ...editData, job_type: e.target.value })}
                            disabled={
                                !isEditable ||
                                (!selectedEstimate?.id && Boolean(editData.job_id))
                            }
                        >
                            <option value="Rad Power Washing">Rad Power Washing</option>
                            <option value="Rad Renovations">Rad Renovations</option>
                        </select>

                        <br /><br />

                        <label>Tax Locations</label>
                        <select 
                            value={editData.tax_location_id}
                            onChange={(e) => setEditData({ ... editData, tax_location_id: e.target.value })}
                            disabled={!isEditable}
                        >
                            <option value="">-- No Tax --</option>
                            {taxLocations.map((t) => (
                                <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>
                            ))}
                        </select>

                        {/* Inline tax management — only while editing a draft */}
                        {isEditable && (
                            <TaxManager
                                taxLocations={taxLocations}
                                onChanged={loadData}
                                selectedTaxId={editData.tax_location_id}
                                onSelectedDeleted={() => setEditData({ ...editData, tax_location_id: "" })}
                            />  
                        )}

                        <br /><br />

                        {isEditable ? (
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
                            disabled={!isEditable}
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
                                    flexWrap: "wrap",
                                }}
                            >
                                {/* Editable (Draft or Awaiting Changes): Save + Send */}
                                {isEditable && (
                                    <>
                                        <button 
                                            onClick={saveChanges}
                                            disabled={!canSave || !hasUnsavedChanges}
                                        >
                                            Save
                                        </button>

                                        {selectedEstimate?.id && (
                                            <button onClick={handleSend}
                                                disabled={!canSave || hasUnsavedChanges}
                                            >
                                                {selectedEstimate?.status === "Awaiting Changes" ? "Re-Send" : "Send"}
                                            </button>
                                        )}
                                    </>
                                )}
                                
                                {/* Inform User they must Save before sending */}
                                {isEditable && selectedEstimate?.id && hasUnsavedChanges && (
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

                                {/* Sent/Approved/Awaiting Changes: View PDF + View as Customer */}
                                {selectedEstimate?.id && selectedEstimate?.estimate_number && (
                                    <>
                                        <button onClick={() => viewPdf(selectedEstimate.id)}>View PDF</button>
                                        <a 
                                            href={`/estimate/${selectedEstimate.public_token}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <button>View as Customer</button>
                                        </a>
                                    </>
                                )}

                                {/* Archive toggle — any saved estimate */}
                                {selectedEstimate?.id && (
                                    <button onClick={handleArchive}>
                                        {selectedEstimate?.is_archived ? "Un-Archive" : "Archive"}
                                    </button>
                                )}

                                <button onClick={() => setShowPopup(false)}>Close</button>
                            </div>

                            {/* Delete */}
                            {selectedEstimate?.id && (
                                <button onClick={handleDeleteClick}>Delete</button>
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

            {showDeleteConfirm && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <h3>Confirm Delete</h3>
                        <p>This estimate has been sent. Enter your password to delete it.</p>
                        <PasswordInput
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                            placeholder="Your Password"
                            onKeyDown={(e) => { if (e.key === "Enter" && deletePassword) doDelete(deletePassword); }}
                        />
                        {deleteError && <div style={{ color: "red", marginTop: "8px" }}>{deleteError}</div>}
                        <div 
                            style={{
                                display: "flex",
                                gap: "10px",
                                marginTop: "12px",
                            }}
                        >
                            <button onClick={() => doDelete(deletePassword)} disabled={deletePassword === ""}>
                                Delete
                            </button>
                            <button onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
};

const modalStyle = {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "10px",
    width: "400px",
};

export default Estimates;