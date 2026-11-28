/**
 * 糸譜変換アプリ — エントリポイント
 * 状態管理・画面遷移・イベント配線を担当する。
 * 描画は tuning.js / score.js / confirm/ に委譲する。
 */
import {
    analyzeFile, analyzeNotes, convertFile, loadConfirmSample, loadSampleScore,
} from './api.js';
import { SAMPLE_SCORES } from './constants.js';
import { renderTuningCards } from './tuning.js';
import { renderScore, fitBeatText } from './score.js';
import { createConfirmScreen } from './confirm/editor.js';
import { isImage, isPdf } from './confirm/original.js';



/**
 * 画面の番号
 *   MusicXML のとき：UPLOAD → TUNING → SCORE
 *   PDF・画像のとき：UPLOAD → CONFIRM → TUNING → SCORE
 */
const STEP = { UPLOAD: 1, CONFIRM: 2, TUNING: 3, SCORE: 4 };



/**
 * アプリケーション状態
 */
const state = {
    data: null,               // API / sample.json のレスポンス全体
    selectedCandidateId: 'B', // 選択中の候補 ID（初期値 B）
    hasConfirm: false,        // 確認画面を開いたか（PDF・画像から読み込んだか）
};



/**
 * DOM 参照
 */
const screens = {
    [STEP.UPLOAD]: document.getElementById('screen-upload'),
    [STEP.CONFIRM]: document.getElementById('screen-confirm'),
    [STEP.TUNING]: document.getElementById('screen-tuning'),
    [STEP.SCORE]: document.getElementById('screen-score'),
};

const navButtons = {
    [STEP.UPLOAD]: document.getElementById('nav-step-1'),
    [STEP.CONFIRM]: document.getElementById('nav-step-2'),
    [STEP.TUNING]: document.getElementById('nav-step-3'),
    [STEP.SCORE]: document.getElementById('nav-step-4'),
};

const dropZone = document.getElementById('drop-zone');
const dropZoneMain = dropZone.querySelector('.dropzone-main');
const dropZoneIcon = dropZone.querySelector('.dropzone-icon');
const fileInput = document.getElementById('file-input');
const errorEl = document.getElementById('upload-error');
const cancelRow = document.getElementById('upload-cancel-row');

const confirmScreen = createConfirmScreen({
    root: screens[STEP.CONFIRM],
    onSubmit: async (notes) => {
        const json = await analyzeNotes(notes);
        handleData(json);
    },
});



/**
 * 画面遷移
 */
function showStep(stepNumber) {
    Object.entries(screens).forEach(([num, el]) => {
        const active = Number(num) === stepNumber;
        el.hidden = !active;
        el.classList.toggle('active', active);
    });

    Object.entries(navButtons).forEach(([num, btn]) => {
        const n = Number(num);
        // 確認画面は、PDF・画像から読み込んだときだけ行ける
        const skipped = n === STEP.CONFIRM && !state.hasConfirm;
        btn.classList.toggle('active', n === stepNumber);
        btn.disabled = n > stepNumber || skipped;
        btn.classList.toggle('completed', n < stepNumber && !skipped);
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}



/**
 * データ受信後の処理
 */
function handleData(json) {
    state.data = json;
    const hasB = json.candidates.some((c) => c.id === 'B');
    state.selectedCandidateId = hasB ? 'B' : json.candidates[0].id;
    errorEl.hidden = true;

    renderTuningCards(state, onSelectCandidate);
    showStep(STEP.TUNING);
}

function onSelectCandidate(candidateId, navigate) {
    state.selectedCandidateId = candidateId;
    renderTuningCards(state, onSelectCandidate);
    if (navigate) showScore();
}

function showScore() {
    renderScore(state);
    showStep(STEP.SCORE);
    fitBeatText(); // 表示されて高さが測れるようになってから、文字の縦の縮みを計算する
}

/** 確認画面を開く（file：原本、data：確認画面のJSON） */
async function openConfirm(file, data) {
    state.hasConfirm = true;
    showStep(STEP.CONFIRM);
    await confirmScreen.open(file, data);
}



/**
 * ファイルアップロード
 */
let abortController = null;

function setLoading(on, message = '変換中…') {
    dropZone.classList.toggle('loading', on);
    dropZone.style.pointerEvents = on ? 'none' : '';
    dropZoneIcon.textContent = on ? '⏳' : '🎼';
    dropZoneMain.textContent = on ? message : 'ここに楽譜ファイルをドラッグ＆ドロップ';
    if (!on) cancelRow.hidden = true;
}

function showUploadError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
}

async function handleFileUpload(file) {
    if (!file) return;
    errorEl.hidden = true;
    try {
        if (isPdf(file) || isImage(file)) {
            // PDF・画像：楽譜認識（数十秒かかる）→ 確認画面
            abortController = new AbortController();
            setLoading(true, '楽譜を読み取り中…（1ページ数十秒かかります）');
            cancelRow.hidden = false;
            const data = await convertFile(file, abortController.signal);
            setLoading(false);
            await openConfirm(file, data);
        } else {
            setLoading(true);
            const json = await analyzeFile(file);
            state.hasConfirm = false;
            handleData(json);
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            showUploadError(err.message || 'ファイルの読み込みに失敗しました。');
        }
    } finally {
        abortController = null;
        setLoading(false);
        fileInput.value = '';  // 同じファイルをもう一度選べるように
    }
}



/**
 * イベント登録
 */
// ドロップゾーン
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
    }
});
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
});
fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
});
document.getElementById('btn-upload-cancel').addEventListener('click', () => {
    abortController?.abort();
});

// お試しボタン（SAMPLE_SCORES から動的生成）
const sampleButtonsEl = document.getElementById('sample-buttons');
Object.entries(SAMPLE_SCORES).forEach(([key, sample]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wa-btn wa-btn-secondary';
    btn.textContent = (sample.icon ? sample.icon + ' ' : '') + sample.title;
    btn.addEventListener('click', async () => {
        errorEl.hidden = true;
        try {
            if (sample.confirm) {
                // PDF読み取りのお試し：原本のPDFと、読み取った結果のダミーで確認画面を開く
                const { file, data } = await loadConfirmSample(sample);
                await openConfirm(file, data);
            } else {
                const json = await loadSampleScore(key);
                state.hasConfirm = false;
                handleData(json);
            }
        } catch (err) {
            showUploadError('サンプルの読み込みに失敗しました。');
        }
    });
    sampleButtonsEl.appendChild(btn);
});

// ナビボタン
Object.entries(navButtons).forEach(([num, btn]) => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const target = Number(num);
        if (target === STEP.SCORE && state.data) showScore();
        else showStep(target);
    });
});

// 戻るボタン
document.getElementById('btn-back-upload').addEventListener('click', () => showStep(STEP.UPLOAD));
document.getElementById('btn-confirm-back').addEventListener('click', () => showStep(STEP.UPLOAD));
document.getElementById('btn-back-tuning').addEventListener('click', () => showStep(STEP.TUNING));

// 調弦切替プルダウン
document.getElementById('tuning-switcher').addEventListener('change', (e) => {
    state.selectedCandidateId = e.target.value;
    renderScore(state);
});

// 印刷
document.getElementById('btn-print').addEventListener('click', () => window.print());
