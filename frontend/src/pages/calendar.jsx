import { Calendar, momentLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useState, useEffect } from "react";

import moment from "moment";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { canManageContent } from "../auth/permissions";

const localizer = momentLocalizer(moment);

// Dev: hit the backend directly. When you deploy behind Caddy,
// swap this for a relative path ("") or an env var.

function MyCalendar() {
    const { permissions } = useAuth();
    const canEdit = canManageContent(permissions);

    // Use state to manage the date for calendar buttons
    const [date, setDate] = useState(new Date());

    // Use state to manage the view for calendar buttons
    const [view, setView] = useState("month");
    
    // useState to keep the state of the reference date
    const [referenceDate, setReferenceDate] = useState(null);

    // useState to keep the state of events
    const [events, setEvents] = useState([]);

    // useState to keep the state of the popup
    const [showPopup, setShowPopup] = useState(false);

    // useState to keep the state of the selected event
    const [selectedEvent, setSelectedEvent] = useState(null);

    // The in-progress employee name being typed (before it's added to the list).
    const [employeeInput, setEmployeeInput] = useState("");

    const [assignableUsers, setAssignableUsers] = useState([]);

    // useState to edit the selected Event details
    const [editData, setEditData] = useState({
        title: "",
        comments: "",
        employees: [],
    });

    // Load all scheduled jobs from the backend on first render
    useEffect(() => {
        loadEvents();
    }, []);

    // Timezone parsing function to fix timezone mismatch bug
    function parseServerDate(value) {
        // toISOString() always sends UTC, so anything coming back without an
        // explicit timezone is also UTC - tag it as such so new Date() doesn't
        // mistakenly read it as local time.
        const hasZone = /([zZ]|[+-]\d{2}:\d{2})$/.test(value);
        return new Date(hasZone ? value : value + "Z");
    }

    // Convert a backend scheduled_job into a react-big-calander event
    function toEvent(job) {
        return {
            id: job.id,
            title: job.job_name,
            comments: job.job_comments ?? "",
            start: parseServerDate(job.job_start_date),
            end: parseServerDate(job.job_end_date),
            employees: job.employees ?? [],
        };
    }

    // ------ API Helpers ------

    async function loadEvents() {
        try {
            const response = await apiFetch(`/scheduled_jobs/`);
            const data = await response.json();
            setEvents(data.map(toEvent));
        } catch (error) {
            console.error("Failed to load scheduled jobs:", error);
        }

        try {
            const userRes = await apiFetch("/users/assignable");
            setAssignableUsers(await userRes.json());
        } catch (error) {
            console.error("Failed to load assignable users:", error);
        }
    }

    async function createScheduledJob(job) {
        const response = await apiFetch(`/scheduled_jobs/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(job),
        });
        return await response.json();
    }

    async function updateScheduledJob(id, job) {
        const response = await apiFetch(`/scheduled_jobs/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(job),
        });
        return await response.json();
    }

    async function deleteScheduledJob(id) {
        await apiFetch(`/scheduled_jobs/${id}`, {
            method: "DELETE",
        });
    }

    // Map a user id to their name for display (employees are stored as ids).
    function userName(id) {
        const u = assignableUsers.find((x) => x.id === id);
        return u ? u.name : "(unkown)";
    }

    // Events active today: today falls within the event's start–end range.
    // Compares by calendar day (ignoring time), so a multi-day job shows on
    // every day it spans.
    function getTodaysEvents() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);     // start of today

        return events.filter((ev) => {
            const start = new Date(ev.start);
            start.setHours(0, 0, 0, 0);
            const end = new Date(ev.end);
            end.setHours(0, 0, 0, 0);
            // today is on or after start, and on or before end
            return today >= start && today <= end;
        });
    }

    // ----- Handlers -----

    // handle clicking on events
    function handleEventClick(event) {
        setSelectedEvent(event);

        setEditData({
            title: event.title,
            comments: event.comments,
            employees: event.employees ?? [],
        });

        setShowPopup(true);
    }

    // handle selecting a range of dates
    async function handleSlotSelect(slot) {

        console.log(slot);

        // User has not selected first date yet
        if (referenceDate === null) {
            setReferenceDate(slot.start);
            return
        }

        // User selected second date
        let startDate;
        let endDate;

        // Compare the dates to decide which is start and which is end
        if (slot.start < referenceDate) {
            startDate = slot.start;
            endDate = referenceDate;
        } else {
            startDate = referenceDate;
            endDate = slot.start;
        }

        // include the date selected
        let finalEndDate = endDate;

        if (view === "month") {
            finalEndDate = new Date(endDate);
            finalEndDate.setDate(finalEndDate.getDate() + 1);
        }

        // Build the payload the backend expects
        const newJob = { 
            job_name: "New Job",
            job_comments: "",
            job_start_date: startDate.toISOString(),
            job_end_date: finalEndDate.toISOString(),
        };

        try {
            await createScheduledJob(newJob);
            await loadEvents();
        } catch (error) {
            console.error("failed to create scheduled job:", error);
        }

        // Reset for next selection
        setReferenceDate(null);
    }

    async function saveChanges() {

        // Dates are required by the schema, so we resend the existing ones.
        // (Note: the backend update service currently ignores date changes.)

        const updatedJob = {
            job_name: editData.title,
            job_comments: editData.comments,
            job_start_date: selectedEvent.start.toISOString(),
            job_end_date: selectedEvent.end.toISOString(),
            employees: editData.employees,
        };

        try {
            await updateScheduledJob(selectedEvent.id, updatedJob);
            await loadEvents();
        } catch (error) {
            console.error("Failed to upadate scheduled job:", error);
        }

        setShowPopup(false);
    }

    async function deleteJob() {

        try {
            await deleteScheduledJob(selectedEvent.id);
            await loadEvents();
        } catch (error) {
            console.error("Failed to delete scheduled job:", error);
        }

        setShowPopup(false);
        setSelectedEvent(null);
    }

    // Add an employee by id (from the dropdown). Duplicate-guarded by the
    // dropdown filter, but checked here too.
    function addEmployee(id) {
        if (editData.employees.includes(id)) return;
        setEditData({ ...editData, employees: [...editData.employees, id] });
    }

    // Remove an employee by id.
    function removeEmployee(id) {
        setEditData({
            ...editData,
            employees: editData.employees.filter((e) => e !== id),
        });
    }

    const todaysEvents = getTodaysEvents();

    return (
        <div
            style={{
                height: "100vh",
            padding: "20px",
            }}
        >
            
            {/* Row: calendar on the left, today's detail panel on the right */}
            <div
                style={{
                    display: "flex",
                    gap: "16px",
                    height: "80vh",
                }}
            >
    
                {/* Calendar — takes the remaining space */}
                <div style={{ flexGrow: 1 }}>
                    <Calendar
                        localizer={localizer}
                        events={events}

                        selectable={canEdit}

                        date={date}
                        onNavigate={(newDate) => setDate(newDate)}

                        view={view}
                        onView={(newView) => setView(newView)}

                        longPressThreshold={10}
                        
                        onSelectSlot={canEdit ? handleSlotSelect : undefined}

                        onSelectEvent={handleEventClick}

                        startAccessor="start"
                        endAccessor="end"         
                    />
                </div>

                {/* Today's detail panel — fixed width on the right */}
                <div 
                    style={{
                        width: "300px",
                        flexShrink: 0,
                        border: "1px solid #ccc",
                        borderRadius: "8px",
                        padding: "12px",
                        overflowY: "auto",
                    }}
                >
                    <h3 style={{ marginTop: 0 }}>Today's Schedule</h3>

                    {todaysEvents.length === 0 ? (
                        <div style={{ color: "#888" }}>Nothing scheduled today.</div>
                    ) : (
                        todaysEvents.map((ev) => (
                            <div 
                                key={ev.id}
                                style={{
                                    borderBottom: "1px solid #eee",
                                    paddingBottom: "10px",
                                    marginBottom: "10px"
                                }}
                            >
                                <div style={{ fontWeight: "bold" }}>{ev.title}</div>
                                {ev.comments && (
                                    <div 
                                        style={{
                                            fontSize: "0.9em",
                                            color: "#555",
                                            marginTop: "4px",
                                        }}
                                    >
                                        {ev.comments}
                                    </div>
                                )}

                                <div 
                                    style={{
                                        fontSize: "0.85em",
                                        marginTop: "6px",
                                    }}
                                >
                                    <strong>Assigned:</strong>{" "}
                                    {ev.employees && ev.employees.length > 0
                                        ? ev.employees.map((id) => userName(id)).join(", ")
                                        : "No one assigned"}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {showPopup && (

                <div
                    style={{
                        display: showPopup ? "flex" : "none",
                        position:"fixed",
                        top:0,
                        left:0,
                        width:"100%",
                        height:"100%",
                        backgroundColor:"rgba(0,0,0,.5)",
                        justifyContent:"center",
                        alignItems:"center",
                        zIndex: 9999,
                    }}
                >

                    <div 
                        style={{
                            backgroundColor:"white",
                            padding:"20px",
                            borderRadius:"10px",
                            width:"400px"
                        }}
                    >

                        <h2>Job Details</h2>

                        <label>Title</label>

                        <input
                            value={editData.title}
                            onChange={(e) => setEditData({...editData, title: e.target.value})}
                            disabled={!canEdit}
                        />
                        
                        <br/><br/>

                        <label>Comments</label>

                        <textarea
                            value={editData.comments}
                            onChange={(e) => setEditData({ ...editData, comments: e.target.value})}
                            disabled={!canEdit}
                        />

                        <br/><br/>

                        <label>Employees</label>
                        {canEdit ? (
                            <div
                                style={{
                                    border: "1px solid #ccc",
                                    borderRadius: "6px", 
                                    padding: "10px",
                                    marginBottom: "10px"
                                }}
                            >
                                {editData.employees.length === 0 && (
                                    <div 
                                        style={{
                                            color: "#888",
                                            marginBottom: "8px",
                                        }}
                                    >
                                        No employees assigned.
                                    </div>
                                )}

                                {editData.employees.map((id) => (
                                    <div
                                        key={id}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: "4px"
                                        }}
                                    >
                                        <span>{userName(id)}</span>
                                        <button onClick={() => removeEmployee(id)}>Remove</button>
                                    </div>
                                ))}

                                {/* Add via dropdown of assignable users not already added */}
                                <div 
                                    style={{
                                        display: "flex",
                                        gap: "6px",
                                        marginTop: "6px",
                                    }}
                                >
                                    <select 
                                        value=""
                                        onChange={(e) => { if (e.target.value) addEmployee(Number(e.target.value)); }}
                                    >
                                        <option value="">-- Add employee --</option>
                                        {assignableUsers
                                            .filter((u) => !editData.employees.includes(u.id))
                                            .map((u) => (
                                                <option key={u.id} value={u.id}>
                                                    {u.name} ({u.permissions})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            // Read-only: just the assigned names, no controls
                            <div 
                                style={{
                                    border: "1px solid #ccc",
                                    borderRadius: "6px",
                                    padding: "10px",
                                    marginBottom: "10px"
                                }}
                            >
                                {editData.employees.length === 0 ? (
                                    <div style={{ color: "#888" }}>No employees assigned.</div>
                                ) : (
                                    editData.employees.map((id) => (
                                        <div key={id}>{userName(id)}</div>
                                    ))
                                )}
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
                                    <button onClick={saveChanges}>Save</button>
                                )}
                                <button onClick={() => setShowPopup(false)}>Close</button>
                            </div>

                            {canEdit && (
                                <button onClick={deleteJob}>Delete</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
            
    );
}

export default MyCalendar;