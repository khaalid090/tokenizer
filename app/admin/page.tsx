import { Suspense } from "react";
import { AdminOverview } from "@/components/AdminOverview";

/**
 * /admin - Overview page.
 *
 * This is a server component that just renders the client-side overview. The
 * data fetching happens inside AdminOverview via client-side fetch calls to
 * /api/admin/stats, which are themselves gated by requireAdmin().
 */
export default function AdminPage() {
  return (
    <Suspense fallback={<AdminOverviewSkeleton />}>
      <AdminOverview />
    </Suspense>
  );
}

function AdminOverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-surface/70 border border-slate-800 animate-pulse"
          />
        ))}
      </div>
      <div className="h-80 rounded-2xl bg-surface/70 border border-slate-800 animate-pulse" />
    </div>
  );
}