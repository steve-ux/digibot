const SIDEBAR_ITEMS = [
  { label: "Conversaciones", active: true },
  { label: "Estadísticas", active: false },
  { label: "Base de datos", active: false },
  { label: "Ajustes del bot", active: false },
];

const KPIS = [
  { label: "Chats hoy", value: "148", color: "text-foreground" },
  { label: "Resueltos por IA", value: "92%", color: "text-primary" },
  { label: "Derivados", value: "11", color: "text-destructive" },
];

const BARS = [38, 56, 44, 78, 62, 88, 52];

const ROWS = [
  { name: "Lucía M.", text: "Consultó por envíos a Córdoba", tag: "IA", tagColor: "text-primary" },
  { name: "Diego R.", text: "Pidió hablar con una persona", tag: "VOS", tagColor: "text-destructive" },
];

export default function PanelCrm() {
  return (
    <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 md:py-28">
      <div className="flex flex-wrap items-center gap-10 lg:gap-16">
        <div className="min-w-0 flex-[1.3_1_430px] overflow-hidden rounded-[26px] border border-border bg-card shadow-[0_24px_60px_-34px_rgba(28,28,28,0.28)]">
          <div className="flex items-center gap-1.5 border-b border-border px-5 py-4">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
            <span className="ml-3 text-xs font-semibold text-muted-foreground">
              panel.digibotlatam.com
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,110px)_minmax(0,1fr)] sm:grid-cols-[150px_minmax(0,1fr)]">
            <div className="flex min-h-[320px] flex-col gap-2 bg-muted p-4">
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={
                    item.active
                      ? "rounded-[10px] bg-primary px-3 py-2.5 text-[13px] font-semibold text-white"
                      : "rounded-[10px] px-3 py-2.5 text-[13px] text-muted-foreground"
                  }
                >
                  {item.label}
                </div>
              ))}
              <div className="mt-auto flex items-center gap-2 border-t border-border pt-3.5">
                <span className="h-2 w-2 rounded-full bg-secondary" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Bot encendido
                </span>
              </div>
            </div>

            <div className="p-5">
              <div className="mb-4 grid grid-cols-3 gap-3">
                {KPIS.map((kpi) => (
                  <div key={kpi.label} className="min-w-0 rounded-2xl bg-muted p-3">
                    <div className="text-[11px] font-semibold leading-tight text-muted-foreground">
                      {kpi.label}
                    </div>
                    <div className={`font-poppins text-xl font-bold leading-tight sm:text-[22px] ${kpi.color}`}>
                      {kpi.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex h-24 items-end gap-2 px-0.5">
                {BARS.map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-md ${
                      i === 3 || i === 5 ? "bg-primary" : "bg-primary/20"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3.5">
                {ROWS.map((row) => (
                  <div key={row.name} className="flex items-center gap-2.5">
                    <span className="h-[26px] w-[26px] flex-none rounded-full bg-muted" />
                    <span className="whitespace-nowrap text-sm font-semibold text-foreground">
                      {row.name}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                      {row.text}
                    </span>
                    <span className={`flex-none text-[11px] font-bold ${row.tagColor}`}>
                      {row.tag}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-[1_1_300px]">
          <div className="font-poppins text-sm font-bold tracking-[2px] text-primary">
            PANEL CRM
          </div>
          <h2 className="mt-4 font-poppins text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl lg:text-[42px]">
            Un panel propio para gestionar tus conversaciones
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Controlá los diálogos que tiene el bot con tus clientes y tomá el
            control cuando el usuario quiera ser derivado con un humano. Podés
            encender y apagar el bot cuando vos quieras. Accedé a estadísticas
            de tus chats.
          </p>
        </div>
      </div>
    </section>
  );
}
