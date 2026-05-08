type DesignedByBrandProps = {
  className?: string;
  labelClassName?: string;
  linkClassName?: string;
  logoSrc?: string;
  logoAlt?: string;
  logoClassName?: string;
  logoWrapClassName?: string;
};

export default function DesignedByBrand({
  className = "",
  labelClassName = "text-zinc-400",
  linkClassName = "inline-flex items-center gap-0 font-medium text-zinc-100 transition-colors hover:text-brand-gold",
  logoSrc = "https://duckroostdigital.com/brand/DuckRoostDigital-Logo-dark.svg",
  logoAlt = "DuckRoost Digital logo",
  logoClassName = "h-full w-full scale-125 object-cover object-left",
  logoWrapClassName = "inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden",
}: DesignedByBrandProps) {
  return (
    <div className={`inline-flex items-center gap-[0.01rem] ${className}`}>
      <span className={labelClassName}>Designed by: </span>
      <a
        href="https://duckroostdigital.com"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClassName}
      >
        <span className={logoWrapClassName}>
          <img
            src={logoSrc}
            alt={logoAlt}
            width={36}
            height={36}
            loading="lazy"
            decoding="async"
            className={logoClassName}
          />
        </span>
        <span className="-ml-1">DuckRoost Digital</span>
      </a>
    </div>
  );
}
