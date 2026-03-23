(function () {
    'use strict';

    const contentConfig = globalThis.NSM_CONTENT_CONFIG;

    if (!contentConfig || !contentConfig.DEPS) {
        throw new Error('NotebookLM Source Management: Content config is missing.');
    }

    const { DEPS } = contentConfig;

    const MAX_EXPLICIT_ICON_CANDIDATES = 24;
    const MAX_FALLBACK_ICON_CANDIDATES = 18;
    const MAX_QUERY_RESULTS_PER_SELECTOR = 12;

    function findElement(selectors, parent) {
        const root = parent || document;
        for (const selector of Array.isArray(selectors) ? selectors : []) {
            const element = root.querySelector(selector);
            if (element) return element;
        }
        return null;
    }

    function generateSourceKey(title) {
        let hash = 0;
        const normalizedTitle = String(title || '');
        for (let i = 0; i < normalizedTitle.length; i++) {
            const char = normalizedTitle.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return `source_${hash}`;
    }

    function normalizeSourceText(value) {
        return String(value || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    function sanitizeSourceToken(value) {
        return normalizeSourceText(value)
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 96);
    }

    function extractTokenFromUrl(url) {
        if (typeof url !== 'string' || !url) return null;

        try {
            const parsedUrl = new URL(url, window.location.origin);
            const preferredParams = [
                'source', 'sourceId', 'source_id',
                'documentId', 'document_id',
                'docId', 'doc_id',
                'fileId', 'file_id',
                'resourceId', 'resource_id',
                'id'
            ];

            for (const key of preferredParams) {
                const value = parsedUrl.searchParams.get(key);
                const sanitized = sanitizeSourceToken(value ? `${key}:${value}` : '');
                if (sanitized) return sanitized;
            }

            const segments = parsedUrl.pathname.split('/').filter(Boolean);
            const lastSegment = segments[segments.length - 1];
            if (lastSegment && /[A-Za-z0-9_-]{6,}/.test(lastSegment)) {
                return sanitizeSourceToken(`${segments[segments.length - 2] || 'path'}:${lastSegment}`);
            }
        } catch (error) {
            return null;
        }

        return null;
    }

    function extractSourceStableToken(sourceRow) {
        if (!sourceRow) return null;

        const selectors = [
            '[data-source-id]',
            '[data-document-id]',
            '[data-doc-id]',
            '[data-resource-id]',
            '[data-item-id]',
            '[data-id]',
            '[href]'
        ];
        const attributeKeys = [
            'data-source-id',
            'data-document-id',
            'data-doc-id',
            'data-resource-id',
            'data-item-id',
            'data-id'
        ];
        const candidates = [sourceRow];

        for (const selector of selectors) {
            const nodes = sourceRow.querySelectorAll
                ? Array.from(sourceRow.querySelectorAll(selector)).slice(0, 8)
                : [];
            candidates.push(...nodes);
        }

        for (const candidate of candidates) {
            if (!candidate || typeof candidate.getAttribute !== 'function') continue;

            for (const attributeKey of attributeKeys) {
                const attributeValue = candidate.getAttribute(attributeKey);
                const sanitized = sanitizeSourceToken(attributeValue ? `${attributeKey}:${attributeValue}` : '');
                if (sanitized) return sanitized;
            }

            const hrefToken = extractTokenFromUrl(candidate.getAttribute('href'));
            if (hrefToken) return hrefToken;
        }

        return null;
    }

    function extractCssUrl(value) {
        if (typeof value !== 'string' || !value) return null;
        const match = value.match(/url\((['"]?)(.*?)\1\)/i);
        return match && match[2] ? match[2] : null;
    }

    function resolveSourceImageUrl(url) {
        if (typeof url !== 'string') return null;

        const trimmed = url.trim();
        if (!trimmed || trimmed === 'none') return null;

        const lowerValue = trimmed.toLowerCase();
        if (
            lowerValue.startsWith('data:') ||
            lowerValue.startsWith('blob:') ||
            lowerValue.startsWith('chrome-extension:')
        ) {
            return trimmed;
        }

        const baseUrl = window.location.href || window.location.origin || location.href;
        try {
            return new URL(trimmed, baseUrl).href;
        } catch (error) {
            return trimmed;
        }
    }

    function isIgnoredSourceImageCandidate(candidate, sourceElement, context = {}) {
        if (!candidate) return true;

        const { checkbox = null, nativeMoreButton = null } = context;

        if (checkbox && (candidate === checkbox || checkbox.contains?.(candidate))) {
            return true;
        }
        if (nativeMoreButton && (candidate === nativeMoreButton || nativeMoreButton.contains?.(candidate))) {
            return true;
        }

        const ignoredAncestorSelector = [
            '[role="menu"]',
            '[role="menuitem"]',
            '[role="checkbox"]',
            'input',
            'mat-checkbox'
        ].join(', ');
        const ignoredAncestor = typeof candidate.closest === 'function'
            ? candidate.closest(ignoredAncestorSelector)
            : null;
        if (ignoredAncestor && ignoredAncestor !== sourceElement) {
            return true;
        }

        return false;
    }

    function appendCandidate(candidates, seenCandidates, candidate, maxCandidates) {
        if (!candidate || seenCandidates.has(candidate) || candidates.length >= maxCandidates) return;
        seenCandidates.add(candidate);
        candidates.push(candidate);
    }

    function collectConfiguredImageCandidates(sourceElement) {
        const candidates = [];
        const seenCandidates = new Set();
        const selectors = Array.isArray(DEPS.iconImage) ? DEPS.iconImage : [];

        for (const selector of selectors) {
            if (candidates.length >= MAX_EXPLICIT_ICON_CANDIDATES) break;

            if (typeof sourceElement.matches === 'function' && sourceElement.matches(selector)) {
                appendCandidate(candidates, seenCandidates, sourceElement, MAX_EXPLICIT_ICON_CANDIDATES);
            }

            const nodes = sourceElement.querySelectorAll
                ? Array.from(sourceElement.querySelectorAll(selector)).slice(0, MAX_QUERY_RESULTS_PER_SELECTOR)
                : [];

            nodes.forEach((node) => appendCandidate(candidates, seenCandidates, node, MAX_EXPLICIT_ICON_CANDIDATES));
        }

        return candidates;
    }

    function hasInlineVisualHint(candidate) {
        return Boolean(
            extractCssUrl(candidate.style?.backgroundImage) ||
            extractCssUrl(candidate.style?.background) ||
            extractCssUrl(candidate.style?.webkitMaskImage) ||
            extractCssUrl(candidate.style?.maskImage)
        );
    }

    function shouldInspectComputedStyle(candidate) {
        if (!candidate) return false;

        const tagName = String(candidate.tagName || '').toUpperCase();
        if (tagName === 'IMG' || tagName === 'PICTURE' || tagName === 'SVG' || tagName === 'CANVAS') {
            return true;
        }

        if (candidate.getAttribute?.('role') === 'img') {
            return true;
        }

        if (hasInlineVisualHint(candidate)) {
            return true;
        }

        return tagName === 'DIV' || tagName === 'SPAN' || tagName === 'MAT-ICON';
    }

    function extractCandidateImageUrl(candidate) {
        if (!candidate) return null;

        const directUrl = resolveSourceImageUrl(
            candidate.currentSrc ||
            candidate.src ||
            (typeof candidate.getAttribute === 'function' ? candidate.getAttribute('src') : '')
        );
        if (directUrl) return directUrl;

        const inlineVisualUrl = resolveSourceImageUrl(
            extractCssUrl(candidate.style?.backgroundImage) ||
            extractCssUrl(candidate.style?.background) ||
            extractCssUrl(candidate.style?.webkitMaskImage) ||
            extractCssUrl(candidate.style?.maskImage)
        );
        if (inlineVisualUrl) return inlineVisualUrl;

        if (!shouldInspectComputedStyle(candidate) || typeof window.getComputedStyle !== 'function') {
            return null;
        }

        const computedStyle = window.getComputedStyle(candidate);
        const computedImageUrl = resolveSourceImageUrl(
            extractCssUrl(computedStyle?.backgroundImage) ||
            extractCssUrl(computedStyle?.background) ||
            extractCssUrl(computedStyle?.webkitMaskImage) ||
            extractCssUrl(computedStyle?.maskImage)
        );
        if (computedImageUrl) return computedImageUrl;

        return null;
    }

    function collectFallbackImageCandidates(sourceElement, seededCandidates = []) {
        const candidates = [];
        const seenCandidates = new Set(seededCandidates);

        appendCandidate(candidates, seenCandidates, sourceElement, MAX_FALLBACK_ICON_CANDIDATES);

        const directChildren = Array.from(sourceElement.children || []);
        directChildren.forEach((child) => {
            appendCandidate(candidates, seenCandidates, child, MAX_FALLBACK_ICON_CANDIDATES);
            if (child?.shadowRoot?.children) {
                Array.from(child.shadowRoot.children).forEach((shadowChild) => {
                    appendCandidate(candidates, seenCandidates, shadowChild, MAX_FALLBACK_ICON_CANDIDATES);
                });
            }
        });

        if (sourceElement.shadowRoot?.children) {
            Array.from(sourceElement.shadowRoot.children).forEach((shadowChild) => {
                appendCandidate(candidates, seenCandidates, shadowChild, MAX_FALLBACK_ICON_CANDIDATES);
            });
        }

        return candidates;
    }

    function extractSourceIconImageUrl(sourceElement, context = {}) {
        if (!sourceElement) return null;

        const explicitCandidates = collectConfiguredImageCandidates(sourceElement);
        for (const candidate of explicitCandidates) {
            if (isIgnoredSourceImageCandidate(candidate, sourceElement, context)) continue;
            const imageUrl = extractCandidateImageUrl(candidate);
            if (imageUrl) return imageUrl;
        }

        const fallbackCandidates = collectFallbackImageCandidates(sourceElement, explicitCandidates);
        for (const candidate of fallbackCandidates) {
            if (isIgnoredSourceImageCandidate(candidate, sourceElement, context)) continue;
            const imageUrl = extractCandidateImageUrl(candidate);
            if (imageUrl) return imageUrl;
        }

        return null;
    }

    function buildLegacySourceKey(keyTitle, seenLegacyKeys) {
        const baseKey = generateSourceKey(keyTitle);
        const duplicateIndex = seenLegacyKeys.get(baseKey) || 0;
        seenLegacyKeys.set(baseKey, duplicateIndex + 1);
        return duplicateIndex === 0 ? baseKey : `${baseKey}_${duplicateIndex}`;
    }

    function extractSourceIdentitySnapshot(sourceElement) {
        if (!sourceElement) return null;

        const titleEl = findElement(DEPS.title, sourceElement);
        const checkbox = findElement(DEPS.checkbox, sourceElement);
        const ariaLabel = checkbox && typeof checkbox.getAttribute === 'function'
            ? (checkbox.getAttribute('aria-label') || '')
            : '';
        const title = titleEl?.textContent.trim() || getMessage('ui_source_untitled');
        const nativeMoreButton = findElement(DEPS.moreBtn, sourceElement);
        const nativeIconContext = {
            titleEl,
            checkbox,
            nativeMoreButton
        };

        let iconEl = findElement(DEPS.icon, sourceElement);
        let iconName = iconEl?.textContent.trim() || 'article';
        const iconMap = {
            'video_youtube': 'smart_display',
            'more_vert': 'article',
            'audiotrack': 'headphones',
            'picture_as_pdf': 'description',
            'drive_pdf': 'description',
            'link': 'link',
            'format_quote': 'format_quote',
            'text_snippet': 'article',
            'note': 'sticky_note_2'
        };

        if (iconMap[iconName]) {
            iconName = iconMap[iconName];
            if (iconName === 'article' && iconEl?.textContent.trim() === 'more_vert') {
                iconEl = null;
            }
        }

        const stableToken = extractSourceStableToken(sourceElement);
        const fingerprint = [
            normalizeSourceText(title),
            normalizeSourceText(ariaLabel),
            normalizeSourceText(iconName)
        ].join('|');

        return {
            titleEl,
            checkbox,
            nativeMoreButton,
            iconEl,
            iconName,
            title,
            normalizedTitle: normalizeSourceText(title),
            ariaLabel,
            stableToken,
            fingerprint,
            nativeIconContext
        };
    }

    function createSourceDescriptor(sourceElement, seenSourceIds, seenLegacyKeys) {
        const identity = extractSourceIdentitySnapshot(sourceElement);
        const {
            titleEl,
            checkbox,
            ariaLabel,
            title,
            normalizedTitle,
            stableToken,
            fingerprint,
            iconName,
            iconEl,
            nativeIconContext
        } = identity || {};
        const keyTitle = ariaLabel || titleEl?.textContent || '';

        const iconColorClass = Array.from(iconEl?.classList || []).find((className) => className.endsWith('-icon-color')) || '';
        const iconImageUrl = extractSourceIconImageUrl(sourceElement, nativeIconContext);
        const identityType = stableToken ? 'stable-token' : 'fingerprint';
        const sourceIdBase = stableToken
            ? `source_id_${stableToken}`
            : `source_fp_${generateSourceKey(fingerprint)}`;
        const duplicateIndex = seenSourceIds.get(sourceIdBase) || 0;
        seenSourceIds.set(sourceIdBase, duplicateIndex + 1);
        const key = duplicateIndex === 0 ? sourceIdBase : `${sourceIdBase}_${duplicateIndex}`;
        const legacyKey = buildLegacySourceKey(keyTitle, seenLegacyKeys);
        const isLoading = Boolean(sourceElement.querySelector('[role="progressbar"], mat-spinner, svg animateTransform'));
        const isDisabled = !checkbox || checkbox.disabled || isLoading;

        return {
            key,
            legacyKey,
            title,
            normalizedTitle,
            lowercaseTitle: normalizedTitle,
            ariaLabel,
            stableToken,
            fingerprint,
            identityType,
            element: sourceElement,
            iconName,
            iconColorClass,
            iconImageUrl,
            checkbox,
            isLoading,
            isDisabled
        };
    }

    const sourceDescriptorHelpers = {
        createSourceDescriptor,
        extractSourceIdentitySnapshot,
        extractSourceIconImageUrl,
        extractSourceStableToken,
        extractTokenFromUrl,
        extractCssUrl,
        generateSourceKey,
        normalizeSourceText,
        resolveSourceImageUrl,
        sanitizeSourceToken
    };

    globalThis.NSM_SOURCE_DESCRIPTOR_HELPERS = sourceDescriptorHelpers;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = sourceDescriptorHelpers;
    }
})();
