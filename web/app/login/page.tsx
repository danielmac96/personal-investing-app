import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; sent?: string };
}) {
  return (
    <div className="mx-auto mt-12 max-w-sm">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        Magic link to the allow-listed email only.
      </p>

      {searchParams?.error === "not_authorized" && (
        <p className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          That email isn&apos;t authorised for this dashboard.
        </p>
      )}

      <div className="mt-6">
        <LoginForm initialSent={searchParams?.sent === "1"} />
      </div>
    </div>
  );
}
