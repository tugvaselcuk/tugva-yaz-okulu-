import { db, REGISTRATIONS_COL } from "./firebase.js";
import { onSnapshot, doc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { generateQR } from "./qr.js";
import { MAX_QUOTA } from "./config.js";

let allStudents = [];
let filteredStudents = [];
let html5QrcodeScanner = null;
let currentSelectedStudentForQr = null;

document.addEventListener('DOMContentLoaded', () => {
    initAdminPage();
});

function initAdminPage() {
    setupRealtimeListener();
    setupSearchAndFilterEvents();
    setupExcelExportEvent();
    setupEditFormEvent();
    setupQrModalActions();
    setupScannerEvents();
}

// Canlı Firestore Veri Dinleyicisi
function setupRealtimeListener() {
    onSnapshot(REGISTRATIONS_COL, (snapshot) => {
        allStudents = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        processAndRenderData();
    }, (error) => {
        console.error("Firestore okuma hatası:", error);
        const tbody = document.getElementById('studentTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-4">Veriler yüklenirken bir hata oluştu. Lütfen sayfayı yenileyiniz.</td></tr>`;
        }
    });
}

// Arama, Sıralama ve Filtre Dinleyicileri
function setupSearchAndFilterEvents() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const seatFilterSelect = document.getElementById('seatFilterSelect');

    if (searchInput) searchInput.addEventListener('input', processAndRenderData);
    if (sortSelect) sortSelect.addEventListener('change', processAndRenderData);
    if (seatFilterSelect) seatFilterSelect.addEventListener('change', processAndRenderData);
}

// Verileri İşleme, Soyada ve Manuel İndekse Göre Sıralama
function processAndRenderData() {
    let result = [...allStudents];

    // 1. Arama Filtresi
    const searchTerm = (document.getElementById('searchInput')?.value || '').trim().toLowerCase('tr');
    if (searchTerm) {
        result = result.filter(s => 
            (s.name || '').toLowerCase('tr').includes(searchTerm) ||
            (s.surname || '').toLowerCase('tr').includes(searchTerm) ||
            (s.tc || '').includes(searchTerm) ||
            (s.phone || '').includes(searchTerm) ||
            (s.registerNumber || '').toLowerCase('tr').includes(searchTerm) ||
            (s.seatNumber || '').toLowerCase('tr').includes(searchTerm) ||
            (s.parentName || '').toLowerCase('tr').includes(searchTerm)
        );
    }

    // 2. Koltuk Filtresi
    const seatFilterVal = document.getElementById('seatFilterSelect')?.value || 'all';
    if (seatFilterVal === 'seated') {
        result = result.filter(s => s.seatNumber && s.seatNumber.trim() !== '');
    } else if (seatFilterVal === 'unseated') {
        result = result.filter(s => !s.seatNumber || s.seatNumber.trim() === '');
    }

    // 3. Soyadı Sayılarını Hesaplama (Aynı soyada sahip kaç kişi var?)
    const surnameCounts = {};
    allStudents.forEach(s => {
        const key = (s.surname || '').trim().toUpperCase('tr');
        if (key) {
            surnameCounts[key] = (surnameCounts[key] || 0) + 1;
        }
    });

    // 4. Sıralama Mantığı
    const sortVal = document.getElementById('sortSelect')?.value || 'surname';
    
    result.sort((a, b) => {
        if (sortVal === 'surname') {
            // Soyadı A-Z (Akrabalar yan yana)
            const surComp = (a.surname || '').localeCompare(b.surname || '', 'tr', { sensitivity: 'base' });
            if (surComp !== 0) return surComp;
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        } else if (sortVal === 'custom') {
            // Manuel Sıralama İndeksi
            const orderA = typeof a.displayOrder === 'number' ? a.displayOrder : 999999;
            const orderB = typeof b.displayOrder === 'number' ? b.displayOrder : 999999;
            return orderA - orderB;
        } else if (sortVal === 'name') {
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        } else if (sortVal === 'registerNumber') {
            return (a.registerNumber || '').localeCompare(b.registerNumber || '');
        } else if (sortVal === 'seatNumber') {
            return (a.seatNumber || 'ZZZ').localeCompare(b.seatNumber || 'ZZZ');
        } else if (sortVal === 'dateDesc') {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        }
        return 0;
    });

    filteredStudents = result;

    // Metrik Kartları Güncelle
    updateStats(surnameCounts);

    // Tabloyu Yazdır
    renderTable(filteredStudents, surnameCounts);
}

function updateStats(surnameCounts) {
    const totalEl = document.getElementById('stat-total');
    const familiesEl = document.getElementById('stat-families');
    const seatedEl = document.getElementById('stat-seated');
    const unseatedEl = document.getElementById('stat-unseated');
    const minorsEl = document.getElementById('stat-minors');
    const remainingEl = document.getElementById('stat-remaining');
    const badgeEl = document.getElementById('listCountBadge');

    const totalCount = allStudents.length;
    const familyCount = Object.values(surnameCounts).filter(count => count > 1).length;
    const seatedCount = allStudents.filter(s => s.seatNumber && s.seatNumber.trim() !== '').length;
    const unseatedCount = totalCount - seatedCount;
    const minorCount = allStudents.filter(s => (s.age || 0) < 18).length;
    const remaining = Math.max(0, MAX_QUOTA - totalCount);

    if (totalEl) totalEl.innerText = totalCount;
    if (familiesEl) familiesEl.innerText = `${familyCount} Soyad Grubu`;
    if (seatedEl) seatedEl.innerText = seatedCount;
    if (unseatedEl) unseatedEl.innerText = unseatedCount;
    if (minorsEl) minorsEl.innerText = minorCount;
    if (remainingEl) remainingEl.innerText = `${remaining} / ${MAX_QUOTA}`;
    if (badgeEl) badgeEl.innerText = `${filteredStudents.length} Kayıt`;
}

function renderTable(students, surnameCounts) {
    const tbody = document.getElementById('studentTableBody');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-folder-open fa-2xl mb-3 d-block opacity-50"></i>
                    Aranan kriterlere uygun öğrenci bulunamadı.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    students.forEach((student, index) => {
        const surnameKey = (student.surname || '').trim().toUpperCase('tr');
        const countWithSameSurname = surnameCounts[surnameKey] || 0;
        const isGrouped = countWithSameSurname > 1;

        const rowClass = isGrouped ? 'same-surname-row' : '';
        const badgeHtml = isGrouped 
            ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle surname-badge ms-1" title="Aynı soyadı taşıyan ${countWithSameSurname} kişi var">
                <i class="fa-solid fa-people-group me-1"></i>${countWithSameSurname} Akraba
               </span>`
            : '';

        const hasSeat = student.seatNumber && student.seatNumber.trim() !== '';
        const seatHtml = hasSeat
            ? `<span class="badge seat-badge-assigned fs-6 px-2 py-1"><i class="fa-solid fa-chair me-1"></i>${student.seatNumber}</span>`
            : `<button class="btn btn-sm btn-outline-warning text-dark py-0 px-2 quick-seat-btn" data-id="${student.id}"><i class="fa-solid fa-plus me-1"></i>Koltuk Ver</button>`;

        const isMinor = (student.age || 0) < 18;

        html += `
            <tr class="${rowClass}">
                <td class="text-center fw-bold text-muted small">${index + 1}</td>
                <td>
                    <span class="badge bg-light text-dark border font-monospace fs-6">
                        ${student.registerNumber || 'TYO-0000'}
                    </span>
                </td>
                <td>
                    <div class="fw-bold text-dark">${student.name || ''} <span class="text-primary">${student.surname || ''}</span></div>
                    ${badgeHtml}
                </td>
                <td>${seatHtml}</td>
                <td class="font-monospace text-muted small">${student.tc || '-'}</td>
                <td class="small"><a href="tel:${student.phone}" class="text-decoration-none text-dark fw-semibold">${student.phone || '-'}</a></td>
                <td class="small">${student.birthDate || '-'} <br><span class="badge bg-secondary-subtle text-dark">${student.age || '-'} Yaş / ${student.gender || '-'}</span></td>
                <td class="small text-truncate" style="max-width: 140px;" title="${student.neighborhood || ''} Mah. ${student.district || ''}">
                    ${student.district || '-'}${student.neighborhood ? ' / ' + student.neighborhood : ''}
                </td>
                <td class="small">
                    ${isMinor ? `<strong>Okul:</strong> ${student.school || '-'}<br><strong>Veli:</strong> ${student.parentName || '-'} (${student.parentPhone || '-'})` : '<span class="text-muted">Reşit Öğrenci</span>'}
                </td>
                <td class="text-center">
                    <div class="d-inline-flex align-items-center gap-1">
                        <!-- Manuel Sıralama Butonları -->
                        <div class="reorder-btn-group me-1">
                            <button class="btn btn-outline-secondary move-up-btn" data-index="${index}" title="Yukarı Taşı">▲</button>
                            <button class="btn btn-outline-secondary move-down-btn" data-index="${index}" title="Aşağı Taşı">▼</button>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-dark qr-btn" data-id="${student.id}" title="QR Kod & İndir">
                                <i class="fa-solid fa-qrcode"></i>
                            </button>
                            <button class="btn btn-outline-primary edit-btn" data-id="${student.id}" title="Düzenle / Koltuk Ver">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-outline-danger delete-btn" data-id="${student.id}" data-name="${student.name} ${student.surname}" title="Kaydı Sil">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Dinleyicileri Bağla
    tbody.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', () => moveStudentOrder(parseInt(btn.dataset.index), -1));
    });

    tbody.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', () => moveStudentOrder(parseInt(btn.dataset.index), 1));
    });

    tbody.querySelectorAll('.qr-btn').forEach(btn => {
        btn.addEventListener('click', () => openQrModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.quick-seat-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteStudent(btn.dataset.id, btn.dataset.name));
    });
}

// Manuel Sıra Kaydırma Fonksiyonu (Yukarı / Aşağı)
async function moveStudentOrder(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= filteredStudents.length) return;

    // Dizi içindeki yerlerini değiştir
    const currentStudent = filteredStudents[index];
    const targetStudent = filteredStudents[targetIndex];

    // Otomatik olarak 'custom' sıralama moduna al
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'custom';

    // Mevcut görünümdeki tüm elemanlara sıra indekslerini atayalım
    try {
        filteredStudents.forEach((s, idx) => {
            s.displayOrder = idx;
        });

        // İki elemanın sırasını takas et
        currentStudent.displayOrder = targetIndex;
        targetStudent.displayOrder = index;

        // Veritabanında güncelle
        await Promise.all([
            updateDoc(doc(REGISTRATIONS_COL, currentStudent.id), { displayOrder: targetIndex }),
            updateDoc(doc(REGISTRATIONS_COL, targetStudent.id), { displayOrder: index })
        ]);

        processAndRenderData();
    } catch (err) {
        console.error("Sıra güncelleme hatası:", err);
    }
}

// Düzenleme Modalı Açma
function openEditModal(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editRegisterNumber').value = student.registerNumber || '';
    document.getElementById('editSeatNumber').value = student.seatNumber || '';
    document.getElementById('editTc').value = student.tc || '';
    document.getElementById('editName').value = student.name || '';
    document.getElementById('editSurname').value = student.surname || '';
    document.getElementById('editPhone').value = student.phone || '';
    document.getElementById('editGender').value = student.gender || 'Erkek';
    document.getElementById('editDistrict').value = student.district || '';
    document.getElementById('editNeighborhood').value = student.neighborhood || '';
    document.getElementById('editAddress').value = student.address || '';
    document.getElementById('editSchool').value = student.school || '';
    document.getElementById('editClassName').value = student.className || '';
    document.getElementById('editParentName').value = student.parentName || '';
    document.getElementById('editParentPhone').value = student.parentPhone || '';

    const bsModal = new bootstrap.Modal(document.getElementById('editModal'));
    bsModal.show();
}

// Düzenleme Kaydetme
function setupEditFormEvent() {
    const saveBtn = document.getElementById('saveEditBtn');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
        const studentId = document.getElementById('editStudentId').value;
        if (!studentId) return;

        const docRef = doc(REGISTRATIONS_COL, studentId);
        const updatePayload = {
            seatNumber: (document.getElementById('editSeatNumber').value || '').trim(),
            tc: (document.getElementById('editTc').value || '').trim(),
            name: (document.getElementById('editName').value || '').trim(),
            surname: (document.getElementById('editSurname').value || '').trim(),
            phone: (document.getElementById('editPhone').value || '').trim(),
            gender: document.getElementById('editGender').value,
            district: (document.getElementById('editDistrict').value || '').trim(),
            neighborhood: (document.getElementById('editNeighborhood').value || '').trim(),
            address: (document.getElementById('editAddress').value || '').trim(),
            school: (document.getElementById('editSchool').value || '').trim(),
            className: (document.getElementById('editClassName').value || '').trim(),
            parentName: (document.getElementById('editParentName').value || '').trim(),
            parentPhone: (document.getElementById('editParentPhone').value || '').trim()
        };

        try {
            await updateDoc(docRef, updatePayload);
            const modalEl = document.getElementById('editModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            Swal.fire({
                icon: 'success',
                title: 'Güncellendi',
                text: 'Öğrenci ve koltuk bilgileri kaydedildi.',
                timer: 1800,
                showConfirmButton: false
            });
        } catch (err) {
            console.error("Güncelleme hatası:", err);
            Swal.fire('Hata', 'Kayıt güncellenirken bir hata oluştu.', 'error');
        }
    });
}

// Manuel QR Modal Açma
async function openQrModal(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    currentSelectedStudentForQr = student;

    document.getElementById('qrModalTitle').innerHTML = `<i class="fa-solid fa-qrcode me-2"></i>${student.registerNumber} - QR Kod`;
    
    // QR Kodu Çiz
    await generateQR('modalQrCode', student.id);

    // Detayları Doldur
    document.getElementById('qrStudentDetails').innerHTML = `
        <div class="row g-2">
            <div class="col-6"><strong>Ad Soyad:</strong> ${student.name} ${student.surname}</div>
            <div class="col-6"><strong>Koltuk No:</strong> <span class="text-primary fw-bold">${student.seatNumber || 'Atanmadı'}</span></div>
            <div class="col-6"><strong>TC Kimlik:</strong> ${student.tc}</div>
            <div class="col-6"><strong>Telefon:</strong> ${student.phone}</div>
            <div class="col-12"><strong>Adres:</strong> ${student.neighborhood || ''} Mah. ${student.district || ''}</div>
            ${(student.age || 0) < 18 ? `<div class="col-12 border-top pt-1 mt-1"><strong>Okul/Veli:</strong> ${student.school || '-'} / ${student.parentName || '-'} (${student.parentPhone || '-'})</div>` : ''}
        </div>
    `;

    const bsModal = new bootstrap.Modal(document.getElementById('qrModal'));
    bsModal.show();
}

// QR Modalı Buton Aksiyonları (İndir / Yazdır)
function setupQrModalActions() {
    const downloadBtn = document.getElementById('downloadQrBtn');
    const printBtn = document.getElementById('printQrBtn');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const qrCanvas = document.querySelector('#modalQrCode canvas');
            const qrImg = document.querySelector('#modalQrCode img');
            let dataUrl = '';

            if (qrCanvas) dataUrl = qrCanvas.toDataURL("image/png");
            else if (qrImg && qrImg.src) dataUrl = qrImg.src;

            if (dataUrl && currentSelectedStudentForQr) {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `QR_${currentSelectedStudentForQr.registerNumber}_${currentSelectedStudentForQr.name}_${currentSelectedStudentForQr.surname}.png`;
                a.click();
            } else {
                Swal.fire('Hata', 'QR resim verisi alınamadı.', 'error');
            }
        });
    }

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
}

// Kamera İle QR Okutma
function setupScannerEvents() {
    const qrScanModalEl = document.getElementById('qrScanModal');
    if (!qrScanModalEl) return;

    qrScanModalEl.addEventListener('shown.bs.modal', () => {
        if (html5QrcodeScanner) return;

        html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
            fps: 10, 
            qrbox: { width: 250, height: 250 } 
        });

        html5QrcodeScanner.render(async (decodedText) => {
            try {
                const parsed = JSON.parse(decodedText);
                if (parsed && parsed.id) {
                    if (html5QrcodeScanner) {
                        html5QrcodeScanner.clear().catch(e => console.error(e));
                        html5QrcodeScanner = null;
                    }

                    const modal = bootstrap.Modal.getInstance(qrScanModalEl);
                    if (modal) modal.hide();

                    const docSnap = await getDoc(doc(REGISTRATIONS_COL, parsed.id));
                    if (docSnap.exists()) {
                        openQrModal(docSnap.id);
                    } else {
                        Swal.fire('Bulunamadı', 'Okutulan QR koda ait öğrenci kaydı bulunamadı.', 'warning');
                    }
                }
            } catch (err) {
                Swal.fire('Geçersiz QR', 'Okutulan QR kod bu sisteme ait değil.', 'error');
            }
        });
    });

    qrScanModalEl.addEventListener('hidden.bs.modal', () => {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().catch(e => console.error(e));
            html5QrcodeScanner = null;
        }
    });
}

// Silme Onayı
function confirmDeleteStudent(studentId, fullName) {
    Swal.fire({
        title: 'Silmek İstiyor musunuz?',
        text: `"${fullName}" öğrencisinin kaydı kalıcı olarak silinecektir!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Evet, Sil!',
        cancelButtonText: 'Vazgeç'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(REGISTRATIONS_COL, studentId));
                Swal.fire('Silindi!', 'Kayıt silindi.', 'success');
            } catch (err) {
                Swal.fire('Hata!', 'Silme işlemi başarısız.', 'error');
            }
        }
    });
}

// Excel Dışa Aktarma (Ekrandaki Canlı Sıraya Birebir Uygun)
function setupExcelExportEvent() {
    const exportBtn = document.getElementById('exportExcelBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (filteredStudents.length === 0) {
            Swal.fire('Uyarı', 'İndirilecek kayıt bulunamadı.', 'warning');
            return;
        }

        // Ekrandaki tam dizilime göre Excel verisi hazırlar
        const excelData = filteredStudents.map((s, index) => ({
            "Sıra No": index + 1,
            "Kayıt No": s.registerNumber || '',
            "Koltuk No": s.seatNumber || 'Atanmadı',
            "Soyadı": (s.surname || '').toUpperCase('tr'),
            "Adı": s.name || '',
            "TC Kimlik No": s.tc || '',
            "Telefon": s.phone || '',
            "Doğum Tarihi": s.birthDate || '',
            "Yaş": s.age || '',
            "Cinsiyet": s.gender || '',
            "İlçe": s.district || '',
            "Mahalle": s.neighborhood || '',
            "Açık Adres": s.address || '',
            "Okul Adı": s.school || '-',
            "Sınıf": s.className || '-',
            "Veli Ad Soyad": s.parentName || '-',
            "Veli Telefon": s.parentPhone || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelData);

        const columnWidths = [
            { wch: 8 },  // Sıra
            { wch: 12 }, // Kayıt No
            { wch: 14 }, // Koltuk No
            { wch: 18 }, // Soyadı
            { wch: 18 }, // Adı
            { wch: 14 }, // TC
            { wch: 14 }, // Tel
            { wch: 12 }, // Doğum
            { wch: 6 },  // Yaş
            { wch: 10 }, // Cinsiyet
            { wch: 15 }, // İlçe
            { wch: 18 }, // Mahalle
            { wch: 30 }, // Adres
            { wch: 22 }, // Okul
            { wch: 8 },  // Sınıf
            { wch: 20 }, // Veli Ad
            { wch: 14 }  // Veli Tel
        ];
        worksheet['!cols'] = columnWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Kayıt_Listesi");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `TUGVA_Yaz_Okulu_Kayıtlar_${today}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'Excel İndirildi',
            text: `${filteredStudents.length} kayıt mevcut sıralama düzeniyle indirildi.`,
            timer: 2000,
            showConfirmButton: false
        });
    });
}

