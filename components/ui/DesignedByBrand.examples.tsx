import DesignedByBrand from "@/components/ui/DesignedByBrand";

/**
 * Usage examples for quickly reusing the DesignedByBrand block.
 * Copy one of these snippets into the target surface as needed.
 */

export function DesignedByBrandFooterExample() {
  return <DesignedByBrand className="mt-4 text-xs" />;
}

export function DesignedByBrandHeaderExample() {
  return (
    <DesignedByBrand
      className="text-xs"
      labelClassName="text-zinc-500"
      linkClassName="font-medium text-zinc-200 transition-colors hover:text-brand-gold"
    />
  );
}

export function DesignedByBrandLoginExample() {
  return (
    <DesignedByBrand
      className="mt-6 border-t border-zinc-800 pt-4 text-xs"
      labelClassName="text-zinc-500"
      linkClassName="font-medium text-brand-gold transition-colors hover:text-brand-gold/80"
    />
  );
}

export function DesignedByBrandLandingExample() {
  return (
    <DesignedByBrand
      className="mt-10 text-sm"
      labelClassName="text-zinc-400"
      linkClassName="font-semibold text-brand-gold transition-colors hover:text-brand-gold/80"
    />
  );
}
