import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const API_URL = "http://localhost:8000";

function CustomerEstimate() {
    const { token } = useParams();

    const [estimate, setEstimate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Popups
    const [showApprove, setShowApprove] = useState(false);
    const [showRequest, setShowRequest] = useState(false);
    const [signature, setSignature] = useState("");
    const [changeMessage, setChangeMessage] = useState("");
    const [actionError, setActionError] = useState("");

    useEffect(() => {
        loadEstimate();
    }, [token]);

    // PLAIN fetch — no apiFetch, because the customer has no login token.
    async function loadEstimate() {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${API_URL}/public/estimates/${token}`);
            if (!res.ok) {
                throw new Error("This estimate is not available");
            }
            setEstimate(await res.json());
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    async function submitApproval() {
        setActionError("");
        try {
            const res = await fetch(`${API_URL}/public/estimates/${token}/approve`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ signature }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to approve");
            }
            setEstimate(await res.json());
            setShowApprove(false);
            setSignature("");
        } catch (err) {
            setActionError(err.message);
        }
    }

    async function submitRequest() {
        setActionError("");
        try {
            const res = await fetch(`${API_URL}/public/estimates/${token}/request-changes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ change_request: changeMessage }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.detail || "Failed to submit request");
            }
            setEstimate(await res.json());
            setShowRequest(false);
            setChangeMessage("");
        } catch (err) {
            setActionError(err.message);
        }
    }

    function money(value) {
        if (value === undefined || value === null) return "—";
        return `$${Number(value).toFixed(2)}`;
    }

    if (loading) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;
    if (error) return <div style={{ padding: "40px", textAlign: "center", color: "#a00" }}>{error}</div>;
    if (!estimate) return null;

    const canAct = estimate.status === "Awaiting Response";

    return (
        <div 
            style={{
                maxWidth: "900px",
                margin: "0 auto",
                padding: "30px",
                fontFamily: "Arial, sans-serif",
            }}
        >
            <div 
                style={{
                    display: "flex",
                    gap: "30px",
                    alignItems: "flex-start",
                }}
            >
                {/* ---- The estimate itself ---- */}
                <div 
                    style={{
                        flex: "1 1 auto",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "24px",
                    }}
                >
                    {/* NO business header — only recipient info (per spec) */}
                    <div style={{ marginBottom: "20px" }}>
                        <div 
                            style={{
                                fontSize: "0.8em",
                                color: "#777",
                                fontWeight: "bold",
                            }}
                        >
                            RECIPIENT
                        </div>
                        <div>{estimate.client_name}</div>
                        <div>{estimate.address}</div>
                    </div>

                    <h2 style={{ marginBottom: "4px" }}>
                        Estimate #{estimate.estimate_number ? estimate.estimate_number.slice(4) : ""}
                    </h2>
                    <div style={{ color: "#777", marginBottom: "4px" }}>Status: {estimate.status}</div>
                    {estimate.date_sent && (
                        <div style={{ color: "#777", marginBottom: "16px" }}>
                            Sent: {new Date(estimate.date_sent).toLocaleDateString()}
                        </div>
                    )}

                    {estimate.estimate_title && (
                        <div 
                            style={{
                                fontWeight: "bold",
                                fontSize: "1.1em",
                                marginBottom: "12px"
                            }}
                        >
                            {estimate.estimate_title}
                        </div>
                    )}

                    {/* Line items */}
                    <table 
                        style={{
                            width: "100%", 
                            borderCollapse: "collapse",
                            marginBottom: "16px",
                        }}
                    >
                        <thead>
                            <tr style={{ background: "#4a90b8", color: "#fff" }}>
                                <td style={{ padding: "8px" }}>Product/Service</td>
                                <td style={{ padding: "8px" }}>Description</td>
                                <td style={{ padding: "8px", textAlign: "right" }}>Qty</td>
                                <td style={{ padding: "8px", textAlign: "right" }}>Unit</td>
                                <td style={{ padding: "8px", textAlign: "right" }}>Total</td>
                            </tr>
                        </thead>
                        <tbody>
                            {estimate.items.map((it, i) => (
                                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: "8px" }}>{it.name}</td>
                                    <td style={{ padding: "8px" }}>{it.description}</td>
                                    <td style={{ padding: "8px", textAlign: "right" }}>{it.quantity}</td>
                                    <td style={{ padding: "8px", textAlign: "right" }}>{it.unit_price.toFixed(2)}</td>
                                    <td style={{ padding: "8px", textAlign: "right" }}>{it.line_total.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Totals */}
                    <div 
                        style={{
                            marginLeft: "auto",
                            width: "50%",
                        }}
                    >
                        <div 
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "4px 0",
                            }}
                        >
                            <span>Subtotal</span><span>{money(estimate.subtotal)}</span>
                        </div>
                        {estimate.tax_name && (
                            <div 
                                style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    padding: "4px 0",
                                }}
                            >
                                <span>{estimate.tax_name} ({estimate.tax_percentage}%)</span>
                                <span>{money(estimate.tax_amount)}</span>
                            </div>
                        )}
                        <div 
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                padding: "8px 0",
                                fontWeight: "bold",
                                fontSize: "1.1em",
                                borderTop: "2px solid #222",
                            }}
                        >
                            <span>Total</span><span>{money(estimate.total)}</span>
                        </div>
                    </div>

                    {/* Disclaimer */}
                    <div 
                        style={{
                            marginTop: "24px",
                            fontSize: "0.85em",
                            color: "#444",
                        }}
                    >
                        This quote is valid for the next 30 days, after which values may be subject to change.
                        {estimate.disclaimer && <div style={{ marginTop: "8px" }}>{estimate.disclaimer}</div>}
                    </div>

                    {/* Signature (once approved) */}
                    {estimate.signature && (
                        <div 
                            style={{
                                marginTop: "24px",
                                borderTop: "1px solid #ccc",
                                paddingTop: "12px",
                            }}
                        >
                            <div 
                                style={{
                                    fontSize: "0.8em", 
                                    color: "#777",
                                    fontWeight: "bold",
                                }}
                            >
                                APPROVED &amp; SIGNED
                            </div>
                            <div style={{ fontStyle: "italic", fontSize: "1.2em" }}>{estimate.signature}</div>
                            {estimate.signed_date && (
                                <div style={{ color: "#444", fontSize: "0.85em" }}>
                                    {new Date(estimate.signed_date).toLocaleDateString()}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ---- Side panel: total + actions ---- */}
                <div 
                    style={{
                        flex: "0 0 240px",
                        border: "1px solid #ddd",
                        borderRadius: "8px",
                        padding: "20px",
                        position: "sticky", 
                        top: "30px",
                    }}
                >
                    <div style={{ fontSize: "0.85em", color: "#777" }}>Estimate Total</div>
                    <div style={{ fontSize: "1.8em", fontWeight: "bold", marginBottom: "16px" }}>
                        {money(estimate.total)}
                    </div>

                    {canAct ? (
                        <>
                            <button onClick={() => setShowApprove(true)}
                                style={{
                                    width: "100%",
                                    padding: "10px",
                                    marginBottom: "8px",
                                }}
                            >
                                Approve 
                            </button>
                            <button onClick={() => setShowRequest(true)}
                                style={{
                                    width: "100%",
                                    padding: "10px",
                                    marginBottom: "8px",
                                }}
                            >
                                Request Changes
                            </button>
                        </>
                    ) : (
                        <div 
                            style={{
                                color: "#777",
                                fontSize: "0.9em",
                                marginBottom: "8px",
                            }}
                        >
                            {estimate.status === "Approved" && "You approved this estimate."}
                            {estimate.status === "Awaiting Changes" && "Your change request has been submitted."}
                        </div>
                    )}

                    <a 
                        href={`${API_URL}/public/estimates/${token}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <button style={{ width: "100%", padding: "10px" }}>Download PDF</button>
                    </a>
                </div>
            </div>

            {/* ---- Approve popup ---- */}
            {showApprove && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <h3>Approve Estimate</h3>
                        <p>Type your full name to sign and approve this estimate.</p>
                        <input 
                            value={signature}
                            onChange={(e) => setSignature(e.target.value)}
                            placeholder="Your full name"
                            style={{
                                width: "100%",
                                padding: "8px",
                                marginBottom: "12px"
                            }}
                        />
                        {actionError && <div style={{ color: "red", marginBottom: "8px" }}>{actionError}</div>}
                        <div
                            style={{
                                display: "flex",
                                gap: "10px", 
                            }}
                        >
                            <button onClick={submitApproval} disabled={signature.trim() === ""}>Approve</button>
                            <button onClick={() => { setShowApprove(false); setActionError(""); }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- Request changes popup ---- */}
            {showRequest && (
                <div style={overlayStyle}>
                    <div style={modalStyle}>
                        <h3>Request Changes</h3>
                        <p>Describe the changes you'd like.</p>
                        <textarea
                            value={changeMessage}
                            onChange={(e) => setChangeMessage(e.target.value)}
                            style={{
                                width: "100%",
                                minHeight: "100px",
                                padding: "8px",
                                marginBottom: "12px",
                            }}
                        />
                        {actionError && <div style={{ color: "red", marginBottom: "8px" }}>{actionError}</div>}
                        <div 
                            style={{
                                display: "flex",
                                gap: "10px",
                            }}
                        >
                            <button onClick={submitRequest} disabled={changeMessage.trim() === ""}>Submit Request</button>
                            <button onClick={() => { setShowRequest(false); setActionError(""); }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const overlayStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0,0,0,.5)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
};

const modalStyle = {
    backgroundColor: "white",
    padding: "20px",
    borderRadius: "10px",
    width: "400px",
};

export default CustomerEstimate;