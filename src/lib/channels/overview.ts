// Estado de Canales de una cuenta (para la pantalla). Server-only.
//
// Junta lo conectado desde el panel con lo que se configuró a mano antes de esta
// etapa (la conexión interna de WhatsApp sin número guardado y las variables
// META_PAGE_* / META_IG_* / THREADS_*). Eso último se muestra como "configurado
// por DigiBot" y no se desconecta desde el panel, para no cortar lo que ya anda.

import { listEnvSocialAccounts } from "../meta-social/accounts";
import { defaultAccountId, getConnectionForAccount, listWhatsAppConnections } from "../whatsapp-connections";
import { metaClientConfig, providerAvailability } from "./config";
import type { ChannelsRepo } from "./repo";
import { socialAccountView, whatsappAccountView } from "./service";
import type { ChannelsOverview, ConnectedAccount, ProviderId } from "./types";

const ENV_PROVIDER: Record<"fb" | "ig" | "th", ProviderId> = { fb: "facebook", ig: "instagram", th: "threads" };

export async function channelsOverview(repo: ChannelsRepo, accountId: number): Promise<ChannelsOverview> {
  const [whatsapp, social] = await Promise.all([repo.listWhatsApp(accountId), repo.listSocial(accountId)]);
  const accounts: ConnectedAccount[] = [...whatsapp.map(whatsappAccountView), ...social.map(socialAccountView)];

  // Conexiones de WhatsApp anteriores al Embedded Signup (sin número guardado) o de las variables.
  const legacy = (await listWhatsAppConnections().catch(() => [])).filter(
    (c) => c.clientId === accountId && !c.phoneNumberId
  );
  // Sin nada en la base: las variables WHATSAPP_* (id 0) valen para la cuenta por defecto.
  const fromEnv = whatsapp.length === 0 && legacy.length === 0 ? await getConnectionForAccount(accountId) : null;
  for (const c of [...legacy, ...(fromEnv?.id === 0 ? [fromEnv] : [])]) {
    accounts.push({
      key: `legacy:wa:${c.id}`,
      provider: "whatsapp",
      title: c.displayPhoneNumber ?? "Número de DigiBot",
      subtitle: `Configurado por DigiBot · WABA ${c.wabaId}`,
      pictureUrl: null,
      connectedAt: c.connectedAt,
      expiresAt: null,
      fromEnv: true,
    });
  }

  if (accountId === defaultAccountId()) {
    for (const env of listEnvSocialAccounts()) {
      if (social.some((s) => s.channel === env.channel && s.externalId === env.accountId)) continue;
      accounts.push({
        key: `env:${env.channel}:${env.accountId}`,
        provider: ENV_PROVIDER[env.channel],
        title: env.displayName ?? env.accountId,
        subtitle: "Configurado por DigiBot",
        pictureUrl: null,
        connectedAt: null,
        expiresAt: null,
        fromEnv: true,
      });
    }
  }

  return { accounts, availability: providerAvailability(), meta: metaClientConfig() };
}
