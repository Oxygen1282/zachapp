import { useState, useEffect } from "react";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { canManageContent } from "../auth/permissions";

const cellStyle = {
    border: "1px solid black",
    padding: "8px",
};

const EMPTY_ADDRESS = {
    street: "",
    street_line2: "",
    city: "", 
    state: "", 
    zip: "",
};

// ---------- Reusable editor for a client's list of structured addresses ----------
// Unlike DictEditor (which edits a dict of name -> number), this edits a LIST of
// address OBJECTS, each with 5 fields. It stages changes locally and calls
// onChange with the new array; the parent commits everything on its own Save.

function AddressEditor({ addresses, onChange }) {

    // The addresss currently in the form
    const [draft, setDraft] = useState(EMPTY_ADDRESS);

    // null  -> the form is adding a NEW address
    // number -> the form is editing the address at that index
    const [editingIndex, setEditingIndex] = useState(null);

    // Required fields must be filled; street_line2 is optional.
    const isValid = 
    draft.street.trim() !== "" &&
    draft.city.trim() !== "" &&
    draft.state.trim() !== "" &&
    draft.zip.trim() !== "";

    function updateField(field, value) {
        setDraft({ ... draft, [field]: value });
    }

    function resetForm() {
        setDraft(EMPTY_ADDRESS);
        setEditingIndex(null);
    }

    // Append the draft as a new address.
    function handleAdd () {
        onChange([...addresses, draft]);
        resetForm();
    }

    // Load an existing address into the form to edit it.
    function handleEdit(index) {
        setDraft({ ...addresses[index] });
        setEditingIndex(index);
    }

    // Write the draft back over the address at editingIndex.
    function handleSave() {
        const updated = addresses.map((addr, i) =>
            i === editingIndex ? draft: addr
        );  
        onChange(updated);
        resetForm();
    }

    // Remove an address by index. Always reset the form afterward so the
    // editingIndex can't point at a shifted or deleted entry.
    function handleDelete(index) {
        const updated = addresses.filter((_, i) => i !== index);
        onChange(updated);
        resetForm();
    }

     // Compose the structured fields into one line for display (skips empty line 2).
     function composeAddress(addr) {
        const parts = [addr.street];
        if (addr.street_line2) {
            parts.push(addr.street_line2);
        }
        parts.push(`${addr.city}, ${addr.state}, ${addr.zip}`);
        return parts.join(", ");
     }

     return (
        <div style={{
            border: "1px solid #ccc", 
            borderRadius: "6px", 
            padding: "12px",
            marginBottom: "12px"
        }}>

            <strong>Addresses</strong>

            <br /><br />

            {/* Existing addresses, each with edit/delete */}
            {addresses.length === 0 && (
                <div style={{
                    color: "#888",
                    marginBottom: "10px"
                }}>
                    No addresses yet.
                </div>
            )}

            {addresses.map((addr, index) => (
                <div 
                    key={index}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "6px",
                    }}
                >
                    <span>{composeAddress(addr)}</span>
                    <div style={{
                        display: "flex",
                        gap: "6px",
                    }}>
                        <button onClick={() => handleEdit(index)}>Edit</button>
                        <button onClick={() => handleDelete(index)}>Delete</button>
                    </div>
                </div>
            ))}

            <hr />

            {/* The form for adding or editing on address */}
            <label>Street</label>
            <input 
                value={draft.street}
                onChange={(e) =>
                    updateField("street", e.target.value)
                }
            />

            <br /><br />

            <label>Street Line 2 (Optional)</label>
            <input 
                value={draft.street_line2}
                onChange={(e) =>
                    updateField("street_line2", e.target.value)
                }
            />

            <br /><br />

            <label>City</label>
            <input 
                value={draft.city}
                onChange={(e) =>
                    updateField("city", e.target.value)
                }
            />

            <br /><br />

            <label>State</label>
            <input 
                value={draft.state}
                onChange={(e) =>
                    updateField("state", e.target.value)
                }
            />

            <br /><br />

            <label>Zip</label>
            <input 
                value={draft.zip}
                onChange={(e) =>
                    updateField("zip", e.target.value)
                }
            />

            <br /><br />
            
            {editingIndex === null ? (
                <button onClick={handleAdd} disabled={!isValid}>
                    Add Address
                </button>
            ) : (
                <div style={{
                    display: "flex",
                    gap: "10px", 
                }}>
                    <button onClick={handleSave} disabled={!isValid}>
                        Save Address
                    </button>
                    <button onClick={resetForm}>
                        Cancel
                    </button>
                </div>
            )}

        </div>
     );
}

// ------------------------------- Clients Page -------------------------------------

function Clients() {
    const { permissions } = useAuth();
    const canEdit = canManageContent(permissions);

    const [clients, setClients] = useState([]);

    const [showPopup, setShowPopup] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const [deleteError, setDeleteError] = useState("");

    const [editData, setEditData] = useState({
        name: "",
        phone: "",
        email: "",
        addresses: [],
    });

    useEffect(() => {
        loadClients();
    }, []);

    // --------- API Helpers -------------

    async function loadClients() {
        try {
            const response = await apiFetch(`/clients/`);
            const data = await response.json();
            setClients(data);
        } catch (error) {
            console.error("Failed to load clients:", error);
        }
    }

    async function createClientInDatabase(clientData) {
        const response = await apiFetch(`/clients`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clientData),
        });
        return await response.json();
    }

    async function updateClientInDatabase(id, clientData) {
        const response = await apiFetch(`/clients/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(clientData),
        });
        return await response.json();
    }

    async function deleteClientFromDatabase(id) {
        const response = await apiFetch(`/clients/${id}`, {
            method: "DELETE",
        });

        // Surface the backend's guard message (e.g. "client still has jobs")
        // instead of silently failing.
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to delete client");
        }
    }

    // --------- Handlers --------------

    // open the popup with a blank client for creation.
    function createClient() {
        setSelectedClient({ id: null });
        setEditData({
            name: "",
            phone: "",
            email: "",
            addresses: []
        });
        setShowPopup(true);
        setDeleteError("");
    }

    // Open the popup with an existing client's data. Normalize nullable fields
    // to "" so the inputs stay controlled, and strip the address ids (the
    // backend rebuilds addresses from scratch, so it doesn't want them back).
    function handleClientClick(client) {
        setSelectedClient(client);
        setEditData({
            name: client.name,
            phone: client.phone ?? "",
            email: client.email ?? "",
            addresses: client.addresses.map((a) => ({
                street: a.street,
                street_line2: a.street_line2 ?? "",
                city: a.city,
                state: a.state,
                zip: a.zip,
            })),
        });
        setDeleteError("");
        setShowPopup(true);
    }

    // Backend requires a name; phone/email/addresses are optional.
    const canSave = editData.name.trim() !== "";

    async function saveChanges() {
        const clientData = {
            name: editData.name,
            phone: editData.phone,
            email: editData.email,
            addresses: editData.addresses,
        };

        try {
            if (selectedClient.id) {
                await updateClientInDatabase(selectedClient.id, clientData);
            } else {
                await createClientInDatabase(clientData);
            }

            await loadClients();
            setShowPopup(false);
        } catch (error) {
            console.error("Failed to save client", error);
        }
    }

    async function deleteClient() {
        setDeleteError("");
        try {
            if (selectedClient.id) {
                await deleteClientFromDatabase(selectedClient.id);
            }

            await loadClients();
            setShowPopup(false);
            setSelectedClient(null);
        } catch (error) {
            // Show the gaurd message in the popup rather than closing it
            setDeleteError(error.message);
        }
    }

    return (
        <div style={{ padding: "20px" }}>

            {canEdit && (
                <button onClick={createClient}>
                    New Client
                </button>
            )}

            <br /><br />

            <h1>Clients</h1>

            <table style={{
                width: "100%",
                borderCollapse: "collapse",
                marginTop: "20px",
            }}>

                <thead>
                    <tr>
                        <th style={cellStyle}>Name</th>
                        <th style={cellStyle}>Phone</th>
                        <th style={cellStyle}>Email</th>
                        <th style={cellStyle}>Addresses</th>
                    </tr>
                </thead>

                <tbody>
                    {clients.map((client) => (
                        <tr
                            key={client.id}
                            onClick={() => handleClientClick(client)}
                            style={{ cursor: "pointer" }}
                            onMouseEnter={(e) =>
                                e.currentTarget.style.backgroundColor = "#f0f0f0"
                            }
                            onMouseLeave={(e) =>
                                e.currentTarget.style.backgroundColor = ""
                            }
                        >
                            <td style={cellStyle}>{client.name}</td>
                            <td style={cellStyle}>{client.phone}</td>
                            <td style={cellStyle}>{client.email}</td>
                            <td style={cellStyle}>{client.addresses.length}</td>
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
                            width: "500px",
                            maxHeight: "90vh",
                            overflowY: "auto",
                        }}
                    >

                        <h2>{selectedClient?.id ? "Edit Client" : "New Client"}</h2>

                        {!canEdit && (
                            <div
                                style={{
                                    color: "#777",
                                    marginBottom: "10px",
                                    fontStyle: "italic"
                                }}
                            >
                                View Only 
                            </div>
                        )}

                        <label>Name</label>
                        <input 
                            value={editData.name}
                            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                            disabled={!canEdit}
                        />

                        <br /><br />

                        <label>Phone</label>
                        <input 
                            value={editData.phone}
                            onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                            disabled={!canEdit}
                        />

                        <br /><br />

                        <label>Email</label>
                        <input 
                            value={editData.email}
                            onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                            disabled={!canEdit}
                        />

                        <br /><br />

                        {canEdit ? (
                            <AddressEditor
                                addresses={editData.addresses}
                                onChange={(updated) => setEditData({ ...editData, addresses: updated })}
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
                                <strong>Addresses</strong>
                                {editData.addresses.map((a, i) => (
                                    <div key={i}>{a.street}{a.street_line2 ? `, ${a.street_line2}` : ""}, {a.city}, {a.state} {a.zip}</div>
                                ))}
                            </div>
                        )}
                        

                        {deleteError && (
                            <div
                                style={{
                                color: "red",
                                marginBottom: "10px"
                                }}
                            >
                                {deleteError}
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
                                {canEdit && (
                                    <button onClick={saveChanges} disabled={!canSave}>
                                        Save
                                    </button>
                                )}
                                
                                <button onClick={() => setShowPopup(false)}>
                                    Close
                                </button>
                            </div>

                            {canEdit && selectedClient?.id && (
                                <button onClick={deleteClient}>
                                    Delete
                                </button>
                            )}

                        </div>

                    </div>
                
                </div>

            )}

        </div>
    );
}

export default Clients;