import { useState } from "react";

// Sentinel value for the "+ New Item" dropdown option. Lives here since it's
// only meaningful inside this editor's dropdown.
const NEW_ITEM = "__new__";

// -------------------------------------------------------------------------
//   LINE-ITEM EDITOR: a list of objects (catalog picker + new-item entry)
// -------------------------------------------------------------------------

function LineItemEditor({ items, catalog, onChange }) {
    
    // Which catalog item is selected in the dropdown: "" (none), a catalog id,
    // or NEW_ITEM. Kept as a string because <select> values are strings.
    const [selectedCatalogId, setSelectedCatalogId] = useState("");

    // Fields for the line being built.
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [unitPrice, setUnitPrice] = useState("");
    const [quantity, setQuantity] = useState("");

    // Are we entering a brand-new catalog item (vs. picking an existing one)?
    const isNew = selectedCatalogId === NEW_ITEM;

    // When the dropdown changes, fill name/description from the chosen catalog
    // item (locked), or clear them for a new item.
    function handleSelect(value) {
        setSelectedCatalogId(value)

        if (value === "" || value === NEW_ITEM) {
            setName("");
            setDescription("");
        } else {
            const item = catalog.find((c) => String(c.id) === value);
            if (item) {
                setName(item.name);
                setDescription(item.description ?? "");
            }
        }
        // Price/quantity always reset on a fresh selection.
        setUnitPrice("");
        setQuantity("");
    }

    // ----------- Validation -------------
    const priceNum = Number(unitPrice);
    const qtyNum = Number(quantity);

    const priceValid = unitPrice !== "" && !isNaN(priceNum) && priceNum >= 0;
    const qtyValid = quantity !== "" && !isNaN(qtyNum) && qtyNum > 0;
    const nameValid = name.trim() !== "";

    // For a NEW item, block a name that already exists in the catalog.
    const nameCollision = isNew && catalog.some((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    const canAdd = selectedCatalogId !== "" && nameValid && priceValid && qtyValid && !nameCollision;

    function handleAdd() {
        onChange([
            ...items,
            {
                name: name,
                description: description,
                unit_price: priceNum,
                quantity: qtyNum,
            },
        ]);
        // Reset for the next line
        setSelectedCatalogId("");
        setName("");
        setDescription("");
        setUnitPrice("");
        setQuantity("");
    }

    function handleRemoveLine(index) {
        onChange(items.filter((_, i) => i !== index));
    }

    const subtotal = items.reduce((s, it) => s + it.unit_price * it.quantity, 0);

    return (
        <div 
            style={{
                border: "1px solid #ccc",
                borderRadius: "6px",
                padding: "12px",
                marginBottom: "12px"
            }}
        >
            
            <strong>Line Items</strong> (subtotal: ${subtotal.toFixed(2)})

            <br /><br />

            {/* Lines already added to this invoice */}
            {items.length === 0 && (
                <div 
                    style={{
                        color: "#888",
                        marginBottom: "10px"
                    }}
                >
                    No line items yet.
                </div>
            )}

            {items.map((it, index) => (
                <div 
                    key={index}
                    style={{
                        display: "flex", 
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: "8px",
                        gap: "10px",
                    }}
                >
                    <div>
                        <strong>{it.name}</strong> — {it.quantity} × ${Number(it.unit_price).toFixed(2)} = ${(it.unit_price * it.quantity).toFixed(2)}
                        <div 
                            style={{
                                fontSize: "0.85em",
                                color: "#555",
                            }}
                        >
                            {it.description}
                        </div>
                    </div>
                    <button onClick={() => handleRemoveLine(index)}>Remove</button>
                </div>
            ))}

            <hr />

            {/* Catalog picker */}
            <label>Item</label>
            <select value={selectedCatalogId} onChange={(e) => handleSelect(e.target.value)}>
                <option value="">-- Select an Item --</option>
                {catalog.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value={NEW_ITEM}>+ New Item</option>
            </select>

            {selectedCatalogId !== "" && (
                <div style={{ marginTop: "10px" }}>

                    {/* Name: editable only for a new item */}
                    <label>Name</label>
                    <input 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={!isNew}
                    />

                    {nameCollision && (
                        <div 
                            style={{
                                color: "red",
                                marginTop: "4px",
                            }}
                        >
                            An item with that name already exists
                        </div>
                    )}

                    <br /><br />

                    {/* Description: full text, editable only for a new item */}
                    <label>Description</label>
                    {isNew ? (
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            style={{
                                width: "100%",
                                minHeight: "80px"
                            }}
                        />
                    ) : (
                        // Existing Item: show the WHOLE description, read-only, fully readable.
                        <div 
                            style={{
                                border: "1px solid #ddd",
                                borderRadius: "4px",
                                padding: "8px",
                                background: "#fafafa",
                                fontSize: "0.9em",
                                whiteSpace: "pre-wrap",
                            }}
                        >
                            {description}
                        </div>
                    )}

                    <br />

                    <label>Unit Price</label>
                    <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />

                    <label>Quantity</label>
                    <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />

                    <br /><br />

                    <button onClick={handleAdd} disabled={!canAdd}>Add Line</button>
                
                </div>
            )}

        </div>
    );
}

export default LineItemEditor;