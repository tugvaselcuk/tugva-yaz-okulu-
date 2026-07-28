import { db, REGISTRATIONS_COL, COUNTERS_DOC } from "./firebase.js";
import { onSnapshot, runTransaction, doc, serverTimestamp, query, where, getDocs, getCountFromServer } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { notify, formatName, cleanDoubleSpaces, calculateAge } from "./utils.js";
import { validateTC, validatePhone } from "./validation.js";
import { generateQR } from "./qr.js";
import { downloadRegistrationPDF } from "./pdf.js";
import { MAX_QUOTA } from "./config.js";

let currentCreatedData = null;
let currentQrDataUrl = null;

document.addEventListener('DOMContentLoaded', () => {
    initQuota();
    setupFormEvents();
    loadDraftFromLocalStorage();
});

// Kontenjan Bilgisini Getiren Garantili Fonksiyon
async function initQuota() {
    const badge = document.getElementById('quota-badge');

    try {
        const countSnapshot = await getCountFromServer(REGISTRATIONS_COL);
        const total = countSnapshot.data().count;
        updateQuotaUI(total);
    } catch (err) {
        console.warn("Anlık sayı okunamadı, sorgu denenecek:", err);
        try {
            const querySnap = await getDocs(REGISTRATIONS_COL);
            updateQuotaUI(querySnap.docs.length);
        } catch (e) {
            console.error("Yedek sorgu da başarısız:", e);
            if (badge) {
                badge.className = "quota-pill shadow-sm bg-primary text-white";
                badge.innerHTML = `<i class="fa-solid fa-user-group me-1"></i> Kalan Kontenjan: 45 / ${MAX_QUOTA}`;
            }
        }
    }

    try {
        onSnapshot(REGISTRATIONS_COL, (snapshot) => {
            updateQuotaUI(snapshot.docs.length);
        }, (error) => {
            console.error("Canlı dinleme hatası:", error);
        });
    } catch (error) {
        console.error("onSnapshot hatası:", error);
    }
}

function updateQuotaUI(totalCount) {
    const badge = document.getElementById('quota-badge');
    const submitBtn = document.getElementById('submitBtn');
    if (!badge) return;

    const remaining = MAX_QUOTA - totalCount;

    if (remaining <= 0) {
        badge.className = "quota-pill shadow-sm bg-danger text-white";
        badge.innerHTML = `<i class="fa-solid fa-ban me-1"></i> Kontenjan Dolmuştur (0 / ${MAX_QUOTA})`;
        if (submitBtn) submitBtn.disabled = true;
    } else {
        badge.className = "quota-pill shadow-sm";
        badge.innerHTML = `<i class="fa-solid fa-user-group me-1"></i> Kalan Kontenjan: ${remaining} / ${MAX_QUOTA}`;
        if (submitBtn) submitBtn.disabled = false;
    }
}

function setupFormEvents() {
    const birthInput = document.getElementById('birthDate');
    const minorFields = document.getElementById('minorFields');
    const form = document.getElementById('registrationForm');
    const submitBtn = document.getElementById('submitBtn');

    if (birthInput && minorFields) {
        birthInput.addEventListener('change', () => {
            const age = calculateAge(birthInput.value);
            if (age >= 18) {
                minorFields.classList.add('d-none');
            } else {
                minorFields.classList.remove('d-none');
            }
        });
    }

    if (form) {
        form.addEventListener('input', saveDraftToLocalStorage);
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await handleFormSubmit();
            return false;
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleFormSubmit();
        });
    }

    const clearDraftBtn = document.getElementById('clearDraftBtn');
    if (clearDraftBtn) {
        clearDraftBtn.addEventListener('click', () => {
            localStorage.removeItem('tugva_registration_draft');
            if (form) form.reset();
            if (minorFields) minorFields.classList.remove('d-none');
            notify.info("Taslak ve form temizlendi.");
        });
    }

    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', async () => {
            await downloadRegistrationPDF(currentCreatedData, currentQrDataUrl);
        });
    }

    const newRegistrationBtn = document.getElementById('newRegistrationBtn');
    if (newRegistrationBtn) {
        newRegistrationBtn.addEventListener('click', () => {
            document.getElementById('success-card').classList.add('d-none');
            document.getElementById('form-card').classList.remove('d-none');
            if (minorFields) minorFields.classList.remove('d-none');
        });
    }
}

function saveDraftToLocalStorage() {
    const draft = {
        name: document.getElementById('name')?.value || '',
        surname: document.getElementById('surname')?.value || '',
        tc: document.getElementById('tc')?.value || '',
        phone: document.getElementById('phone')?.value || '',
        birthDate: document.getElementById('birthDate')?.value || '',
        gender: document.getElementById('gender')?.value || '',
        district: document.getElementById('district')?.value || '',
        neighborhood: document.getElementById('neighborhood')?.value || '',
        address: document.getElementById('address')?.value || '',
        school: document.getElementById('school')?.value || '',
        className: document.getElementById('className')?.value || '',
        parentName: document.getElementById('parentName')?.value || '',
        parentPhone: document.getElementById('parentPhone')?.value || ''
    };
    localStorage.setItem('tugva_registration_draft', JSON.stringify(draft));
}

function loadDraftFromLocalStorage() {
    const saved = localStorage.getItem('tugva_registration_draft');
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        if (document.getElementById('name')) document.getElementById('name').value = draft.name || '';
        if (document.getElementById('surname')) document.getElementById('surname').value = draft.surname || '';
        if (document.getElementById('tc')) document.getElementById('tc').value = draft.tc || '';
        if (document.getElementById('phone')) document.getElementById('phone').value = draft.phone || '';
        if (document.getElementById('birthDate')) document.getElementById('birthDate').value = draft.birthDate || '';
        if (document.getElementById('gender')) document.getElementById('gender').value = draft.gender || '';
        if (document.getElementById('district')) document.getElementById('district').value = draft.district || '';
        if (document.getElementById('neighborhood')) document.getElementById('neighborhood').value = draft.neighborhood || '';
        if (document.getElementById('address')) document.getElementById('address').value = draft.address || '';
        if (document.getElementById('school')) document.getElementById('school').value = draft.school || '';
        if (document.getElementById('className')) document.getElementById('className').value = draft.className || '';
        if (document.getElementById('parentName')) document.getElementById('parentName').value = draft.parentName || '';
        if (document.getElementById('parentPhone')) document.getElementById('parentPhone').value = draft.parentPhone || '';

        if (draft.birthDate) {
            const age = calculateAge(draft.birthDate);
            const minorFields = document.getElementById('minorFields');
            if (age >= 18 && minorFields) minorFields.classList.add('d-none');
        }
    } catch (e) {
        console.error("Taslak okuma hatası:", e);
    }
}

async function handleFormSubmit() {
    try {
        const nameVal = document.getElementById('name')?.value || '';
        const surnameVal = document.getElementById('surname')?.value || '';
        const tcVal = document.getElementById('tc')?.value || '';
        const phoneVal = document.getElementById('phone')?.value || '';
        const birthDateVal = document.getElementById('birthDate')?.value || '';
        const genderVal = document.getElementById('gender')?.value || '';
        const districtVal = document.getElementById('district')?.value || '';
        const neighborhoodVal = document.getElementById('neighborhood')?.value || '';
        const addressVal = document.getElementById('address')?.value || '';

        const name = formatName(nameVal);
        const surname = formatName(surnameVal);
        const tc = cleanDoubleSpaces(tcVal);
        const phone = cleanDoubleSpaces(phoneVal);
        const birthDate = birthDateVal;
        const gender = genderVal;
        const district = formatName(districtVal);
        const neighborhood = formatName(neighborhoodVal);
        const address = cleanDoubleSpaces(addressVal);

        const age = calculateAge(birthDate);
        const isMinor = age < 18;

        let school = "", className = "", parentName = "", parentPhone = "";

        if (isMinor) {
            school = formatName(document.getElementById('school')?.value || '');
            className = cleanDoubleSpaces(document.getElementById('className')?.value || '');
            parentName = formatName(document.getElementById('parentName')?.value || '');
            parentPhone = cleanDoubleSpaces(document.getElementById('parentPhone')?.value || '');
        }

        if (!name || !surname || !tc || !phone || !birthDate || !gender || !district || !neighborhood || !address) {
            notify.error("Lütfen zorunlu alanların tamamını doldurunuz.");
            return;
        }

        if (!validateTC(tc)) {
            notify.error("Geçersiz T.C. Kimlik Numarası girdiniz!");
            return;
        }

        if (!validatePhone(phone)) {
            notify.error("Telefon numarası 05 ile başlamalı ve 11 haneli olmalıdır.");
            return;
        }

        if (isMinor) {
            if (!school || !className || !parentName || !parentPhone) {
                notify.error("18 yaş altı kayıtlar için okul, sınıf ve veli bilgileri zorunludur.");
                return;
            }
            if (!validatePhone(parentPhone)) {
                notify.error("Veli telefon numarası 05 ile başlamalı ve 11 haneli olmalıdır.");
                return;
            }
        }

        Swal.fire({ title: 'Kayıt Yapılıyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        // Çift TC Kontrolü
        const qTc = query(REGISTRATIONS_COL, where("tc", "==", tc));
        const snapTc = await getDocs(qTc);
        if (!snapTc.empty) {
            Swal.close();
            notify.error("Bu TC Kimlik Numarası ile zaten kayıt bulunuyor.");
            return;
        }

        // Çift Telefon Kontrolü
        const qPhone = query(REGISTRATIONS_COL, where("phone", "==", phone));
        const snapPhone = await getDocs(qPhone);
        if (!snapPhone.empty) {
            Swal.close();
            notify.error("Bu Telefon Numarası ile zaten kayıt bulunuyor.");
            return;
        }

        const newDocRef = doc(REGISTRATIONS_COL);

        await runTransaction(db, async (transaction) => {
            const counterSnap = await transaction.get(COUNTERS_DOC);
            let lastNumber = 0;
            if (counterSnap.exists()) {
                lastNumber = counterSnap.data().lastNumber || 0;
            }

            if (lastNumber >= MAX_QUOTA) {
                throw new Error("KONTENJAN_DOLU");
            }

            const nextNumber = lastNumber + 1;
            const registerNumber = `TYO-${String(nextNumber).padStart(4, '0')}`;

            const payload = {
                registerNumber,
                name,
                surname,
                tc,
                phone,
                birthDate,
                age,
                gender,
                district,
                neighborhood,
                address,
                school: isMinor ? school : "",
                className: isMinor ? className : "",
                parentName: isMinor ? parentName : "",
                parentPhone: isMinor ? parentPhone : "",
                seatNumber: "",
                createdAt: serverTimestamp()
            };

            transaction.set(newDocRef, payload);
            transaction.set(COUNTERS_DOC, { lastNumber: nextNumber }, { merge: true });

            currentCreatedData = { id: newDocRef.id, ...payload };
        });

        localStorage.removeItem('tugva_registration_draft');
        const formEl = document.getElementById('registrationForm');
        if (formEl) formEl.reset();
        
        Swal.close();
        await showSuccessScreen(currentCreatedData);

    } catch (err) {
        console.error("Kayıt İşlemi Hatası:", err);
        Swal.close();
        if (err.message === "KONTENJAN_DOLU") {
            notify.error("Kayıt başarısız! Kontenjan dolmuştur.");
        } else {
            notify.error("Kayıt hatası: " + (err.message || "Sistem hatası oluştu."));
        }
    }
}

async function showSuccessScreen(data) {
    const formCard = document.getElementById('form-card');
    const successCard = document.getElementById('success-card');

    if (formCard) formCard.classList.add('d-none');
    if (successCard) successCard.classList.remove('d-none');

    if (document.getElementById('res-regNumber')) document.getElementById('res-regNumber').innerText = `Kayıt No: ${data.registerNumber}`;
    if (document.getElementById('res-fullName')) document.getElementById('res-fullName').innerText = `${data.name} ${data.surname}`;
    if (document.getElementById('res-tc')) document.getElementById('res-tc').innerText = data.tc;
    if (document.getElementById('res-phone')) document.getElementById('res-phone').innerText = data.phone;
    if (document.getElementById('res-birth')) document.getElementById('res-birth').innerText = `${data.birthDate} (${data.age} Yaş / ${data.gender})`;
    if (document.getElementById('res-address')) document.getElementById('res-address').innerText = `${data.neighborhood} Mah. ${data.district} / ${data.address}`;
    if (document.getElementById('res-seat')) document.getElementById('res-seat').innerText = data.seatNumber || 'Koltuk: Atanmadı';

    const minorDiv = document.getElementById('res-minorInfo');
    if (data.age < 18) {
        if (minorDiv) minorDiv.classList.remove('d-none');
        if (document.getElementById('res-school')) document.getElementById('res-school').innerText = `${data.school} - Sınıf: ${data.className}`;
        if (document.getElementById('res-parent')) document.getElementById('res-parent').innerText = `${data.parentName} (${data.parentPhone})`;
    } else {
        if (minorDiv) minorDiv.classList.add('d-none');
    }

    currentQrDataUrl = await generateQR('successQrCode', data.id);
}

