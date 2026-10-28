// Customer lands here if they backed out / cancelled on Stripe's checkout page
// WITHOUT paying (this also covers "gave up after a declined card"). The invoice
// is unchanged (still unpaid). We reassure them nothing was charged and tell
// them how to try again (the pay link in their email still works).
function PayCancel() {
    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>—</div>
                <h1 style={{ margin: "0 0 12px" }}>Payment Cancelled</h1>
                <p style={{ color: "#555", lineHeight: 1.5 }}>
                    No payment was made and you haven't been charged. If you'd like 
                    to pay, you can use the "Pay Online" button in your invoice email 
                    again at any time.
                </p>
                <p
                    style={{
                        color: "#777",
                        fontSize: "0.9em",
                        marginTop: "20px",
                    }}
                >
                    Need help? Just reply to the email we sent you.
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

export default PayCancel;