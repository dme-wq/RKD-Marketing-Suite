"use client";

import { useState, useRef, useEffect } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface FilterBarProps {
  /** All rows to filter over */
  allRows: any[];
  /** Column names to use as filter dimensions (in order) */
  cols: string[];
  /** Current active filter values — Record<colName, value> */
  filters: Record<string, string>;
  /** Called whenever any filter changes */
  onChange: (filters: Record<string, string>) => void;
  /** Result count to display */
  resultCount: number;
  /** Accent color for this bar: 'purple' | 'green' */
  accent?: "purple" | "green";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const accentMap = {
  purple: {
    badge: "#6366f1",
    activeBg: "#ede9fe",
    activeText: "#4f46e5",
    activeBorder: "#6366f1",
    icon: "#6366f1",
    clearBg: "#fff1f2",
    clearText: "#ef4444",
    clearBorder: "#ef4444",
  },
  green: {
    badge: "#10b981",
    activeBg: "#d1fae5",
    activeText: "#065f46",
    activeBorder: "#10b981",
    icon: "#10b981",
    clearBg: "#fff1f2",
    clearText: "#ef4444",
    clearBorder: "#ef4444",
  },
};

function getUniqueVals(rows: any[], col: string): string[] {
  const set = new Set<string>();
  rows.forEach(r => {
    const v = String(r[col] ?? "").trim();
    if (v) set.add(v);
  });
  return Array.from(set).sort();
}

// ─── SearchableDropdown ───────────────────────────────────────────────────────
interface SearchableDropdownProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  accent: typeof accentMap["purple"];
  placeholder?: string;
  disabled?: boolean;
}

function SearchableDropdown({ label, options, value, onChange, accent, placeholder = "Search…", disabled }: SearchableDropdownProps) {
  const [open, setOpen]       = useState(false);
  const [search, setSearch]   = useState("");
  const ref                   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const isActive = Boolean(value);

  return (
    <div ref={ref} style={{ display: "flex", flexDirection: "column", gap: 3, position: "relative", minWidth: 160, opacity: disabled ? 0.6 : 1 }}>
      <label style={{ fontSize: "0.65rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 4 }}>
        <i className="fa-solid fa-magnifying-glass" style={{ color: disabled ? "#94a3b8" : accent.icon, fontSize: "0.6rem" }} />
        {label}
        {isActive && (
          <span style={{ marginLeft: "auto", background: accent.badge, color: "white", borderRadius: 99, padding: "0 6px", fontSize: "0.6rem", fontWeight: 800 }}>1</span>
        )}
      </label>

      <div
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0.45rem 0.875rem", borderRadius: 10,
          border: `1.5px solid ${isActive ? accent.activeBorder : "#e2e8f0"}`,
          background: disabled ? "#f8fafc" : isActive ? accent.activeBg : "white",
          cursor: disabled ? "not-allowed" : "pointer", fontSize: "0.88rem", fontWeight: isActive ? 700 : 500,
          color: disabled ? "#94a3b8" : isActive ? accent.activeText : "#475569",
          transition: "all 0.15s", userSelect: "none",
          boxShadow: open ? `0 0 0 3px ${accent.badge}22` : "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>
          {value || placeholder}
        </span>
        <i className={`fa-solid fa-chevron-${open ? "up" : "down"}`} style={{ fontSize: "0.7rem", marginLeft: 8, color: "#94a3b8" }} />
      </div>

      {open && !disabled && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 9999, marginTop: 6,
          background: "white", borderRadius: 12, border: "1.5px solid #e2e8f0",
          boxShadow: "0 12px 40px rgba(0,0,0,0.15)", minWidth: 220, maxWidth: 320,
          overflow: "hidden", animation: "dropdownIn 0.2s ease-out"
        }}>
          {/* Internal Styles for animation */}
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes dropdownIn {
              from { opacity: 0; transform: translateY(-10px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}} />

          {/* Search input */}
          <div style={{ padding: "0.75rem", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 8, padding: "0.5rem 0.75rem", border: "1.5px solid #e2e8f0" }}>
              <i className="fa-solid fa-magnifying-glass" style={{ color: "#94a3b8", fontSize: "0.8rem" }} />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${label}...`}
                style={{ border: "none", background: "transparent", outline: "none", fontSize: "0.85rem", color: "#1e293b", width: "100%" }}
              />
              {search && (
                <i className="fa-solid fa-xmark" onClick={() => setSearch("")} style={{ color: "#94a3b8", fontSize: "0.85rem", cursor: "pointer" }} />
              )}
            </div>
          </div>

          {/* Options */}
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            <div
              onClick={() => { onChange(""); setSearch(""); setOpen(false); }}
              style={{ padding: "0.7rem 1rem", fontSize: "0.85rem", color: "#64748b", cursor: "pointer", fontStyle: "italic", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={e => (e.currentTarget.style.background = "#f1f5f9")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <i className="fa-solid fa-circle-xmark" style={{ fontSize: "0.8rem" }} /> Clear selection
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: "2rem 1rem", fontSize: "0.85rem", color: "#94a3b8", textAlign: "center" }}>
                <i className="fa-solid fa-inbox" style={{ display: "block", fontSize: "1.8rem", marginBottom: 10, opacity: 0.3 }} />
                No values found
              </div>
            )}

            {filtered.map(opt => {
              const active = opt === value;
              return (
                <div
                  key={opt}
                  onClick={() => { onChange(opt); setSearch(""); setOpen(false); }}
                  style={{
                    padding: "0.7rem 1rem", fontSize: "0.85rem", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                    background: active ? accent.activeBg : "transparent",
                    color: active ? accent.activeText : "#334155",
                    fontWeight: active ? 700 : 450,
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = "#f8fafc"; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
                  {active && <i className="fa-solid fa-check" style={{ color: accent.badge, fontSize: "0.8rem", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FilterBar (main export) ──────────────────────────────────────────────────
export default function FilterBar({ allRows, cols, filters, onChange, resultCount, accent = "purple" }: FilterBarProps) {
  if (cols.length === 0 || allRows.length === 0) return null;

  const a = accentMap[accent];
  const hasAnyFilter = Object.values(filters).some(Boolean);
  const totalRows = allRows.length;

  // Build smart options: each dropdown only shows values valid
  // given the selections made in ALL OTHER dropdowns.
  const getOptionsForCol = (colName: string): string[] => {
    const filteredRows = allRows.filter(row =>
      Object.entries(filters).every(([fCol, fVal]) => {
        // Skip the current column's own filter so we can see other possible options
        if (!fVal || fCol === colName) return true;
        return String(row[fCol] ?? "").trim() === fVal;
      })
    );
    return getUniqueVals(filteredRows, colName);
  };

  const handleChange = (col: string, val: string) => {
    // When a filter changes, we just update it. 
    // In multi-directional mode, we don't necessarily clear downstream filters 
    // unless the user specifically wants sequential flow. 
    // But for "Smart" filtering, it's better to keep other selections if they are still valid.
    onChange({ ...filters, [col]: val });
  };

  return (
    <div className="container-fluid" style={{
      padding: "1rem 1.5rem",
      borderBottom: "1px solid #e2e8f0",
      background: "linear-gradient(135deg, #f8f9ff 0%, #ffffff 100%)",
      display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "flex-end",
      boxShadow: "inset 0 -2px 10px rgba(0,0,0,0.02)"
    }}>
      {/* Premium Filter Heading */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginRight: 8, paddingBottom: 2 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 14,
          background: `linear-gradient(135deg, ${a.badge} 0%, ${accent === "purple" ? "#818cf8" : "#34d399"} 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 4px 15px ${a.badge}55`,
          color: "white"
        }}>
          <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: "1.1rem" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: "0.65rem", fontWeight: 900, color: a.badge, textTransform: "uppercase", letterSpacing: "0.2em" }}>Smart</span>
          <span style={{ fontSize: "1rem", fontWeight: 800, color: "#1e293b", letterSpacing: "-0.02em" }}>Filter HUB</span>
        </div>
      </div>

      {/* All dropdowns are now enabled and cross-dependent */}
      {cols.map((col, idx) => {
        const options = getOptionsForCol(col);
        return (
          <SearchableDropdown
            key={col}
            label={col}
            options={options}
            value={filters[col] || ""}
            onChange={val => handleChange(col, val)}
            accent={a}
            disabled={false} // All enabled now
            placeholder={`Choose ${col}...`}
          />
        );
      })}

      {/* Divider */}
      <div style={{ width: 1, height: 44, background: "#e2e8f0", alignSelf: "center", margin: "0 0.5rem" }} />

      {/* Result count badge */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end", paddingBottom: 2 }}>
        <label style={{ fontSize: "0.65rem", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Coverage</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0.45rem 0.9rem", borderRadius: 12, background: "white", border: "1.5px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
          <i className="fa-solid fa-database" style={{ color: a.badge, fontSize: "0.8rem" }} />
          <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#1e293b" }}>{resultCount}</span>
          <span style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 }}>/ {totalRows}</span>
        </div>
      </div>

      {/* Active filter chips */}
      {hasAnyFilter && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", alignSelf: "flex-end", paddingBottom: 2 }}>
          {Object.entries(filters).filter(([, v]) => v).map(([col, val]) => (
            <span key={col} style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "0.35rem 0.85rem", borderRadius: 10,
              background: a.activeBg, color: a.activeText,
              border: `1.5px solid ${a.activeBorder}33`,
              fontSize: "0.82rem", fontWeight: 700,
              boxShadow: "0 2px 4px rgba(0,0,0,0.02)"
            }}>
              <i className="fa-solid fa-tag" style={{ fontSize: "0.7rem", opacity: 0.6 }} />
              <span style={{ color: "#64748b", fontWeight: 600 }}>{col}:</span> {val}
              <i
                className="fa-solid fa-circle-xmark"
                onClick={() => onChange({ ...filters, [col]: "" })}
                style={{ fontSize: "0.85rem", cursor: "pointer", marginLeft: 4, opacity: 0.5, transition: "opacity 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")}
              />
            </span>
          ))}
          <button
            onClick={() => onChange({})}
            style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "0.35rem 1rem", borderRadius: 10,
              background: a.clearBg, color: a.clearText,
              border: `1.5px solid ${a.clearBorder}44`,
              fontSize: "0.82rem", fontWeight: 800, cursor: "pointer",
              transition: "all 0.15s",
              boxShadow: "0 2px 4px rgba(0,0,0,0.05)"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = a.clearText; e.currentTarget.style.color = "white"; }}
            onMouseLeave={e => { e.currentTarget.style.background = a.clearBg; e.currentTarget.style.color = a.clearText; }}
          >
            <i className="fa-solid fa-broom" /> Reset
          </button>
        </div>
      )}
    </div>
  );
}
