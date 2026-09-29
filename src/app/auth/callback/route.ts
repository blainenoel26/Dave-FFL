import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the sign-in link in Supabase's email. Exchanges the one-time code for a
// session cookie. Only works in the browser that requested the email (the PKCE verifier lives
// in that browser's cookies); the emailed 6-digit code works from anywhere.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const target = request.nextUrl.clone();
  target.search = "";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      target.pathname = "/";
      return NextResponse.redirect(target);
    }
  }

  target.pathname = "/login";
  target.searchParams.set("error", "link");
  return NextResponse.redirect(target);
}
