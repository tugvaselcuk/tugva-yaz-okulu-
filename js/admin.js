import { auth, db, REGISTRATIONS_COL } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { onSnapshot, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { notify, cleanDoubleSpaces, formatName } from "./utils.js";
import { generateQR } from "./qr.js";
import { MAX_QUOTA } from "./config.js";

let registrationsList = [];
let html5QrcodeScanner = null;
let unsubscribeSnapshot = null;

document.addEventListener('DOMContentLoaded', () => {
    // Firebase Kimlik Doğrulama Dinleyicisi
    onAuthStateChanged(auth, (user) => {
        const loginCard = document.getElementById('admin-login-card');
        const dashboard = document.getElementById('admin-dashboard');

        if (user) {
            if (loginCard) loginCard.classList.add('d-none');
            if (dashboard) dashboard.classList.remove('d-none');
            startRealtimeListener();
        } else {
            if (loginCard) loginCard.classList.remove('d-none');
            if (dashboard) dashboard.classList.add('d-none');
            if (unsubscribeSnapshot) {
                unsubscribeSnapshot();
                unsubscribeSnapshot = null;
            }
        }
    });

    setupAdminEvents();
});

function setupAdminEvents() {
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('adminEmail').value.trim();
            const password = document.getElementById('adminPassword').value;

            Swal.fire({ title: 'Giriş Yapılıyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            try {
                await signInWithEmailAndPassword(auth, email, password);
                Swal.close();
                notify.success("Yönetici girişi başarılı.");
            } catch (err) {
                console.error("Giriş hatası:", err);
                Swal.close();
                notify.error("Giriş başarısız! E-posta veya şifre hatalı.");
            }
        });
    }

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                notify.info("Çıkış yapıldı.");
            } catch (err) {
                console.error("Çıkış hatası:", err);
            }
        });
    }

    const searchInput = document.getElementById('adminSearchInput');
    if (searchInput) searchInput.addEventListener('input', renderAdminTable);

    const genderFilter = document.getElementById('adminGenderFilter');
    if (genderFilter) genderFilter.addEventListener('change', renderAdminTable);

    const exportBtn = document.getElementById('exportExcelBtn');
    if (exportBtn) exportBtn.addEventListener('click', exportToExcel);

    const saveEditBtn = document.getElementById('saveEditBtn');
    if (saveEditBtn) saveEditBtn.addEventListener('click', saveRegistrationEdit);

    const qrScanModalEl = document.getElementById('qrScanModal');
    if (qrScanModalEl) {
        qrScanModalEl.addEventListener('shown.bs.modal', startScanner);
        qrScanModalEl.addEventListener('hidden.bs.modal', stopScanner);
    }
}

function startRealtimeListener() {
    if (unsubscribeSnapshot) unsubscribeSnapshot();

    unsubscribeSnapshot = onSnapshot(REGISTRATIONS_COL, (snapshot) => {
        registrationsList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        updateDashboardStats();
        renderAdminTable();
    }, (error) => {
        console.error("Admin verileri dinleme hatası:", error);
        notify.error("Veriler yüklenirken yetki veya bağlantı hatası oluştu.");
    });
}

function updateDashboardStats() {
    const total = registrationsList.length;
    const male = registrationsList.filter(r => r.gender === 'Erkek').length;
    const female = registrationsList.filter(r => r.gender === 'Kadın').length;
    const seated = registrationsList.filter(r => r.seatNumber && r.seatNumber.trim() !== '').length;
    const unseated = total - seated;
    const remainingQuota = MAX_QUOTA - total;

    if (document.getElementById('stat-total')) document.getElementById('stat-total').innerText = total;
    if (document.getElementById('stat-male')) document.getElementById('stat-male').innerText = male;
    if (document.getElementById('stat-female')) document.getElementById('stat-female').innerText = female;
    if (document.getElementById('stat-seated')) document.getElementById('stat-seated').innerText = seated;
    if (document.getElementById('stat-unseated')) document.getElementById('stat-unseated').innerText = unseated;
    if (document.getElementById('stat-quota')) document.getElementById('stat-quota').innerText = remainingQuota < 0 ? 0 : remainingQuota;
}

function renderAdminTable() {
    const tbody = document.getElementById('registrationsTbody');
    if (!tbody) return;

    const searchInput = document.getElementById('adminSearchInput');
    const genderSelect = document.getElementById('adminGenderFilter');

    const search = searchInput ? searchInput.value.toLocaleLowerCase('tr-TR') : '';
    const genderFilter = genderSelect ? genderSelect.value : '';

    const filtered = registrationsList.filter(item => {
        const matchesSearch = 
            (item.name || '').toLocaleLowerCase('tr-TR').includes(search) ||
            (item.surname || '').toLocaleLowerCase('tr-TR').includes(search) ||
            (item.tc || '').includes(search) ||
            (item.phone || '').includes(search) ||
            (item.registerNumber || '').toLocaleLowerCase('tr-TR').includes(search);

        const matchesGender = genderFilter ? item.gender === genderFilter : true;
        return matchesSearch && matchesGender;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">Kayıt bulunamadı.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(item => `
        <tr>
            <td><span class="badge bg-secondary">${item.registerNumber || '-'}</span></td>
            <td class="fw-bold">${item.name} ${item.surname}</td>
            <td>${item.tc}</td>
            <td>${item.phone}</td>
            <td>${item.age} / ${item.gender}</td>
            <td>${item.district} / ${item.neighborhood}</td>
            <td>
                ${item.seatNumber ? `<span class="badge bg-success">${item.seatNumber}</span>` : `<span class="badge bg-outline-warning text-dark border">Atanmadı</span>`}
            </td>
            <td class="text-end">
                <button class="btn btn-sm btn-outline-info me-1" onclick="viewQrModal('${item.id}')"><i class="fa-solid fa-qrcode"></i></button>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal('${item.id}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRegistration('${item.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

window.openEditModal = function(docId) {
    const item = registrationsList.find(r => r.id === docId);
    if (!item) return;

    document.getElementById('editDocId').value = item.id;
    document.getElementById('editRegisterNumber').value = item.registerNumber || '';
    document.getElementById('editSeatNumber').value = item.seatNumber || '';
    document.getElementById('editTc').value = item.tc || '';
    document.getElementById('editName').value = item.name || '';
    document.getElementById('editSurname').value = item.surname || '';
    document.getElementById('editPhone').value = item.phone || '';
    document.getElementById('editGender').value = item.gender || 'Erkek';
    document.getElementById('editDistrict').value = item.district || '';
    document.getElementById('editNeighborhood').value = item.neighborhood || '';
    document.getElementById('editAddress').value = item.address || '';
    document.getElementById('editSchool').value = item.school || '';
    document.getElementById('editClassName').value = item.className || '';
    document.getElementById('editParentName').value = item.parentName || '';
    document.getElementById('editParentPhone').value = item.parentPhone || '';

    new bootstrap.Modal(document.getElementById('editModal')).show();
};

async function saveRegistrationEdit() {
    const docId = document.getElementById('editDocId').value;
    if (!docId) return;

    const docRef = doc(REGISTRATIONS_COL, docId);
    const updatePayload = {
        seatNumber: cleanDoubleSpaces(document.getElementById('editSeatNumber').value),
        tc: cleanDoubleSpaces(document.getElementById('editTc').value),
        name: formatName(document.getElementById('editName').value),
        surname: formatName(document.getElementById('editSurname').value),
        phone: cleanDoubleSpaces(document.getElementById('editPhone').value),
        gender: document.getElementById('editGender').value,
        district: formatName(document.getElementById('editDistrict').value),
        neighborhood: formatName(document.getElementById('neighborhood').value),
        address: cleanDoubleSpaces(document.getElementById('editAddress').value),
        school: formatName(document.getElementById('editSchool').value),
        className: cleanDoubleSpaces(document.getElementById('editClassName').value),
        parentName: formatName(document.getElementById('editParentName').value),
        parentPhone: cleanDoubleSpaces(document.getElementById('editParentPhone').value)
    };

    try {
        await updateDoc(docRef, updatePayload);
        const modalEl = document.getElementById('editModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
        notify.success("Kayıt güncellendi.");
    } catch (err) {
        console.error("Güncelleme hatası:", err);
        notify.error("Kayıt güncellenemedi.");
    }
}

window.deleteRegistration = function(docId) {
    Swal.fire({
        title: 'Silmek istediğinize emin misiniz?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonText: 'İptal',
        confirmButtonText: 'Evet, Sil'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(REGISTRATIONS_COL, docId));
                notify.success("Kayıt silindi.");
            } catch (err) {
                notify.error("Silinemedi.");
            }
        }
    });
};

window.viewQrModal = function(docId) {
    const item = registrationsList.find(r => r.id === docId);
    if (!item) return;

    document.getElementById('qrModalTitle').innerText = `${item.registerNumber} - Detaylar`;
    generateQR('adminQrContainer', item.id);

    document.getElementById('qrDetailsContainer').innerHTML = `
        <p class="mb-1"><strong>Ad Soyad:</strong> ${item.name} ${item.surname}</p>
        <p class="mb-1"><strong>TC Kimlik:</strong> ${item.tc}</p>
        <p class="mb-1"><strong>Telefon:</strong> ${item.phone}</p>
        <p class="mb-1"><strong>Doğum Tarihi / Yaş:</strong> ${item.birthDate} (${item.age})</p>
        <p class="mb-1"><strong>İlçe / Mahalle:</strong> ${item.district} / ${item.neighborhood}</p>
        <p class="mb-1"><strong>Adres:</strong> ${item.address}</p>
        ${item.age < 18 ? `
            <p class="mb-1"><strong>Okul / Sınıf:</strong> ${item.school} / ${item.className}</p>
            <p class="mb-1"><strong>Veli / Tel:</strong> ${item.parentName} (${item.parentPhone})</p>
        ` : ''}
        <p class="mb-0 mt-2 text-primary"><strong>Koltuk No:</strong> ${item.seatNumber || 'Atanmadı'}</p>
    `;

    new bootstrap.Modal(document.getElementById('qrViewModal')).show();
};

function startScanner() {
    if (html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } });
    html5QrcodeScanner.render(onScanSuccess);
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(err => console.error(err));
        html5QrcodeScanner = null;
    }
}

async function onScanSuccess(decodedText) {
    try {
        const parsed = JSON.parse(decodedText);
        if (parsed && parsed.id) {
            stopScanner();
            const scanModalEl = document.getElementById('qrScanModal');
            const modal = bootstrap.Modal.getInstance(scanModalEl);
            if (modal) modal.hide();

            const snap = await getDoc(doc(REGISTRATIONS_COL, parsed.id));
            if (snap.exists()) {
                window.viewQrModal(snap.id);
            } else {
                notify.error("Kayıt bulunamadı!");
            }
        }
    } catch (e) {
        notify.error("Geçersiz QR Kod.");
    }
}

function exportToExcel() {
    if (registrationsList.length === 0) {
        notify.info("Kayıt yok.");
        return;
    }

    const excelData = registrationsList.map(item => ({
        "Kayıt No": item.registerNumber || "",
        "Ad": item.name || "",
        "Soyad": item.surname || "",
        "TC Kimlik": item.tc || "",
        "Telefon": item.phone || "",
        "Doğum Tarihi": item.birthDate || "",
        "Yaş": item.age || 0,
        "Cinsiyet": item.gender || "",
        "İlçe": item.district || "",
        "Mahalle": item.neighborhood || "",
        "Adres": item.address || "",
        "Okul": item.school || "",
        "Sınıf": item.className || "",
        "Veli Adı": item.parentName || "",
        "Veli Telefon": item.parentPhone || "",
        "Koltuk No": item.seatNumber || "Atanmadı"
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Kayıtlar");
    XLSX.writeFile(workbook, `Yaz_Okulu_Kayitlar.xlsx`);
}

