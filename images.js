// Bilder verkleinern, bevor sie in die Datenbank gehen (nur im Browser nutzbar).

// Verkleinert eine Bilddatei auf maxSide Pixel (längste Seite) und gibt eine JPEG-Data-URL zurück.
// Ein Bild von ca. 640 px bei Qualität 0,78 ist rund 40–70 KB groß.
export async function resizeToDataUrl(file, maxSide = 640, quality = 0.78){
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  if(bmp.close) bmp.close();
  return canvas.toDataURL('image/jpeg', quality);
}
