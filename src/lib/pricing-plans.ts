// Planes de precios (tabla web_pricing_plans, migración 0003). Server-only.
// Los usan la landing (sección "Nuestros planes") y el panel (Configuración → Suscripción).

import type { RowDataPacket } from "mysql2";
import { getPool, isDbConfigured } from "./db";

export type Plan = {
  planKey: string;
  name: string;
  tagline: string;
  price: string;
  currency: string;
  billingPeriod: string;
  ctaLabel: string;
  featured: boolean;
  features: string[];
};

// Se usa solo si la DB no está configurada o la consulta falla, para que la
// sección de precios nunca desaparezca de la web.
export const FALLBACK_PLANS: Plan[] = [
  {
    planKey: "basico",
    name: "Básico",
    tagline: "Perfecto para empezar",
    price: "$99",
    currency: "ARS",
    billingPeriod: "/mes",
    ctaLabel: "Elegir Básico",
    featured: false,
    features: [
      "Hasta 1.000 mensajes/mes",
      "WhatsApp Business",
      "Panel de control básico",
      "Soporte por email",
      "Entrenamiento básico de IA",
      "Soporta audios e imágenes",
    ],
  },
  {
    planKey: "premium",
    name: "Premium",
    tagline: "Ideal para marcas en crecimiento",
    price: "$199",
    currency: "ARS",
    billingPeriod: "/mes",
    ctaLabel: "Elegir Premium",
    featured: true,
    features: [
      "Hasta 5.000 mensajes/mes",
      "WhatsApp + Instagram, Facebook y Threads (Universo META)",
      "Panel de control avanzado",
      "Soporte prioritario",
      "IA personalizada avanzada",
      "Estadísticas detalladas",
      "Integración con CRM",
      "Soporta audios e imágenes",
    ],
  },
  {
    planKey: "plus",
    name: "Plus+",
    tagline: "Para empresas grandes",
    price: "$399",
    currency: "ARS",
    billingPeriod: "/mes",
    ctaLabel: "Elegir Plus+",
    featured: false,
    features: [
      "Mensajes ilimitados",
      "Universo META + YouTube, Telegram y TikTok",
      "Panel empresarial completo",
      "Soporte 24/7",
      "IA ultra personalizada",
      "Analytics avanzados",
      "Genera links de ventas",
      "Soporta audios e imágenes",
      "Entrenamiento personalizado",
      "Integración con Google Sheets",
    ],
  },
];

interface PlanRow extends RowDataPacket {
  plan_key: string;
  name: string;
  tagline: string;
  price: string | number;
  currency: string;
  billing_period: string;
  cta_label: string;
  is_featured: number;
  features: string | string[];
}

function formatPrice(price: string | number) {
  const value = typeof price === "string" ? Number(price) : price;
  if (!Number.isFinite(value)) return String(price);
  // Sin decimales cuando es un número redondo (ej: $99 en vez de $99,00).
  const hasDecimals = value % 1 !== 0;
  return `$${value.toLocaleString("es-AR", {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export async function getPlans(): Promise<Plan[]> {
  if (!isDbConfigured()) return FALLBACK_PLANS;

  try {
    const pool = getPool();
    const [rows] = await pool.query<PlanRow[]>(
      `SELECT plan_key, name, tagline, price, currency, billing_period, cta_label, is_featured, features
       FROM web_pricing_plans
       WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    );

    if (!rows.length) return FALLBACK_PLANS;

    return rows.map((row) => ({
      planKey: row.plan_key,
      name: row.name,
      tagline: row.tagline,
      price: formatPrice(row.price),
      currency: row.currency,
      billingPeriod: row.billing_period,
      ctaLabel: row.cta_label,
      featured: Boolean(row.is_featured),
      features: typeof row.features === "string" ? JSON.parse(row.features) : row.features,
    }));
  } catch (err) {
    console.error("Error obteniendo planes de precios de la base:", err);
    return FALLBACK_PLANS;
  }
}
