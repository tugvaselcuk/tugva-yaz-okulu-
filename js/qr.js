export function generateQR(elementId, docId) {
    const container = document.getElementById(elementId);
    if (!container) return;
    container.innerHTML = '';
    
    new QRCode(container, {
        text: JSON.stringify({ id: docId }),
        width: 150,
        height: 150,
        correctLevel: QRCode.CorrectLevel.H
    });
}
