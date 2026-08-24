import React from "react";

const LOGO_URL =
  "https://horizons-cdn.hostinger.com/fcd5ffc4-f69d-4e0c-b2bd-0dc6f9e8ace1/d40c2cb35c70b25f24e9504fe3a6703d.png";

export default function Logo({ showText = true, className = "", textClass = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <img src={LOGO_URL} alt="Aitoma" className="h-8 w-8 object-contain" />
      {showText && (
        <div className="leading-none">
          <span className={`font-display text-lg font-extrabold tracking-tight ${textClass}`}>
            Aitoma
          </span>
          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
            CMMS
          </span>
        </div>
      )}
    </div>
  );
}
