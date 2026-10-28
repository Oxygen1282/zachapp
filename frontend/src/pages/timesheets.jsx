import { useState, useEffect } from "react";
import { apiFetch } from "../auth/apiFetch";

const cell = {
    border: "1px solid black",
    padding: "8px",
};

// Format a minutes count as "Xh Ym".
function formatMinutes(mins) {
    if (mins === null || mins === undefined) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
}

// Format an ISO timestamp as a readable local time.
function formatTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
}

function Timesheets() {

    // The current OPEN shift (or null if not clocked in).
    const [currentShift, setCurrentShift] = useState(null);
    // All past shifts, newest first.
    const [history, setHistory] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [currentRes, historyRes] = await Promise.all([
                apiFetch("/timesheets/current"),
                apiFetch("/timesheets/me"),
            ]);
            // /current returns the open shift or null.
            setCurrentShift(await currentRes.json());
            setHistory(await historyRes.json());
        } catch (err) {
            console.error("Failed to load timesheets:", err);
        } finally {
            setLoading(false);
        }
    }

    // Derived state from the current shift's timestamps.
    const isClockedIn = currentShift !== null;
    const onBreak = isClockedIn && currentShift.break_start && !currentShift.break_end;

    // ----- Clock actions -----
    // Each posts to its endpoint, then reloads so the UI reflects new state.

    async function doAction(path) {
        setError("");
        try {
            const response = await apiFetch(path, { method: "POST" });
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Action Failed");
            }
            await loadData();
        } catch (err) {
            setError(err.message);
        }
    }

    const clockIn = () => doAction("/timesheets/clock-in");
    const clockOut = () => doAction("/timesheets/clock-out");
    const startBreak = () => doAction("/timesheets/break-start");
    const endBreak = () => doAction("/timesheets/break-end");

    if (loading) {
        return <div style={{ padding: "20px" }}>Loading...</div>;
    }

    return (
        <div style={{ padding: "20px" }}>
            <h1>My Timesheet</h1>

            {error && (
                <div 
                    style={{
                        color: "red",
                        marginBottom: "12px",
                    }}
                >
                    {error}
                </div>
            )}

            {/* ----- Clock control panel ----- */}
            <div 
                style={{
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    padding: "16px",
                    marginBottom: "24px",
                    maxWidth: "400px",
                }}
            >

                {!isClockedIn ? (
                    <>
                        <div 
                            style={{
                                marginBottom: "12px",
                                color: "#777",
                            }}
                        >
                            You are clocked out.
                        </div>
                        <button onClick={clockIn}>Clock In</button>
                    </>
                ) : (
                    <>
                        <div style={{ marginBottom: "8px"}}>
                            Clocked in at <strong>{formatTime(currentShift.clock_in)}</strong>
                        </div>
                        <div 
                            style={{
                                marginBottom: "12px",
                                color: onBreak ? "#a00" : "#080",
                            }}
                        >
                            {onBreak ? "On Break" : "On The Clock"}
                            {currentShift.break_time > 0 && ` · break so far: ${formatMinutes(currentShift.break_time)}`}
                        </div>

                        <div
                            style={{
                                display: "flex", 
                                gap: "10px"
                            }}
                        >
                            {/* Clock Out - disabled while on break (state machine) */}
                            <button onClick={clockOut} disabled={onBreak}>
                                Clock Out 
                            </button>

                            {/* Break toggles: Start Break when not on break, End Break when on break */}
                            {!onBreak ? (
                                <button onClick={startBreak}>Start Break</button>
                            ) : (
                                <button onClick={endBreak}>End Break</button>
                            )}
                        </div>

                        {onBreak && (
                            <div 
                                style={{
                                    marginTop: "8px",
                                    fontSize: "0.85em",
                                    color: "#a00"
                                }}
                            >
                                End your break to clock out.
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* ----- Shift history ----- */}
            <h2>History</h2>
            <table 
                style={{
                    width: "100%",
                    borderCollapse: "collapse"
                }}
            >
                <thead>
                    <tr>
                        <th style={cell}>Date</th>
                        <th style={cell}>Clock In</th>
                        <th style={cell}>Clock Out</th>
                        <th style={cell}>Break Time</th>
                        <th style={cell}>Payable Time</th>
                    </tr>
                </thead>
                <tbody>
                    {history.map((s) => (
                        <tr key={s.id}>
                            <td style={cell}>{s.date}</td>
                            <td style={cell}>{formatTime(s.clock_in)}</td>
                            <td style={cell}>{s.clock_out ? formatTime(s.clock_out) : "— (open)"}</td>
                            <td style={cell}>{formatMinutes(s.break_time)}</td>
                            <td style={cell}>{formatMinutes(s.payable_time)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default Timesheets;