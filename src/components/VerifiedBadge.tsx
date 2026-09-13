import Image from "next/image";

// El archivo fuente es 1200x800 (relación 3:2). Se respeta esa proporción
// para que el sello no se vea aplastado a los costados.
const ASPECT_RATIO = 1200 / 800;

export default function VerifiedBadge({ size = 16 }: { size?: number }) {
  const width = Math.round(size * ASPECT_RATIO);
  return (
    <Image
      src="/Meta-Verified-for-Businesses-launch-TRANSPARENTE.png"
      alt="Verificado por META"
      width={width}
      height={size}
      className="flex-none"
      style={{ width, height: size }}
    />
  );
}
