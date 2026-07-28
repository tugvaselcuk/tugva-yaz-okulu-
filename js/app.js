import { db, REGISTRATIONS_COL, COUNTERS_DOC } from "./firebase.js";
import { onSnapshot, runTransaction, doc, serverTimestamp, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { notify, formatName, cleanDoubleSpaces, calculateAge } from "./utils.js";
import { validateTC, validatePhone } from "./validation.js";
import { generateQR } from "./qr.js";
import { downloadRegistrationPDF } from "./pdf.js";
import { MAX_QUOTA } from "./config.js";

let currentCreatedData = null;
let currentQrDataUrl = null;

document.addEventListener('DOMContentLoaded', () => {
    listenToQuota();
    setupFormEvents();
    loadDraftFromLocalStorage();
});

function listenToQuota() {
    onSnapshot(REGISTRATIONS_COL, (snapshot) => {
        const total = snapshot.docs.length;
        const remaining = MAX_QUOTA - total;
        const badge = document.getElementById('quota-badge');
        
        if (remaining <= 0) {
            badge.className = "badge bg-danger fs-6 px-3 py-2";
            badge.innerHTML = `<i class="fa-solid fa-ban me-1"></i> Kontenjan Dolmuştur (0 / ${MAX_QUOTA})`;
            document.getElementById('submitBtn').disabled = true;
        } else {
            badge.className = "badge bg-primary fs-6 px-3 py-2";
            badge.innerHTML = `<i class="fa-solid fa-user-group me-1"></i> Kalan Kontenjan: ${remaining} / ${MAX_QUOTA}`;
            document.getElementById('submitBtn').disabled = false;
        }
    });
}

function setupFormEvents() {
    const birthInput = document.getElementById('birthDate');
    const minorFields = document.getElementById('minorFields');
    const form = document.getElementById('registrationForm');

    birthInput.addEventListener('change', () => {
        const age = calculateAge(birthInput.value);
        if (age >= 18) {
            minorFields.classList.add('d-none');
        } else {
            minorFields.classList.remove('d-none');
        }
    });

    form.addEventListener('input', saveDraftToLocalStorage);

    document.getElementById('clearDraftBtn').addEventListener('click', () => {
        localStorage.removeItem('tugva_registration_draft');
        form.reset();
        minorFields.classList.remove('d-none');
        notify.info("Taslak ve form temizlendi.");
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleFormSubmit();
    });

    document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
        await downloadRegistrationPDF(currentCreatedData, currentQrDataUrl);
    });

    document.getElementById('newRegistrationBtn').addEventListener('click', () => {
        document.getElementById('success-card').classList.add('d-none');
        document.getElementById('form-card').classList.remove('d-none');
        document.getElementById('minorFields').classList.remove('d-none');
    });
}

function saveDraftToLocalStorage() {
    const draft = {
        name: document.getElementById('name').value,
        surname: document.getElementById('surname').value,
        tc: document.getElementById('tc').value,
        phone: document.getElementById('phone').value,
        birthDate: document.getElementById('birthDate').value,
        gender: document.getElementById('gender').value,
        district: document.getElementById('district').value,
        neighborhood: document.getElementById('neighborhood').value,
        address: document.getElementById('address').value,
        school: document.getElementById('school').value,
        className: document.getElementById('className').value,
        parentName: document.getElementById('parentName').value,
        parentPhone: document.getElementById('parentPhone').value
    };
    localStorage.setItem('tugva_registration_draft', JSON.stringify(draft));
}

function loadDraftFromLocalStorage() {
    const saved = localStorage.getItem('tugva_registration_draft');
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        document.getElementById('name').value = draft.name || '';
        document.getElementById('surname').value = draft.surname || '';
        document.getElementById('tc').value = draft.tc || '';
        document.getElementById('phone').value = draft.phone || '';
        document.getElementById('birthDate').value = draft.birthDate || '';
        document.getElementById('gender').value = draft.gender || '';
        document.getElementById('district').value = draft.district || '';
        document.getElementById('neighborhood').value = draft.neighborhood || '';
        document.getElementById('address').value = draft.address || '';
        document.getElementById('school').value = draft.school || '';
        document.getElementById('className').value = draft.className || '';
        document.getElementById('parentName').value = draft.parentName || '';
        document.getElementById('parentPhone').value = draft.parentPhone || '';

        if (draft.birthDate) {
            const age = calculateAge(draft.birthDate);
            if (age >= 18) document.getElementById('minorFields').classList.add('d-none');
        }
    } catch (e) {
        console.error(e);
    }
}

async function handleFormSubmit() {
    const name = formatName(document.getElementById('name').value);
    const surname = formatName(document.getElementById('surname').value);
    const tc = cleanDoubleSpaces(document.getElementById('tc').value);
    const phone = cleanDoubleSpaces(document.getElementById('phone').value);
    const birthDate = document.getElementById('birthDate').value;
    const gender = document.getElementById('gender').value;
    const district = formatName(document.getElementById('district').value);
    const neighborhood = formatName(document.getElementById('neighborhood').value);
    const address = cleanDoubleSpaces(document.getElementById('address').value);

    const age = calculateAge(birthDate);
    const isMinor = age < 18;

    let school = "", className = "", parentName = "", parentPhone = "";

    if (isMinor) {
        school = formatName(document.getElementById('school').value);
        className = cleanDoubleSpaces(document.getElementById('className').value);
        parentName = formatName(document.getElementById('parentName').value);
        parentPhone = cleanDoubleSpaces(document.getElementById('parentPhone').value);
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

    try {
        const qTc = query(REGISTRATIONS_COL, where("tc", "==", tc));
        const snapTc = await getDocs(qTc);
        if (!snapTc.empty) {
            Swal.close();
            notify.error("Bu TC Kimlik Numarası ile zaten kayıt bulunuyor.");
            return;
        }

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
        document.getElementById('registrationForm').reset();
        Swal.close();
        await showSuccessScreen(currentCreatedData);

    } catch (err) {
        console.error(err);
        if (err.message === "KONTENJAN_DOLU") {
            notify.error("Kayıt başarısız! Kontenjan dolmuştur.");
        } else {
            notify.error("Kayıt oluşturulurken bir hata meydana geldi.");
        }
    }
}

async function showSuccessScreen(data) {
    document.getElementById('form-card').classList.add('d-none');
    document.getElementById('success-card').classList.remove('d-none');

    document.getElementById('res-regNumber').innerText = `Kayıt No: ${data.registerNumber}`;
    document.getElementById('res-fullName').innerText = `${data.name} ${data.surname}`;
    document.getElementById('res-tc').innerText = data.tc;
    document.getElementById('res-phone').innerText = data.phone;
    document.getElementById('res-birth').innerText = `${data.birthDate} (${data.age} Yaş / ${data.gender})`;
    document.getElementById('res-address').innerText = `${data.neighborhood} Mah. ${data.district} / ${data.address}`;
    document.getElementById('res-seat').innerText = data.seatNumber || 'Atanmadı';

    const minorDiv = document.getElementById('res-minorInfo');
    if (data.age < 18) {
        minorDiv.classList.remove('d-none');
        document.getElementById('res-school').innerText = `${data.school} - Sınıf: ${data.className}`;
        document.getElementById('res-parent').innerText = `${data.parentName} (${data.parentPhone})`;
    } else {
        minorDiv.classList.add('d-none');
    }

    // QR Kodunu üret ve base64 URL'ini değişkene kaydet
    currentQrDataUrl = await generateQR('successQrCode', data.id);
}

