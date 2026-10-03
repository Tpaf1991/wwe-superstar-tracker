// ============================================================
//  FIREBASE CONFIG — reemplaza con tus datos reales
//  Instrucciones en INSTRUCCIONES.md
// ============================================================
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROJECT.firebaseapp.com",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_PROJECT.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ============================================================
//  CLOUDINARY CONFIG — reemplaza con tus datos reales
//  Instrucciones en INSTRUCCIONES.md (sección Cloudinary)
// ============================================================
window.CLOUDINARY_CLOUD_NAME   = "TU_CLOUD_NAME";
window.CLOUDINARY_UPLOAD_PRESET = "TU_UPLOAD_PRESET";
