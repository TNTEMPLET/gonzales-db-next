import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { canAccessAdminModule, toAdminRole } from "@/lib/auth/adminRoles";
import {
  ADMIN_SESSION_COOKIE,
  getAdminUserFromCookieToken,
} from "@/lib/auth/adminSession";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import {
  getOrgDocumentsConfig,
  getOrgDocumentsEmbedSrc,
} from "@/lib/orgDocuments";
import { getSiteConfig } from "@/lib/siteConfig";

export function generateMetadata() {
  const site = getSiteConfig();
  return {
    title: `Organization documents | ${site.name}`,
    description:
      "AP Baseball shared Google Drive folder for bylaws, policies, and organizational files.",
  };
}

export default async function AdminDocumentsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const adminUser = await getAdminUserFromCookieToken(token);

  if (!adminUser) {
    redirect("/admin/login?next=/admin/documents");
  }

  const role = toAdminRole(adminUser.role, adminUser.isMaster);
  if (!canAccessAdminModule(role, "ORG_DOCUMENTS")) {
    redirect("/admin?denied=documents");
  }

  const drive = getOrgDocumentsConfig();

  return (
    <main className="min-h-screen bg-zinc-950 text-white py-14 pb-24">
      <section className="max-w-6xl mx-auto px-6">
        <div className="mb-8">
          <AdminSectionHeader badge="ORG DOCUMENTS" />
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            Organization documents
          </h1>
          <p className="text-zinc-400 max-w-3xl">
            Shared AP Baseball Google Drive for bylaws, policies, templates, and other org files.
            Access is managed in Google: sign in with an account that has been invited to the
            folder. For images used on the site or social posts, download from Drive (or export from
            Canva) and use the News or Social upload flows so files are hosted on this site.
          </p>
        </div>

        {!drive ? (
          <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-4 text-sm text-amber-100">
            <p className="font-semibold">Drive folder not configured</p>
            <p className="mt-2 text-amber-200/90">
              Set <code className="text-amber-50">AP_GOOGLE_DRIVE_FOLDER_URL</code> on the server
              to a Google Drive folder URL (e.g.{" "}
              <code className="text-amber-50">
                https://drive.google.com/drive/folders/…
              </code>
              ) or paste the folder ID only.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <a
                href={drive.folderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg bg-[#2374E1] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1864D7] transition"
              >
                Open in Google Drive
              </a>
              <p className="text-xs text-zinc-500 max-w-xl">
                If the preview below is blank, use the button above—you may need to sign in to
                Google in that tab first.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-900/50">
              <iframe
                title="Shared Google Drive folder"
                src={getOrgDocumentsEmbedSrc(drive.folderId)}
                className="h-[min(70vh,720px)] w-full border-0 bg-zinc-950"
              />
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
