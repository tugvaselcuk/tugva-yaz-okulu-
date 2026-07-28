export function downloadRegistrationPDF(data) {
    if (!data) return;
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF();

    // Türkçe karakter dönüşüm fonksiyonu (jsPDF standart font uyumu için)
    const trFix = (str) => {
        if (!str) return '';
        return String(str)
            .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
            .replace(/Ü/g, 'U').replace(/ü/g, 'u')
            .replace(/Ş/g, 'S').replace(/ş/g, 's')
            .replace(/İ/g, 'I').replace(/ı/g, 'i')
            .replace(/Ö/g, 'O').replace(/ö/g, 'o')
            .replace(/Ç/g, 'C').replace(/ç/g, 'c');
    };

    // Başlık ve Çerçeve
    docPdf.setLineWidth(0.5);
    docPdf.rect(10, 10, 190, 277); // Sayfa çerçevesi
    docPdf.setFontSize(18);
    docPdf.setFont("helvetica", "bold");
    docPdf.text("TUGVA YAZ OKULU KAYIT BELGESI", 15, 25);

    docPdf.setFontSize(10);
    docPdf.setFont("helvetica", "normal");
    docPdf.text("Tarih: " + new Date().toLocaleDateString('tr-TR'), 15, 32);

    docPdf.setLineWidth(0.2);
    docPdf.line(15, 35, 195, 35);

    // QR Kodu Ekran Elemanından Alıp PDF'e Ekleme
    const qrElement = document.querySelector('#successQrCode img') || document.querySelector('#successQrCode canvas');
    if (qrElement) {
        let qrDataUrl = '';
        if (qrElement.tagName.toLowerCase() === 'img') {
            qrDataUrl = qrElement.src;
        } else if (qrElement.tagName.toLowerCase() === 'canvas') {
            qrDataUrl = qrElement.toDataURL('image/png');
        }

        if (qrDataUrl) {
            // Sağ üst köşeye QR Ekle
            docPdf.addImage(qrDataUrl, 'PNG', 145, 40, 45, 45);
            docPdf.rect(143, 38, 49, 49); // QR çerçevesi
        }
    }

    // Öğrenci Bilgileri
    let startY = 45;
    const lineHeight = 8;

    docPdf.setFontSize(11);
    
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Kayit Numarasi:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(data.registerNumber), 55, startY);

    startY += lineHeight;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Ad Soyad:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(`${data.name} ${data.surname}`), 55, startY);

    startY += lineHeight;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("TC Kimlik No:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(data.tc), 55, startY);

    startY += lineHeight;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Telefon:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(data.phone), 55, startY);

    startY += lineHeight;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Dogum Tarihi / Yas:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(`${data.birthDate} (${data.age} Yas / ${data.gender})`), 55, startY);

    startY += lineHeight;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Ilce / Mahalle:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(`${data.district} / ${data.neighborhood}`), 55, startY);

    startY += lineHeight;
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Adres:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(data.address), 55, startY);

    if (data.age < 18) {
        startY += lineHeight;
        docPdf.setFont("helvetica", "bold");
        docPdf.text("Okul / Sinif:", 15, startY);
        docPdf.setFont("helvetica", "normal");
        docPdf.text(trFix(`${data.school} - Sinif: ${data.className}`), 55, startY);

        startY += lineHeight;
        docPdf.setFont("helvetica", "bold");
        docPdf.text("Veli Ad Soyad:", 15, startY);
        docPdf.setFont("helvetica", "normal");
        docPdf.text(trFix(data.parentName), 55, startY);

        startY += lineHeight;
        docPdf.setFont("helvetica", "bold");
        docPdf.text("Veli Telefon:", 15, startY);
        docPdf.setFont("helvetica", "normal");
        docPdf.text(trFix(data.parentPhone), 55, startY);
    }

    startY += lineHeight + 4;
    docPdf.line(15, startY - 4, 195, startY - 4);
    
    docPdf.setFont("helvetica", "bold");
    docPdf.text("Koltuk Numarasi:", 15, startY);
    docPdf.setFont("helvetica", "normal");
    docPdf.text(trFix(data.seatNumber || 'Atanmadi'), 55, startY);

    // Alt Bilgi Dipnot
    docPdf.setFontSize(9);
    docPdf.setFont("helvetica", "italic");
    docPdf.text("Bu belge TUGVA Yaz Okulu Kayit Sistemi tarafindan otomatik uretilmistir.", 15, 275);

    docPdf.save(`TUGVA_Kayit_${data.registerNumber}.pdf`);
}

