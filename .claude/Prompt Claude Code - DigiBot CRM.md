# Prompt para Claude Code — DigiBot CRM (bandeja omnicanal)

Te adjunto `DigiBot CRM.dc.html`: es la maqueta aprobada del CRM de DigiBot. Tomala como **referencia visual y funcional exacta** (layout, textos, colores, estados e interacciones). No es código de producción: reimplementala dentro del stack actual del proyecto, respetando su estructura, routing, auth y forma de llamar a la API. Ya existe una "Bandeja de WhatsApp" funcionando: reemplazá su UI por esta y extendela a los demás canales sin romper lo que ya anda (envío, recepción, polling, plantillas).

Antes de escribir código, revisá el repo, decime qué archivos vas a tocar/crear y qué partes del backend faltan. Después implementá por etapas (orden de abajo) y avisame al terminar cada una.

## Objetivo
Un solo panel donde nuestros clientes (negocios, usuarios poco técnicos) gestionen WhatsApp, Instagram (DMs y comentarios) y Facebook Messenger. Prioridad absoluta: que todo se resuelva con 1 o 2 clicks, con textos claros en español rioplatense (voseo: "Escribí", "Elegí", "Tomá").

## Responsive (obligatorio, en todas las pantallas)
- Mobile first. Probar en 360, 768, 1024, 1280 y 1440 px.
- **Desktop (≥1280):** sidebar + lista de conversaciones + chat + panel de contacto (como la maqueta).
- **Laptop (1024–1279):** el panel de contacto se oculta y se abre como drawer desde el botón del header del chat.
- **Tablet (768–1023):** sidebar colapsado a íconos (76 px); lista + chat.
- **Mobile (<768):** sidebar → barra de navegación inferior (Bandeja, Métricas, Equipo, Canales). Bandeja en dos pasos: lista a pantalla completa → al tocar, chat a pantalla completa con botón "volver". Panel de contacto como bottom sheet. Modales a pantalla completa.
- Targets táctiles mínimo 44 px. Composer pegado abajo respetando teclado móvil y `safe-area-inset`. Nada de scroll horizontal; tablas de Equipo/Métricas pasan a tarjetas apiladas en mobile. Gráficos fluidos.

## Marca / estilos
- Colores: primario `#0066FF` (hover `#0047B3`), acento `#66FF99`, tinta `#1C1C1C`, fondo `#F5F7FA`, superficies `#FFFFFF`, bordes `#E8ECF2`, texto secundario `#6B7280`, tinte azul `#F0F6FF` / borde `#D6E6FF`. Éxito `#16A34A`, alerta `#B45309`/`#FEF3C7`, error `#DC2626`/`#FEF2F2`.
- Modo oscuro: fondo `#121212`, sidebar `#171717`, cards `#1C1C1C`, inputs `#232323`, bordes `#2E2E2E`, tinte `#14233D`. Toggle en el sidebar, persistido en localStorage y respetando `prefers-color-scheme` la primera vez.
- Tipografía: Poppins (títulos, botones, 600–800) e Inter (texto, 400–600).
- Botones pill (radio 999px), cards radio 20px, inputs radio 12px. Logo e íconos de canales: usar los SVG de `assets/` de la maqueta (copialos al proyecto).
- Definí estos valores como tokens/variables del sistema de estilos que use el proyecto (CSS vars, Tailwind config, etc.), no hardcodeados.

## Pantallas

### 1. Bandeja (omnicanal)
- **Lista:** buscador (nombre/número/@usuario), chips de canal (Todos, WhatsApp, Instagram, Comentarios, Messenger) con contador de abiertas, segmentado de estado (Abiertas, Sin responder, Mías, Resueltas). Cada fila: avatar con iniciales + ícono del canal, nombre, hora, preview ("Vos:", "DigiBot:"), badge de no leídos, pills "IA respondiendo", asignado y "Ventana cerrada". Estado vacío "Todo al día".
- **Header del chat:** avatar, nombre, handle · canal, badge de ventana 24 h (solo WhatsApp: "Ventana abierta · quedan X h" / "Ventana cerrada"), pill "Responde DigiBot", botón "Resolver", toggle del panel de contacto.
- **Mensajes:** entrante (izquierda, blanco), DigiBot (derecha, tinte azul con label "Respondió DigiBot"), agente (derecha, azul), nota interna (amarillo punteado, "solo la ve tu equipo"), mensajes del sistema centrados ("Tomaste la conversación…"). Estados: Enviado / Leído. Fondo con patrón de WhatsApp solo en ese canal.
- **Errores de envío:** nunca mostrar el error crudo de Meta. Mapear códigos a mensajes humanos (ej. 131030 → "Este número todavía no está habilitado para recibir mensajes de prueba…", 131047 → ventana cerrada, 131026 → número sin WhatsApp, etc.) con botón "Reintentar" y el código en chiquito. Centralizar el mapeo en un solo archivo.
- **Composer, según estado (uno solo a la vez):**
  1. Resuelta → aviso + "Reabrir".
  2. IA activa → banner "DigiBot está atendiendo…" + **"Tomar conversación"** (pausa la IA solo en ese chat y te la asigna).
  3. WhatsApp con ventana cerrada → aviso + **"Enviar plantilla"** (modal con plantillas aprobadas, variables autocompletadas con el nombre).
  4. Normal → respuestas rápidas, adjuntar, textarea (Enter envía, Shift+Enter salto), enviar, link "Devolver a DigiBot".
- **Comentarios de Instagram:** mostrar miniatura y caption del post arriba; selector "En público / Por privado" (privado = private reply de la API).
- **Panel de contacto:** asignar (select de agentes activos), etiquetas toggle de un click, nota interna (autosave con debounce), primer contacto y cantidad de conversaciones.
- Toasts de confirmación para cada acción. Actualización en tiempo real (websocket/SSE si el proyecto lo permite; si no, mantener el polling actual) y optimistic UI al enviar.

### 2. Métricas
Filtro Hoy / 7 días / 30 días. KPIs: conversaciones, % resueltas por DigiBot, tiempo promedio de primera respuesta, esperando respuesta ahora (link a la Bandeja filtrada). Barras apiladas por canal, split DigiBot vs equipo, participación por canal y tabla del equipo (atendidas, tiempo de respuesta, resueltas). Calcular en backend con endpoints agregados.

### 3. Equipo (admin)
Lista de usuarios (avatar, email, rol, canales habilitados, estado Activo / Invitación enviada, Editar). Modal "Crear usuario": nombre, email, rol con tarjetas explicadas, canales como chips; envía invitación por email para que cree su contraseña. Validaciones inline.
Roles y permisos (aplicar en backend, no solo ocultando UI):
- **Administrador:** todo, incluido Equipo y Canales.
- **Supervisor:** todas las conversaciones y Métricas; sin configuración.
- **Agente:** solo la Bandeja de los canales asignados.

### 4. Canales (admin)
Tarjetas por canal con estado Conectado / Sin conectar, cuenta vinculada y botón Conectar / Desconectar (flujo OAuth de Meta / Embedded Signup cuando seamos Tech Provider; dejarlo preparado con la interfaz aunque algún canal todavía no esté disponible).

## Modelo de datos sugerido (adaptalo a lo existente)
`Contact`, `Conversation` (channel: wa|ig|ig_comment|messenger, status, bot_active, assignee_id, window_expires_at, tags, note, unread_count), `Message` (direction, author: customer|bot|agent|system|note, body, status, error_code, meta_message_id), `User` (role, channels[], status), `ChannelAccount`, `Template`. Normalizá los webhooks de los tres canales a este modelo para que la UI sea una sola.

## Etapas
1. Tokens de diseño, layout base, sidebar, modo oscuro y responsive.
2. Bandeja con WhatsApp (migrar lo actual) + estados del composer + errores humanos.
3. Instagram DMs, comentarios y Messenger.
4. Equipo, roles y permisos.
5. Métricas.
6. Canales.

## Calidad
Accesibilidad (contraste AA, foco visible, labels, navegación por teclado), estados de carga (skeletons) y error en cada vista, sin regresiones en lo que ya funciona. Al final pasame una lista de lo que quedó pendiente o necesita configuración del lado de Meta.
