import Link from "next/link";
import Logo from "./Logo";
import { WA_LINKS } from "@/lib/whatsapp";

export default function Footer() {
  const year = new Date().getFullYear();
  const version = process.env.APP_VERSION;

  return (
    <footer className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
      <div className="flex flex-wrap items-start gap-12 border-t border-border pt-12">
        <div className="min-w-[260px] flex-1">
          <div className="flex items-center gap-2.5">
            <Logo size={30} />
            <span className="font-poppins text-xl font-extrabold text-foreground">
              DigiBot
            </span>
          </div>
          <p className="mt-4 max-w-[300px] text-[15px] text-muted-foreground">
            Conversaciones que venden. Agentes de IA para WhatsApp, Instagram
            y Facebook en toda LATAM.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="font-poppins text-sm font-semibold text-foreground">
            Producto
          </div>
          <Link href="/#que-es" className="text-[15px] text-muted-foreground hover:text-primary">
            ¿Qué es?
          </Link>
          <Link href="/#planes" className="text-[15px] text-muted-foreground hover:text-primary">
            Planes
          </Link>
          <Link href="/#faq" className="text-[15px] text-muted-foreground hover:text-primary">
            FAQ
          </Link>
          <a href="/admin" className="text-[15px] text-muted-foreground hover:text-primary">
            Panel
          </a>
        </div>

        <div className="flex flex-col gap-3">
          <div className="font-poppins text-sm font-semibold text-foreground">
            Legal
          </div>
          <Link href="/terminos-y-condiciones" className="text-[15px] text-muted-foreground hover:text-primary">
            Términos y condiciones
          </Link>
          <Link href="/politica-de-privacidad" className="text-[15px] text-muted-foreground hover:text-primary">
            Política de privacidad
          </Link>
          <Link href="/eliminacion-de-datos" className="text-[15px] text-muted-foreground hover:text-primary">
            Eliminación de datos
          </Link>
        </div>

        <div className="flex flex-col gap-3">
          <div className="font-poppins text-sm font-semibold text-foreground">
            Contacto
          </div>
          <a href="mailto:info@digibotlatam.com" className="text-[15px] text-muted-foreground hover:text-primary">
            info@digibotlatam.com
          </a>
          <a
            href="https://www.instagram.com/digibot_ok/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[15px] text-muted-foreground hover:text-primary"
          >
            Instagram
          </a>
          <a
            href="https://www.facebook.com/profile.php?id=61594108541947"
            target="_blank"
            rel="noreferrer noopener"
            className="text-[15px] text-muted-foreground hover:text-primary"
          >
            Facebook
          </a>
          <a
            href={WA_LINKS.footer}
            target="_blank"
            rel="noreferrer noopener"
            data-track="whatsapp"
            data-location="footer_whatsapp"
            className="text-[15px] text-muted-foreground hover:text-primary"
          >
            WhatsApp
          </a>
        </div>
      </div>

      <div className="mt-10 text-sm text-muted-foreground">
        © {year} DigiBot LATAM. Todos los derechos reservados.
        {version && ` v${version}`}
      </div>
    </footer>
  );
}
