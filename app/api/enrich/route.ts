import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { name, company, mobile } = await req.json();

    if (!name && !mobile) return NextResponse.json({ success: false, error: "No data to search" });

    // ── Search-Based Heuristic ────────────────────────────────────────────────
    // In a world-class app, we use Gemini Search or SerpApi here.
    // For now, we will construct a high-confidence Google Search URL that 
    // opens their LinkedIn profile as a direct match.
    
    // Logic: site:linkedin.com/in "Name" "Company" is almost always the profile.
    let linkedinUrl = "";
    
    if (name) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      // Construct a "Search Link" that looks like a profile URL as a fallback
      // but better: We provide a clickable Google Search that targets their profile.
      linkedinUrl = `https://www.google.com/search?q=site:linkedin.com/in+"${encodeURIComponent(name)}"+${encodeURIComponent(company || "")}`;
    } else {
      linkedinUrl = `https://www.google.com/search?q=site:linkedin.com+"${encodeURIComponent(mobile)}"`;
    }

    return NextResponse.json({ success: true, linkedinUrl });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
