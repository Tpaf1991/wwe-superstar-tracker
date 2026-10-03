# WWE 2K25 — Superstar Mode Tracker
## Guía de instalación y despliegue

---

## PASO 1 — Crear cuenta en Firebase

1. Ve a https://firebase.google.com
2. Haz clic en **"Comenzar"** o **"Get started"**
3. Inicia sesión con tu cuenta de Google
4. Haz clic en **"Agregar proyecto"**
5. Nombre del proyecto: `wwe-superstar` (o el que quieras)
6. Desactiva Google Analytics (no es necesario) → **Crear proyecto**
7. Espera que se cree → **Continuar**

---

## PASO 2 — Configurar Firestore (base de datos)

1. En el panel de Firebase, en el menú izquierdo ve a **"Firestore Database"**
2. Haz clic en **"Crear base de datos"**
3. Selecciona **"Comenzar en modo de prueba"** → **Siguiente**
4. Elige la ubicación más cercana (ej: `us-central`) → **Listo**

---

## PASO 3 — Obtener las credenciales de Firebase

1. En el panel de Firebase, haz clic en el ícono de engranaje ⚙️ → **"Configuración del proyecto"**
2. Baja hasta la sección **"Tus aplicaciones"**
3. Haz clic en el ícono `</>` (Web)
4. Nombre de la app: `wwe-tracker` → **Registrar app**
5. Verás un bloque de código como este:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "wwe-superstar.firebaseapp.com",
  projectId: "wwe-superstar",
  storageBucket: "wwe-superstar.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

6. **Copia esos valores** y reemplázalos en el archivo `firebase-config.js` de este proyecto

---

## PASO 4 — Actualizar firebase-config.js

Abre el archivo `firebase-config.js` y reemplaza cada campo:

```javascript
const firebaseConfig = {
  apiKey: "← pega tu apiKey aquí",
  authDomain: "← pega tu authDomain aquí",
  projectId: "← pega tu projectId aquí",
  storageBucket: "← pega tu storageBucket aquí",
  messagingSenderId: "← pega tu messagingSenderId aquí",
  appId: "← pega tu appId aquí"
};
```

---

## PASO 5 — Crear cuenta en Netlify

1. Ve a https://app.netlify.com/signup
2. Regístrate con tu cuenta de Google o GitHub (recomendado)
3. Completa el proceso de registro

---

## PASO 6 — Subir el proyecto a Netlify

### Opción A — Arrastrar y soltar (más fácil)

1. Ve a https://app.netlify.com
2. Haz clic en **"Add new site"** → **"Deploy manually"**
3. Comprime todos los archivos del proyecto en un ZIP:
   - `index.html`
   - `style.css`
   - `app.js`
   - `firebase-config.js` ← asegúrate de tener tus credenciales reales
   - `netlify.toml`
4. Arrastra el ZIP a la zona de subida de Netlify
5. Netlify desplegará tu sitio automáticamente
6. Recibirás una URL como: `https://nombre-aleatorio.netlify.app`

### Opción B — GitHub (recomendado para actualizaciones futuras)

1. Crea una cuenta en https://github.com si no tienes
2. Crea un nuevo repositorio: "wwe-superstar"
3. Sube todos los archivos del proyecto
4. En Netlify: **"Add new site"** → **"Import an existing project"** → conecta GitHub
5. Selecciona tu repositorio → **Deploy site**

---

## PASO 7 — Configurar reglas de seguridad en Firestore (opcional pero recomendado)

1. En Firebase → Firestore → **"Reglas"**
2. Reemplaza el contenido con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Haz clic en **"Publicar"**

> ⚠️ Nota: Esta configuración permite acceso público. Es suficiente para uso personal.
> Si quieres protegerlo con autenticación en el futuro, avísame.

---

## ARCHIVOS DEL PROYECTO

```
wwe-superstar/
├── index.html          ← Estructura HTML de la app
├── style.css           ← Estilos y diseño visual
├── app.js              ← Toda la lógica de la aplicación
├── firebase-config.js  ← ← TUS CREDENCIALES VAN AQUÍ
├── netlify.toml        ← Configuración de Netlify
└── INSTRUCCIONES.md    ← Esta guía
```

---

## ¿PROBLEMAS?

- **La página carga pero no guarda datos**: Revisa que `firebase-config.js` tenga las credenciales correctas (sin espacios extra, con comillas)
- **Error "Firebase: No Firebase App"**: Las credenciales en `firebase-config.js` están incompletas o incorrectas
- **Netlify muestra error 404**: Asegúrate de que `index.html` esté en la raíz del ZIP, no dentro de una carpeta

---

¡Listo! Tu tracker estará disponible en la URL que te entrega Netlify.

---

## PASO 8 — Configurar Cloudinary (para subir imágenes)

### 8.1 Crear cuenta

1. Ve a https://cloudinary.com/users/register_free
2. Regístrate gratis (no requiere tarjeta de crédito)
3. El plan gratuito incluye 25 GB de almacenamiento y 25 GB de transferencia mensual — más que suficiente

### 8.2 Obtener tu Cloud Name

1. Al ingresar al dashboard de Cloudinary verás en la parte superior tu **Cloud Name** (ej: `dxyz12abc`)
2. Cópialo — lo necesitas en el paso 8.4

### 8.3 Crear un Upload Preset sin firma (unsigned)

1. En el menú superior de Cloudinary ve a **Settings** (ícono de engranaje) → **Upload**
2. Baja hasta la sección **Upload presets**
3. Haz clic en **Add upload preset**
4. Configura:
   - **Preset name**: `wwe-superstar` (o el que quieras, anótalo)
   - **Signing Mode**: cambia a **Unsigned**
   - **Folder**: `wwe-superstar` (opcional, organiza tus imágenes)
5. Haz clic en **Save**

### 8.4 Actualizar firebase-config.js

Abre `firebase-config.js` y reemplaza los dos valores de Cloudinary:

```javascript
window.CLOUDINARY_CLOUD_NAME    = "dxyz12abc";        // ← tu Cloud Name
window.CLOUDINARY_UPLOAD_PRESET = "wwe-superstar";    // ← el nombre del preset
```

---

¡Listo! Las imágenes se subirán directamente a Cloudinary al guardar cada lucha,
y la URL quedará guardada en Firestore junto al resto de los datos.
