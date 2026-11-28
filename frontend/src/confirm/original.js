/**
 * 確認画面：アップロードした原本（PDF・画像）を表示する。
 *
 * PDF は PDF.js で1ページずつ canvas に描く。画像はそのまま <img> で出す。
 * バックエンドは使わず、アップロードしたファイルをそのまま読む。
 * 拡大・縮小は、描いた canvas / img の表示幅を変えるだけにする（描き直さない）。
 */
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
    new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

const RENDER_WIDTH = 1400;   // canvas を描く横幅（px）。拡大しても粗くならないように大きめ
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];

export function isPdf(file) {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

/** 読み取りに使える画像（PNG だけ。バックエンドが PDF・PNG にしか対応していないため） */
export function isImage(file) {
    return file.type === 'image/png' || /\.png$/i.test(file.name);
}

/** JPEG（読み取りには使えないので、PNG に変えてもらう） */
export function isJpeg(file) {
    return /^image\/jpe?g$/.test(file.type) || /\.jpe?g$/i.test(file.name);
}

/**
 * 原本の表示を作る。
 * container：表示する場所
 * 返すもの：{ show(file), zoomIn(), zoomOut(), zoom }
 */
export function createOriginalView(container) {
    let zoomIndex = ZOOM_STEPS.indexOf(100);
    let objectUrl = null;
    let loadId = 0;

    function applyZoom() {
        container.style.setProperty('--original-zoom', `${ZOOM_STEPS[zoomIndex]}%`);
    }
    applyZoom();

    async function show(file) {
        const id = ++loadId;
        container.innerHTML = '';
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = null;

        if (isPdf(file)) {
            const data = new Uint8Array(await file.arrayBuffer());
            const pdf = await pdfjsLib.getDocument({ data }).promise;
            for (let p = 1; p <= pdf.numPages; p++) {
                if (id !== loadId) return;  // 途中で別のファイルが選ばれた
                const page = await pdf.getPage(p);
                const base = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: RENDER_WIDTH / base.width });
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(viewport.width);
                canvas.height = Math.round(viewport.height);
                canvas.className = 'original-page';
                canvas.setAttribute('aria-label', `原本 ${p}ページ目`);
                container.appendChild(canvas);
                await page.render({ canvas, viewport }).promise;
            }
        } else {
            objectUrl = URL.createObjectURL(file);
            const img = document.createElement('img');
            img.src = objectUrl;
            img.alt = '原本の楽譜';
            img.className = 'original-page';
            container.appendChild(img);
        }
    }

    return {
        show,
        zoomIn() { zoomIndex = Math.min(zoomIndex + 1, ZOOM_STEPS.length - 1); applyZoom(); },
        zoomOut() { zoomIndex = Math.max(zoomIndex - 1, 0); applyZoom(); },
        get zoom() { return ZOOM_STEPS[zoomIndex]; },
    };
}
