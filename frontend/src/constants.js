export const KOTO_STRING_NAMES = [
    '一',
    '二',
    '三',
    '四',
    '五',
    '六',
    '七',
    '八',
    '九',
    '十',
    '斗',
    '為',
    '巾',
];

export const MEASURES_PER_COLUMN = 4;

/** 1ページに並べる行（列）の数。1ページ目は曲名の柱があるので少なめ */
export const COLUMNS_PER_PAGE = 9;
export const FIRST_PAGE_COLUMNS = 6;

export const SAMPLE_SCORES = {
    sample: {
        title: 'お試し',
        icon: '',
        file: 'sample.json',
    },
    // PDF読み取りのお試し：原本の PDF と、読み取った結果のダミー（確認画面のJSON）。
    // ダミーは3小節目に読み間違いを1つ入れてある（最後の音が4分音符→8分音符）
    sakuraPdf: {
        title: 'さくら（PDF読み取りのお試し）',
        icon: '📄',
        pdf: 'sample-sakura.pdf',
        confirm: 'sample-confirm.json',
    },
    /*
    sakura: {
        title: 'さくらさくら',
        icon: '🌸',
        file: 'sakura.json',
    },
    kojo: {
        title: '荒城の月',
        icon: '🌙',
        file: 'kojo.json',
    },
    kuroda: {
        title: '黒田節',
        icon: '🍶',
        file: 'kuroda.json',
    },
    */
}