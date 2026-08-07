import { useState } from "react";
import { apiFetch } from "../auth/apiFetch";

// -------------------------------------------------------------------------
//        CATALOG MANAGER: EDIT/ADD/DELETE CATALOG ITEMS
// -------------------------------------------------------------------------

function CatalogManager({ catalog, onChanged, onClose }) {

    // null = not editing; "new" = adding; a number = editing that item's id.
    const [editingId, setEditingId] = useState(null);
    const [draftName, setDraftName] = useState("");
    const [draftDescription, setDraftDescription] = useState("");
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
            console.error("Failed to delete item", err);
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
                            style={{ width: "100%"}}
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

export default CatalogManager;