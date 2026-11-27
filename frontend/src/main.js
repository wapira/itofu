/**                                                                                                            
 * 糸譜変換アプリ — エントリポイント                                                                           
 * 状態管理・画面遷移・イベント配線を担当する。
 * 描画は tuning.js / score.js に委譲する。
 */
import { analyzeFile, loadSampleScore } from './api.js';
import { SAMPLE_SCORES } from './constants.js';
import { renderTuningCards } from './tuning.js';
import { renderScore } from './score.js';



/**
 * アプリケーション状態
 */
const state = {
    data: null,               // API / sample.json のレスポンス全体
    selectedCandidateId: 'B', // 選択中の候補 ID（初期値 B）
};



/**
 * DOM 参照
 */
const screens = {
    1: document.getElementById('screen-upload'),
    2: document.getElementById('screen-tuning'),
    3: document.getElementById('screen-score'),
};

const navButtons = {
    1: document.getElementById('nav-step-1'),
    2: document.getElementById('nav-step-2'),
    3: document.getElementById('nav-step-3'),
};

const dropZone = document.getElementById('drop-zone');
const dropZoneMain = dropZone.querySelector('.dropzone-main');
const dropZoneIcon = dropZone.querySelector('.dropzone-icon');
const fileInput = document.getElementById('file-input');
const errorEl = document.getElementById('upload-error');



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
        btn.classList.toggle('active', n === stepNumber);
        btn.disabled = n > stepNumber;
        if (n < stepNumber) btn.classList.add('completed');
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
}



/**
 * データ受信後の処理
 */
function handleData(json) {
    state.data = json;
    state.selectedCandidateId = 'B';
    errorEl.hidden = true;

    renderTuningCards(state, onSelectCandidate);
    showStep(2);
}

function onSelectCandidate(candidateId, navigate) {
    state.selectedCandidateId = candidateId;
    renderTuningCards(state, onSelectCandidate);
    if (navigate) showScore();
}

function showScore() {
    renderScore(state);
    showStep(3);
}



/**
 * ファイルアップロード
 */
function setLoading(on) {
    dropZone.classList.toggle('loading', on);
    dropZone.style.pointerEvents = on ? 'none' : '';
    dropZoneIcon.textContent = on ? '⏳' : '🎼';
    dropZoneMain.textContent = on ? '変換中…' : 'ここに MusicXML ファイルをドラッグ＆ドロップ';
}

async function handleFileUpload(file) {
    if (!file) return;
    errorEl.hidden = true;
    setLoading(true);
    try {
        const json = await analyzeFile(file);
        handleData(json);
    } catch (err) {
        errorEl.textContent = err.message || 'ファイルの読み込みに失敗しました。';
        errorEl.hidden = false;
    } finally {
        setLoading(false);
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
            const json = await loadSampleScore(key);
            handleData(json);
        } catch (err) {
            errorEl.textContent = 'サンプルの読み込みに失敗しました。';
            errorEl.hidden = false;
        }
    });
    sampleButtonsEl.appendChild(btn);
});

// ナビボタン
Object.entries(navButtons).forEach(([num, btn]) => {
    btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const target = Number(num);
        if (target === 3 && state.data) showScore();
        else showStep(target);
    });
});

// 戻るボタン
document.getElementById('btn-back-upload').addEventListener('click', () => showStep(1));
document.getElementById('btn-back-tuning').addEventListener('click', () => showStep(2));

// 調弦切替プルダウン
document.getElementById('tuning-switcher').addEventListener('change', (e) => {
    state.selectedCandidateId = e.target.value;
    renderScore(state);
});

// 印刷
document.getElementById('btn-print').addEventListener('click', () => window.print());
