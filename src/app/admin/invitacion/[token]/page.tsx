import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Logo from "@/components/Logo";
import { findInvite } from "@/lib/crm/team";
import { getMySqlUsersRepo } from "@/lib/crm/users-mysql";
import { isDbConfigured } from "@/lib/db";
import InviteForm from "./InviteForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Creá tu contraseña · DigiBot", robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = isDbConfigured() ? await findInvite(getMySqlUsersRepo(), decodeURIComponent(token)).catch(() => null) : null;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex flex-1 items-center justify-center px-5 py-16 sm:py-24">
        <div className="w-full max-w-[420px] rounded-[26px] border border-border bg-card p-8 shadow-[0_30px_70px_-30px_rgba(28,28,28,0.25)]">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="font-poppins text-xl font-extrabold text-foreground">DigiBot</span>
          </div>
          {user ? (
            <>
              <h1 className="mt-6 font-poppins text-2xl font-bold text-foreground">
                ¡Hola, {user.name.split(" ")[0]}!
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {user.status === "active"
                  ? "Creá una contraseña nueva para entrar al panel."
                  : "Te sumaron al panel de DigiBot. Creá tu contraseña y listo."}
              </p>
              <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
                Vas a entrar con <strong>{user.email}</strong>
              </p>
              <InviteForm token={decodeURIComponent(token)} />
            </>
          ) : (
            <>
              <h1 className="mt-6 font-poppins text-2xl font-bold text-foreground">Este link ya no sirve</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Puede que haya vencido (dura 7 días) o que ya lo hayas usado. Pedile a quien te invitó que te mande
                uno nuevo desde Equipo.
              </p>
              <a
                href="/admin/login"
                className="mt-6 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:border-primary hover:text-primary"
              >
                Ir a entrar al panel
              </a>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
