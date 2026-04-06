import { google } from "googleapis";
import { NextResponse } from "next/server";

const getAuth = () => {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
};

const spreadsheetId = process.env.GOOGLE_SHEET_ID;

export async function GET(request: Request) {
  if (!spreadsheetId) return NextResponse.json({ error: "Missing GOOGLE_SHEET_ID" }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const action  = searchParams.get("action");
  const tabName = searchParams.get("tabName");

  const auth   = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  try {
    if (action === "getTabsAndColumns") {
      const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
      const tabsInfo  = [];
      const sheetsList = spreadsheetInfo.data.sheets || [];

      for (const s of sheetsList) {
        const title = s.properties?.title;
        if (!title) continue;
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${title}!1:1`,
        });
        const headers = response.data.values?.[0] || [];
        tabsInfo.push({ tabName: title, columns: headers });
      }
      return NextResponse.json({ success: true, tabs: tabsInfo });
    }

    if (action === "getRows" && tabName) {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!A:Z`,
      });
      const rows = response.data.values || [];
      if (rows.length === 0) return NextResponse.json({ success: true, headers: [], data: [] });
      const headers = rows[0];
      const data = rows.slice(1).map((row, idx) => {
        const obj: any = { _index: idx + 2 }; // 1-indexed sheet row, +1 for header
        headers.forEach((h: string, i: number) => {
          obj[h] = row[i] || "";
        });
        return obj;
      });
      return NextResponse.json({ success: true, headers, data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Sheets API GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!spreadsheetId) return NextResponse.json({ error: "Missing GOOGLE_SHEET_ID" }, { status: 500 });
  const body = await request.json();
  const { action, tabName, rows, rowIndex } = body;
  const auth   = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  try {
    // ── Append rows ──────────────────────────────────────────────────────────
    if (action === "appendRows" && tabName && rows) {
      const response = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `${tabName}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rows },
      });
      return NextResponse.json({ success: true, response: response.data });
    }

    // ── Delete row ───────────────────────────────────────────────────────────
    if (action === "deleteRow" && tabName && rowIndex) {
      const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
      const sheet = spreadsheetInfo.data.sheets?.find(s => s.properties?.title === tabName);
      if (!sheet) throw new Error("Sheet not found");
      const sheetId = sheet.properties?.sheetId;

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{
            deleteDimension: {
              range: {
                sheetId,
                dimension: "ROWS",
                startIndex: rowIndex - 1,
                endIndex: rowIndex,
              },
            },
          }],
        },
      });
      return NextResponse.json({ success: true });
    }

    // ── Create new tab (copies headers from 'bathmat') ────────────────────────
    if (action === "createTab" && tabName) {
      // 1. Get reference headers from 'bathmat'
      const refResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `bathmat!1:1`,
      });
      const refHeaders = refResponse.data.values?.[0] || [];

      // 2. Create the new sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: tabName } } }],
        },
      });

      // 3. Write headers to the new sheet
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${tabName}!1:1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [refHeaders] },
      });

      return NextResponse.json({ success: true, columns: refHeaders });
    }

    // ── Update specific cell for a row ───────────────────────────────────────
    if (action === "updateCell" && tabName && body.rowIndex && body.columnName && body.value !== undefined) {
      const { rowIndex: rIdx, columnName: colName, value } = body;
      const headerResp = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tabName}!1:1` });
      const headers = headerResp.data.values?.[0] || [];
      const colIdx = headers.findIndex((h: string) => h.toLowerCase() === colName.toLowerCase());

      if (colIdx === -1) return NextResponse.json({ success: false, error: `Column ${colName} not found` }, { status: 400 });

      // Column letter calculation (A=65)
      let colLetter = "";
      let tempIdx = colIdx;
      while (tempIdx >= 0) {
        colLetter = String.fromCharCode((tempIdx % 26) + 65) + colLetter;
        tempIdx = Math.floor(tempIdx / 26) - 1;
      }
      const cellRange = `${tabName}!${colLetter}${rIdx}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: cellRange,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[value]] },
      });
      return NextResponse.json({ success: true });
    }

    // ── Update Status cell for a specific row ─────────────────────────────────
    if (action === "updateStatus" && tabName && body.rowIndex && body.status !== undefined) {
      const { rowIndex: rIdx, status } = body;

      // Find the "Status" column dynamically from the header row
      const headerResp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tabName}!1:1`,
      });
      const headers = headerResp.data.values?.[0] || [];
      const statusColIdx = headers.findIndex(
        (h: string) => h.toLowerCase() === "status"
      );

      if (statusColIdx === -1) {
        return NextResponse.json(
          { success: false, error: "No 'Status' column found in spreadsheet headers." },
          { status: 400 }
        );
      }

      // Column letter: 0→A, 1→B, …, 6→G
      const colLetter = String.fromCharCode(65 + statusColIdx);
      const cellRange = `${tabName}!${colLetter}${rIdx}`;

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: cellRange,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[status]] },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Sheets API POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
