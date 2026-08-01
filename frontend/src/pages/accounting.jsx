import { useState, useEffect } from "react";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { isOwner } from "../auth/permissions";

const NEW_MATERIAL = "__new_material__";

const cellStyle = {
    border: "1px solid black",
    padding: "8px",
};

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                                                  MATERIALS EDITOR: PICK FROM THE CATALOG + ENTER PER-JOB COST
//
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// entries is the materials_out dict (name -> cost). catalog is the list of
// saved material names. onCatalogChanged reloads the catalog after add/edit/delete.
function MaterialsEditor({ entries, catalog, onChange, onCatalogChanged }) {

    // Entry-adding state: which catalog material is picked, and its cost.
    const [selectedMaterialId, setSelectedMaterialId] = useState("");
    const [costInput, setCostInput] = useState("");

    // Inline catalog-manager state.
    const [managerOpen, setManagerOpen] = useState(false);
    const [editingId, setEditingId] = useState(null); 
    const [draftName, setDraftName] = useState("");
    const [managerError, setManagerError] = useState("");

    const entryNames = Object.keys(entries);

    // ----- Adding a material line to this job's finances -----

    const selectedMaterial = catalog.find((m) => String(m.id) === selectedMaterialId);
    const costNum = Number(costInput);
    const costValid = costInput !== "" && !isNaN(costNum) && costNum >= 0;

    // Block adding a material that's already on this job.
    const alreadyAdded = selectedMaterial && entryNames.includes(selectedMaterial.name);

    const canAdd = selectedMaterial && costValid && !alreadyAdded;

    // ------- Handlers ----------
    function handleAddEntry() {
        onChange({ ...entries, [selectedMaterial.name]: costNum });
        setSelectedMaterialId("");
        setCostInput("");
    }

    function handleRemoveEntry(name) {
        const updated = { ...entries };
        delete updated[name];
        onChange(updated);
    }

    // ------- Managing the catalog (add/edit/delete material names) ------------

    function startNew() {
        setEditingId("new")
        setDraftName("");
        setManagerError("");
    }

    function startEdit(material) {
        setEditingId(material.id);
        setDraftName(material.name);
        setManagerError("");
    }

    async function saveCatalog() {
        setManagerError("");
        const payload = { name: draftName };

        try {
            let response;
            if (editingId === "new") {
                response = await apiFetch(`/materials/`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                response = await apiFetch(`/materials/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to save material");
            }

            await onCatalogChanged();
            setEditingId(null);
        } catch (err) {
            setManagerError(err.message);
        }
    }

    async function deleteCatalog(id) {
        try {
            await apiFetch(`$/materials/${id}`, {
                method: "DELETE",
            });
            await onCatalogChanged();
        } catch (err) {
            console.error("Failed to delete material:", err);
        }
    }

    const materialsTotal = entryNames.reduce((sum, k) => sum + entries[k], 0);

    return (
        <div 
            style={{
                border: "1px solid #ccc",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "12px",
            }}
        >

            <strong>Materials</strong> (total: ${materialsTotal.toFixed(2)})

            <br/><br/>

            {/* Materials already on this job */}
            {entryNames.length === 0 && (
                <div
                    style={{
                        color: "#888", 
                        marginBottom: "8px",
                    }}
                >
                    No materials added 
                </div>
            )}
            {entryNames.map((name) => (
                <div 
                    key={name}
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "4px",
                    }}
                >
                    <span>{name}: ${Number(entries[name]).toFixed(2)}</span>
                    <button onClick={() => handleRemoveEntry(name)}>Remove</button>
                </div>
            ))}

            <hr />

            {/* Add a material: pick from catalog + enter cost */}
            <label>Material</label>
            <select 
                value={selectedMaterialId}
                onChange={(e) => setSelectedMaterialId(e.target.value)}
            >
                <option value="">-- Select a Material --</option>
                {catalog.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                ))}
            </select>

            {selectedMaterialId !== "" && (
                <div style={{ marginTop: "8px" }}>
                    <label>Cost</label>
                    <input 
                        type="number" 
                        value={costInput} 
                        onChange={(e) => setCostInput(e.target.value)}
                    />

                    {alreadyAdded && (
                        <div 
                            style={{
                                color: "red",
                                marginTop: "4px"
                            }}
                        >
                            That material is already added to this job.
                        </div>
                    )}

                    <br /><br />
                    <button onClick={handleAddEntry} disabled={!canAdd}>Add Material</button>
                </div>
            )}

            {/* Inline catalog manager */}
            <div style={{ marginTop: "10px" }}>
                <button 
                    type="button"
                    onClick={() => setManagerOpen(!managerOpen)}
                    style={{ fontSize: "0.85em" }}>
                        {managerOpen? "Hide Material Management" : "Manage Materials"}
                    </button>

                    {managerOpen && (
                        <div 
                            style={{
                                border: "1px solid #eee",
                                borderRadius: "6px",
                                padding: "10px",
                                marginTop: "8px",
                            }}
                        >
                            <button onClick={startNew}>Add New</button>

                            {editingId !== null && (
                                <div
                                    style={{
                                        marginTop: "8px",
                                        borderBottom: "1px solid #eee",
                                        paddingBottom: "8px",
                                    }}
                                >
                                    <label>Material Name</label>
                                    <input
                                        value={draftName}
                                        onChange={(e) => setDraftName(e.target.value)}
                                    />
                                    {managerError && <div style={{ color: "red", marginTop: "4px" }}>{managerError}</div>}
                                    <br /><br/>
                                    <button onClick={saveCatalog} disabled={draftName.trim() === ""}>Save</button>
                                    <button onClick={() => setEditingId(null)} style={{ marginLeft: "8px" }}>Cancel</button>
                                </div>
                            )}

                            <div style={{ marginTop: "8px" }}>
                                {catalog.length === 0 && <div style={{ color: "#888" }}>No materials in catalog.</div>}
                                {catalog.map((m) => (
                                    <div 
                                        key={m.id} 
                                        style={{ 
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "4px",
                                        }}
                                    >
                                        <span>{m.name}</span>
                                        <div 
                                            style={{
                                                display: "flex",
                                                gap: "6px",
                                            }}
                                        >
                                            <button onClick={() => startEdit(m)}>Edit</button>
                                            <button onClick={() => deleteCatalog(m.id)}>Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div> 
                        </div>
                    )}
            </div>

        </div>
    );
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                                                  REUSABLE DICTIONARY EDITOR (EMPLOYEES_OUT)
//
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function DictEditor({ title, entries, onChange }) {

    const NEW = "__new__";

    const [selected, setSelected] = useState("");
    const [nameInput, setNameInput] = useState("");
    const [valueInput, setValueInput] = useState("");

    const keys = Object.keys(entries);

    // Handle picking an option from the dropdown
    function handleSelect(value) {
        setSelected(value);

        if (value === NEW || value === "") {
            setNameInput("")
            setValueInput("");
        } else {
            // Existing entry -> load it into the editable fields
            setNameInput(value);
            setValueInput(String(entries[value]));
        }
    }

    // ------ Validation -------
    const trimmedName = nameInput.trim();
    const numericValue = Number(valueInput);

    const nameIsValid = trimmedName !== "";
    const valueIsValid = valueInput !== "" && !isNaN(numericValue) && numericValue >= 0;

    // New entries can't reuse a name; edits can keep their own name but not steal another
    const nameCollision =
        selected === NEW
            ? keys.includes(trimmedName)
            : trimmedName !== selected && keys.includes(trimmedName);

    const canSubmit = nameIsValid && valueIsValid && !nameCollision;

    // Add a brand new entry
    function handleAdd() {
        onChange({ ...entries, [trimmedName]: numericValue });
        setNameInput("");
        setValueInput("");
    }

    // Save an edit to the selected entry (handles rename)
    function handleSave() {
        const updated = { ...entries };

        if (trimmedName !== selected) {
            delete updated[selected];
        }

        updated[trimmedName] = numericValue;
        onChange(updated);
        setSelected(trimmedName);
    }

    // Remove the selected entry
    function handleDelete() {
        const updated = { ...entries };
        delete updated[selected];
        onChange(updated);

        setSelected("");
        setNameInput("");
        setValueInput("");
    }

    const total = keys.reduce((sum, k) => sum + entries[k], 0);

    return (
        <div
            style={{
                border: "1px solid #ccc",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "12px",
            }}
        >

            <strong>{title}</strong> (total: ${total.toFixed(2)})

            <br /><br />

            <select 
                value={selected}
                onChange={(e) => handleSelect(e.target.value)}
            >
                <option value="">-- select --</option>

                {keys.map((k) => (
                    <option key={k} value={k}>
                        {k}
                    </option>
                ))}

                <option value={NEW}>+ New</option>
            </select>

            {selected !== "" && (

                <div style={{ marginTop: "10px" }}>

                    <label>Name</label>
                    <input
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                    />

                    <br /><br />

                    <label>Amount</label>
                    <input
                        type="number"
                        value={valueInput}
                        onChange={(e) => setValueInput(e.target.value)}
                    />

                    <br /><br />

                    {selected === NEW ? (
                        <button onClick={handleAdd} disabled={!canSubmit}>
                            Add 
                        </button>
                    ) : (
                        <div style={{ display: "flex", gap: "10px" }}>
                            <button onClick={handleSave} disabled={!canSubmit}>
                                Save
                            </button>
                            <button onClick={handleDelete}>
                                Delete 
                            </button>
                        </div>
                    )}

                    {nameCollision && (
                        <div style={{ color: "red", marginTop: "6px" }}>
                            That name already exists.
                        </div>
                    )}

                </div> 

            )}

        </div>
    )
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
//
//                                                  ACCOUNTING PAGE
//
// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function Accounting() {
    const { permissions } = useAuth();

    if (!isOwner(permissions)) {
        return <div style={{ padding: "20px" }}>You don't have access to this page.</div>
    }

    const [jobs, setjobs] = useState([]);
    const [finances, setFinances] = useState([]);
    const [clients, setClients] = useState([]);
    const [materialsCatalog, setMaterialsCatalog] = useState([]);

    const [showPopup, setShowPopup] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [hasFinances, setHasFinances] = useState(false);

    const [editData, setEditData] = useState({
        money_in: "",
        materials_out: {},
        employees_out: {},
    });

    useEffect(() => {
        loadData();
    }, []);

    // -------- API Helpers ----------

    async function loadData() {
        try {
            const [jobsRes, financesRes, clientsRes, materialsRes] = await Promise.all([
                apiFetch(`/jobs/`),
                apiFetch(`/finances/`),
                apiFetch(`/clients/`),
                apiFetch(`/materials/`),
            ]);

            const jobsData = await jobsRes.json();
            const financesData = await financesRes.json();
            const clientsData = await clientsRes.json();
            const materialsCatalogData = await materialsRes.json();

            setjobs(jobsData);
            setFinances(financesData);
            setClients(clientsData);
            setMaterialsCatalog(materialsCatalogData);
        } catch (error) {
            console.error("Failed to load accounting data:", error);
        }
    }

    async function createFinances(payload) {
        const response = await apiFetch(`/finances/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return await response.json();
    }

    async function updateFinances(jobID, payload) {
        const response = await apiFetch(`/finances/${jobID}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return await response.json();
    }

    async function deleteFinances(jobID) {
        await apiFetch(`/finances/${jobID}`, {
            method: "DELETE",
        });
    }

    // ------- Helpers ----------

    // Look up finances by job_id so we can merge them into the jobs table
    const financesByJob = {};
    finances.forEach((f) => {
        financesByJob[f.job_id] = f;
    });

    const clientsById = {};
    clients.forEach((c) => {
        clientsById[c.id] = c;
    });

    function money(value) {
        if (value === undefined || value === null) {
            return "—";
        }
        return `$${Number(value).toFixed(2)}`;
    }

    // ------- Handlers --------

    function handleRowClick(job) {
        const existing = financesByJob[job.id];

        setSelectedJob(job);
        setHasFinances(Boolean(existing));

        if (existing) {
            setEditData({
                money_in: String(existing.money_in),
                materials_out: { ...existing.materials_out },
                employees_out: { ...existing.employees_out },
            });
        } else {
            setEditData({
                money_in: "",
                materials_out: {},
                employees_out: {},
            });
        }

        setShowPopup(true);
    }

    // Main-save validation: backend requires a numeric money_in
    const moneyInValid = 
        editData.money_in !== "" && !isNaN(Number(editData.money_in));

    const canSave = moneyInValid;

    async function saveChanges() {
        
        const payload = {
            money_in: Number(editData.money_in),
            materials_out: editData.materials_out,
            employees_out: editData.employees_out
        };

        try {
            if (hasFinances) {
                await updateFinances(selectedJob.id, payload);
            } else {
                await createFinances({ ...payload, job_id: selectedJob.id });
            }

            await loadData();
        } catch (error) {
            console.error("Failed to save finances", error);
        }

        setShowPopup(false);
    }

    async function deleteJobFinances() {
        try {
            if (hasFinances) {
                await deleteFinances(selectedJob.id);
            }

            await loadData();
        } catch (error) {
            console.error("Failed to delete finances:", error);
        }

        setShowPopup(false);
        setSelectedJob(null);
    }

    // Live profit preview (server still recomputes the authoritative value on save)
    const materialsTotal = Object.values(editData.materials_out).reduce((a, b) => a + b, 0);
    const employeesTotal = Object.values(editData.employees_out).reduce((a, b) => a + b, 0);
    const projectedProfit = (Number(editData.money_in) || 0) - (materialsTotal + employeesTotal);

    return (
        <div style={{ padding: "20px" }}>

            <h1>Accounting</h1>

            <table
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "20px",
                }}
            >

                <thead>
                    <tr>
                        <th style={cellStyle}>Client</th>
                        <th style={cellStyle}>Address</th>
                        <th style={cellStyle}>Job Type</th>
                        <th style={cellStyle}>Money In</th>
                        <th style={cellStyle}>Materials</th>
                        <th style={cellStyle}>Labor</th>
                        <th style={cellStyle}>Profit</th>
                    </tr>
                </thead>

                <tbody>

                    {jobs.map((job) => {
                        const f = financesByJob[job.id];

                        return (
                            <tr 
                                key={job.id}
                                onClick={() => handleRowClick(job)}
                                style={{ cursor: "pointer" }}
                                onMouseEnter={(e) =>
                                    e.currentTarget.style.backgroundColor = "#f0f0f0"
                                }
                                onMouseLeave={(e) =>
                                    e.currentTarget.style.backgroundColor = ""
                                }
                            >
                                <td style={cellStyle}>{clientsById[job.client_id]?.name ?? "—"}</td>
                                <td style={cellStyle}>{job.address}</td>
                                <td style={cellStyle}>{job.job_type}</td>
                                <td style={cellStyle}>{f ? money(f.money_in) : "—"}</td>
                                <td style={cellStyle}>{f ? money(f.total_material_cost) : "—"}</td>
                                <td style={cellStyle}>{f ? money(f.total_labor_cost) : "—"}</td>
                                <td style={cellStyle}>{f ? money(f.job_profit) : "—"}</td>
                            </tr>
                        );
                    })}

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

                        <h2>Finances — {clientsById[selectedJob?.client_id]?.name ?? ""}</h2>

                        <label>Money In</label>
                        <input 
                            type="number"
                            value={editData.money_in}
                            onChange={(e) =>
                                setEditData({
                                    ...editData,
                                    money_in: e.target.value,
                                })
                            }
                        />

                        <br /><br />

                        <MaterialsEditor
                            entries={editData.materials_out}
                            catalog={materialsCatalog}
                            onChange={(updated) =>
                                setEditData({
                                    ...editData,
                                    materials_out: updated,
                                })
                            }
                            onCatalogChanged={loadData}
                        />

                        <br /><br />

                        <DictEditor
                            title="Employees"
                            entries={editData.employees_out}
                            onChange={(updated) =>
                                setEditData({
                                    ...editData,
                                    employees_out: updated,
                                })
                            }
                        />

                        <div style={{ marginBottom: "16px" }}>
                            <strong>Projected Profit: {money(projectedProfit)}</strong>
                        </div>

                        <div 
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: "10px",
                            }}
                        >

                            <div style={{ display: "flex", gap: "10px" }}>
                                <button onClick={saveChanges} disabled={!canSave}>
                                    Save
                                </button>
                                <button onClick={() => setShowPopup(false)}>
                                    Close
                                </button>
                            </div>

                            {hasFinances && (
                                <button onClick={deleteJobFinances}>
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

export default Accounting;