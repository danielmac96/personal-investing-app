import { NextResponse, type NextRequest } from "next/server";

import { ALLOWED_EMAIL } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=exchange", url.origin));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ALLOWED_EMAIL) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=not_authorized", url.origin),
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
