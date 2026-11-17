// Next.js lo ejecuta una vez al arrancar el server. Acá se prenden las tareas en
// segundo plano de WhatsApp (ver src/lib/whatsapp-accounts/scheduler.ts).
//
// El import tiene que quedar dentro de este `if` literal: así Next lo saca del bundle
// de edge (nodemailer y mysql2 solo existen en Node).

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.DB_HOST || !process.env.DB_DATABASE) return;
    const { startWaScheduler } = await import("./lib/whatsapp-accounts/scheduler");
    startWaScheduler();
  }
}
