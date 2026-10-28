import { useState, useEffect } from "react";

import { apiFetch } from "../auth/apiFetch";
import { useAuth } from "../auth/AuthContext";
import { isOwner } from "../auth/permissions";
import { useLoaderData } from "react-router-dom";

const cellStyle = {
    border: "1px solid black",
    padding: "8px",
    textAlign: "left",
};

const popupStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
}

const messageCellStyle = {
    ...cellStyle,
    maxWidth: "400px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
}

// Turn the stored UTC timestamp into the viewer's local date/time string.
function formatTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
}

// -------------------------------------------------------------------------
//
//                              NOTIFICATIONS PAGE
//
// Everyone can see this page (employees need owner broadcasts). The backend
// filters what each role receives — owners get everything, everyone else gets
// only "Owner Message" broadcasts — so there's no role gate on the page itself.
// The composer, though, is owner-only.
// -------------------------------------------------------------------------

function Notifications() {
    const { permissions } = useAuth();

    const [notifications, setNotifications] = useState([]);
    const [loadError, setLoadError] = useState("");
    
    // The notification whose full text is open in the detail popup (or null).
    const [selectedNotification, setSelectedNotification] = useState(null);

    // Owner broadcast composer state.
    const [message, setMessage] = useState("");
    const [sendError, setSendError] = useState("");
    const [sending, setSending] = useState(false);

    // Two-stage filter: type buttons remove non-matching rows, then the search
    // box narrows within what's left. "all" = no type restriction.
    const [typeFilter, setTypeFilter] = useState("all");
    const [searchText, setSearchText] = useState("");

    // Broadcast composer now lives in a popup, opened by "New Notification".
    const [showPopup, setShowPopup] = useState(false);

    // The type filter buttons. Label "Owner" maps to the stored "Owner Message"
    // type; everything else matches its stored value directly.
    const TYPE_FILTERS = [
        { label: "All", value: "all" },
        { label: "Timesheets", value: "Timesheets" },
        { label: "Invoices", value: "Invoices" },
        { label: "Estimates", value: "Estimates" },
        { label: "Owner Messages", value: "Owner Message" },
    ];

    const visibleNotifications = notifications.filter((n) => {
        // Stage 1: type. "all" lets everything through.
        if (typeFilter !== "all" && n.type !== typeFilter) return false;

        // Stage 2: text search within the surviving rows (message substring).
        const text = searchText.trim().toLowerCase();
        if (text === "") return true;
        return n.notification_message.toLowerCase().includes(text);
    });

    useEffect(() => {
        loadData();
    }, []);

    // ------ API helpers ------
    async function loadData() {
        setLoadError("");
        try {
            const res = await apiFetch(`/notifications/`);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to load notifications");
            }
            // Backend already returns newest-first.
            setNotifications(await res.json());
        } catch (error) {
            setLoadError(error.message);
        }
    }

    // Open the full-text popup for a notification AND mark it read for this
    // user. Optimistically flips is_read locally so the row greys immediately;
    // the POST persists it. A failed POST just leaves it re-markable.
    async function openNotification(notification) {
        setSelectedNotification(notification);

        if (!notification.is_read) {
            setNotifications((prev) =>
                prev.map((x) => (x.id === notification.id ? { ...x, is_read: true } : x))
            );
            try {
                await apiFetch(`/notifications/${notification.id}/read`, {
                    method: "POST",
                });
            } catch {
                // Ignore - stays re-markable next open
            }
        }
    }

    async function handleMarkAllRead() {
        try {
            const res = await apiFetch(`/notifications/read-all`, {
                method: "POST",
            });
            if (!res.ok) return;
            setNotifications((prev) =>
                prev.map((n) => 
                    ({ ...n, is_read: true })));
        } catch {
            // Ignore
        }
    }

    // Owner broadcast. Reloads afterward so the new "Owner Message" row appears
    // at the top with a real server timestamp.
    async function handleSend() {
        setSendError("");
        const text = message.trim();
        if (text === "") return;

        setSending(true);
        try {
            const res = await apiFetch(`/notifications/owner-message`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to send message");
            }
            setMessage("");
            await loadData();
            setShowPopup(false);
        } catch (error) {
            setSendError(error.message);
        } finally {
            setSending(false);
        }
    }

    const hasUnread = notifications.some((n) => !n.is_read);

    return (
        <div style={{ padding: "20px" }}>
            <div 
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                }}
            >
                <h2 style={{ margin: 0 }}>Notifications</h2>
            </div>

            <div 
                style={{
                    display: "flex",
                    gap: "8px", 
                    alignItems: "center",
                }}
            >
                {/* Owner-only broadcast composer. */}
                {isOwner(permissions) && (
                    <button onClick={() => {
                        setMessage("");
                        setSendError("");
                        setShowPopup(true);
                    }}>
                        New Notification
                    </button>
                )}
                <button onClick={handleMarkAllRead} disabled={!hasUnread}>
                    Mark All Read
                </button>
            </div>

            {loadError && (
                <div style={{ color: "red", marginBottom: "12px" }}>{loadError}</div>
            )}

            {isOwner(permissions) && (
                <div
                    style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        marginBottom: "12px",
                    }}
                >
                    {TYPE_FILTERS.map((t) => (
                        <button 
                            key={t.value}
                            onClick={() => setTypeFilter(t.value)}
                            style={{
                                fontWeight: typeFilter === t.value ? "bold" : "normal",
                                // Selected type reads as active.
                                backgroundColor: typeFilter === t.value ? "#ccc" : "transparent",
                            }}
                        >
                            {t.label}
                        </button>
                    ))}

                    <input 
                        type="text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        placeholder="Search notifications..."
                        style={{
                            padding: "6px",
                            width: "240px",
                            marginLeft: "8px",
                        }}
                    />
                </div>
            )}

            {visibleNotifications.length === 0 ? (
                <div style={{ color: "#888" }}>No Notifications</div>
            ) : (
                <table 
                    style={{
                        borderCollapse: "collapse",
                        width: "100%",
                        maxWidth: "1200px",
                        tableLayout: "fixed",
                    }}
                >
                    <thead>
                        <tr>
                            <th style={cellStyle}>Time</th>
                            <th style={cellStyle}>Type</th>
                            <th style={cellStyle}>Notifications</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleNotifications.map((n) => (
                            <tr
                                key={n.id}
                                onClick={() => openNotification(n)}
                                style={{
                                    // Unread = bright (white), read = darker (grey).
                                    backgroundColor: n.is_read ? "#d9d9d9" : "#ffffff",
                                    color: n.is_read ? "#777" : "#111",
                                    fontWeight: n.is_read ? "normal" : 500,
                                    cursor: n.is_read ? "default" : "pointer",
                                }}
                            >
                                <td style={cellStyle}>{formatTime(n.time)}</td>
                                <td style={cellStyle}>{n.type}</td>
                                <td style={messageCellStyle}>{n.notification_message}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {showPopup && (
                <div 
                    style={ popupStyle }
                    onClick={() => setShowPopup(false)}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: "#fff",
                            padding: "20px",
                            width: "420px", maxWidth: "90%",
                        }}
                    >
                        <h3 style={{ marginTop: 0 }}>Message All Employees</h3>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            rows={4}
                            style={{
                                width: "100%",
                                boxSizing: "border-box",
                            }}
                            placeholder="Write a message to send to everyone..."
                        />
                        <div 
                            style={{
                                marginTop: "12px",
                                display: "flex",
                                gap: "8px",
                                alignItems: "center",
                            }}
                        >
                            <button onClick={handleSend} disabled={sending || message.trim() === ""}>
                                {sending ? "Sending..." : "Send to all"}
                            </button>
                            <button onClick={() => setShowPopup(false)}>Cancel</button>
                            {sendError && <span style={{ color: "red" }}>{sendError}</span>}
                        </div>
                    </div>
                </div>
            )}

            {selectedNotification && (
                <div 
                    style={ popupStyle }
                    onClick={() => setSelectedNotification(null)}
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: "#fff",
                            padding: "20px",
                            width: "480px",
                            maxWidth: "90%",
                        }}
                    >
                        <div style={{
                            color: "#777",
                            fontSize: "0.9em",
                            marginBottom: "8px"
                            }}
                        >
                            {selectedNotification.type} · {formatTime(selectedNotification.time)}
                        </div>
                        <div 
                            style={{
                                whiteSpace: "pre-wrap",
                                marginBottom: "16px",
                            }}
                        >
                            {selectedNotification.notification_message}
                        </div>
                        <button onClick={() => setSelectedNotification(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Notifications;