import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
      <p className="text-sm uppercase tracking-[0.22em] text-slate-400">404</p>
      <h1 className="mt-3 font-display text-4xl text-white">Page Not Found</h1>
      <p className="mt-3 text-slate-300">The route does not exist in Lite-Dipper.</p>
      <Link
        to="/"
        className="mt-6 inline-flex rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm text-white transition hover:bg-white/10"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
