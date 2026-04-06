import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();
  // `phone` should include country code e.g., 919876543210
  // `message` is the dynamic string
  // `mediaUrl` is optional pdf link
  // `filename` is the original name of the attachment
  // `mime_type` is the file format (e.g. application/pdf)
  const { phone, message, mediaUrl, filename, mime_type } = body;

  const PRODUCT_ID = process.env.MAYTAPI_PRODUCT_ID;
  const TOKEN = process.env.MAYTAPI_TOKEN;
  const PHONE_ID = process.env.MAYTAPI_PHONE_ID;

  if (!PRODUCT_ID || !TOKEN || !PHONE_ID) {
    return NextResponse.json({ error: "Missing Maytapi Environment Variables" }, { status: 500 });
  }

  const payload: any = {
    to_number: phone, 
    type: "text",
    message: message,
  };

  // If a URL is passed to attach a PDF Media
  if (mediaUrl) {
    payload.type = "media";
    payload.message = mediaUrl;
    payload.text = message; // Maytapi: text sent along with media inside the 'text' property
    if (filename) payload.filename = filename;
    if (mime_type) payload.mime_type = mime_type;
  }

  try {
    const response = await fetch(`https://api.maytapi.com/api/${PRODUCT_ID}/${PHONE_ID}/sendMessage`, {
      method: "POST",
      headers: {
        "x-maytapi-key": TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    return NextResponse.json({ success: data.success, data });
  } catch (error: any) {
    console.error("WhatsApp Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
