# Tomalo CRM â Tickets (WhatsApp/Email) + CRM Comercial

Sistema multiusuario y multicanal para transformar mensajes de WhatsApp y correos
en tickets de soporte, y para llevar el pipeline comercial (CRM) de Tomalo.

- **Backend**: Node.js puro (sin dependencias externas), `node:sqlite` como base de datos.
- **Frontend**: SPA en HTML/CSS/JS plano, con colores de marca Tomalo (naranjo / carbÃ³n / blanco).
- **Multicanal**: varios nÃºmeros de WhatsApp Business (Meta Cloud API) y varias cuentas de email (Resend / SendGrid / Mailgun).
- **Multiusuario**: roles `admin`, `comercial`, `agente`, cada uno con su propio login.

---

## 1. Requisitos

- Node.js **22.5 o superior** (usa `node:sqlite`, una API experimental incluida en Node).
- No se necesita instalar nada con `npm install` â el proyecto no tiene dependencias.

---

## 2. Correr en local

```bash
cd transporte-crm-app
node server.js
```

Al arrancar por primera vez, el servidor:

1. Crea el archivo `data/tomalo.db` (SQLite).
2. Lo puebla con datos de ejemplo: usuarios, clientes, tickets, oportunidades, canales de prueba y conversaciones.
3. Queda escuchando en `http://localhost:3000` (o el puerto que indique `PORT`).

Abre `http://localhost:3000` en el navegador.

### Usuarios de prueba

| Email | ContraseÃ±a | Rol |
|---|---|---|
| admin@tomalo.cl | admin123 | admin |
| comercial@tomalo.cl | comercial123 | comercial |
| soporte@tomalo.cl | soporte123 | agente |

**Importante**: cambia estas contraseÃ±as (o crea usuarios nuevos y desactiva/elimina estos) antes de usar el sistema en producciÃ³n, desde la pestaÃ±a **Usuarios** (solo visible para `admin`).

### Variables de entorno

Ver `.env.example`:

- `PORT` â puerto HTTP (por defecto 3000).
- `DB_PATH` â ruta del archivo SQLite (por defecto `./data/tomalo.db`).

---

## 3. Roles

- **admin**: acceso total. Ãnico rol que puede gestionar **Canales** (WhatsApp/Email) y **Usuarios**.
- **comercial**: Dashboard, CRM/Pipeline, Clientes, Tickets, bandejas de WhatsApp/Email.
- **agente**: Dashboard, Tickets, bandejas de WhatsApp/Email, Clientes (sin pipeline comercial restringido, pero pensado para soporte).

---

## 4. Desplegar en Render / Railway / Fly.io

El proyecto es un servidor Node estÃ¡ndar (`node server.js`), por lo que funciona en cualquiera de estas plataformas sin configuraciÃ³n especial.

### Render
1. Crea un nuevo **Web Service** apuntando a este repositorio.
2. Build command: *(vacÃ­o â como no hay dependencias, usa `echo "no build needed"` si exige).
3. Start command: `node server.js`.
4. Variables de entorno: agrega `DB_PATH=/data/tomalo.db` **solo si** usas un *Persistent Disk* montado en `/data` (recomendado).
5. Render asigna `PORT` automÃ¡ticamente â el servidor ya lo respeta.

### Railway
1. Nuevo proyecto â Deploy from repo.
2. Railway detecta Node automÃ¡ticamente. Start command: `node server.js`.
3. Agrega un **Volume** y monta en `/data`, luego define `DB_PATH=/data/tomalo.db` para persistencia.

### Fly.io
1. `fly launch` (sin Dockerfile necesario si usas el buildpack de Node, o agrega uno simple con `CMD ["node","server.js"]`).
2. Crea un volumen y mÃ³ntalo, define `DB_PATH` apuntando a la ruta montada.

> â ï¸ Sin un volumen/disco persistente, cada redeploy borra la base de datos (vuelve a poblarse con los datos de ejemplo). Para producciÃ³n real, **configura almacenamiento persistente**.

---

## 5. Configurar WhatsApp Business (Meta Cloud API)

El sistema soporta **mÃºltiples nÃºmeros de WhatsApp**. Cada nÃºmero se configura como un "canal" desde la pestaÃ±a **Canales** (solo admin).

### Paso a paso (por cada nÃºmero)

1. Ve a [developers.facebook.com/apps](https://developers.facebook.com/apps) y crea (o usa) una App de tipo "Business".
2. Agrega el producto **WhatsApp** a la app.
3. En el panel de WhatsApp â **Cuenta de la API**, obtÃ©n:
   - **Phone number ID**
   - **WhatsApp Business Account ID (WABA ID)**
4. Genera un **token de acceso permanente**:
   - Ve a Business Settings â System Users â crea un System User con rol Admin.
   - Asigna la app y el permiso `whatsapp_business_messaging`.
   - Genera un token sin fecha de expiraciÃ³n.
5. En Tomalo CRM, ve a **Canales â + Agregar nÃºmero de WhatsApp** y completa:
   - Nombre interno (ej: "AtenciÃ³n Norte")
   - TelÃ©fono visible
   - Phone Number ID
   - WABA ID
   - Token de acceso permanente
   - (El token de verificaciÃ³n del webhook se genera automÃ¡ticamente, pero puedes cambiarlo)
6. Guarda. La tabla de Canales mostrarÃ¡ la **URL del webhook**, algo como:
   ```
   https://tu-dominio.com/webhook/whatsapp/cw_xxxxxxxx
   ```
7. En Meta for Developers â WhatsApp â Configuration â Webhook:
   - **Callback URL**: la URL anterior.
   - **Verify token**: el `verify_token` mostrado en la tabla de Canales.
   - SuscrÃ­bete al campo `messages`.

Listo â los mensajes entrantes a ese nÃºmero aparecerÃ¡n en la bandeja de **WhatsApp** del sistema, y las respuestas desde ahÃ­ se enviarÃ¡n por la Cloud API.

---

## 6. Configurar cuentas de Email

TambiÃ©n se soportan **mÃºltiples cuentas de correo**, cada una con su propio proveedor de envÃ­o via API (no se usa SMTP/IMAP).

Proveedores soportados: **Resend**, **SendGrid**, **Mailgun**.

### Paso a paso (por cada cuenta)

1. Crea una cuenta/API key en el proveedor elegido:
   - **Resend**: [resend.com](https://resend.com) â API Keys.
   - **SendGrid**: [sendgrid.com](https://sendgrid.com) â Settings â API Keys.
   - **Mailgun**: [mailgun.com](https://mailgun.com) â API Keys + dominio verificado.
2. En Tomalo CRM, ve a **Canales â + Agregar cuenta de email**:
   - Nombre interno (ej: "Soporte")
   - DirecciÃ³n de correo (ej: `soporte@tomalo.cl`, debe estar verificada en el proveedor)
   - Proveedor (resend / sendgrid / mailgun)
   - API Key
   - Dominio (solo necesario para Mailgun)
3. Guarda. La tabla mostrarÃ¡ la **URL del webhook entrante** y el **secret**:
   ```
   https://tu-dominio.com/webhook/email/ce_xxxxxxxx
   ```
4. Configura el "inbound parsing"/"webhook entrante" del proveedor para que haga `POST` a esa URL con el formato:
   ```json
   { "secret": "...", "from": "Nombre <correo@dominio.com>", "subject": "...", "text": "..." }
   ```
   (En Resend/Mailgun puedes usar una Route o un Worker intermedio que transforme el payload a este formato si el nativo difiere.)

Los correos entrantes aparecerÃ¡n en la bandeja de **Email**, y las respuestas se enviarÃ¡n viá la API del proveedor configurado.

---

## 7. Flujo de trabajo

1. Llega un mensaje (WhatsApp o Email) â aparece en la bandeja correspondiente, vinculado automÃ¡ticamente a un cliente si el telÃ©fono/email coincide.
2. Desde la conversaciÃ³n puedes:
   - **Responder** directamente (se envÃ­a de verdad por WhatsApp/Email).
   - **+ Ticket** crea un ticket de soporte.
   - **+ Oportunidad** crea una oportunidad en CRM.

---

## 8. Estructura del proyecto

```
transporte-crm-app/
âââ server.js
âââ db.js
âââ auth.js
âââ lib/router.js
âââ integrations/whatsapp.js
âââ integrations/email.js
âââ routes/...
âââ public/index.html, styles.css, app.js
```

---

## 9. Seguridad

- ContraseÃ±as hasheadas con `pbkdf2` (100.000 iteraciones).
- Sesiones: tokens aleatorios con expiraciÃ³n 7 dÃ­as.
- Secretos de canales ocultos para no-admin (*â¢â¢â¢â¢â¢â¢â¢â¢*).
