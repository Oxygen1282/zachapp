import { useState } from "react";
import { apiFetch } from "../auth/apiFetch";

// -------------------------------------------------------------------------
//   INLINE TAX-LOCATION MANAGER (expands inside an invoice/estimate popup)
// -------------------------------------------------------------------------

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

export default TaxManager;