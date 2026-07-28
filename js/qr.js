// QR Kodunu hem DOM'a basan hem de DataURL (Base64) olarak döndüren fonksiyon
export function generateQR(elementId, docId) {
    return new Promise((resolve) => {
        const container = document.getElementById(elementId);
        if (!container) {
            resolve(null);
            return;
        }
        container.innerHTML = '';

        const qrText = JSON.stringify({ id: docId });

        // QRCode kütüphanesi ile ekrana çizim
        const qrcodeObj = new QRCode(container, {
            text: qrText,
            width: 150,
            height: 150,
            correctLevel: QRCode.CorrectLevel.H
        });

        // Çizimin tamamlanması için kısa bir gecikme beklenir ve Canvas/Img okunur
        setTimeout(() => {
            const canvas = container.querySelector('canvas');
            const img = container.querySelector('img');

            if (canvas) {
                resolve(canvas.toDataURL('image/png'));
            } else if (img && img.src) {
                resolve(img.src);
            } else {
                resolve(null);
            }
        }, 300);
    });
}

