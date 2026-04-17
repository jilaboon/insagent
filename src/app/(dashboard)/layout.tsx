import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AmbientField } from "@/components/prism/ambient-field";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The dashboard shell owns the Prism backdrop so the login page
    // keeps its clean surface-0 background untouched. The gradient is
    // extremely soft; the AmbientField below adds the real chromatic
    // motion.
    <div
      className="flex h-full"
      style={{
        background:
          "linear-gradient(135deg, #EEF2FF 0%, #FBF7FF 45%, #FFFFFF 65%, #FFF1F9 100%)",
        backgroundAttachment: "fixed",
      }}
    >
      <Sidebar />
      <div className="mr-64 flex flex-1 flex-col">
        <Topbar />
        {/* `relative overflow-hidden` clips the AmbientField haze so it
            never bleeds over the sidebar. The AmbientField itself is
            pointer-events-none and sits on -z-10 so page content stays
            interactive and on top. */}
        <main className="relative flex-1 overflow-x-hidden overflow-y-auto p-8">
          <AmbientField />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
