import { db, REGISTRATIONS_COL } from "./firebase.js";
import { onSnapshot, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { MAX_QUOTA } from "./config.js";

let allStudents = [];
let filteredStudents = [];

document.addEventListener('DOMContentLoaded', () => {
    initAdminPage();
});

function initAdminPage() {
    setupRealtimeListener();
    setupSearchAndFilterEvents();
    setupExcelExportEvent();
}

// Canlı Firestore Veri Dinleyici
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
            tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger py-4">Veriler yüklenirken bir hata oluştu. Lütfen sayfayı yenileyiniz.</td></tr>`;
        }
    });
}

// Arama, Sıralama ve Filtre Olay Dinleyicileri
function setupSearchAndFilterEvents() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const filterSelect = document.getElementById('filterSelect');

    if (searchInput) searchInput.addEventListener('input', processAndRenderData);
    if (sortSelect) sortSelect.addEventListener('change', processAndRenderData);
    if (filterSelect) filterSelect.addEventListener('change', processAndRenderData);
}

// Verileri İşleme, Soyada Göre Gruplama ve Ekrana Basma
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
            (s.parentName || '').toLowerCase('tr').includes(searchTerm)
        );
    }

    // 2. Yaş Filtresi
    const filterVal = document.getElementById('filterSelect')?.value || 'all';
    if (filterVal === 'minors') {
        result = result.filter(s => (s.age || 0) < 18);
    } else if (filterVal === 'adults') {
        result = result.filter(s => (s.age || 0) >= 18);
    }

    // 3. Soyadı Sayılarını Hesaplama (Aynı soyada sahip kaç kişi var?)
    const surnameCounts = {};
    allStudents.forEach(s => {
        const key = (s.surname || '').trim().toUpperCase('tr');
        if (key) {
            surnameCounts[key] = (surnameCounts[key] || 0) + 1;
        }
    });

    // 4. Sıralama (Varsayılan: Soyadına göre Türkçe A-Z)
    const sortVal = document.getElementById('sortSelect')?.value || 'surname';
    
    result.sort((a, b) => {
        if (sortVal === 'surname') {
            // Önce Soyadına Göre Sırala
            const surComp = (a.surname || '').localeCompare(b.surname || '', 'tr', { sensitivity: 'base' });
            if (surComp !== 0) return surComp;
            // Soyadı aynı ise Ada Göre Sırala
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        } else if (sortVal === 'name') {
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        } else if (sortVal === 'registerNumber') {
            return (a.registerNumber || '').localeCompare(b.registerNumber || '');
        } else if (sortVal === 'dateDesc') {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        }
        return 0;
    });

    filteredStudents = result;

    // İstatistikleri Güncelle
    updateStats(surnameCounts);

    // Tabloyu Oluştur
    renderTable(filteredStudents, surnameCounts);
}

// İstatistikleri Güncelle
function updateStats(surnameCounts) {
    const totalEl = document.getElementById('stat-total');
    const familiesEl = document.getElementById('stat-families');
    const minorsEl = document.getElementById('stat-minors');
    const remainingEl = document.getElementById('stat-remaining');
    const badgeEl = document.getElementById('listCountBadge');

    const totalCount = allStudents.length;
    const familyCount = Object.values(surnameCounts).filter(count => count > 1).length;
    const minorCount = allStudents.filter(s => (s.age || 0) < 18).length;
    const remaining = Math.max(0, MAX_QUOTA - totalCount);

    if (totalEl) totalEl.innerText = totalCount;
    if (familiesEl) familiesEl.innerText = `${familyCount} Aile / Soyad Grubu`;
    if (minorsEl) minorsEl.innerText = minorCount;
    if (remainingEl) remainingEl.innerText = `${remaining} / ${MAX_QUOTA}`;
    if (badgeEl) badgeEl.innerText = `${filteredStudents.length} Kayıt Gösteriliyor`;
}

// Tablo Satırlarını Oluşturma
function renderTable(students, surnameCounts) {
    const tbody = document.getElementById('studentTableBody');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-folder-open fa-2xl mb-3 d-block opacity-50"></i>
                    Arama kriterlerine uygun kayıt bulunamadı.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    students.forEach((student) => {
        const surnameKey = (student.surname || '').trim().toUpperCase('tr');
        const countWithSameSurname = surnameCounts[surnameKey] || 0;
        const isGrouped = countWithSameSurname > 1;

        const rowClass = isGrouped ? 'same-surname-row' : '';
        const badgeHtml = isGrouped 
            ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle surname-badge ms-1" title="Aynı soyadı taşıyan ${countWithSameSurname} kişi var">
                <i class="fa-solid fa-people-group me-1"></i>${countWithSameSurname} Akraba
               </span>`
            : '';

        const ageInfo = student.birthDate 
            ? `${student.birthDate} <span class="badge bg-secondary-subtle text-dark ms-1">${student.age || '-'} Yaş</span>`
            : '-';

        const isMinor = (student.age || 0) < 18;

        html += `
            <tr class="${rowClass}">
                <td>
                    <span class="badge bg-light text-dark border font-monospace fs-6">
                        ${student.registerNumber || 'TYO-0000'}
                    </span>
                </td>
                <td>
                    <div class="fw-bold text-dark">${student.name || ''} <span class="text-primary">${student.surname || ''}</span></div>
                    ${badgeHtml}
                </td>
                <td class="font-monospace text-muted">${student.tc || '-'}</td>
                <td><a href="tel:${student.phone}" class="text-decoration-none text-dark fw-semibold"><i class="fa-solid fa-phone me-1 small text-muted"></i>${student.phone || '-'}</a></td>
                <td class="small">${ageInfo}</td>
                <td class="small text-truncate" style="max-width: 150px;" title="${student.neighborhood || ''} Mah. ${student.district || ''}">
                    ${student.district || '-'}${student.neighborhood ? ' / ' + student.neighborhood : ''}
                </td>
                <td class="small">
                    ${isMinor ? `${student.school || '-'} <br><span class="text-muted">Sınıf: ${student.className || '-'}</span>` : '<span class="text-muted">-</span>'}
                </td>
                <td class="small">
                    ${isMinor ? `<span class="fw-semibold">${student.parentName || '-'}</span><br><a href="tel:${student.parentPhone}" class="text-muted text-decoration-none">${student.parentPhone || '-'}</a>` : '<span class="text-muted">Reşit</span>'}
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary view-btn" data-id="${student.id}" title="Detay Gör">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="btn btn-outline-danger delete-btn" data-id="${student.id}" data-name="${student.name} ${student.surname}" title="Kaydı Sil">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // Buton Dinleyicilerini Bağla
    tbody.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', () => showStudentDetail(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteStudent(btn.dataset.id, btn.dataset.name));
    });
}

// Öğrenci Detay Modalı Gösterme
function showStudentDetail(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    const modalBody = document.getElementById('modalBody');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="row g-3">
            <div class="col-md-6">
                <p class="mb-1 text-muted small fw-semibold">Kayıt Numarası</p>
                <p class="fw-bold fs-5 text-primary mb-0">${student.registerNumber || '-'}</p>
            </div>
            <div class="col-md-6">
                <p class="mb-1 text-muted small fw-semibold">Ad Soyad</p>
                <p class="fw-bold fs-5 mb-0">${student.name || ''} ${student.surname || ''}</p>
            </div>
            <hr class="my-2">
            <div class="col-md-6">
                <p class="mb-1 text-muted small fw-semibold">T.C. Kimlik No</p>
                <p class="fw-semibold mb-0">${student.tc || '-'}</p>
            </div>
            <div class="col-md-6">
                <p class="mb-1 text-muted small fw-semibold">Telefon Numarası</p>
                <p class="fw-semibold mb-0">${student.phone || '-'}</p>
            </div>
            <div class="col-md-6">
                <p class="mb-1 text-muted small fw-semibold">Doğum Tarihi / Yaş / Cinsiyet</p>
                <p class="fw-semibold mb-0">${student.birthDate || '-'} (${student.age || '-'} Yaş / ${student.gender || '-'})</p>
            </div>
            <div class="col-md-6">
                <p class="mb-1 text-muted small fw-semibold">Adres</p>
                <p class="fw-semibold mb-0">${student.neighborhood || ''} Mah. ${student.district || ''} - ${student.address || ''}</p>
            </div>
            ${(student.age || 0) < 18 ? `
                <hr class="my-2">
                <div class="col-md-6">
                    <p class="mb-1 text-muted small fw-semibold">Okul / Sınıf</p>
                    <p class="fw-semibold mb-0">${student.school || '-'} / ${student.className || '-'} Sınıf</p>
                </div>
                <div class="col-md-6">
                    <p class="mb-1 text-muted small fw-semibold">Veli Bilgisi</p>
                    <p class="fw-semibold mb-0">${student.parentName || '-'} (${student.parentPhone || '-'})</p>
                </div>
            ` : ''}
        </div>
    `;

    const bsModal = new bootstrap.Modal(document.getElementById('detailModal'));
    bsModal.show();
}

// Kayıt Silme Onayı
function confirmDeleteStudent(studentId, fullName) {
    Swal.fire({
        title: 'Kaydı Silmek İstiyor musunuz?',
        text: `"${fullName}" isimli öğrencinin kaydı kalıcı olarak silinecektir!`,
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
                Swal.fire('Silindi!', 'Kayıt başarıyla silindi.', 'success');
            } catch (err) {
                console.error("Silme hatası:", err);
                Swal.fire('Hata!', 'Silme işlemi başarısız oldu.', 'error');
            }
        }
    });
}

// Excel (.xlsx) Dışa Aktarma Kurulumu
function setupExcelExportEvent() {
    const exportBtn = document.getElementById('exportExcelBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (filteredStudents.length === 0) {
            Swal.fire('Uyarı', 'İndirilecek kayıt bulunamadı.', 'warning');
            return;
        }

        // Excel verilerini oluştur (Soyadına göre sıralı liste)
        const excelData = filteredStudents.map((s, index) => ({
            "Sıra No": index + 1,
            "Kayıt No": s.registerNumber || '',
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

        // SheetJS İle Excel Çalışma Sayfası Hazırlama
        const worksheet = XLSX.utils.json_to_sheet(excelData);

        // Sütun Genişliklerini Otomatik Ayarlama
        const columnWidths = [
            { wch: 8 },  // Sıra No
            { wch: 12 }, // Kayıt No
            { wch: 18 }, // Soyadı
            { wch: 18 }, // Adı
            { wch: 14 }, // TC
            { wch: 14 }, // Telefon
            { wch: 12 }, // Doğum Tarihi
            { wch: 6 },  // Yaş
            { wch: 10 }, // Cinsiyet
            { wch: 15 }, // İlçe
            { wch: 18 }, // Mahalle
            { wch: 30 }, // Adres
            { wch: 25 }, // Okul
            { wch: 8 },  // Sınıf
            { wch: 22 }, // Veli Ad
            { wch: 14 }  // Veli Tel
        ];
        worksheet['!cols'] = columnWidths;

        // Workbook oluşturup dosyayı indirme
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Ogrenci_Listesi");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `TUGVA_Yaz_Okulu_Kayıt_Listesi_${today}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'Excel İndirildi',
            text: `${filteredStudents.length} adet öğrenci kaydı soyada göre sıralı şekilde indirildi.`,
            timer: 2500,
            showConfirmButton: false
        });
    });
}

