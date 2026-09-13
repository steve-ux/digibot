import Link from "next/link";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { WA_LINKS } from "@/lib/whatsapp";

const NAV_LINKS = [
  { href: "/#que-es", label: "¿Qué es?" },
  { href: "/#pasos", label: "Cómo funciona" },
  { href: "/#planes", label: "Planes" },
  { href: "/#faq", label: "FAQ" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-lg">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5 text-foreground">
          <Logo />
          <span className="font-poppins text-[22px] font-extrabold tracking-tight text-foreground">
            DigiBot
          </span>
        </Link>

        <nav className="ml-auto hidden flex-wrap items-center gap-6 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://panel.digibotlatam.com/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[15px] font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Panel
          </a>
        </nav>

        <div className="flex items-center gap-3 lg:ml-0 ml-auto">
          <ThemeToggle />
          <a
            href={WA_LINKS.general}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-full bg-primary px-5 py-3 font-poppins text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Quiero mi bot
          </a>
        </div>
      </div>
    </header>
  );
}
