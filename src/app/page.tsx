import ClientBody from "./ClientBody";

// Pricing lee los planes desde la base de datos (tabla web_pricing_plans).
// Con esto la home se revalida cada 60s: si cambiás un precio en la DB, se ve
// en la web sin tocar código ni redeployear.
export const revalidate = 60;

export default function Page() { return <ClientBody />; }

