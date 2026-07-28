import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Anonim Oturum Başlatma (Firebase yetkilendirme garantisi için)
signInAnonymously(auth).catch((err) => {
    console.warn("Anonim oturum başlatılamadı:", err);
});

export const REGISTRATIONS_COL = collection(db, 'registrations');
export const COUNTERS_DOC = doc(db, 'counters', 'registrationCounter');

