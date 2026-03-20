(function () {
    'use strict';

    const contentStyleText = `
            @font-face {
                font-family: 'Google Symbols';
                font-style: normal;
                font-weight: 400;
                src: url(
                    https://fonts.gstatic.com/s/googlesymbols/v342/HhzMU5Ak9u-oMExPeInvcuEmPosC9zyteYEFU68cPrjdKM1XLPTxlGmzczpgWvF1d8Yp7AudBnt3CPar1JFWjoLAUv3G-tSNljixIIGUsC62cYrKiAw.woff2
                ) format('woff2');
            }
            .google-symbols {
                font-family: 'Google Symbols';
                font-weight: normal;
                font-style: normal;
                font-size: 18px;
                line-height: 1;
                letter-spacing: normal;
                text-transform: none;
                display: inline-block;
                white-space: nowrap;
                word-wrap: normal;
                direction: ltr;
                -webkit-font-feature-settings: 'liga';
                -webkit-font-smoothing: antialiased;
            }
            
            /* -------- Light Mode (Default) -------- */
            :host {
                --sp-bg-primary: transparent;
                --sp-bg-secondary: rgba(0,0,0,0.03);
                --sp-bg-hover: rgba(0,0,0,0.04);
                --sp-bg-button: #fff;
                --sp-bg-button-hover: #f5f5f7;
                --sp-bg-button-active: #ebebeb;
                --sp-bg-toast: rgba(0,0,0,0.8);
                --sp-bg-badge: rgba(0,0,0,0.05);
                --sp-bg-switch: #e9e9ea;
                --sp-bg-switch-thumb: white;
                --sp-bg-checkbox: #fff;
                --sp-border-light: rgba(0,0,0,0.1);
                --sp-border-medium: rgba(0,0,0,0.15);
                --sp-border-checkbox: rgba(0,0,0,0.25);
                --sp-text-primary: #1A1A1C;
                --sp-text-secondary: #6E6E73;
                --sp-text-toast: #fff;
                --sp-text-badge: #6E6E73;
                --sp-accent: #007aff;
                --sp-accent-danger: #ff3b30;
                --sp-accent-success: #34c759;
                --sp-drag-bg: rgba(0, 122, 255, 0.05);
                --sp-drag-into-bg: rgba(0, 122, 255, 0.1);
                --sp-shadow-toast: 0 8px 32px rgba(0,0,0,0.08);
                --sp-shadow-button: 0 8px 32px rgba(0,0,0,0.08);
                --sp-shadow-hover-item: 0 10px 24px rgba(0,0,0,0.08);
                --sp-panel-bg: #f6f7f9;
                --sp-shadow-switch-thumb: 0 1px 2px rgba(0,0,0,0.2), 0 0 1px rgba(0,0,0,0.1);
                --sp-icon-button-hover: rgba(0,0,0,0.08);
                
                /* Global Glassmorphism Variables */
                --sp-glass-bg-body: rgba(255, 255, 255, 0.85);
                --sp-glass-bg-menu: rgba(255, 255, 255, 0.85);
                --sp-glass-border: rgba(0, 0, 0, 0.05);
                --sp-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
            }

            /* -------- Dark Mode Override -------- */
            @media (prefers-color-scheme: dark) {
                :host {
                    --sp-bg-secondary: rgba(255,255,255,0.05);
                    --sp-bg-hover: rgba(255,255,255,0.08);
                    --sp-bg-button: #1c1c1e;
                    --sp-bg-button-hover: #2c2c2e;
                    --sp-bg-button-active: #3a3a3c;
                    --sp-bg-toast: rgba(255,255,255,0.9);
                    --sp-bg-badge: rgba(255,255,255,0.1);
                    --sp-bg-switch: #39393d;
                    --sp-bg-switch-thumb: white;
                    --sp-bg-checkbox: rgba(255,255,255,0.1);
                    --sp-border-light: rgba(255,255,255,0.1);
                    --sp-border-medium: rgba(255,255,255,0.2);
                    --sp-border-checkbox: rgba(255,255,255,0.6);
                    --sp-text-primary: #f5f5f7;
                    --sp-text-secondary: #98989d;
                    --sp-text-toast: #000;
                    --sp-text-badge: #98989d;
                    --sp-accent: #0a84ff;
                    --sp-accent-danger: #ff453a;
                    --sp-accent-success: #30d158;
                    --sp-drag-bg: rgba(10, 132, 255, 0.1);
                    --sp-drag-into-bg: rgba(10, 132, 255, 0.15);
                    --sp-shadow-toast: 0 8px 32px rgba(0,0,0,0.4);
                    --sp-shadow-button: 0 8px 32px rgba(0,0,0,0.2);
                    --sp-shadow-hover-item: 0 12px 28px rgba(0,0,0,0.32);
                    --sp-panel-bg: #272c33;
                    --sp-shadow-switch-thumb: 0 1px 2px rgba(0,0,0,0.3), 0 0 1px rgba(0,0,0,0.2);
                    --sp-icon-button-hover: rgba(255,255,255,0.15);
                    
                    /* Global Glassmorphism Variables */
                    --sp-glass-bg-body: rgba(28, 28, 30, 0.85);
                    --sp-glass-bg-menu: rgba(44, 44, 46, 0.85);
                    --sp-glass-border: rgba(255, 255, 255, 0.15);
                    --sp-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                }
            }

            .sp-container {
                display: flex;
                flex-direction: column;
                max-height: calc(100vh - 220px);
                min-height: 150px;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                color: var(--sp-text-primary);
                position: relative;
                background: var(--sp-panel-bg);
                transition: box-shadow 0.35s cubic-bezier(0.25, 1, 0.5, 1), transform 0.35s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-container.sp-focus-ring {
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.22), 0 18px 40px rgba(0, 122, 255, 0.18);
                transform: translateY(-2px);
            }
            .sp-resizer {
                height: 8px;
                width: 100%;
                cursor: ns-resize;
                position: absolute;
                bottom: -4px;
                left: 0;
                z-index: 10;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .sp-resizer::after {
                content: '';
                width: 30px;
                height: 3px;
                background-color: var(--sp-border-medium);
                border-radius: 3px;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-resizer:hover::after {
                background-color: var(--sp-accent);
            }
            
            /* Sticky Header */
            .sp-controls::after {
                content: none;
                pointer-events: none;
            }
            .sp-toolbar-actions {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
                max-width: 520px;
                overflow: hidden;
                transform-origin: right center;
                transition: max-width 0.26s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.18s ease, transform 0.24s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-controls > .sp-button,
            .sp-toolbar-actions > .sp-button {
                flex-shrink: 0;
            }
            .sp-controls.is-search-expanded .sp-toolbar-actions {
                max-width: 0;
                opacity: 0;
                transform: translateX(10px) scale(0.98);
                pointer-events: none;
            }
            .sp-view-state {
                display: flex;
                flex-direction: column;
                gap: 8px;
                padding: 8px 0 4px;
            }
            .sp-view-state[hidden] {
                display: none;
            }
            .sp-view-banner {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 10px 12px;
                border-radius: 14px;
                background: var(--sp-bg-secondary);
                border: 1px solid var(--sp-border-light);
            }
            .sp-view-banner-copy {
                min-width: 0;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .sp-view-banner-label {
                font-size: 12px;
                font-weight: 600;
                color: var(--sp-text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .sp-view-banner-btn {
                flex-shrink: 0;
                padding: 5px 10px;
            }
            
            #sources-list {
                overflow-y: auto;
                overflow-x: hidden;
                flex-grow: 1;
                min-height: 0;
                padding-right: 8px;
                padding-top: 4px;
                background: var(--sp-panel-bg);
                position: relative;
                isolation: isolate;
            }
            .sp-search-container {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                gap: 6px;
                flex: 0 0 36px;
                width: 36px;
                min-width: 36px;
                margin-left: auto;
                position: relative;
                overflow: hidden;
                border: 1px solid transparent;
                border-radius: 12px;
                transition: flex-basis 0.26s cubic-bezier(0.25, 1, 0.5, 1), width 0.26s cubic-bezier(0.25, 1, 0.5, 1), min-width 0.26s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease, padding 0.26s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-search-container.is-expanded {
                flex: 1 1 100%;
                width: auto;
                min-width: 0;
                padding: 0 4px 0 10px;
                background-color: var(--sp-bg-secondary);
                border-color: var(--sp-border-light);
                box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
            }
            .sp-search-container.is-expanded:focus-within {
                background-color: var(--sp-bg-button);
                border-color: var(--sp-accent);
                box-shadow: 0 0 0 3px rgba(0,122,255,0.15);
            }
            #sp-search {
                width: 0;
                min-width: 0;
                box-sizing: border-box;
                padding: 6px 0;
                border: 0;
                border-radius: 0;
                font-size: 13px;
                background-color: transparent;
                color: var(--sp-text-primary);
                transition: width 0.26s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.18s ease 0s, padding 0.26s cubic-bezier(0.25, 1, 0.5, 1);
                outline: none;
                box-shadow: none;
                opacity: 0;
                pointer-events: none;
            }
            .sp-search-container.is-expanded #sp-search {
                width: 100%;
                opacity: 1;
                pointer-events: auto;
                transition-delay: 0.08s, 0.08s, 0.08s;
            }
            #sp-search:focus {
                background-color: transparent;
                border-color: transparent;
                box-shadow: none;
                transform: none;
            }
            #sp-search::placeholder {
                color: var(--sp-text-secondary);
            }
            
            .sp-icon-button {
                background: none;
                border: none;
                padding: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--sp-text-secondary);
                cursor: pointer;
                border-radius: 8px;
                flex-shrink: 0;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-icon-button:hover {
                background-color: var(--sp-icon-button-hover);
                color: var(--sp-text-primary);
                transform: scale(1.08);
            }
            .sp-icon-button:active {
                transform: scale(0.85);
            }
            .sp-icon-button .google-symbols {
                font-size: 18px;
            }
            
            .sp-button {
                position: relative;
                overflow: hidden;
                border: 1px solid var(--sp-border-light);
                color: var(--sp-text-primary);
                background-color: var(--sp-bg-button);
                font-size: 13px;
                font-weight: 500;
                border-radius: 12px;
                padding: 6px 12px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                white-space: nowrap;
                box-shadow: var(--sp-shadow-button);
            }
            .sp-button:hover {
                background-color: var(--sp-bg-button-hover);
                border-color: var(--sp-border-medium);
            }
            .sp-button:active {
                background-color: var(--sp-bg-button-active);
                transform: scale(0.95);
            }
            .sp-button::after {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 50%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(128,128,128,0.15), transparent);
                transform: skewX(-20deg);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-button:hover::after {
                left: 150%;
            }
            
            /* --- Ultra Premium Custom Animated Checkboxes --- */
            .sp-checkbox { 
                box-sizing: border-box;
                appearance: none; -webkit-appearance: none; 
                width: 18px; height: 18px; 
                margin: 0; padding: 0;
                border: 2px solid var(--sp-text-secondary); /* High contrast border so it's clearly visible in both modes */
                border-radius: 6px; 
                cursor: pointer; 
                position: relative; 
                flex-shrink: 0; 
                background-color: var(--sp-bg-primary); 
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-checkbox:hover {
                border-color: var(--sp-accent);
                transform: scale(1.05);
            }
            .sp-checkbox:checked { 
                background-color: var(--sp-accent); 
                border-color: var(--sp-accent); 
                /* Removed implicit animation */
            }
            /* Explicit user-interaction animation */
            .sp-checkbox.is-animating:checked {
                animation: checkbox-spring 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            
            /* The hidden checkmark shape inside the box */
            .sp-checkbox::before { 
                content: ''; 
                display: block; 
                position: absolute; 
                left: 0.5px; 
                bottom: 6px; 
                border: solid white; 
                border-width: 0 2.5px 2.5px 0; /* Thicker checkmark */
                border-radius: 1px;
                transform: rotate(45deg); 
                transform-origin: left bottom; /* Critical for growing outward correctly */
                
                /* Static base state for unselected */
                width: 0; 
                height: 0; 
                opacity: 0;
            }
            
            /* Static base state for successfully selected elements (avoiding re-render flickers) */
            /* MUST BE LOWER SPECIFICITY OR DECLARED BEFORE THE ANIMATION CLASS */
            .sp-checkbox:checked::before {
                width: 4.5px; 
                height: 10px; 
                opacity: 1;
            }

            /* Animate the checkmark drawing in using an organic, non-linear sequence ONLY on user interaction */
            .sp-checkbox.is-animating:checked::before { 
                /* ease-out decelerates at the very end of the stroke */
                animation: check-draw-organic 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards !important;
                animation-delay: 0.1s !important; /* Let the checkbox pop start and settle a bit first */
            }

            @keyframes check-draw-organic {
                0% {
                    width: 0;
                    height: 0;
                    opacity: 0;
                }
                10% {
                    width: 0;
                    height: 0;
                    opacity: 1;
                }
                40%  { width: 4.5px; height: 0;    opacity: 1; } /* Stroke 1: Draw short stem left-to-right */
                100% { width: 4.5px; height: 10px; opacity: 1; } /* Stroke 2: Whip up the long stem bottom-to-top */
            }

            @keyframes checkbox-spring {
                0% {
                    transform: scale(1);
                }
                30% {
                    transform: scale(0.7);
                }
                60% { transform: scale(1.15); } /* Overshoot */
                100% {
                    transform: scale(1);
                }
            }
            .source-item, .group-header {
                display: flex;
                align-items: center;
                padding: 6px 8px;
                border-radius: 12px;
                margin: 2px 0;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                color: var(--sp-text-primary);
                position: relative;
                z-index: 1;
                transform-origin: left center;
                cursor: pointer;
                box-shadow: none;
            }
            .source-item {
                padding-left: 12px;
                border: 1px solid transparent;
            }
            .group-header {
                font-weight: 600;
                background-color: var(--sp-bg-primary);
            }
            .source-item:hover, .group-header:hover {
                background-color: var(--sp-bg-hover);
                z-index: 4;
                transform: scale(1.015);
                box-shadow: var(--sp-shadow-hover-item);
            }
            .source-item:active, .group-header:active {
                transform: scale(1.008);
            }
            .sp-caret {
                background: none;
                border: none;
                cursor: pointer;
                padding: 0 2px;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                transform: rotate(0deg);
                color: var(--sp-text-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .sp-caret .google-symbols {
                font-size: 20px;
            }
            .sp-caret.collapsed {
                transform: rotate(-90deg);
            }
            .icon-container {
                flex-shrink: 0;
                margin-right: 12px;
                display: flex;
                align-items: center;
                color: var(--sp-text-secondary);
                transition: all 0.15s cubic-bezier(0.25, 1, 0.5, 1);
                cursor: pointer;
            }
            .icon-container:hover {
                transform: scale(0.95);
                opacity: 0.8;
            }
            .icon-container .google-symbols {
                font-size: 16px;
            }
            .sp-source-actions-anchor {
                position: relative;
                flex-shrink: 0;
                margin-right: 8px;
                display: flex;
                align-items: center;
            }
            .title-container, .group-title {
                flex-grow: 1;
                min-width: 0;
                text-overflow: ellipsis;
                white-space: nowrap;
                overflow: hidden;
                font-size: 13px;
                color: var(--sp-text-primary);
                letter-spacing: -0.01em;
            }
            .title-container {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 4px;
                min-width: 0;
            }
            .source-title-text {
                width: 100%;
                line-height: 1.35;
            }
            .source-tag-list {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                width: 100%;
            }
            .sp-tag-pill {
                border: 1px solid var(--sp-border-light);
                background: var(--sp-bg-secondary);
                color: var(--sp-text-secondary);
                border-radius: 999px;
                padding: 2px 8px;
                font-size: 11px;
                line-height: 1.4;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-tag-pill:hover {
                background: var(--sp-bg-hover);
                color: var(--sp-text-primary);
                border-color: var(--sp-border-medium);
            }
            .sp-tag-pill.is-active {
                background: rgba(0, 122, 255, 0.12);
                border-color: rgba(0, 122, 255, 0.3);
                color: var(--sp-accent);
            }
            .checkbox-container {
                flex-shrink: 0;
                margin-left: auto;
                padding-left: 8px;
                display: flex;
                align-items: center;
            }
            .sp-source-actions-button, .sp-add-subgroup-button, .sp-isolate-button, .sp-edit-button, .sp-delete-button {
                background: none;
                border: none;
                cursor: pointer;
                border-radius: 12px;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
                color: var(--sp-text-secondary);
                flex-shrink: 0;
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-source-actions-button .google-symbols,
            .sp-add-subgroup-button .google-symbols,
            .sp-isolate-button .google-symbols,
            .sp-edit-button .google-symbols,
            .sp-delete-button .google-symbols {
                font-size: 16px;
            }
            .sp-source-actions-button {
                opacity: 0.72;
            }
            .sp-source-actions-anchor.is-open .sp-source-actions-button,
            .source-item:hover .sp-source-actions-button {
                opacity: 1;
            }
            .sp-source-actions-button[disabled] {
                opacity: 0.35;
                cursor: not-allowed;
                transform: none;
            }
            .sp-source-actions-layer {
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 10002;
            }
            .sp-source-actions-menu {
                position: absolute;
                min-width: 170px;
                padding: 6px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                border-radius: 14px;
                background: var(--sp-glass-bg-menu);
                backdrop-filter: blur(20px) saturate(160%);
                -webkit-backdrop-filter: blur(20px) saturate(160%);
                border: 1px solid var(--sp-glass-border);
                box-shadow: var(--sp-glass-shadow);
                pointer-events: auto;
                transform-origin: top left;
            }
            .sp-source-actions-menu.is-top {
                transform-origin: bottom left;
            }
            .sp-source-actions-menu-item {
                width: 100%;
                border: none;
                background: transparent;
                color: var(--sp-text-primary);
                border-radius: 10px;
                padding: 8px 10px;
                display: flex;
                align-items: center;
                gap: 10px;
                text-align: left;
                cursor: pointer;
                transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
            }
            .sp-source-actions-menu-item .google-symbols {
                font-size: 16px;
                color: var(--sp-text-secondary);
            }
            .sp-source-actions-menu-label {
                min-width: 0;
                font-size: 12px;
                line-height: 1.35;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .sp-add-subgroup-button, .sp-isolate-button, .sp-edit-button, .sp-delete-button {
                display: flex;
                opacity: 0;
                transform: translateX(10px) scale(0.9);
                pointer-events: none;
                transition: all 0.25s cubic-bezier(0.25, 1, 0.5, 1);
                margin-left: 2px;
            }
            .group-header:hover .sp-add-subgroup-button, .group-header:hover .sp-isolate-button, .group-header:hover .sp-edit-button, .group-header:hover .sp-delete-button {
                opacity: 1;
                transform: translateX(0) scale(1);
                pointer-events: auto;
            }
            .group-title + .badge {
                margin-left: auto;
            }
            .sp-source-actions-button:hover, .sp-source-actions-menu-item:hover, .sp-add-subgroup-button:hover, .sp-isolate-button:hover, .sp-edit-button:hover {
                background-color: var(--sp-icon-button-hover);
                color: var(--sp-text-primary);
            }
            .sp-source-actions-button:hover, .sp-add-subgroup-button:hover, .sp-isolate-button:hover, .sp-edit-button:hover {
                transform: scale(1.1);
            }
            .sp-source-actions-menu-item:hover {
                transform: translateX(2px);
            }
            .sp-source-actions-menu-item:hover .google-symbols {
                color: var(--sp-text-primary);
            }
            .sp-isolate-button.is-active {
                opacity: 1;
                transform: translateX(0) scale(1);
                pointer-events: auto;
                color: var(--sp-accent);
                background-color: rgba(0, 122, 255, 0.12);
            }
            .sp-delete-button:hover {
                background-color: rgba(255, 59, 48, 0.1);
                color: var(--sp-accent-danger);
                transform: scale(1.1);
            }
            .sp-source-actions-button:active, .sp-add-subgroup-button:active, .sp-isolate-button:active, .sp-edit-button:active, .sp-delete-button:active {
                transform: scale(0.85);
            }
            .icon-color {
                color: var(--sp-accent);
                } .youtube-icon-color { color: var(--sp-accent-danger);
                } .pdf-icon-color { color: var(--sp-accent-danger);
            }
            .group-container {
                display: flex;
                flex-direction: column;
                overflow: visible;
                margin-bottom: 2px;
                position: relative;
            }
            .source-item.gated, .group-container.gated > .group-children {
                opacity: 0.5;
                filter: grayscale(50%);
            }
            .failed-source {
                cursor: not-allowed;
            }
            .failed-source .title-container, .failed-source .icon-container {
                color: var(--sp-accent-danger) !important;
            }
            .failed-source .sp-checkbox {
                opacity: 0.5;
                cursor: not-allowed;
                border-color: var(--sp-accent-danger);
            }
            
            /* Loading State Visuals */
            .loading-source {
                cursor: wait;
            }
            .loading-source .title-container { 
                opacity: 0.6; 
                animation: pulse-text 2s cubic-bezier(0.25, 1, 0.5, 1) infinite; 
            }
            .loading-source .sp-checkbox {
                opacity: 0;
                pointer-events: none;
            }
            .sp-spinner {
                width: 16px;
                height: 16px;
                border: 2px solid var(--sp-border-medium);
                border-top-color: var(--sp-accent);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                100% { transform: rotate(360deg);
                };
            }
            @keyframes pulse-text {
                0%, 100% {
                    opacity: 0.8;
                }
                50% {
                    opacity: 0.4;
                }
            }
            .group-children { 
                padding-left: 8px; 
                border-left: 1px solid var(--sp-border-light); 
                margin-left: 18px; 
                margin-top: 2px; 
                overflow: visible; 
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                opacity: 1;
                position: relative;
                /* By default, let height be auto. JS will set explicit heights during animation. */
            }
            .group-children.collapsed {
                height: 0;
                opacity: 0;
                margin-top: 0;
                border: none;
                overflow: hidden;
            }
            
            /* Folder Entry Animation */
            .sp-folder-enter {
                animation: sp-folder-pop 0.4s cubic-bezier(0.25, 1, 0.5, 1) forwards;
                transform-origin: top center;
            }
            @keyframes sp-folder-pop {
                0% {
                    opacity: 0;
                    transform: translateY(-10px) translateX(-5px) scale(0.95);
                }
                100% {
                    opacity: 1;
                    transform: translateY(0) translateX(0) scale(1);
                }
            }
            
            /* --- Move to Folder Modal & Overlay --- */
            @keyframes sp-modal-enter {
                0% {
                    opacity: 0;
                    transform: translate(-50%, -46%) scale(0.95);
                }
                100% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
            }
            @keyframes sp-modal-leave {
                0% {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                }
                100% {
                    opacity: 0;
                    transform: translate(-50%, -54%) scale(0.95);
                }
            }
            .sp-overlay-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.2);
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                pointer-events: none;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
            }
            .sp-overlay-backdrop.visible {
                opacity: 1;
                pointer-events: auto;
            }
            .sp-folder-modal {
                position: fixed;
                top: 50%;
                left: 50%;
                width: 320px;
                max-height: 80vh;
                transform: translate(-50%, -50%);
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(24px);
                -webkit-backdrop-filter: blur(24px);
                border: 1px solid rgba(0, 0, 0, 0.05);
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                z-index: 10001;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                opacity: 0;
                pointer-events: none;
            }
            
            /* Adjust for dark mode specifically */
            @media (prefers-color-scheme: dark) {
                .sp-folder-modal {
                    background: rgba(30, 30, 32, 0.85);
                    border-color: rgba(255,255,255,0.1);
                    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
                }
                .sp-overlay-backdrop {
                    background: rgba(0, 0, 0, 0.6);
                }
                .sp-folder-modal-header,
                .sp-folder-modal-footer {
                    border-color: rgba(255,255,255,0.05);
                }
            }
            
            .sp-folder-modal.visible {
                opacity: 1;
                pointer-events: auto;
                animation: sp-modal-enter 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            }
            .sp-folder-modal.closing {
                animation: sp-modal-leave 0.3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
            }
            .sp-folder-modal-header {
                padding: 16px 20px;
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            }
            .sp-folder-modal-title {
                font-size: 16px;
                font-weight: 500;
                color: var(--sp-text-primary);
                margin: 0;
            }
            .sp-folder-modal-content {
                padding: 8px;
                overflow-y: auto;
                flex-grow: 1;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            /* Vertical option list style */
            .sp-folder-option {
                display: flex;
                align-items: center;
                padding: 10px 12px;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
                background: transparent;
                border: none;
                width: 100%;
                text-align: left;
            }
            .sp-folder-option:hover {
                background: var(--sp-bg-hover);
                transform: scale(0.98);
            }
            .sp-folder-option .google-symbols {
                font-size: 20px;
                color: var(--sp-accent);
                margin-right: 12px;
                opacity: 0.8;
            }
            .sp-folder-option-title {
                font-size: 14px;
                color: var(--sp-text-primary);
                flex-grow: 1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-weight: normal;
            }
            
            .sp-folder-empty {
                padding: 24px 16px;
                text-align: center;
                color: var(--sp-text-tertiary);
                font-size: 14px;
            }
            .sp-folder-modal-footer {
                padding: 12px 16px;
                display: flex;
                justify-content: flex-end;
                border-top: 1px solid rgba(0, 0, 0, 0.05);
                gap: 8px;
            }
            .sp-tag-modal-content {
                gap: 8px;
            }
            .sp-tag-create-row {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .sp-tag-input {
                width: 100%;
                box-sizing: border-box;
                padding: 8px 10px;
                border: 1px solid var(--sp-border-light);
                border-radius: 10px;
                background: var(--sp-bg-secondary);
                color: var(--sp-text-primary);
                font-size: 13px;
                outline: none;
            }
            .sp-tag-input:focus {
                border-color: var(--sp-accent);
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
            }
            .sp-tag-option,
            .sp-tag-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                border-radius: 10px;
                background: var(--sp-bg-primary);
                border: 1px solid var(--sp-border-light);
            }
            .sp-tag-option-checkbox {
                margin: 0;
            }
            .sp-tag-option-label,
            .sp-tag-row-label {
                flex: 1;
                min-width: 0;
                font-size: 13px;
                color: var(--sp-text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .sp-tag-row-count {
                font-size: 12px;
                color: var(--sp-text-secondary);
                min-width: 18px;
                text-align: right;
            }
            .sp-tag-row-button {
                background: none;
                border: none;
                width: 28px;
                height: 28px;
                border-radius: 10px;
                cursor: pointer;
                color: var(--sp-text-secondary);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-tag-row-button:hover {
                background: var(--sp-bg-hover);
                color: var(--sp-text-primary);
            }
            .sp-tag-row-button .google-symbols {
                font-size: 16px;
            }
            .sp-modal-cancel {
                background: var(--sp-bg-secondary);
                color: var(--sp-text-primary);
                border: 1px solid var(--sp-border-light);
                padding: 8px 16px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-modal-cancel:hover {
                background: var(--sp-bg-hover);
                transform: scale(0.98);
            }

            .ungrouped-header {
                margin: 16px 0 6px 8px;
                color: var(--sp-text-secondary);
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .source-item.dragging,
            .group-header.dragging {
                opacity: 0.95;
                background-color: var(--sp-bg-button);
                transform: scale(1.03) translateY(-2px);
                box-shadow: var(--sp-shadow-toast);
                border: 1px solid var(--sp-accent);
                z-index: 10;
                cursor: grabbing;
                transition: none;
            }

            .group-container.drag-into > .group-header {
                background-color: var(--sp-drag-into-bg);
                border-radius: 12px;
            }

            .sp-toast {
                visibility: hidden;
                min-width: 200px;
                background-color: var(--sp-bg-toast);
                color: var(--sp-text-toast);
                text-align: center;
                border-radius: 12px;
                padding: 12px 16px;
                position: fixed;
                z-index: 9999;
                left: 50%;
                bottom: 30px;
                transform: translateX(-50%) translateY(20px) scale(0.9);
                font-size: 14px;
                font-weight: 500;
                opacity: 0;
                filter: blur(4px);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                backdrop-filter: blur(10px);
                box-shadow: var(--sp-shadow-toast);
            }

            .sp-toast.show {
                visibility: visible;
                opacity: 1;
                transform: translateX(-50%) translateY(0) scale(1);
                filter: blur(0);
            }

            .badge {
                font-size: 11px;
                color: var(--sp-text-badge);
                margin-left: 6px;
                font-weight: 500;
                font-variant-numeric: tabular-nums;
                flex-shrink: 0;
                background: var(--sp-bg-badge);
                padding: 2px 6px;
                border-radius: 12px;
            }

            .sp-toggle-switch {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
                margin: 0 8px 0 2px;
                flex-shrink: 0;
                transform: scale(0.9);
            }
            .sp-toggle-switch:hover .sp-toggle-slider {
                box-shadow: inset 0 0 0 1px var(--sp-border-medium);
            }

            .sp-toggle-switch .sp-group-toggle-checkbox {
                opacity: 0;
                width: 0;
                height: 0;
            }

            .sp-toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: var(--sp-bg-switch);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                border-radius: 18px;
                box-shadow: inset 0 0 0 1px var(--sp-border-light);
            }

            .sp-toggle-slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 2px;
                bottom: 2px;
                background-color: var(--sp-bg-switch-thumb);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
                border-radius: 50%;
                box-shadow: var(--sp-shadow-switch-thumb);
            }

            .sp-group-toggle-checkbox:checked + .sp-toggle-slider {
                background-color: var(--sp-accent-success);
                box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);
            }

            .sp-group-toggle-checkbox:checked + .sp-toggle-slider:before {
                transform: translateX(16px);
            }
            
            /* --- Batch Mode Additions --- */
            .source-item.selected-for-batch {
                background-color: rgba(0, 122, 255, 0.05);
                border: 1px dashed var(--sp-accent);
            }
            .sp-batch-checkbox {
                border-color: var(--sp-accent);
                background-color: rgba(0, 122, 255, 0.1);
            }
            .sp-batch-checkbox:checked {
                background-color: var(--sp-accent);
                border-color: var(--sp-accent);
            }
            .sp-batch-action-bar {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                margin-top: 8px;
                position: sticky;
                bottom: 8px;
                background: var(--sp-glass-bg-body, rgba(255, 255, 255, 0.85));
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid var(--sp-glass-border, rgba(0, 0, 0, 0.05));
                border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
                z-index: 5;
            }
            .sp-batch-actions {
                display: flex;
                gap: 8px;
            }
            .sp-batch-add-folder-btn {
                background-color: var(--sp-accent);
                color: white;
                border-color: transparent;
            }
            .sp-batch-add-folder-btn:hover {
                background-color: #0066cc;
            }
            .sp-batch-add-folder-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .sp-confirm-delete-btn {
                background-color: var(--sp-accent-danger);
                color: white;
                border-color: transparent;
            }
            .sp-confirm-delete-btn:hover {
                background-color: #ff2d20;
            }
            .sp-confirm-delete-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            /* =========================================
               UI Polish Part 2
               ========================================= */

            /* 1. Empty Drop Zone Styling */
            .sp-empty-state {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 16px;
                margin: 4px 8px 8px 18px;
                border: 2px dashed var(--sp-border-medium);
                border-radius: 12px;
                color: var(--sp-text-secondary);
                font-size: 13px;
                font-weight: 500;
                background-color: rgba(0, 0, 0, 0.01);
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            @media (prefers-color-scheme: dark) {
                .sp-empty-state {
                    background-color: rgba(255, 255, 255, 0.01);
                }
            }
            .group-container.drag-into > .group-children > .sp-empty-state {
                background-color: var(--sp-drag-into-bg);
                border-color: var(--sp-accent);
                color: var(--sp-accent);
                transform: scale(1.02);
            }
            
            /* 2. Global Icon Button Click Feedback */
            .sp-icon-button {
                transition: all 0.2s cubic-bezier(0.25, 1, 0.5, 1);
            }
            .sp-icon-button:active {
                transform: scale(0.85);
            }


            /* =========================================
               UI Polish Part 3: Typography & Layout
               ========================================= */

            /* 1. Sticky Controls with Glassmorphism */
            .sp-controls {
                display: flex;
                flex-wrap: nowrap;
                align-items: center;
                gap: 8px;
                flex-shrink: 0;
                padding: 12px 8px 8px 0;
                position: sticky;
                top: 0;
                z-index: 20;
                background: var(--sp-panel-bg);
                backdrop-filter: none;
                -webkit-backdrop-filter: none;
                margin-bottom: 0;
                border-bottom: 1px solid var(--sp-border-light);
                transition: border-color 0.3s ease;
            }
            /* Add a subtle border when scrolling */
            #sources-list:not(:empty) {
                padding-top: 0;
            }

            /* 2. Advanced Typography & Line Clamp */
            .source-title-text, .group-title {
                /* Replace single line ellipsis with up to 2 lines */
                white-space: normal;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                line-height: 1.4;
                margin-right: 4px;
            }
            .group-name {
                font-weight: 500;
                letter-spacing: 0.1px;
            }
            
            /* 3. Enhanced Modal Depth (Material 3) */
            .sp-folder-modal {
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.12), 0 0 1px rgba(0,0,0,0.1);
                transition: transform 0.4s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.4s ease;
            }
            @media (prefers-color-scheme: dark) {
                .sp-folder-modal {
                    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255,255,255,0.1);
                }
            }

            .sp-cancel-batch-btn {
                background: transparent;
                border: 1px solid var(--sp-border-light);
            }

            /* =========================================
               UI Polish & Enhancements
               ========================================= */

            /* 1. Custom Webkit Scrollbar */
            #sources-list::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            #sources-list::-webkit-scrollbar-track {
                background: transparent;
            }
            #sources-list::-webkit-scrollbar-thumb {
                background: rgba(150, 150, 150, 0.3);
                border-radius: 10px;
            }
            #sources-list::-webkit-scrollbar-thumb:hover {
                background: rgba(150, 150, 150, 0.6);
            }

            /* 2. Tree-view Hierarchy Lines & Item Styling */
            .source-item {
                border-radius: 8px;
                margin-bottom: 2px;
                transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
            }
            .source-item:hover {
                background-color: var(--sp-bg-hover);
            }
            .group-children {
                border-left: 2px solid var(--sp-border-light) !important;
                border-radius: 0 0 0 6px;
                transition: border-color 0.3s ease, height 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease;
            }
            .group-container:hover > .group-children {
                border-left-color: var(--sp-accent) !important;
            }

            /* 3. Micro-interactions & Focus Rings */
            #sp-search {
                transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            }
            #sp-search:focus {
                outline: none;
                border-color: var(--sp-accent);
                box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.15); /* Apple style focus ring */
            }
            #sp-search:focus + #sp-search-btn .google-symbols {
                color: var(--sp-accent);
            }
            
            /* Enhanced Drag Feedback */
            .drag-over-top {
                border-top: 2px solid var(--sp-accent) !important;
                position: relative;
            }
            .drag-over-top::before {
                content: '';
                position: absolute;
                top: -5px;
                left: -5px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--sp-accent);
                border: 2px solid var(--sp-bg-primary, white);
                z-index: 10;
            }
            
            .drag-over-bottom {
                border-bottom: 2px solid var(--sp-accent) !important;
                position: relative;
            }
            .drag-over-bottom::after {
                content: '';
                position: absolute;
                bottom: -5px;
                left: -5px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--sp-accent);
                border: 2px solid var(--sp-bg-primary, white);
                z-index: 10;
            }
        `;

    const globalOverlayStyleText = `
                    /* --------- Global Apple HIG Glassmorphism Overrides --------- */
                    /* Note: Modifying Angular Material generic overlay/dialog structures */
                    
                    /* 1. Popover Menus (More button floating menus) */
                    body .cdk-overlay-container .mat-mdc-menu-panel,
                    body .cdk-overlay-container .mat-menu-panel {
                        background-color: var(--sp-glass-bg-menu, rgba(255, 255, 255, 0.85)) !important;
                        backdrop-filter: blur(20px) saturate(150%) !important;
                        -webkit-backdrop-filter: blur(20px) saturate(150%) !important;
                        border-radius: 12px !important;
                        border: 1px solid var(--sp-glass-border, rgba(0, 0, 0, 0.1)) !important;
                        box-shadow: var(--sp-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.12)) !important;
                        overflow: hidden !important;
                    }
                    
                    /* Menu item hover effects inside the glass panel */
                    body .cdk-overlay-container .mat-mdc-menu-item:hover,
                    body .cdk-overlay-container .mat-menu-item:hover {
                        background-color: rgba(128, 128, 128, 0.1) !important;
                    }

                    /* 2. Dialogs / Modals (New Note, Rename, Delete Confirmation) */
                    body .cdk-overlay-container .mat-mdc-dialog-surface,
                    body .cdk-overlay-container .mat-dialog-container {
                        background-color: var(--sp-glass-bg-body, rgba(255, 255, 255, 0.75)) !important;
                        backdrop-filter: blur(24px) saturate(180%) !important;
                        -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
                        border-radius: 16px !important;
                        border: 1px solid var(--sp-glass-border, rgba(0, 0, 0, 0.1)) !important;
                        box-shadow: var(--sp-glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.12)) !important;
                    }

                    /* Respect system dark mode for global variables if not defined in shadow root */
                    @media (prefers-color-scheme: dark) {
                        body .cdk-overlay-container {
                            --sp-glass-bg-body: rgba(28, 28, 30, 0.85);
                            --sp-glass-bg-menu: rgba(44, 44, 46, 0.85);
                            --sp-glass-border: rgba(255, 255, 255, 0.15);
                            --sp-glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                        }
                    }
                `;

    globalThis.NSM_CONTENT_STYLE_TEXT = contentStyleText;
    globalThis.NSM_GLOBAL_OVERLAY_STYLE_TEXT = globalOverlayStyleText;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            contentStyleText,
            globalOverlayStyleText
        };
    }
})();
