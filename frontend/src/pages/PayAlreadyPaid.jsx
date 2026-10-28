// Customer clicked a pay link for an invoice that's ALREADY paid. The backend
// pay endpoint (guard from Piece 3) redirects here instead of creating another
// checkout session — so they can't accidentally pay twice.
function PayAlreadyPaid() {
    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>✓</div>
                <h1 style={{ margin: "0 0 12px" }}>Already Paid</h1>
                <p style={{ color: "#555", lineHeight: 1.5 }}>
                    This invoice has already been paid — no further payment is needed.
                    Thank you!
                </p>
                <p
                    style={{
                        color: "#777",
                        fontSize: "0.9em",
                        marginTop: "20px",
                    }}
                >
                    Questions? Just reply to the email we sent you.
                </p>
            </div>
        </div>
    );
}

const pageStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center", 
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    padding: "20px",
};

const cardStyle = {
    backgroundColor: "white",
    padding: "40px",
    borderRadius: "12px",
    maxWidth: "440px",
    textAlign: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
};

export default PayAlreadyPaid;