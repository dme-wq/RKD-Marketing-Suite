const { google } = require("googleapis");

async function testConnection() {
  console.log("Testing Google Service Account...");
  console.log("Email:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error("Error: Credentials not found in environment variables.");
    process.exit(1);
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });
    console.log("Authenticating and fetching Sheet info...");

    const response = await sheets.spreadsheets.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
    });

    console.log("✅ SUCCESS!");
    console.log("Sheet Title:", response.data.properties.title);
    console.log("Available Tabs:", response.data.sheets.map(s => s.properties.title).join(", "));
  } catch (error) {
    console.error("❌ FAILED!");
    console.error(error.message);
  }
}

testConnection();
