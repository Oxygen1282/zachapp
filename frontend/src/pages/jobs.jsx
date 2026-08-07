import { useState, useEffect  } from "react";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { canManageContent, isOwner } from "../auth/permissions";

import SearchFilter from "../components/SearchFilter"

import { useNavigate, useSearchParams } from "react-router-dom";

const cellStyle = {
    border: "1px solid black",
    padding: "8px",
};

const STATUSES = [
        "No Estimates",
        "Estimate Drafted",
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
    const isOwnerUser = isOwner(permissions);

    const [searchParams, setSearchParams] = useSearchParams();

    const navigate = useNavigate();

    const [convertingEstimateId, setConvertingEstimateId] = useState(null);

    const [jobs, setJobs] = useState([]);
    const [clients, setClients] = useState([]);
    const [estimates, setEstimates] = useState([]);

    const [showPopup, setShowPopup] = useState(false);
    const [selectedJob, setSelectedJob] = useState(null);
    const [actionError, setActionError] = useState("");

    // Current search filter: which column, and the (lowercased) search text.
    const [filter, setFilter] = useState({ column: "client", text: "" });

    // Define which columns are filterable (matches your decision for Clients).
    const filterColumns = [
        { value: "client", label: "Client" },
        { value: "address", label: "Address" },
    ];


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

    // If we arrived via "Convert to Job" (/jobs?newClientId=5), open the New Job
    // popup with that client preselected — but only once clients are loaded, so
    // the dropdown has the client available to select.
    useEffect(() => {
        const newClientId = searchParams.get("newClientId");

        if (newClientId && clients.length > 0) {
            openNewJobForClient(Number(newClientId));
            // Clear the param so refreshing/re-rendering doesn't reopen it.
            setSearchParams({});
            return;
        }

        // From estimates "Convert to Job" — prefill from the estimate.
        const fromEstimate = searchParams.get("fromEstimate");
        if (fromEstimate && clients.length > 0 && estimates.length > 0) {
            openNewJobFromEstimate(Number(fromEstimate));
            setSearchParams({});
            return;
        }

        // From estimates "Go to Job" — open that job's edit popup.
        const openJob = searchParams.get("openJob");
        if (openJob && jobs.length > 0) {
            const job = jobs.find((j) => j.id === Number(openJob));
            if (job) {
                handleJobClick(job);
                setSearchParams({});
            }
            return;
        }

    }, [clients, jobs, estimates, searchParams]);

    // ----- API Helpers -----

    async function loadData() {
        try {
            const [jobsRes, clientsRes] = await Promise.all([
                apiFetch(`/jobs/`),
                apiFetch(`/clients`),
            ]);

            setJobs(await jobsRes.json());
            setClients(await clientsRes.json());

            // Estimates are owner-only — a manager gets 403. Load them only if allowed.
            if (isOwnerUser) {
                const estimatesRes = await apiFetch(`/estimates/`);
                if (estimatesRes.ok) {
                    setEstimates(await estimatesRes.json());
                }
            }
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
        const response = await apiFetch(`/jobs/${id}`, { method: "DELETE" });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to delete job");
        }
    }

    async function linkEstimateToJob(estimateId, jobId, address) {
        const response = await apiFetch(`/estimates/${estimateId}/link-job`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ job_id: jobId, address }),
        });
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Failed to link estimate");
        }
        return await response.json();
    }

    // ----- Helpers -----

    // Look up a client by id (for showing the client name in the jobs table).
    const clientsById = {};
    clients.forEach((c) => {
        clientsById[c.id] = c;
    });

    // Estimates grouped by the job they're linked to.
    const estimatesByJob = {};
    (Array.isArray(estimates) ? estimates : []).forEach((est) => {
        if (est.job_id != null) {
            if (!estimatesByJob[est.job_id]) estimatesByJob[est.job_id] = [];
                estimatesByJob[est.job_id].push(est);
        }
    });

    // Filter the jobs by the selected column + search text (substring, case-insensitive)
    const filteredJobs = jobs.filter((job) => {
        if (filter.text === "") return true;    // empty search shows everything

        // Read the value for the selected column off this client.
        let value = "";
        if (filter.column === "client") value = clientsById[job.client_id]?.name ?? "";
        else if (filter.column === "address") value = job.address ?? "";

        return value.toLowerCase().includes(filter.text);
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
        parts.push(`${addr.city}, ${addr.state} ${addr.zip}`);
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

    // Open the New Job popup with a specific client preselected (from "Convert
    // to Job"). Loads that client's addresses so the address dropdown is ready.
    function openNewJobForClient(clientId) {

        setSelectedJob({ id: null });       // null = creating (not editing)
        setEditData({
            client_id: clientId,    // preselect the client 
            client_address_id: "",
            job_type: "Rad Power Washing",
            description: "",
            status: "New",
        });
        setShowPopup(true);
    }

    // Open the New Job popup prefilled from an estimate (Convert to Job). Matches
    // the estimate's frozen address to a live client address if possible; if not,
    // leaves the address empty for the owner to pick. Enters "conversion mode" so
    // the save links the estimate afterward.
    function openNewJobFromEstimate(estimateId) {
        const estimate = estimates.find((e) => e.id === estimateId);
        if (!estimate) return;

        const client = clientsById[estimate.client_id];
        if (!client) return;

        // Try to match the frozen address string to one of the client's addresses.
        let matchedAddressId = "";
        for (const addr of (client.addresses ?? [])) {
            if (composeAddress(addr) === estimate.address) {
                matchedAddressId = String(addr.id);
                break;
            }
        }

        setSelectedJob({ id: null });
        setEditData({
            client_id: estimate.client_id,
            client_address_id: matchedAddressId,    // preselected if matched, else ""
            description: "",
            job_type: "Rad Power Washing",
            status: "Estimate Drafted",             // born from an estimate
        });

        // Remember we're converting THIS estimate, so the save links it.
        setConvertingEstimateId(estimateId);

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
                const newJob = await createJobInDatabase(jobData);

                // Conversion mode: link the estimate to the new job.
                if (convertingEstimateId) {
                    await linkEstimateToJob(convertingEstimateId, newJob.id, newJob.address);
                    setConvertingEstimateId(null);
                }
            }

            await loadData();
            closePopup();
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
            closePopup();
            setSelectedJob(null);
        } catch (error) {
            setActionError(error.message);
        }
    }

    function closePopup() {
        setShowPopup(false);
        setConvertingEstimateId(null);
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
                        <th style={cellStyle}>Client</th>
                        <th style={cellStyle}>Address</th>
                        <th style={cellStyle}>Job Type</th>
                        <th style={cellStyle}>Description</th>
                        {canEdit && <th style={cellStyle}>Status</th>}
                        {isOwnerUser && <th style={cellStyle}>Estimates</th>}
                    </tr>
                </thead>

                <tbody>

                    {filteredJobs.map((job) => (

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
                            {isOwnerUser && <td style={cellStyle} onClick={(e) => e.stopPropagation()}>
                                {(() => {
                                    const jobEstimates = estimatesByJob[job.id] ?? [];

                                    // No estimates yet → Create Estimate (Flow 2)
                                    if (jobEstimates.length === 0) {
                                        return (
                                            <button onClick={() => navigate(`/estimates?newJobId=${job.id}`)}>
                                                Create Estimate
                                            </button>
                                        );
                                    }

                                    // Exactly one -> View Estimate (jump straight to it)
                                    if (jobEstimates.length === 1) {
                                        return (
                                            <button onClick={() => navigate(`/estimates?openEstimate=${jobEstimates[0].id}`)}>
                                                View Estimate
                                            </button>
                                        );
                                    }

                                    // Two or more → dropdown to pick one
                                    return (
                                        <select
                                            value=""
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    navigate(`/estimates?openEstimate=${e.target.value}`);
                                                }
                                            }}
                                        >
                                            <option value="">-- View Estimate --</option>
                                            {jobEstimates.map((est) => (
                                                <option key={est.id} value={est.id}>
                                                    #{est.estimate_number ? est.estimate_number.slice(4) : "Draft"} ({est.status})
                                                </option>
                                            ))}
                                        </select>
                                    );
                                })()}
                            </td>}
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
                        {isNewJob ? (
                            // CREATING: show the client dropdown
                            <select 
                                value={editData.client_id}
                                onChange={(e) => {
                                    const cid = Number(e.target.value);
                                    setEditData({ ...editData, client_id: cid, client_address_id: "" });

                                }}
                                disabled={!canEdit}
                            >
                                <option value="">-- Select a Client --</option>
                                {clients.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            // EDITING: client is fixed — show as text
                            <div>{clientsById[selectedJob.client_id]?.name ?? "—"}</div>
                        )}

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
                                    {STATUSES
                                        .filter((s) => {
                                            const hasEstimates = (estimatesByJob[selectedJob?.id] ?? []).length > 0;

                                            // Estimate-related statuses require the job to actually have estimates.
                                            if ((s === "Estimate Drafted" || s === "Estimate Sent") && !hasEstimates) {
                                                return false;
                                            }

                                            // Hide "No Estimates" if this job actually has estimates.
                                            if (s === "No Estimates" && hasEstimates) {
                                                return false;
                                            }
                                            return true;
                                        })
                                        .map((status) => (
                                        <option key={status} value={status}>
                                            {status}
                                        </option>
                                    ))}
                                </select>

                                <br /><br />
                            </>
                        )}

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
                                <button onClick={closePopup}>Close</button>
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