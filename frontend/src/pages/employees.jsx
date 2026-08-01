import { useState, useEffect, useReducer } from "react";
import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { canManageContent, isOwner } from "../auth/permissions";
import PasswordInput from "../components/PasswordInput";

const cell = {
    border: "1px solid black",
    padding: "8px",
}

// Shared popup styles (overlay + white box), reused by all popups here.
const overlay = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zindex: 9999,
};

const popup = {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "10px",
    maxHeight: "90vh",
    overflowY: "auto",
};

// Blank employee form state — used when creating a new employee.
const EMPTY_FORM = {
    name: "",
    email: "",
    password: "",
    permissions: "Employee",
    pay_type: "Hourly",
    pay_rate: "",
}

function Employees() {

    // The logged-in user's role decides what's editable. Managers can view the
    // list and open timesheets, but can't create/edit/deactivate/delete — those
    // are Owner-only (enforced on the backend; hidden here for UX).
    const { permissions } = useAuth();
    const owner = isOwner(permissions);

    // Employees page is Owner + Manager only. Block others cleanly.
    if (!canManageContent(permissions)) {
        return <div style={{ padding: "20px" }}>You don't have access to this page.</div>
    }

    // ----- List + popup state -----
    const [users, setUsers] = useState([]);
    const [showForm, setShowForm] = useState(false);            // create/edit popup
    const [selectedUser, setSelectedUser] = useState(null);     // null id = creating
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // The password-gated delete popup (asks for the OWNER's password).
    const [showDelete, setShowDelete] = useState(false);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState("");

    // The timesheet viewer. Holds with employee we're viewing
    const [timesheetUser, setTimesheetUser] = useState(null);

    useEffect(() => {
        loadUsers();
    }, []);

    // ----- Load the full user list from the backend -----
    // GET /users/ is Owner+Manager guarded, so a Manager can see the list too.
    async function loadUsers() {
        try {
            const response = await apiFetch("/users/");
            if (!response.ok) {
                setUsers([]);
                return;
            }
            const data = await response.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error("Failed to load users:", err);
            setUsers([]);
        }
    }

    // ----- Open the create form (blank) -----
    function startCreate() {
        setSelectedUser({ id: null });
        setFormData(EMPTY_FORM);
        setFormError("");
        setConfirmPassword("");
        setShowForm(true);
    }

    // ----- Open the edit form for an existing employee -----
    // Password is left blank on edit — blank means "keep the current password".
    // pay_rate is stringified for the controlled input.
    function startEdit(user) {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            password: "",
            permissions: user.permissions,
            pay_type: user.pay_type ?? "Hourly",
            pay_rate: user.pay_rate != null ? String(user.pay_rate) : "",
        });
        setFormError("");
        setConfirmPassword("");
        setShowForm(true);
    }

    // ----- Save the create/edit form -----
    // Create requires a password; edit sends password only if one was typed.
    // pay_rate is converted to a number (or null if blank).
    async function saveForm() {
        setFormError("");

        // If a password was entered, it must match the confirmation.
        if (formData.password !== "" && formData.password !== confirmPassword) {
            setFormError("Passwords do not match.");
            return;
        }

        const payload = {
            name: formData.name,
            email: formData.email,
            permissions: formData.permissions,
            pay_type: formData.pay_type,
            pay_rate: formData.pay_rate === "" ? null : Number(formData.pay_rate)
        };

        // Password: required on create, optional on edit (blank = keep current).
        if (formData.password !== "") {
            payload.password = formData.password;
        }

        try {
            let response;
            if (selectedUser.id) {
                // Edit existing (PUT /users/{id}) — Owner only on the backend.
                response = await apiFetch(`/users/${selectedUser.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                // Create new (POST /users/). Password IS required here.
                if (formData.password === "") {
                    setFormError("A password is required for a new empolyee");
                    return;
                }

                payload.password = formData.password;
                response = await apiFetch("/users/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to save employee");
            }

            await loadUsers();
            setShowForm(false);
        } catch (err) {
            setFormError(err.message);
        }
    }

    // ----- Toggle an employee active/inactive -----
    // Deactivation blocks their login and (later) hides them from selections.
    // Owner-only. Reloads the list to reflect the new status.
    async function toggleActive(user) {
        const path = user.is_active 
            ? `/users/${user.id}/deactivate`
            : `/users/${user.id}/reactivate`;
        try {
            const response = await apiFetch(path, { method: "POST" });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to update status");
            }
            await loadUsers();
        } catch (err) {
            console.error("Failed to toggle active:", err);
        }
    }

    // ----- Open the password-gated delete confirmation -----
    function startDelete(user) {
        setSelectedUser(user);
        setDeletePassword("");
        setDeleteError("");
        setShowDelete(true);
    }

    // ----- Confirm the hard delete -----
    // Sends the OWNER's password to POST /users/{id}/delete. The backend
    // re-verifies it before the irreversible delete (which also cascades away
    // the employee's timesheet history).
    async function confirmDelete() {
        setDeleteError("");
        try {
            const response = await apiFetch(`/users/${selectedUser.id}/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: deletePassword }),
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to delete employee");
            }
            await loadUsers();
            setShowDelete(false);
        } catch (err) {
            setDeleteError(err.message);
        }
    }

    // Password validation: only matters if a password was actually typed
    // (blank on edit = keep current). If typed, confirm must match.
    const passwordEntered = formData.password !== "";
    const passwordsMatch = formData.password === confirmPassword;
    const passwordProblem = passwordEntered && !passwordsMatch

    return (
        <div style={{ padding: "20px" }}>

            { /* Only Owners can create employees. */}
            {owner && (
                <button onClick={startCreate}>New Employee</button>
            )}

            <br /><br />

            <h1>Employees</h1>

            {/* ----- The employee list ----- */}
            <table 
                style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "20px"
                }}
            >
                <thead>
                    <tr>
                        <th style={cell}>Name</th>
                        <th style={cell}>Email</th>
                        <th style={cell}>Role</th>
                        <th style={cell}>Pay</th>
                        <th style={cell}>Status</th>
                        <th style={cell}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map((u) => (
                        <tr 
                            key={u.id}
                            style={{
                                background: u.is_active ? "" : "#f5f5f5",
                                color: u.is_active ? "" : "#999"
                            }}
                        >
                            <td style={cell}>{u.name}</td>
                            <td style={cell}>{u.email}</td>
                            <td style={cell}>{u.permissions}</td>
                            <td style={cell}>
                                {u.pay_type === "Hourly" && u.pay_rate != null
                                    ? `$${u.pay_rate}/hr`
                                    : u.pay_type ?? "—"}
                            </td>
                            <td style={cell}>{u.is_active ? "Active" : "Inactive"}</td>
                            <td style={cell}>
                                <div 
                                    style={{
                                        display: "flex",
                                        gap: "6px",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    {/* Timesheets: Owner + Manager */}
                                    <button onClick={() => setTimesheetUser(u)}>Timesheets</button>

                                    {/* Edit / deactivate / delete: Owner only. */}
                                    {owner && (
                                        <>
                                            <button onClick={() => startEdit(u)}>Edit</button>
                                            {u.permissions !== "Owner" && (
                                                <button onClick={() => toggleActive(u)}>
                                                    {u.is_active ? "Deactivate" : "Reactivate"}
                                                </button>
                                            )}
                                            <button onClick={() => startDelete(u)}>Delete</button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ----- Create/Edit employee popup ----- */}
            {showForm && (
                <div style={overlay}>
                    <div 
                        style={{
                            ...popup,
                            width: "500px"
                        }}
                    >

                        <h2>{selectedUser?.id ? "Edit Employee" : "New Employee"}</h2>

                        <label>Name</label>
                        <input
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            style={{ width: "100%" }}
                        />

                        <br /><br />

                        <label>Email</label>
                        <input
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            style={{ width: "100%" }}
                        />

                        <br /><br />

                        {/* On edit, blank password = keep current. On create, required. */}
                        <label>{selectedUser?.id ? "New Password (blank = unchanged)" : "Password"}</label>
                        <PasswordInput
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />

                        <br /><br />

                        {/* Confirm only appears/matters when a password is being set. */}
                        <label>Confirm Password</label>
                        <PasswordInput
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                        />

                        {passwordProblem && (
                            <div style={{ color: "red", marginTop: "6px" }}>
                                Passwords do not match.
                            </div>
                        )}

                        <br />< br />

                        <label>Role</label>
                        <select 
                            value={formData.permissions}
                            onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}
                        >
                            <option value="Employee">Employee</option>
                            <option value="Manager">Manager</option>
                            <option value="Owner">Owner</option>    
                        </select>

                        <br /><br />

                        <label>Pay Type</label>
                        <select 
                            value={formData.pay_type}
                            onChange={(e) => setFormData({ ...formData, pay_type: e.target.value })}
                        >
                            <option value="Hourly">Hourly</option>
                            <option value="Salary">Salary</option>    
                        </select>

                        <br /><br />

                        <label>Pay Rate</label>
                        <input 
                            type="number" 
                            value={formData.pay_rate}
                            onChange={(e) => setFormData({ ...formData, pay_rate: e.target.value })}
                        />

                        {formError && <div style={{ color: "red", marginTop: "10px" }}>{formError}</div>}

                        <div 
                            style={{
                                display: "flex",
                                gap: "10px",
                                marginTop: "16px"
                            }}
                        >
                            <button onClick={saveForm} disabled={formData.name === "" || formData.email === ""}>Save</button>
                            <button onClick={() => setShowForm(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ----- Password-gated delete popup ----- */}
            {showDelete && (
                <div style={overlay}>
                    <div 
                        style={{
                            ...popup,
                            width: "400px",
                        }}
                    >
                        <h2>Delete {selectedUser?.name}?</h2>
                        <p style={{ color: "#a00" }}>
                            This permanently deletes the employee and all their timesheet history. This cannot be undone.
                        </p>
                        <label>Enter your password to confirm</label>
                        <PasswordInput
                            value={deletePassword}
                            onChange={(e) => setDeletePassword(e.target.value)}
                        />

                        {deleteError && <div style={{ color: "red", marginTop: "10px" }}>{deleteError}</div>}

                        <div 
                            style={{
                                display: "flex",
                                gap: "10px",
                                marginTop: "16px"
                            }}
                        >
                            <button onClick={confirmDelete} disabled={deletePassword === ""}>Delete Permanently</button>
                            <button onClick={() => setShowDelete(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ----- Timesheet viewer (Part 2) — rendered when an employee is selected ----- */}
            {timesheetUser && (
                <TimesheetViewer 
                    user={timesheetUser}
                    isOwnerUser={owner}
                    onClose={() => setTimesheetUser(null)}
                />
            )}

        </div>
    );
}

// =======================================================================================================================================================================================================
// TimesheetViewer — shows one employee's shifts, with edit + delete.
// Opened from the Employees list. Owner + Manager can view and EDIT shifts;
// only the Owner can DELETE (password-gated). isOwnerUser controls that split.
// =======================================================================================================================================================================================================

// Format a minutes count as "Xh Ym" for display.
function fmtMinutes(mins) {
    if (mins === null || mins === undefined) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

// Format an ISO timestamp as readable local date+time.
function fmtDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
}

// Convert an ISO timestamp into the value a datetime-local input expects
// (YYYY-MM-DDTHH:MM in LOCAL time). Used to prefill the edit form.
function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    // Adjust for the timezone offset so the local wall-clock time shows.
    const off = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - off).toISOString().slice(0,16);
}

function TimesheetViewer({ user, isOwnerUser, onClose }) {

    // The employee's shifts, newest first.
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Edit popup state: which shift is being edited + the editable fields.
    const [editShift, setEditShift] = useState(null);
    const [editData, setEditData] = useState({ clock_in: "", clock_out: "", break_time: "" });
    const [editError, setEditError] = useState("");

    // Delete popup state: which shift + the owner's password.
    const [deleteShift, setDeleteShift] = useState(null);
    const [deletePassword, setDeletePassword] = useState("");
    const [deleteError, setDeleteError] = useState("");

    useEffect(() => {
        loadShifts();
    }, []);

    // ----- Load this employee's shifts -----
    // GET /users/{id}/timesheets is Owner+Manager guarded.
    async function loadShifts() {
        setLoading(true);
        try {
            const response = await apiFetch(`/users/${user.id}/timesheets`);
            setShifts(await response.json());
        } catch (err) {
            console.error("Failed to load timesheets:", err);
        } finally {
            setLoading(false);
        }
    }

    // ----- Open the edit popup for a shift -----
    // Only COMPLETED shifts are editable (backend rejects open ones). Prefill
    // the datetime-local inputs from the shift's stored UTC timestamps.
    function startEdit(shift) {
        setEditShift(shift);
        setEditData({
            clock_in: toLocalInput(shift.clock_in),
            clock_out: toLocalInput(shift.clock_out),
            break_time: String(shift.break_time),
        });
        setEditError("");
    }

    // ----- Save an edited shift -----
    // Sends corrected clock_in/out + break_time. The datetime-local values are
    // local wall-clock; new Date(...).toISOString() converts them back to UTC
    // for the backend. Payable time is RECOMPUTED server-side, never sent.
    async function saveEdit() {
        setEditError("");

        const payload = {
            clock_in: new Date(editData.clock_in).toISOString(),
            clock_out: new Date(editData.clock_out).toISOString(),
            break_time: Number(editData.break_time),
        };

        try {
            const response = await apiFetch(`/timesheets/${editShift.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Failed to save shift");
            }
            await loadShifts();
            setEditShift(null);
        } catch (err) {
            setEditError(err.message);
        }
    }

    // ----- Open the password-gated delete popup for a shift -----
    function startDelete(shift) {
        setDeleteShift(shift);
        setDeletePassword("");
        setDeleteError("");
    }

    // ----- Confirm shift deletion -----
    // Sends the OWNER's password to POST /timesheets/{id}/delete; backend
    // re-verifies before the irreversible delete. Owner-only.
    async function confirmDelete() {
        try {
            const response = await apiFetch(`/timesheets/${deleteShift.id}/delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: deletePassword }),
            });
            if (!response.ok) {
                const data = await resposne.json();
                throw new Error(data.detail || "Failed to delete shift");
            }
            await loadShifts();
            setDeleteShift(null);
        } catch (err) {
            setDeleteError(err.message);
        }
    }

    return (
        <div style={overlay}>
            <div
                style={{
                    ...popup,
                    width: "800px"
                }}
            >

                <div 
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <h2>{user.name}'s Timesheets</h2>
                    <button onClick={onClose}>Close</button>
                </div>

                {loading ? (
                    <div>Loading...</div>
                ) : (
                    <table 
                        style={{
                            width: "100px",
                            borderCollapse: "collapse",
                            marginTop: "12px"
                        }}
                    >
                        <thead>
                            <tr>
                                <th style={cell}>Date</th>
                                <th style={cell}>Clock In</th>
                                <th style={cell}>Clock Out</th>
                                <th style={cell}>Break Time</th>
                                <th style={cell}>Payable Time</th>
                                <th style={cell}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {shifts.length === 0 && (
                                <tr><td style={cell} colSpan={6}>No Shifts Recorded.</td></tr>
                            )}
                            {shifts.map((s) => {
                                // An open shift (no clock_out) isn't editable.
                                const isOpen = s.clock_out === null;
                                return (
                                    <tr key={s.id}>
                                        <td style={cell}>{s.date}</td>
                                        <td style={cell}>{fmtDateTime(s.clock_in)}</td>
                                        <td style={cell}>{isOpen ? "— (open)" : fmtDateTime(s.clock_out)}</td>
                                        <td style={cell}>{fmtMinutes(s.break_time)}</td>
                                        <td style={cell}>{fmtMinutes(s.payable_time)}</td>
                                        <td style={cell}>
                                            <div 
                                                style={{
                                                    display: "flex",
                                                    gap: "6px",
                                                }}
                                            >
                                                {/* Edit: Owner + Manager, completed shifts only. */}
                                                {!isOpen && (
                                                    <button onClick={() => startEdit(s)}>Edit</button>
                                                )}
                                                {/* Delete: Owner only, password-gated. */}
                                                {isOwnerUser && (
                                                    <button onClick={() => startDelete(s)}>Delete</button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {/* ----- Edit shift popup ----- */}
                {editShift && (
                    <div style={overlay}>
                        <div 
                            style={{
                                ...popup,
                                width: "400px",
                            }}
                        >
                            <h3>Edit Shift</h3>

                            <label>Clock In</label>
                            <input 
                                type="datetime-local"
                                value={editData.clock_in}
                                onChange={(e) => setEditData({ ...editData, clock_in: e.target.value })}
                                style={{ width: "100%" }}
                            />

                            <br /><br />

                            <label>Clock Out</label>
                            <input 
                                type="datetime-local"
                                value={editData.clock_out}
                                onChange={(e) => setEditData({ ...editData, clock_out: e.target.value })}
                                style={{ width: "100%" }}
                            />

                            <br /><br />

                            <label>Break (minutes)</label>
                            <input 
                                type="number"
                                value={editData.break_time}
                                onChange={(e) => setEditData({ ...editData, break_time: e.target.value })}
                            />

                            {editError && <div style={{ color: "red", marginTop: "8px" }}>{editError}</div>}

                            <div 
                                style={{
                                    display: "flex", 
                                    gap: "10px",
                                    marginTop: "16px"
                                }}
                            >
                                <button onClick={saveEdit}>Save</button>
                                <button onClick={() => setEditShift(null)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ----- Password-gated shift delete popup ----- */}
                {deleteShift && (
                    <div style={overlay}>
                        <div 
                            style={{
                                ...popup,
                                width: "400px",
                            }}
                        >
                            <h3>Delete this shift?</h3>
                            <p style={{ color: "#a00" }}>
                                This permanently removes the shift. This action cannot be undone.
                            </p>
                            <label>Enter your password to confirm</label>
                            <PasswordInput
                                value={deletePassword}
                                onChange={(e) => setDeletePassword(e.target.value)}
                            />

                            {deleteError && <div style={{ color: "red", marginTop: "8px" }}>{deleteError}</div>}
                            <div 
                                style={{
                                    display: "flex",
                                    gap: "10px",
                                    marginTop: "16px" 
                                }}
                            >
                                <button onClick={confirmDelete} disabled={deletePassword === ""}>Delete Permanently</button>
                                <button onClick={() => setDeleteShift(null)}>Cancel</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

export default Employees;