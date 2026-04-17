"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import logo from "@/public/images/logo.png";

export default function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/dugout")) return null;

  return (
    <footer className="bg-zinc-950 border-t border-zinc-800 py-16">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-4 gap-10">
        {/* Column 1: Logo & About */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative w-10 h-10">
              <Image
                src={logo}
                alt="Gonzales Diamond Baseball"
                className="object-contain"
              />
            </div>
            <div>
              <div className="font-bold text-xl">Gonzales DB</div>
              <div className="text-xs text-brand-gold">DIAMOND BASEBALL</div>
            </div>
          </div>
          <p className="text-sm text-zinc-400 max-w-xs">
            Official youth baseball league in Ascension Parish, Louisiana.
            Providing fun, skill development, and competitive play for ages
            3–12.
          </p>
        </div>

        {/* Column 2: Quick Links */}
        <div>
          <h4 className="font-semibold mb-4 text-brand-gold">Quick Links</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <a href="#schedule" className="hover:text-brand-gold transition">
                Schedules & Standings
              </a>
            </li>
            <li>
              <a href="#register" className="hover:text-brand-gold transition">
                Player Registration
              </a>
            </li>
            <li>
              <a href="#teams" className="hover:text-brand-gold transition">
                Teams & Rosters
              </a>
            </li>
            <li>
              <a href="#fields" className="hover:text-brand-gold transition">
                Field Status
              </a>
            </li>
            <li>
              <a href="#news" className="hover:text-brand-gold transition">
                News & Announcements
              </a>
            </li>
          </ul>
        </div>

        {/* Column 3: Contact Info */}
        <div>
          <h4 className="font-semibold mb-4 text-brand-gold">Contact Us</h4>
          <div className="space-y-3 text-sm text-zinc-400">
            <p>
              AP Baseball / Gonzales Diamond Baseball
              <br />
              1943 S. Burnside Ave.
              <br />
              Gonzales, LA 70737
            </p>
            <p>
              Phone:{" "}
              <a href="tel:225-495-4001" className="hover:text-white">
                (225) 495-4001
              </a>
            </p>
            <p>
              Email:{" "}
              <a href="mailto:info@apbaseball.com" className="hover:text-white">
                info@apbaseball.com
              </a>
            </p>
          </div>
        </div>

        {/* Column 4: Social & Legal */}
        <div>
          <h4 className="font-semibold mb-4 text-brand-gold">Follow Us</h4>
          <div className="flex gap-4 mb-8">
            {/* Add your actual social links here when ready */}
            <a
              href="https://www.facebook.com/APBaseball"
              target="_blank"
              rel="noopener"
              className="hover:text-brand-gold"
            >
              Facebook
            </a>
          </div>

          <div className="text-xs text-zinc-500">
            © {new Date().getFullYear()} Gonzales Diamond Baseball
            <br />
            Powered by Next.js • All Rights Reserved
          </div>
        </div>
      </div>
    </footer>
  );
}
