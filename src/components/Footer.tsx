// src/components/Footer.tsx
"use client";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <div className="text-center text-sm text-gray-500 mb-6">
      © {year} DigiBot LATAM. Todos los derechos reservados.
    </div>
  );
}
