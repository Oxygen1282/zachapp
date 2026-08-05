import { useState } from "react";

// A reusable search box + "filter by" column dropdown.
//
// Props:
//   columns  - array of { value, label } describing filterable columns.
//              The first one is the default selected column.
//              e.g. [{ value: "name", label: "Name" }, { value: "email", label: "Email" }]
//   onChange - called with { column, text } whenever either changes, so the
//              parent can filter its list. text is lowercased for matching.
//
// This component only reports the current column + text; the PARENT does the
// actual filtering (it knows how to read each column off its own rows).
function SearchFilter({ columns, onChange }) {

    const [column, setColumn] = useState(columns[0].value);
    const [text, setText] = useState("");

    // Report changes upward. Called on both column change and text change.
    function report(nextColumn, nextText) {
        onChange({ column: nextColumn, text: nextText.toLowerCase() });
    }

    function handleColumnChange(e) {
        const next = e.target.value;
        setColumn(next);
        report(next, text);
    }

    function handleTextChange(e) {
        const next = e.target.value;
        setText(next);
        report(column, next);
    }

    return (
        <div 
            style={{
                display: "flex",
                gap: "8px",
                alignItems: "center",
                marginBottom: "16px",
            }}
        >
            <input
                type="text"
                value={text}
                onChange={handleTextChange}
                placeholder="Search..."
                style={{
                    padding: "6px",
                    width: "240px",
                }}
            />

            <span style={{ color: "#777" }}>filter by</span>

            <select
                value={column}
                onChange={handleColumnChange}
                style={{ padding: "6px" }}
            >
                {columns.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                ))}
            </select>
        </div>
    );
}

export default SearchFilter;