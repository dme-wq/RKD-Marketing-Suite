import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const existingPhones = JSON.parse(formData.get("existingPhones") as string || "[]") as string[];
    const sheetColumns = JSON.parse(formData.get("columns") as string || "[]") as string[];

    if (!file) return NextResponse.json({ success: false, error: "No file uploaded" });

    const fileName  = file.name.toLowerCase();
    const buffer    = await file.arrayBuffer();
    const bytes     = Buffer.from(buffer);

    let rawContacts: any[] = [];

    // ── VCF / vCard ─────────────────────────────────────────────────────────
    if (fileName.endsWith(".vcf")) {
      const text  = bytes.toString("utf-8");
      rawContacts = parseVCF(text);
    }

    // ── CSV ──────────────────────────────────────────────────────────────────
    else if (fileName.endsWith(".csv")) {
      const text  = bytes.toString("utf-8");
      const wb    = XLSX.read(text, { type: "string" });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      rawContacts = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }

    // ── XLSX / XLS ────────────────────────────────────────────────────────────
    else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const wb    = XLSX.read(bytes, { type: "buffer" });
      const ws    = wb.Sheets[wb.SheetNames[0]];
      rawContacts = XLSX.utils.sheet_to_json(ws, { defval: "" });
    }

    else {
      return NextResponse.json({ success: false, error: "Unsupported file type. Use .vcf, .csv, or .xlsx" });
    }

    // ── Smart Global Field Mapping ──────────────────────────────────────────
    const mapped = smartMapContacts(rawContacts);

    // ── Deduplicate against existing sheet phone numbers ──────────────────────
    const normalise = (n: string) => n.toString().replace(/\D/g, "").slice(-10); // last 10 digits
    const existingSet = new Set(existingPhones.map(normalise).filter(Boolean));

    const unique   : any[] = [];
    const skipped  : any[] = [];

    for (const c of mapped) {
      const norm = normalise(c.mobile || "");
      if (norm && existingSet.has(norm)) {
        skipped.push(c);
      } else {
        unique.push(c);
        if (norm) existingSet.add(norm); // prevent duplicates within the file itself
      }
    }

    return NextResponse.json({ success: true, contacts: unique, skipped, total: rawContacts.length });
  } catch (err: any) {
    console.error("Import error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── VCF Parser ────────────────────────────────────────────────────────────────
function parseVCF(text: string) {
  const contacts: any[] = [];
  const cards = text.split(/BEGIN:VCARD/i).filter(c => /END:VCARD/i.test(c));

  for (const card of cards) {
    const get = (pattern: RegExp): string =>
      (card.match(pattern)?.[1] ?? "").trim().replace(/\\n/g, " ").replace(/\r/g, "");

    const name    = get(/FN:(.+)/i)    || get(/N:([^;]+)/i);
    const phone   = get(/TEL[^:]*:(.+)/i).replace(/[\s\-().+]/g, "");
    const org     = get(/ORG:([^;]+)/i);
    const url     = get(/URL[^:]*:(.+)/i);
    const email   = get(/EMAIL[^:]*:(.+)/i);
    const alias   = get(/NICKNAME:(.+)/i);

    if (name || phone) {
      contacts.push({ name, mobile: phone, company: org, link: url, email, alias });
    }
  }
  return contacts;
}

// ── Smart Global Field Mapping ──────────────────────────────────────────
function smartMapContacts(rows: any[]) {
  if (!rows.length) return [];

  const keys = Object.keys(rows[0]);
  const sampleRows = rows.slice(0, 20); // analyze first 20 rows

  const scores: Record<string, { [key: string]: number }> = {
    mobile: {}, nameF: {}, nameL: {}, company: {}, link: {}, alias: {}
  };

  keys.forEach(k => {
    const kl = k.toLowerCase().replace(/[^a-z]/g, "");
    const vals = sampleRows.map(r => String(r[k] || "").trim());

    // ── Score for Mobile (Critical improvement) ─────────────
    // High weight for headers like "whatsapp", "mobile", "phone"
    if (kl.includes("whatsapp") || kl.includes("mobile") || kl.includes("phone")) scores.mobile[k] = (scores.mobile[k] || 0) + 10;
    if (kl.includes("contact") || kl.includes("cell") || kl === "number") scores.mobile[k] = (scores.mobile[k] || 0) + 5;
    if (kl.includes("serial") || kl.includes("index")) scores.mobile[k] = (scores.mobile[k] || 0) - 20;

    // Content check: Mobile numbers should be mostly digits and have length >= 10
    const digitRatio = vals.filter(v => v.replace(/\D/g, "").length >= 7).length / (vals.length || 1);
    if (digitRatio > 0.5) scores.mobile[k] = (scores.mobile[k] || 0) + 15;
    if (vals.some(v => v.length > 0 && v.length < 5)) scores.mobile[k] = (scores.mobile[k] || 0) - 10; // penalize serial numbers 1,2,3...

    // ── Score for Name ──────────────
    if (kl === "firstname" || kl === "fname" || kl === "first") scores.nameF[k] = (scores.nameF[k] || 0) + 20;
    if (kl === "lastname" || kl === "lname" || kl === "last" || kl === "surname") scores.nameL[k] = (scores.nameL[k] || 0) + 20;
    if (kl === "name" || kl === "fullname" || kl === "contactname") scores.nameF[k] = (scores.nameF[k] || 0) + 10;
    if (kl.includes("sourcename") || kl.includes("adname") || kl.includes("manager")) scores.nameF[k] = (scores.nameF[k] || 0) - 15;

    // ── Score for Other Fields ──────
    if (kl.includes("company") || kl.includes("org")) scores.company[k] = (scores.company[k] || 0) + 10;
    if (kl.includes("url") || kl.includes("link") || kl.includes("web") || kl.includes("drive")) scores.link[k] = (scores.link[k] || 0) + 10;
    if (kl.includes("alias") || kl.includes("nick")) scores.alias[k] = (scores.alias[k] || 0) + 10;
  });

  const getBest = (field: string) => {
    const list = Object.entries(scores[field]).sort((a,b) => b[1] - a[1]);
    return list[0]?.[0] || null;
  };

  const bestMobile  = getBest("mobile");
  const bestNameF   = getBest("nameF");
  const bestNameL   = getBest("nameL");
  const bestCompany = getBest("company");
  const bestLink    = getBest("link");
  const bestAlias   = getBest("alias");

  return rows.map(row => {
    const fname = bestNameF ? String(row[bestNameF] || "").trim() : "";
    const lname = bestNameL ? String(row[bestNameL] || "").trim() : "";
    const name  = (fname + " " + (bestNameL === bestNameF ? "" : lname)).trim();

    // Clean mobile: remove non-digits, then strip leading 91 or 0 if it looks like a country code/prefix
    let cleanMobile = bestMobile ? String(row[bestMobile] || "").replace(/\D/g, "") : "";
    if (cleanMobile.length > 10) {
      if (cleanMobile.startsWith("91")) cleanMobile = cleanMobile.slice(2);
      else if (cleanMobile.startsWith("0")) cleanMobile = cleanMobile.slice(1);
    }
    // Final check for +91 cases that might have been handled by \D but let's be safe
    if (cleanMobile.length > 10) cleanMobile = cleanMobile.slice(-10);

    return {
      name,
      mobile:  cleanMobile,
      company: bestCompany ? String(row[bestCompany] || "").trim() : "",
      link:    bestLink ? String(row[bestLink] || "").trim() : "",
      alias:   bestAlias ? String(row[bestAlias] || "").trim() : "",
    };
  }).filter(c => c.name || c.mobile);
}
