import { useState, useEffect  } from "react";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { canManageContent } from "../auth/permissions";

const cellStyle = {
    border: "1px solid black",
    padding: "8px",
};

const STATUSES = [
        "New",
        "Estimate Sent",
        "Scheduled",
        "In Progress",
        "Completed",
        "Paid",
        "Canceled",
];

const JOB_TYPES = [
        "Rad Power Washing",
        "Rad Renovations",
];

function Jobs() {
    const { permissions } = useAuth();
    const canEdit = canManageContent(permissions);

    const [jobs, setJobs] = useState([]);
    const [clients, setClients] = useState([]);

    const [showPopup, setShowPopup] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);

    const [editData, setEditData] = useState({
        client_id: "",
        client_address_id: "",
        description: "",
        job_type: "Rad Power Washing",
        status: "New",
    });

    useEffect(() => {
        loadData();
    }, []);

    // ----- API Helpers -----

    async function loadData() {
        try {
            const [jobsRes, clientsRes] = await Promise.all([
                apiFetch(`/jobs/`),
                apiFetch(`/clients`),
            ]);

            const jobsData = await jobsRes.json();
            const clientsData = await clientsRes.json();

            setJobs(jobsData);
            setClients(clientsData);
        } catch (error) {
            console.error("Failed to load jobs data:", error);
        }
    }

    async function createJobInDatabase(jobData) {
        const response = await apiFetch(`/jobs/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(jobData),
        });

        return await response.json();
    }

    async function updateJobInDatabase(id, jobData) {
        const response = await apiFetch(`/jobs/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(jobData),
        });

        return await response.json();
    }

    async function deleteJobFromDatabase(id) {
        await apiFetch(`/jobs/${id}`, {
            method: "DELETE",
        });
    }

    // ----- Helpers -----

    // Look up a client by id (for showing the client name in the jobs table).
    const clientsById = {};
    clients.forEach((c) => {
        clientsById[c.id] = c;
    });

    // The addresses available for the client currently chosen in the form.
    // This is the "dependent" part: it recomputes whenever editData.client_id
    // changes, so the address dropdown always reflects the chosen client.
    const selectedClient = clientsById[Number(editData.client_id)];
    const availableAddresses = selectedClient ? selectedClient.addresses : [];

    // Compose a client's address for display in the dropdown
    function composeAddress(addr) {
        const parts = [addr.street];
        if (addr.street_line2) {
            parts.push(addr.street_line2);
        }
        parts.push(`${addr.city}, ${addr.state}, ${addr.zip}`);
        return parts.join(", ");
    }

    // ----- Handlers -----

    // Open the popup with a blank job for creation
    function createJob() {

        setSelectedJob({ id: null });
        setEditData({
            client_id: "",
            client_address_id: "",
            description: "",
            job_type: "Rad Power Washing",
            status: "New",
        });

        setShowPopup(true);
    }

    // Open the popup for an existing job. Note: the job stores a FROZEN address
    // string, not an address id — so we can't preselect which address it came
    // from. We preselect the client, and leave the address dropdown for the
    // user to (re)choose if they want to change it. See the note below.
    function handleJobClick(job) {

        setSelectedJob(job);
        setEditData({
            client_id: String(job.client_id),
            client_address_id: "",
            description: job.description ?? "",
            job_type: job.job_type,
            status: job.status,
        });

        setShowPopup(true);
    }
    
    // When the client changes, reset the chosen address — the old choice
    // belonged to a different client and would be invalid.
    function handleClientChange(value) {
        setEditData({
            ...editData,
            client_id: value,
            client_address_id: "",
        });
    }

    // New jobs must have an address; edits may keep the existing frozen one
    const isNewJob = !selectedJob?.id;

    const canSave =
        editData.client_id !== "" &&
        editData.job_type !== "" &&
        (!isNewJob || editData.client_address_id !== "");

    async function saveChanges() {

        const jobData = {
            client_id: Number(editData.client_id),
            description: editData.description,
            job_type: editData.job_type,
            status: editData.status,
        };

        // Only include the address if one was picked. Omitting it on an edit
        // tells the backend to keep the job's existing frozen address.
        if (editData.client_address_id !== "") {
            jobData.client_address_id = Number(editData.client_address_id);
        }

        try {

            // Existing job
            if (selectedJob.id) {
                await updateJobInDatabase(selectedJob.id, jobData);
            }

            // New job
            else {
                await createJobInDatabase(jobData);
            }

            await loadData();
            setShowPopup(false);
        } catch (error) {
            console.error("Failed to save job:", error);
        }
    }

    async function deleteJob() {

        try {
            if (selectedJob.id) {
                await deleteJobFromDatabase(selectedJob.id);
            }

            await loadData();
            setShowPopup(false);
            setSelectedJob(null);
        } catch (error) {
            console.error("Failed to delete job:", error);
        }
    }

    return (
        <div style={{ padding: "20px" }}>

            {canEdit && (
                <button onClick={createJob}>
                    New Job
                </button>
            )}

            <br /><br />

            <h1>Jobs</h1>

            <table 
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "20px"
                }}
            >

                <thead>
                    <tr>
                        <th style={cellStyle}>Client</th>
                        <th style={cellStyle}>Address</th>
                        <th style={cellStyle}>Job Type</th>
                        <th style={cellStyle}>Description</th>
                        {canEdit && <th style={cellStyle}>Status</th>}
                    </tr>
                </thead>

                <tbody>

                    {jobs.map((job) => (

                        <tr 
                            key={job.id}
                            onClick={() => handleJobClick(job)}
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
                            <td style={cellStyle}>{job.description}</td>
                            {canEdit && <td style={cellStyle}>{job.status}</td>}
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
                        
                        <h2>{selectedJob?.id ? "Edit Job" : "New Job"}</h2>

                        <label>Client</label>
                        <select 
                            value={editData.client_id}
                            onChange={(e) => handleClientChange(e.target.value)}
                            disabled={!canEdit}
                        >
                            <option value="">-- Select a Client --</option>
                            {clients.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>

                        <br /><br />

                        {canEdit ? (
                            <>
                                <label>Address</label>
                                <select 
                                    value={editData.client_address_id}
                                    onChange={(e) => setEditData({ ...editData, client_address_id: e.target.value })}
                                    disabled={editData.client_id === ""}
                                >
                                    <option value="">-- Select an Address --</option>
                                    {availableAddresses.map((addr) => (
                                        <option key={addr.id} value={addr.id}>
                                            {composeAddress(addr)}
                                        </option>
                                    ))}
                                </select>

                                {/* the "Current address" hint, still useful for editors */}
                                {selectedJob?.id && (
                                    <div 
                                        style={{
                                            color: "#777",
                                            marginTop: "6px",
                                            fontSize: "0.9em" 
                                        }}
                                    >
                                        Current address: {selectedJob.address}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div>
                                <label>Address</label>
                                <div>{selectedJob.address}</div>
                            </div>
                        )}

                        {/* Nudge when the chosen client has no addresses to pick */}
                        {editData.client_id !== "" && availableAddresses.length === 0 && (
                            <div
                                style={{
                                    color: "red",
                                    marginTop: "6px"
                                }}
                            >
                                This client has no addresses. Add one on the Clients page first.
                            </div>
                        )}

                        {/* Show the current frozen address when editing an existing job */}
                        {selectedJob?.id && (
                            <div 
                                style={{ 
                                    color: "#777",
                                    marginTop: "6px",
                                    fontSize: "0.9em" 
                                }}
                            >
                                Current address: {selectedJob.address}
                            </div>
                        )}

                        <br /><br />

                        <label>Job Type</label>
                        <select 
                            value={editData.job_type}
                            onChange={(e) => setEditData({ ...editData, job_type: e.target.value })}
                            disabled={!canEdit}
                        >
                            {JOB_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type}
                                </option>
                            ))}
                        </select>

                        <br /><br />

                        <label>Description</label>
                        <input 
                            value={editData.description}
                            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                            disabled={!canEdit}
                        />

                        <br /><br />
                        
                        {canEdit && (
                            <>
                                <label>Status</label>
                                <select 
                                    value={editData.status}
                                    onChange={(e) => setEditData({ ...editData, status: e.target.value })}
                                >
                                    {STATUSES.map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>

                                <br /><br />
                            </>
                        )}

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginTop: "20px"
                            }}
                        >

                            <div
                                style={{
                                    display: "flex",
                                    gap: "10px",
                                }}
                            >
                                {canEdit && (
                                    <button onClick={saveChanges} disabled={!canSave}>Save</button>
                                )}
                                <button onClick={() => setShowPopup(false)}>Close</button>
                            </div>

                            {canEdit && selectedJob?.id && (
                                <button onClick={deleteJob}>Delete</button>
                            )}

                        </div>

                    </div>

                </div>

            )}

        </div>
    );
}

export default Jobs;