import Link from "next/link";

type AdminSectionHeaderProps = {
  badge: string;
};

export default function AdminSectionHeader({ badge }: AdminSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-4 mb-4">
      <div className="inline-block bg-brand-purple text-xs tracking-[3px] px-6 py-2 rounded-full">
        {badge}
      </div>
      <div className="flex items-center gap-4 text-sm">
        <Link
          href="/admin"
          className="text-brand-gold hover:text-brand-gold/80"
        >
          Back to Admin Dashboard
        </Link>
      </div>
    </div>
  );
}
