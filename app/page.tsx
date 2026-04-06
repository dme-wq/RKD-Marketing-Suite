"use client";

import { useState, useEffect, useRef } from "react";
import s from "./page.module.css";
import FilterBar from "./FilterBar";

type TabInfo    = { tabName: string; columns: string[] };
type ModalType  = "addTab" | "deleteRow" | null;
type ViewType   = "entry" | "edit" | "sent";

const STATUS_SENT = "WhatsApp Sent";
const POLL_INTERVAL_MS = 30_000; // Realtime sync: poll Google Sheet every 30s

export default function Home() {
  const [tabs, setTabs]                 = useState<TabInfo[]>([]);
  const [activeTab, setActiveTab]       = useState("");
  const [columns, setColumns]           = useState<string[]>([]);
  const [existingRows, setExistingRows] = useState<any[]>([]);
  const [newRows, setNewRows]           = useState<any[]>([{}]);
  const [view, setView]                 = useState<ViewType>("entry");
  const [sidebarOpen, setSidebarOpen]   = useState(false); // Sidebar hidden by default

  const [whatsappTemplate, setWhatsappTemplate] = useState(
    "Hello {{First Name}},\n\nPlease find our latest catalog here: {{Link}}\n\nBest Regards!"
  );
  const [mediaUrls, setMediaUrls]       = useState<{ url: string; name: string; mimeType?: string; base64?: string }[]>([]);
  const [countryCode, setCountryCode]   = useState("91");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  // ── Looker-Studio style filters ────────────────────────────────────────────
  const [editFilters, setEditFilters]   = useState<Record<string, string>>({});
  const [sentFilters, setSentFilters]   = useState<Record<string, string>>({});

  // Modal
  const [modal, setModal]               = useState<ModalType>(null);
  const [modalInput, setModalInput]     = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: "success" | "danger" | "info" } | null>(null);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const modalInputRef  = useRef<HTMLInputElement>(null);
  const importFileRef  = useRef<HTMLInputElement>(null);
  const pollTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  // Import state
  const [importModal, setImportModal]         = useState(false);
  const [importParsed, setImportParsed]       = useState<any[]>([]);
  const [importSkipped, setImportSkipped]     = useState<any[]>([]);
  const [importLoading, setImportLoading]     = useState(false);
  const [importFileName, setImportFileName]   = useState("");

  const showToast = (msg: string, type: "success" | "danger" | "info" = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => { 
    fetchTabs(); 
    fetchTemplate();
  }, []);
  useEffect(() => {
    if (modal === "addTab") setTimeout(() => modalInputRef.current?.focus(), 100);
  }, [modal]);

  // ✅ REALTIME SYNC: Auto-poll Google Sheet every 30s silently
  useEffect(() => {
    if (!activeTab) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/sheets?action=getRows&tabName=${activeTab}`);
        const data = await res.json();
        if (data.success) setExistingRows(data.data);
      } catch { /* silent fail */ }
    }, POLL_INTERVAL_MS);
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, [activeTab]);

  const fetchTabs = async () => {
    try {
      const res  = await fetch("/api/sheets?action=getTabsAndColumns");
      const data = await res.json();
      if (data.success && data.tabs.length > 0) {
        setTabs(data.tabs);
        if (!activeTab) {
          setActiveTab(data.tabs[0].tabName);
          setColumns(data.tabs[0].columns);
        }
      }
    } catch { showToast("Failed to load sheet data", "danger"); }
  };

  const fetchRows = async (tab: string) => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/sheets?action=getRows&tabName=${tab}`);
      const data = await res.json();
      if (data.success) { setExistingRows(data.data); setSelectedRows(new Set()); }
    } catch { showToast("Error loading records", "danger"); }
    setLoading(false);
  };

  const fetchTemplate = async () => {
    try {
      const res = await fetch("/api/sheets?action=getTemplate");
      const data = await res.json();
      if (data.success && data.template) {
        setWhatsappTemplate(data.template);
      }
    } catch { /* ignore silently on load */ }
  };

  const saveTemplate = async () => {
    setTemplateSaving(true);
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveTemplate", template: whatsappTemplate }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("✅ Template saved successfully!", "success");
      } else {
        showToast(`Failed to save template: ${data.error}`, "danger");
      }
    } catch (err: any) {
      showToast(`Error saving template: ${err.message}`, "danger");
    } finally {
      setTemplateSaving(false);
    }
  };

  useEffect(() => {
    if (activeTab) fetchRows(activeTab);
  }, [activeTab]);

  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);
    const t = tabs.find(x => x.tabName === tabName);
    if (t) { setColumns(t.columns); setNewRows([{}]); setSelectedRows(new Set()); }
  };

  const handleCellChange = (ri: number, col: string, val: string) => {
    const d = [...newRows];
    d[ri] = { ...d[ri], [col]: val };
    setNewRows(d);
  };

  const statusCol   = columns.find(c => c.toLowerCase() === "status");
  const STATUS_SENT = "WhatsApp Sent";
  const sentRows    = existingRows.filter(r => statusCol && r[statusCol] === STATUS_SENT);
  const editRows    = existingRows; // Edit view shows ALL rows

  // ── Filter columns available for dropdowns (non-auto, non-upload) ──────────
  const filterableCols = columns.filter(c => {
    const cl = c.toLowerCase();
    return !cl.includes("timestamp") && !cl.includes("time") && !cl.includes("upload") && !cl.includes("link") && !cl.includes("url") && !cl.includes("status");
  });

  // ── Apply filters to rows ──────────────────────────────────────────────────
  const filteredEditRows = editRows.filter((row: any) =>
    Object.entries(editFilters).every(([col, val]) =>
      !val || String(row[col] ?? "").trim() === val
    )
  );
  const filteredSentRows = sentRows.filter((row: any) =>
    Object.entries(sentFilters).every(([col, val]) =>
      !val || String(row[col] ?? "").trim() === val
    )
  );

  // ── Manual refresh ────────────────────────────────────────────────────────
  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const res  = await fetch(`/api/sheets?action=getRows&tabName=${activeTab}`);
      const data = await res.json();
      if (data.success) { setExistingRows(data.data); showToast("✅ Data refreshed!", "success"); }
      else showToast("Refresh failed", "danger");
    } catch { showToast("Refresh failed", "danger"); }
    setRefreshing(false);
  };

  // Columns visible in the Entry form (hide auto-managed ones)
  const autoManagedCols = (col: string) => {
    const cl = col.toLowerCase();
    return cl.includes("timestamp") || cl.includes("time") || cl === "status" || cl.includes("upload file") || cl.includes("mediaurls");
  };
  const entryColumns = columns.filter(col => !autoManagedCols(col));

  // Find key column names dynamically
  const mobileColName     = columns.find(c => /(mobile|phone|number)/i.test(c)) || columns[2];
  const uploadLinkColName = columns.find(c => /upload.?file/i.test(c));

  const toggle = (globalIdx: number) => {
    const s2 = new Set(selectedRows);
    s2.has(globalIdx) ? s2.delete(globalIdx) : s2.add(globalIdx);
    setSelectedRows(s2);
  };

  // ── Update specific cell in Google Sheet ──────────────────────────────────
  const updateArchiveCell = async (rowIndex: number, colName: string, value: string) => {
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateCell", tabName: activeTab, rowIndex, columnName: colName, value }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Saved ${colName}!`, "success");
      } else {
        showToast(`Failed to save: ${data.error}`, "danger");
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, "danger");
    }
  };

  const handleArchiveCellEdit = (globalIdx: number, col: string, val: string) => {
    const d = [...existingRows];
    d[globalIdx] = { ...d[globalIdx], [col]: val };
    setExistingRows(d);
  };

  // ── Helper: Transform Google Drive view links to direct download ─────────
  const toDirectLink = (url: string, filename?: string) => {
    if (!url) return url;
    let finalUrl = url;
    
    const driveMatch = url.match(/[-\w]{25,}/);
    if (url.includes("drive.google.com") && driveMatch) {
      if (url.includes("webContentLink") || url.includes("export=download")) {
        finalUrl = url; // Already direct
      } else {
        finalUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[0]}`;
      }
      
      // Append filename to the end to help WhatsApp detect extension
      if (filename) {
        // Clean name for URL - remove special chars but keep extension dot
        const cleanName = filename.replace(/[^\w\.\-]/g, "_");
        finalUrl += `&/file=${encodeURIComponent(cleanName)}`;
      }
    }
    return finalUrl;
  };
  
  // ── Helper: Guess MIME type from filename extension ────────────────────────
  const getMimeType = (filename: string) => {
    const ext = filename.toLowerCase().split(".").pop();
    switch (ext) {
      case "pdf":  return "application/pdf";
      case "ppt":  return "application/vnd.ms-powerpoint";
      case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      case "doc":  return "application/msword";
      case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      case "xls":  return "application/vnd.ms-excel";
      case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      case "png":  return "image/png";
      case "jpg":  case "jpeg": return "image/jpeg";
      case "vcf":  return "text/vcard";
      default:     return undefined;
    }
  };

  // ── Update Status cell in Google Sheet ─────────────────────────────────────
  const updateSheetStatus = async (rowSheetIndex: number, status: string) => {
    await fetch("/api/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "updateStatus", tabName: activeTab, rowIndex: rowSheetIndex, status }),
    });
  };

  // ── Import contacts from VCF / CSV / XLSX ───────────────────────────────────
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true);
    setImportFileName(file.name);
    showToast(`Parsing ${file.name}…`, "info");

    // Find mobile column dynamically for dedup
    const mobileColName = columns.find(c =>
      /(mobile|phone|tel|number)/i.test(c)
    );
    const existingPhones = existingRows
      .map(r => mobileColName ? r[mobileColName] || "" : "")
      .filter(Boolean)
      .map((n: string) => n.toString().replace(/'/g, "").replace(/\D/g, ""));

    const fd = new FormData();
    fd.append("file", file);
    fd.append("existingPhones", JSON.stringify(existingPhones));
    fd.append("columns", JSON.stringify(columns));

    try {
      const res  = await fetch("/api/import", { method: "POST", body: fd });
      const data = await res.json();
      if (data.success) {
        setImportParsed(data.contacts);
        setImportSkipped(data.skipped);
        setImportModal(true);
        showToast(
          `Found ${data.total} contacts — ${data.contacts.length} new, ${data.skipped.length} already in sheet.`,
          data.contacts.length > 0 ? "success" : "info"
        );
      } else {
        showToast("Import failed: " + data.error, "danger");
      }
    } catch (err: any) {
      showToast("Import error: " + err.message, "danger");
    }
    setImportLoading(false);
    if (importFileRef.current) importFileRef.current.value = "";
  };

  const confirmImport = () => {
    if (!importParsed.length) return;

    const timestamp = getIST();

    // Use columns.find() with regex for reliable fuzzy matching
    const colFor = (...patterns: RegExp[]) =>
      columns.find(col => patterns.some(p => p.test(col)));

    const timestampCol = columns[0];                                   // Always index 0
    const nameCol      = colFor(/first.?name/i, /^name$/i);
    const mobileCol    = colFor(/mobile/i, /phone/i, /number/i);
    const companyCol   = colFor(/company/i, /org/i);
    const linkCol      = colFor(/link/i, /url/i, /web/i);
    const aliasCol     = colFor(/alias/i, /nick/i);
    const statusCol2   = colFor(/status/i);

    const mapped = importParsed.map(c => {
      const row: any = {};
      // Default all columns to empty string first
      columns.forEach(col => { row[col] = ""; });
      // Then fill in specific values
      if (timestampCol) row[timestampCol] = timestamp;
      if (nameCol)      row[nameCol]      = c.name    || "";
      if (mobileCol)    row[mobileCol]    = c.mobile  || "";
      if (aliasCol)     row[aliasCol]     = c.alias   || "";
      if (statusCol2)   row[statusCol2]   = "";          // Status always blank on import
      return row;
    });

    setNewRows(mapped);
    setImportModal(false);
    setView("entry");
    showToast(`✅ ${mapped.length} contacts loaded! Review & click "Save Contact" to save.`, "success");
  };


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;
    setLoading(true);
    const updatedMedia = [...mediaUrls];
    for (let i = 0; i < files.length; i++) {
      showToast(`Uploading ${i + 1}/${files.length}: ${files[i].name}`, "info");

      // ✅ Step 1: Read file as base64 in browser memory (for direct WhatsApp sending — 100% reliable)
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(files[i]);
      });

      // ✅ Step 2: Upload to Google Drive (only for saving the link in Google Sheet)
      const fd = new FormData();
      fd.append("file", files[i]);
      try {
        const res  = await fetch("/api/drive", { method: "POST", body: fd });
        const data = await res.json();
        if (data.success) {
          updatedMedia.push({ 
            url: data.downloadLink || data.link, 
            name: files[i].name,
            mimeType: files[i].type || data.mimeType,
            base64, // ✅ Store base64 so WhatsApp always gets proper file type
          });
        } else {
          // Drive upload failed but we still have base64 — keep it with empty URL
          updatedMedia.push({ url: "", name: files[i].name, mimeType: files[i].type, base64 });
        }
      } catch { showToast(`Upload failed: ${files[i].name}`, "danger"); }
    }
    setMediaUrls(updatedMedia);
    showToast(`${files.length} file(s) ready! Save Contact to send via WhatsApp.`, "success");
    setLoading(false);
  };

  const getIST = () => new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit",
    year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });

  const insertTag = (tag: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const s2 = el.selectionStart, e2 = el.selectionEnd;
    const v  = whatsappTemplate;
    setWhatsappTemplate(v.slice(0, s2) + ` {{${tag}}}` + v.slice(e2));
    setTimeout(() => el.setSelectionRange(s2 + tag.length + 5, s2 + tag.length + 5), 0);
  };

  const submitData = async () => {
    if (!newRows.some(r => Object.values(r).some(v => v))) {
      showToast("Please fill at least one row completely", "danger"); return;
    }

    // ─── Duplicate Checker for Current Tab ─────────────────────────────────────
    const normalize = (val: any) => String(val || "").replace(/\D/g, "").slice(-10);
    const existingMobiles = existingRows.map(r => normalize(r[mobileColName]));
    
    for (const row of newRows) {
      const newMob = normalize(row[mobileColName]);
      if (newMob && existingMobiles.includes(newMob)) {
        showToast(`🚫 Duplicate found: Number "${newMob}" already exists in ${activeTab}!`, "danger");
        return;
      }
    }

    setLoading(true);
    showToast("Saving to Google Sheets…", "info");
    try {
      // Build the upload file link string from current mediaUrls (Filename::URL format)
      const uploadLink = mediaUrls.map(m => `${m.name}::${m.url}`).join(", ");

      const rows = newRows.map(row => columns.map((col, i) => {
        if (i === 0) return getIST();
        if (col === mobileColName && row[col])
          return `'${countryCode}${row[col].toString().replace(/\s/g, "")}`;
        if (col === uploadLinkColName) return uploadLink;
        return row[col] || "";
      }));

      const res  = await fetch("/api/sheets", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "appendRows", tabName: activeTab, rows }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // ✅ COMBINED FLOW: Sheet saved — now send WhatsApp immediately if files are attached
      if (mediaUrls.length > 0) {
        showToast(`✅ Saved! Sending WhatsApp to ${newRows.length} contact(s)…`, "info");
        let waSent = 0;
        const sentRowPhones: string[] = [];
        for (const row of newRows) {
          const rawPhone = row[mobileColName]?.toString().replace(/\s/g, "");
          if (!rawPhone) continue;
          const phone = `${countryCode}${rawPhone}`;

          // Personalise message
          let baseMsg = whatsappTemplate;
          columns.forEach(c => {
            let val = row[c] || "";
            baseMsg = baseMsg.replace(new RegExp(`{{${c}}}`, "g"), val);
          });
          if (mediaUrls[0]?.url) baseMsg = baseMsg.replace(/{{Link}}/g, mediaUrls[0].url);

          for (let mi = 0; mi < mediaUrls.length; mi++) {
            const m = mediaUrls[mi];
            const mediaPayload = m.base64 || toDirectLink(m.url, m.name);
            await fetch("/api/whatsapp", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone,
                message: mi === mediaUrls.length - 1 ? baseMsg : "",  // ✅ Message with LAST file
                mediaUrl: mediaPayload,
                filename: m.name,
                mime_type: m.mimeType,
              }),
            });
          }
          sentRowPhones.push(phone);
          waSent++;
        }

        // ✅ Update Status = 'WhatsApp Sent' for each sent row in Sheet
        await fetchRows(activeTab); // Get fresh rows with _index
        const freshRows = await fetch(`/api/sheets?action=getRows&tabName=${activeTab}`)
          .then(r => r.json()).then(d => d.data || []);
        for (const sentPhone of sentRowPhones) {
          const match = freshRows.find((r: any) => {
            const rp = r[mobileColName]?.toString().replace(/'/g, "").replace(/\D/g, "").slice(-10);
            const sp = sentPhone.replace(/\D/g, "").slice(-10);
            return rp === sp;
          });
          if (match?._index) await updateSheetStatus(match._index, STATUS_SENT);
        }

        showToast(`✅ Saved & WhatsApp sent to ${waSent} contact(s)!`, "success");
      } else {
        showToast(`✅ ${newRows.length} record(s) saved!`, "success");
      }

      setNewRows([{}]);
      setMediaUrls([]);  // ✅ Clear uploaded files after save
      // ✅ REALTIME REFRESH: Immediately update the table after save
      await fetchRows(activeTab);

    } catch (err: any) { showToast("Save failed: " + err.message, "danger"); }
    setLoading(false);
  };

  // ─── SEND WHATSAPP ──────────────────────────────────────────────────────────
  const handleSendWhatsApp = async () => {
    if (!selectedRows.size) return;
    setLoading(true);
    showToast(`Sending WhatsApp to ${selectedRows.size} contact(s)…`, "info");

    const rowsToSend = Array.from(selectedRows);
    let ok = 0;

    try {
      for (const ri of rowsToSend) {
        const row   = existingRows[ri];
        const phone = row[mobileColName]?.toString().replace(/'/g, "");
        if (!phone) continue;

        // — Determine which media URLs to use:
        // Priority 1: Row’s own "Upload File Link" column (saved when contacts were added)
        // Priority 2: Global mediaUrls (manually uploaded in this session)
        const rowUploadLink = uploadLinkColName ? row[uploadLinkColName]?.toString().trim() : "";
        const rowMediaUrls  = rowUploadLink
          ? rowUploadLink.split(",").map((u: string) => u.trim()).filter(Boolean)
          // ✅ FIX: Always emit "filename::url" format so filename is preserved for WhatsApp
          : mediaUrls.map(m => `${m.name}::${m.url}`);

        // Build personalised message
        let baseMsg = whatsappTemplate;
        columns.forEach(c => { 
          let val = row[c] || "";
          // If value is in internal "Name::URL" format, only show the URL in message
          if (val && val.includes("::")) val = val.split("::").pop() || "";
          baseMsg = baseMsg.replace(new RegExp(`{{${c}}}`, "g"), val); 
        });
        if (rowMediaUrls.length) {
          let firstLink = rowMediaUrls[0];
          if (firstLink.includes("::")) firstLink = firstLink.split("::").pop() || "";
          baseMsg = baseMsg.replace(/{{Link}}/g, firstLink);
        }

        if (!rowMediaUrls.length) {
          // Text-only WhatsApp
          await fetch("/api/whatsapp", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, message: baseMsg }),
          });
        } else {
          // Send each media file; message only on first
          for (let mi = 0; mi < rowMediaUrls.length; mi++) {
            const raw = rowMediaUrls[mi];
            
            // Handle filename::URL format
            let filename = "Attachment";
            let rawUrl   = raw;
            if (raw.includes("::")) {
              const parts = raw.split("::");
              filename = parts[0];
              rawUrl   = parts[1];
            } else {
              // Backward compatibility for old plain-URL entries
              const matchedMedia = mediaUrls.find(m => m.url === raw);
              if (matchedMedia) filename = matchedMedia.name;
              else {
                // Try to guess extension from URL or use a generic one
                const end = raw.split("/").pop() || "";
                if (end.includes(".")) filename = end;
                else if (raw.includes("pdf")) filename = "Document.pdf";
                else if (raw.includes("ppt")) filename = "Presentation.ppt";
              }
            }
            
            const matchedMedia = mediaUrls.find(m => m.url === rawUrl || m.name === filename);
            // ✅ Prefer base64 (stored in memory) → avoids Google Drive redirect/BIN issue
            const mediaPayload = matchedMedia?.base64 || toDirectLink(rawUrl, filename);
            const mimeType = matchedMedia?.mimeType || getMimeType(filename);

            await fetch("/api/whatsapp", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                phone, 
                message: mi === rowMediaUrls.length - 1 ? baseMsg : "",  // ✅ Message with LAST file
                mediaUrl: mediaPayload,
                filename: filename,
                mime_type: mimeType
              }),
            });
          }
        }
        ok++;
      }

      // ✅ Update Status column in Google Sheet for each sent row
      const updatePromises = rowsToSend.map(ri => {
        const sheetRowIndex = existingRows[ri]?._index;
        if (sheetRowIndex) return updateSheetStatus(sheetRowIndex, STATUS_SENT);
      });
      await Promise.all(updatePromises);

      setSelectedRows(new Set());
      showToast(`✅ WhatsApp sent to ${ok} contact(s)! Status updated in Google Sheet.`, "success");

      // Refresh to get latest sheet data
      await fetchRows(activeTab);

    } catch { showToast("WhatsApp send failed. Please try again.", "danger"); }
    setLoading(false);
  };

  // ─── ADD TAB ────────────────────────────────────────────────────────────────
  const confirmAddTab = async () => {
    const name = modalInput.trim();
    if (!name) { showToast("Please enter a tab name", "danger"); return; }
    setModal(null);
    setLoading(true);
    showToast(`Creating tab "${name}"…`, "info");
    try {
      const res  = await fetch("/api/sheets", {
        method: "POST",
        body: JSON.stringify({ action: "createTab", tabName: name }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Tab "${name}" created successfully!`, "success");
        await fetchTabs();
        handleTabChange(name);
      } else throw new Error(data.error);
    } catch (err: any) { showToast("Tab creation failed: " + err.message, "danger"); }
    setLoading(false);
    setModalInput("");
  };

  // ─── DELETE ROW ─────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (deleteTarget === null) return;
    setModal(null);
    setLoading(true);
    try {
      const res  = await fetch("/api/sheets", {
        method: "POST",
        body: JSON.stringify({ action: "deleteRow", tabName: activeTab, rowIndex: deleteTarget }),
      });
      const data = await res.json();
      if (data.success) { showToast("Record deleted.", "success"); fetchRows(activeTab); }
    } catch { showToast("Delete failed", "danger"); }
    setLoading(false);
    setDeleteTarget(null);
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className={s.appShell}>
      {/* SIDEBAR */}
      <aside className={`${s.sidebar} ${sidebarOpen ? "" : s.sidebarClosed}`}>
        <div className={s.sidebarLogo}>
          <div className={s.logoIcon}>
            <img 
              src="https://i.ibb.co/N6Rqrqn1/Background-Image.png" 
              alt="RKD Logo" 
              style={{ width: "100%", height: "100%", objectFit: "contain" }} 
            />
          </div>
          <div className={s.logoText}>
            <span>RKD Marketing</span>
            <span>Marketing Suite</span>
          </div>
        </div>

        <nav className={s.sidebarNav}>
          <div className={s.navSection}>Workspace</div>

          <button
            className={`${s.navItem} ${view === "entry" ? s.navItemActive : ""}`}
            onClick={() => setView("entry")}
          >
            <i className="fa-solid fa-pen-to-square" />
            <span>Add Contacts</span>
          </button>

          <button
            className={`${s.navItem} ${view === "edit" ? s.navItemActive : ""}`}
            onClick={() => setView("edit")}
          >
            <i className="fa-solid fa-table-list" />
            <span>Edit Records</span>
            {existingRows.length > 0 && <span className={s.navBadge} style={{ background: "#6366f1" }}>{existingRows.length}</span>}
          </button>

          <button
            className={`${s.navItem} ${view === "sent" ? s.navItemActive : ""}`}
            onClick={() => setView("sent")}
          >
            <i className="fa-solid fa-circle-check" />
            <span>WhatsApp Sent</span>
            {sentRows.length > 0 && (
              <span className={s.navBadge} style={{ background: "#10b981" }}>{sentRows.length}</span>
            )}
          </button>

          <div className={s.navSection}>Tools</div>

          <button className={s.navItem} onClick={() => setShowTemplate(!showTemplate)}>
            <i className="fa-solid fa-message" />
            <span>Message Template</span>
          </button>

          <button className={s.navItem} onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}>
            <i className="fa-solid fa-photo-film" />
            <span>Upload Media</span>
            {mediaUrls.length > 0 && <span className={s.navBadge} style={{ background: "#f59e0b" }}>{mediaUrls.length}</span>}
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileUpload} />
          </button>
        </nav>

        <div className={s.sidebarFooter}>
          <div className={s.sidebarProfile}>
            <div className={s.avatarDot} style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white" }}>RKD</div>
            <span>Admin</span>
            <div className={s.onlineDot} />
          </div>
        </div>
      </aside>

      {/* MAIN AREA */}
      <div className={`${s.mainArea} ${sidebarOpen ? "" : s.mainAreaFull}`}>
        {/* TOP BAR */}
        <header className={s.topBar}>
          <div className={s.topBarLeft}>
            <button
              className={s.sidebarToggleBtn}
              onClick={() => setSidebarOpen(o => !o)}
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <i className={`fa-solid fa-${sidebarOpen ? "xmark" : "bars"}`} />
            </button>
            <div className={s.breadcrumb}>
              <span className={`${s.chip} ${s.chipPrimary}`}>{activeTab || "No Tab"}</span>
              <i className="fa-solid fa-chevron-right" />
              <span style={{ fontWeight: 700, color: "var(--text-1)" }}>
                {view === "entry" ? "Add Contacts" : view === "edit" ? "Edit Records" : "WhatsApp Sent"}
              </span>
            </div>
          </div>

          <div className={s.topBarCenter}>
            <img src="https://i.ibb.co/N6Rqrqn1/Background-Image.png" alt="RKD Logo" />
            <span>RKD Marketing</span>
            <span>Marketing Suite</span>
          </div>

          <div className={s.topBarRight}>
            <div className={s.countryCodeBox}>
              <label><i className="fa-solid fa-earth-asia" /> Country Code</label>
              <input
                type="text"
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
              />
            </div>

            {/* Import Contacts — small icon button always in topbar */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }} title="Import Contacts (VCF/CSV/XLSX)">
              <button
                className={`${s.topBarBtn} ${s.topBarBtnGhost}`}
                style={{
                  background: importLoading ? "#ede9fe" : "#f5f3ff",
                  border: "1.5px solid #6366f1",
                  color: "#6366f1",
                  padding: "0.5rem 0.75rem",
                  minWidth: "40px",
                  justifyContent: "center"
                }}
                onClick={() => importFileRef.current?.click()}
                disabled={importLoading}
              >
                {importLoading ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-file-import" />}
                <span className={s.btnTextHideMobile} style={{ marginLeft: "4px" }}>Import</span>
              </button>
              <input
                ref={importFileRef}
                type="file"
                accept=".vcf,.csv,.xlsx,.xls"
                hidden
                onChange={handleImportFile}
              />
            </div>

            {/* Refresh button — always visible */}
            <button
              className={`${s.topBarBtn} ${s.topBarBtnGhost}`}
              onClick={handleManualRefresh}
              disabled={refreshing || loading}
              title="Force refresh data from Google Sheet"
              style={{ minWidth: 0, padding: "0.5rem 0.75rem" }}
            >
              <i className={`fa-solid fa-rotate${refreshing ? " fa-spin" : ""}`} />
            </button>

            {view === "edit" || view === "sent" ? (
              <button
                className={`${s.topBarBtn} ${s.topBarBtnGhost}`}
                onClick={() => setView("entry")}
              >
                <i className="fa-solid fa-plus" /> Add Contact
              </button>
            ) : view === "entry" ? (
              <button
                className={`${s.topBarBtn} ${s.topBarBtnPrimary}`}
                onClick={submitData}
                disabled={loading}
                style={mediaUrls.length > 0 ? { background: "#10b981", boxShadow: "0 2px 8px rgba(16,185,129,0.3)" } : {}}
              >
                {mediaUrls.length > 0
                  ? <><i className="fa-brands fa-whatsapp" /> Save & Send WhatsApp</>
                  : <><i className="fa-solid fa-cloud-arrow-up" /> Save Contact</>
                }
              </button>
            ) : null}
          </div>
        </header>

        {/* STATS STRIP */}
        <div className={s.statsStrip}>
          <div className={s.statCard}>
            <div className={`${s.statIconBox} ${s.statIconBlue}`}><i className="fa-solid fa-table" /></div>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Active Sheets</span>
              <span className={s.statValue}>{tabs.length}</span>
            </div>
          </div>
          <div className={s.statCard}>
            <div className={`${s.statIconBox} ${s.statIconPurple}`}><i className="fa-solid fa-users" /></div>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Total Contacts</span>
              <span className={s.statValue}>{existingRows.length}</span>
            </div>
          </div>
          <div className={s.statCard}>
            <div className={`${s.statIconBox} ${s.statIconAmber}`}><i className="fa-solid fa-table-list" /></div>
            <div className={s.statInfo}>
              <span className={s.statLabel}>Total Records</span>
              <span className={s.statValue}>{existingRows.length}</span>
            </div>
          </div>
          <div className={s.statCard}>
            <div className={`${s.statIconBox} ${s.statIconGreen}`}><i className="fa-solid fa-circle-check" /></div>
            <div className={s.statInfo}>
              <span className={s.statLabel}>WhatsApp Sent</span>
              <span className={s.statValue}>{sentRows.length}</span>
            </div>
          </div>
        </div>

        {/* CONTENT GRID */}
        <div className={s.contentGrid}>
          {/* LEFT PANEL */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {/* Tab Selector */}
            <div className={s.panel}>
              <div className={s.panelHeader}>
                <div className={s.panelTitle}><i className="fa-solid fa-table-columns" /> Select Tab</div>
                <button
                  className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
                  onClick={() => { setModal("addTab"); setModalInput(""); }}
                >
                  <i className="fa-solid fa-plus" /> Add Tab
                </button>
              </div>
              <div className={s.panelBody}>
                <div className={s.fieldGroup}>
                  <label className={s.fieldLabel}><i className="fa-solid fa-database" /> Active Workspace</label>
                  <select
                    className={`${s.fieldInput} ${s.fieldSelect}`}
                    value={activeTab}
                    onChange={e => handleTabChange(e.target.value)}
                  >
                    {tabs.map(t => <option key={t.tabName} value={t.tabName}>{t.tabName}</option>)}
                  </select>
                </div>
              </div>
            </div>


            {/* Media Vault */}
            <div className={s.panel}>
              <div className={s.panelHeader}>
                <div className={s.panelTitle}><i className="fa-solid fa-photo-film" /> Media Files</div>
              </div>
              <div className={s.panelBody}>
                <div className={s.uploadZone} onClick={() => fileInputRef.current?.click()}>
                  <i className="fa-solid fa-cloud-arrow-up" />
                  <p>Click to upload files</p>
                  <span>PDF, PPT, Images — Multiple OK</span>
                  <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileUpload} />
                </div>
                {mediaUrls.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {mediaUrls.map((m, i) => (
                      <div key={i} className={s.filePill}>
                        <span title={m.name} style={{ display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <i className="fa-solid fa-paperclip" /> {m.name}
                        </span>
                        <button
                          className={s.filePillRemove}
                          onClick={() => setMediaUrls(mediaUrls.filter((__, j) => j !== i))}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* WhatsApp Template */}
            <div className={s.panel}>
              <div className={s.disclosure}>
                <button className={s.disclosureBtn} onClick={() => setShowTemplate(!showTemplate)}>
                  <span>
                    <i className="fa-brands fa-whatsapp" style={{ color: "#25d366", marginRight: "0.5rem" }} />
                    WhatsApp Message Template
                  </span>
                  <i className={`fa-solid fa-chevron-${showTemplate ? "up" : "down"}`} />
                </button>
                {showTemplate && (
                  <div className={s.disclosureBody}>
                    <textarea
                      ref={textareaRef}
                      className={s.textarea}
                      value={whatsappTemplate}
                      onChange={e => setWhatsappTemplate(e.target.value)}
                      placeholder="Write your WhatsApp message here…"
                    />
                    <div className={s.tagChips}>
                      {columns.map(c => (
                        <button key={c} className={s.tagChip} onClick={() => insertTag(c)}>{c}</button>
                      ))}
                      <button className={`${s.tagChip} ${s.tagChipLink}`} onClick={() => insertTag("Link")}>
                        <i className="fa-solid fa-link" /> File Link
                      </button>
                    </div>
                    
                    <button 
                      className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`} 
                      style={{ marginTop: "1rem", width: "100%", justifyContent: "center" }}
                      onClick={saveTemplate}
                      disabled={templateSaving}
                    >
                      {templateSaving ? (
                        <><i className="fa-solid fa-spinner fa-spin" /> Saving…</>
                      ) : (
                        <><i className="fa-solid fa-floppy-disk" /> Save Template Permanently</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL — Data Table */}
          <div className={s.panel} style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className={s.panelHeader}>
              <div className={s.panelTitle}>
                {view === "entry" && <><i className="fa-solid fa-pen-to-square" /> New Contact Entry</>}
                {view === "edit"  && <><i className="fa-solid fa-table-list" /> All Records — {existingRows.length} total</>}
                {view === "sent"  && <><i className="fa-solid fa-circle-check" style={{ color: "#10b981" }} /> WhatsApp Sent — {sentRows.length} contact(s)</>}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <div className={s.segmented}>
                  <button className={`${s.segItem} ${view === "entry" ? s.segItemActive : ""}`} onClick={() => setView("entry")}>
                    <i className="fa-solid fa-pen" /> Add Entry
                  </button>
                  <button className={`${s.segItem} ${view === "edit" ? s.segItemActive : ""}`} onClick={() => setView("edit")}>
                    <i className="fa-solid fa-table-list" /> Edit Records ({existingRows.length})
                  </button>
                  <button className={`${s.segItem} ${view === "sent" ? s.segItemActive : ""}`} onClick={() => setView("sent")}>
                    <i className="fa-solid fa-check-double" /> Sent ({sentRows.length})
                  </button>
                </div>
              </div>
            </div>

            {/* ENTRY VIEW */}
            {view === "entry" && (
              <>
                <div className={`${s.tableWrapper} ${s.tableAnimated}`}>
                  <table className={s.dataTable}>
                    <thead>
                      <tr>
                        {entryColumns.map(c => <th key={c}>{c}</th>)}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newRows.map((row, ri) => (
                        <tr key={ri}>
                          {entryColumns.map((col) => (
                            <td key={col} className={s.editableTd}>
                              <input
                                className={s.cellInput}
                                placeholder={`Enter ${col}`}
                                value={row[col] || ""}
                                onChange={e => handleCellChange(ri, col, e.target.value)}
                              />
                            </td>
                          ))}
                          <td>
                            <button
                              className={s.iconBtn}
                              onClick={() => setNewRows(newRows.filter((_, i) => i !== ri))}
                            >
                              <i className="fa-solid fa-trash-can" style={{ color: "#d1d5db" }} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className={s.tableFooter} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <button
                    className={`${s.btn} ${s.btnGhost} ${s.btnSm}`}
                    onClick={() => setNewRows([...newRows, {}])}
                  >
                    <i className="fa-solid fa-plus" /> Add Another Row
                  </button>
                  <button
                    className={`${s.btn} ${s.btnPrimary} ${s.btnSm}`}
                    onClick={submitData}
                    disabled={loading}
                  >
                    <i className="fa-solid fa-cloud-arrow-up" /> Save to Sheet
                  </button>
                </div>
              </>
            )}

            {/* EDIT RECORDS VIEW — All rows editable */}
            {view === "edit" && (
              <>
                {/* ── New Dependent Searchable Filter Bar ── */}
                {editRows.length > 0 && (
                  <FilterBar
                    allRows={editRows}
                    cols={filterableCols.slice(0, 5)}
                    filters={editFilters}
                    onChange={setEditFilters}
                    resultCount={filteredEditRows.length}
                    accent="purple"
                  />
                )}

                {loading ? (
                  <div className={s.emptyState}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: "2.5rem", color: "var(--primary)" }} />
                    <p style={{ marginTop: "1rem" }}>Loading records…</p>
                  </div>
                ) : editRows.length === 0 ? (
                  <div className={s.emptyState}>
                    <i className="fa-solid fa-inbox" style={{ color: "var(--text-4)" }} />
                    <p>No records yet</p>
                    <span>Add contacts using the "Add Entry" tab</span>
                  </div>
                ) : (
                  <>
                    <div className={`${s.tableWrapper} ${s.tableAnimated}`}>
                      <table className={s.dataTable}>
                        <thead>
                          <tr>
                            {columns.map(c => <th key={c}>{c}</th>)}
                            <th style={{ width: "60px" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEditRows.map((row, pi) => {
                            const globalIdx = existingRows.indexOf(row);
                            const isSent = statusCol && row[statusCol] === STATUS_SENT;
                            return (
                              <tr key={pi} style={isSent ? { background: "rgba(16,185,129,0.05)" } : {}}>
                                {columns.map(c => {
                                  const val = String(row[c] || "");
                                  const isUploadLink = /upload.?file/i.test(c);
                                  const isGeneralLink = /links/i.test(c) || /url/i.test(c);
                                  const isEditable = !autoManagedCols(c);
                                  const isStatusCol = c.toLowerCase() === "status";

                                  if (isStatusCol) {
                                    return (
                                      <td key={c}>
                                        {isSent
                                          ? <span className={`${s.chip} ${s.chipSuccess}`}><i className="fa-solid fa-circle-check" /> Sent</span>
                                          : <span className={`${s.chip} ${s.chipAmber}`}><i className="fa-solid fa-clock" /> Pending</span>
                                        }
                                      </td>
                                    );
                                  }

                                  if (isUploadLink && val) {
                                    const rawParts = val.split(",").map(l => l.trim()).filter(Boolean);
                                    return (
                                      <td key={c}>
                                        <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                                          {rawParts.map((raw, i) => {
                                            let fileName = "Attachment";
                                            let fileUrl  = raw;
                                            if (raw.includes("::")) { [fileName, fileUrl] = raw.split("::"); }
                                            return (
                                              <a key={i} href={fileUrl} target="_blank" rel="noreferrer" title={fileName} className={s.iconBtn}>
                                                <i className="fa-solid fa-paperclip" style={{ color: "var(--primary)" }} />
                                              </a>
                                            );
                                          })}
                                        </div>
                                      </td>
                                    );
                                  }

                                  if (isGeneralLink && val && val.startsWith("http")) {
                                    return (
                                      <td key={c}>
                                        <a href={val} target="_blank" rel="noreferrer" className={s.tagChip} style={{ fontSize: "0.65rem", textDecoration: "none" }}>
                                          <i className="fa-solid fa-link" /> View
                                        </a>
                                      </td>
                                    );
                                  }

                                  if (isEditable) {
                                    return (
                                      <td key={c} className={s.editableTd}>
                                        <input
                                          className={s.cellInput}
                                          value={val}
                                          onChange={e => handleArchiveCellEdit(globalIdx, c, e.target.value)}
                                          onBlur={() => updateArchiveCell(row._index, c, val)}
                                        />
                                      </td>
                                    );
                                  }

                                  return <td key={c} className={s.readonlyTd}>{val}</td>;
                                })}
                                <td>
                                  <button
                                    className={s.iconBtn}
                                    title="Delete record"
                                    onClick={() => { setDeleteTarget(row._index); setModal("deleteRow"); }}
                                  >
                                    <i className="fa-solid fa-trash-can" style={{ color: "#d1d5db" }} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className={s.tableFooter}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-3)", fontWeight: 600 }}>
                        <i className="fa-solid fa-rotate" style={{ marginRight: "0.4rem", color: "var(--primary)" }} />
                        Auto-syncing every 30s &nbsp;·&nbsp; showing {filteredEditRows.length} of {existingRows.length} records
                      </span>
                    </div>
                  </>
                )}
              </>
            )}

            {/* SENT VIEW */}
            {view === "sent" && (
              <>
                {/* ── New Dependent Searchable Filter Bar ── */}
                {sentRows.length > 0 && (
                  <FilterBar
                    allRows={sentRows}
                    cols={filterableCols.slice(0, 5)}
                    filters={sentFilters}
                    onChange={setSentFilters}
                    resultCount={filteredSentRows.length}
                    accent="green"
                  />
                )}

                {sentRows.length === 0 ? (
                  <div className={s.emptyState}>
                    <i className="fa-solid fa-paper-plane" />
                    <p>No WhatsApp messages sent yet</p>
                    <span>Contacts will appear here after you send WhatsApp</span>
                  </div>
                ) : (
                  <div className={`${s.tableWrapper} ${s.tableAnimated}`}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th style={{ width: "120px" }}>Status</th>
                          {columns.map(c => <th key={c}>{c}</th>)}
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSentRows.map((row, si) => {
                          const globalIdx = existingRows.indexOf(row);
                          return (
                            <tr key={si}>
                              <td>
                                <span className={`${s.chip} ${s.chipSuccess}`}>
                                  <i className="fa-solid fa-circle-check" /> Sent
                                </span>
                              </td>
                              {columns.map(c => {
                                const val = String(row[c] || "");
                                const isUploadLink = /upload.?file/i.test(c);
                                const isGeneralLink = /links/i.test(c) || /url/i.test(c);

                                if (isUploadLink && val) {
                                  const rawParts = val.split(",").map(l => l.trim()).filter(Boolean);
                                  return (
                                    <td key={c} style={{ opacity: 1 }}>
                                      <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center" }}>
                                        {rawParts.map((raw, i) => {
                                          let fileName = "Attachment";
                                          let fileUrl  = raw;
                                          if (raw.includes("::")) {
                                            const parts = raw.split("::");
                                            fileName = parts[0];
                                            fileUrl  = parts[1];
                                          }
                                          return (
                                            <a key={i} href={fileUrl} target="_blank" rel="noreferrer" title={fileName} className={s.iconBtn}>
                                              <i className="fa-solid fa-paperclip" style={{ color: "var(--primary)" }} />
                                            </a>
                                          );
                                        })}
                                      </div>
                                    </td>
                                  );
                                }

                                if (isGeneralLink && val && val.startsWith("http")) {
                                  return (
                                    <td key={c} style={{ opacity: 1 }}>
                                      <a href={val} target="_blank" rel="noreferrer" className={s.tagChip} style={{ fontSize: "0.65rem", textDecoration: "none" }}>
                                        <i className="fa-solid fa-link" /> View Link
                                      </a>
                                    </td>
                                  );
                                }

                                return <td key={c} className={s.readonlyTd} style={{ opacity: 0.7 }}>{val}</td>;
                              })}
                              <td>
                                <button
                                  className={s.iconBtn}
                                  title="Move back to Pending"
                                  onClick={async () => {
                                    const sheetRowIndex = row._index;
                                    if (sheetRowIndex) await updateSheetStatus(sheetRowIndex, "");
                                    showToast("Moved back to Pending. Refreshing…", "info");
                                    await fetchRows(activeTab);
                                  }}
                                >
                                  <i className="fa-solid fa-rotate-left" style={{ color: "#f59e0b" }} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className={s.tableFooter}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-3)", fontWeight: 600 }}>
                        <i className="fa-solid fa-circle-check" style={{ color: "#10b981", marginRight: "0.4rem" }} />
                        {sentRows.length} messages successfully sent via WhatsApp
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* IMPORT PREVIEW MODAL */}
      {importModal && (
        <div className={s.modalOverlay} onClick={e => e.target === e.currentTarget && setImportModal(false)}>
          <div className={s.modal} style={{ maxWidth: "700px" }}>
            <div className={s.modalHeader}>
              <h3><i className="fa-solid fa-file-import" /> Import Preview — {importFileName}</h3>
              <button className={s.iconBtn} onClick={() => setImportModal(false)}><i className="fa-solid fa-xmark" /></button>
            </div>

            <div className={s.modalBody} style={{ padding: "1.25rem 1.75rem" }}>
              {/* Summary Chips */}
              <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
                <span className={`${s.chip} ${s.chipSuccess}`}>
                  <i className="fa-solid fa-plus-circle" /> {importParsed.length} New Contacts
                </span>
                {importSkipped.length > 0 && (
                  <span className={`${s.chip} ${s.chipAmber}`}>
                    <i className="fa-solid fa-ban" /> {importSkipped.length} Duplicates Skipped
                  </span>
                )}
                <span className={`${s.chip} ${s.chipPrimary}`}>
                  <i className="fa-solid fa-lock" /> Timestamp &amp; Status: Auto-managed
                </span>
              </div>

              {importParsed.length === 0 ? (
                <div className={s.emptyState} style={{ padding: "2rem" }}>
                  <i className="fa-solid fa-circle-exclamation" style={{ color: "var(--warning)", fontSize: "2.5rem" }} />
                  <p style={{ marginTop: "1rem" }}>No new contacts found.</p>
                  <span>All contacts from this file already exist in the sheet.</span>
                </div>
              ) : (
                <div style={{ maxHeight: "320px", overflow: "auto", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                  <table className={s.dataTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Company</th>
                        <th>Link / URL</th>
                        <th>Alias</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importParsed.map((c, i) => (
                        <tr key={i}>
                          <td style={{ color: "var(--text-4)", fontWeight: 700 }}>{i + 1}</td>
                          <td>{c.name || <span style={{ color: "var(--text-4)" }}>—</span>}</td>
                          <td>
                            <span style={{ fontFamily: "monospace", fontSize: "0.82rem", background: "var(--bg)", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>
                              {c.mobile || "—"}
                            </span>
                          </td>
                          <td>{c.company || <span style={{ color: "var(--text-4)" }}>—</span>}</td>
                          <td style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                            {c.link || <span style={{ color: "var(--text-4)" }}>—</span>}
                          </td>
                          <td>{c.alias || <span style={{ color: "var(--text-4)" }}>—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {importSkipped.length > 0 && (
                <p style={{ fontSize: "0.8rem", color: "var(--text-3)", marginTop: "0.875rem" }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: "0.4rem", color: "var(--warning)" }} />
                  <strong>{importSkipped.length}</strong> contact(s) were skipped because their phone numbers already exist in the sheet.
                </p>
              )}
            </div>

            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setImportModal(false)}>Cancel</button>
              <button
                className={`${s.btn} ${s.btnPrimary}`}
                onClick={confirmImport}
                disabled={importParsed.length === 0}
              >
                <i className="fa-solid fa-check" /> Import {importParsed.length} Contacts to Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {modal && (
        <div className={s.modalOverlay} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className={s.modal}>
            <div className={s.modalHeader}>
              <h3>
                {modal === "addTab"
                  ? <><i className="fa-solid fa-table-columns" /> Create New Tab</>
                  : <><i className="fa-solid fa-triangle-exclamation" style={{ color: "var(--danger)" }} /> Confirm Delete</>
                }
              </h3>
              <button className={s.iconBtn} onClick={() => setModal(null)}><i className="fa-solid fa-xmark" /></button>
            </div>
            <div className={s.modalBody}>
              {modal === "addTab" ? (
                <div className={s.fieldGroup}>
                  <label className={s.fieldLabel}><i className="fa-solid fa-tag" /> Tab Name</label>
                  <input
                    ref={modalInputRef}
                    className={s.fieldInput}
                    placeholder="e.g. April_Campaign"
                    value={modalInput}
                    onChange={e => setModalInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && confirmAddTab()}
                  />
                  <p style={{ fontSize: "0.8rem", color: "var(--text-3)", marginTop: "0.625rem" }}>
                    <i className="fa-solid fa-circle-info" style={{ marginRight: "0.4rem" }} />
                    Columns will be auto-generated with RKD standard headers (Name, Mobile, Company, Links, Status, Upload File Link).
                  </p>
                </div>
              ) : (
                <p style={{ fontSize: "0.9rem", color: "var(--text-2)", lineHeight: 1.6 }}>
                  Are you sure you want to <strong style={{ color: "var(--danger)" }}>permanently delete</strong> this record? This action cannot be undone.
                </p>
              )}
            </div>
            <div className={s.modalFooter}>
              <button className={`${s.btn} ${s.btnGhost}`} onClick={() => setModal(null)}>Cancel</button>
              {modal === "addTab" ? (
                <button className={`${s.btn} ${s.btnPrimary}`} onClick={confirmAddTab}>
                  <i className="fa-solid fa-plus" /> Create Tab
                </button>
              ) : (
                <button className={`${s.btn} ${s.btnDanger}`} onClick={confirmDelete}>
                  <i className="fa-solid fa-trash-can" /> Delete Record
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className={`${s.toast} ${toast.type === "success" ? s.toastSuccess : toast.type === "danger" ? s.toastDanger : s.toastInfo}`}>
          <i className={`fa-solid fa-${toast.type === "success" ? "circle-check" : toast.type === "danger" ? "circle-exclamation" : "circle-info"}`} />
          {toast.msg}
        </div>
      )}
    </div>
  );
}
