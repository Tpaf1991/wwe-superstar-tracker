// ============================================================
//  FIREBASE CONFIG — reemplaza con tus datos reales
//  Instrucciones en INSTRUCCIONES.md
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAkLg9oGV9xNYNQVvNLvl-zGhzmAx_3Zd4",
  authDomain: "superstar-mode.firebaseapp.com",
  projectId: "superstar-mode",
  storageBucket: "superstar-mode.firebasestorage.app",
  messagingSenderId: "682975851590",
  appId: "1:682975851590:web:a655e6abe2ca22db894647"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
//  CLOUDINARY CONFIG — reemplaza con tus datos reales
//  Instrucciones en INSTRUCCIONES.md (sección Cloudinary)
// ============================================================
window.CLOUDINARY_CLOUD_NAME   = "ddzpwpjza";
window.CLOUDINARY_UPLOAD_PRESET = "wwe-superstar-tracker";