import { google } from "googleapis";
import { NextResponse } from "next/server";
import { Readable } from "stream";

const getAuth = () => {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
};

const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

export async function POST(request: Request) {
  if (!folderId) return NextResponse.json({ error: "Missing GOOGLE_DRIVE_FOLDER_ID" }, { status: 500 });
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const stream = Readable.from(buffer);

    const response = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: file.name,
        parents: [folderId],
      },
      media: {
        mimeType: file.type,
        body: stream,
      },
      fields: "id, webViewLink, webContentLink",
    });

    // Make the file readable by anyone if needed, or by specific users
    await drive.permissions.create({
      fileId: response.data.id!,
      supportsAllDrives: true,
      requestBody: {
        role: "reader",
        type: "anyone",
      },
    });

    return NextResponse.json({ 
        success: true, 
        id: response.data.id, 
        link: response.data.webViewLink,
        downloadLink: response.data.webContentLink,
        mimeType: response.data.mimeType
    });
  } catch (error: any) {
    console.error("Drive upload error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
