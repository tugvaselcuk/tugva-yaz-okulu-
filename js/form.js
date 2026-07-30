import { db, REGISTRATIONS_COL } from "./firebase.js";
import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Kontenjan sınırlamasını tamamen kaldıran kayıt fonksiyonu
export async function submitRegistrationForm(studentData) {
    try {
        // Doğrudan Firebase'e kayıt ekler, limit kontrolü yapmaz
        const docRef = await addDoc(REGISTRATIONS_COL, {
            ...studentData,
            createdAt: serverTimestamp()
        });

        return docRef.id;
    } catch (err) {
        console.error("Kayıt ekleme hatası:", err);
        throw err;
    }
}

