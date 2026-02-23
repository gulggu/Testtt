/**
 * image-tag-generator.js
 * Korean/raw image prompts를 영어 Danbooru 형식 태그로 변환하는 유틸리티
 * opinion3.txt 요구사항:
 *   - 한국어 원문은 절대 Image API에 직접 전달 금지
 *   - 태그 생성 단계가 반드시 선행
 *   - 태그는 영어 Danbooru 형식
 */

import { getContext } from './st-context.js';

// Korean character detection regex (Hangul syllables, Jamo, compatibility Jamo)
const KOREAN_REGEX = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

const TAG_CONVERSION_PROMPT = [
    'Convert the following image description into Danbooru-style English tags.',
    'Output ONLY comma-separated tags. No sentences, no Korean, no explanation.',
    'Example output: 1girl, selfie, looking_at_viewer, phone_in_hand, casual_smile, indoor, upper_body',
    '',
    'Description:',
].join('\n');

/**
 * Check if text contains Korean characters.
 * @param {string} text
 * @returns {boolean}
 */
export function containsKorean(text) {
    if (!text) return false;
    return KOREAN_REGEX.test(text);
}

/**
 * Uses AI to convert a raw prompt (possibly Korean) into English Danbooru-style tags.
 * Returns empty string on failure.
 * @param {string} rawPrompt - The raw image prompt (possibly Korean)
 * @returns {Promise<string>} English Danbooru tags, comma-separated
 */
export async function generateDanbooruTags(rawPrompt) {
    if (!rawPrompt || typeof rawPrompt !== 'string' || !rawPrompt.trim()) {
        return '';
    }

    const trimmed = rawPrompt.trim();

    // Already looks like English-only tags — return as-is
    if (!containsKorean(trimmed)) {
        return trimmed;
    }

    const context = getContext();
    if (!context) {
        console.warn('[image-tag-generator] SillyTavern context unavailable; cannot convert tags.');
        return '';
    }

    const fullPrompt = `${TAG_CONVERSION_PROMPT}\n${trimmed}`;

    try {
        let result = '';

        if (typeof context.generateRaw === 'function') {
            result = (await context.generateRaw({
                prompt: fullPrompt,
                quietToLoud: false,
                trimNames: true,
            }) || '').trim();
        } else if (typeof context.generateQuietPrompt === 'function') {
            result = (await context.generateQuietPrompt({
                quietPrompt: fullPrompt,
                quietName: 'danbooru-tag-gen',
            }) || '').trim();
        } else {
            console.warn('[image-tag-generator] No generation API found on context.');
            return '';
        }

        return sanitizeTags(result);
    } catch (error) {
        console.error('[image-tag-generator] Tag generation failed:', error);
        return '';
    }
}

/**
 * Build the final Image API prompt by combining Danbooru tags with appearance tags.
 * Korean text is never included.
 * @param {string} danbooruTags - Generated English Danbooru tags
 * @param {string} appearanceTags - Character appearance tags
 * @returns {string} Final prompt for Image API
 */
export function buildImageApiPrompt(danbooruTags, appearanceTags) {
    const parts = [];

    const cleanDanbooru = safeTags(danbooruTags);
    const cleanAppearance = safeTags(appearanceTags);

    if (cleanDanbooru) parts.push(cleanDanbooru);
    if (cleanAppearance) parts.push(cleanAppearance);

    return parts.join(', ');
}

// ── internal helpers ──

/**
 * Sanitize AI output: strip non-tag noise, reject if Korean remains.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeTags(raw) {
    if (!raw || typeof raw !== 'string') return '';

    // Remove common AI preamble / markdown fences
    let cleaned = raw
        .replace(/```[^`]*```/gs, '')
        .replace(/^[^a-zA-Z0-9_(]*/, '')
        .trim();

    // Reject if Korean characters leaked through
    if (containsKorean(cleaned)) {
        console.warn('[image-tag-generator] AI output still contains Korean; discarding.');
        return '';
    }

    // Normalize whitespace around commas
    cleaned = cleaned
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .join(', ');

    return cleaned;
}

/**
 * Return trimmed tag string only if it is non-empty and Korean-free.
 * @param {string} tags
 * @returns {string}
 */
function safeTags(tags) {
    if (!tags || typeof tags !== 'string') return '';
    const trimmed = tags.trim();
    if (containsKorean(trimmed)) return '';
    return trimmed;
}
