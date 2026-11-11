(() => {
    'use strict';

    const root = document.documentElement;
    const appHeader = document.getElementById('app-header');
    const appTitle = document.getElementById('app-title');
    const headerActions = document.getElementById('header-actions');
    const clearBtn = document.getElementById('clear-btn');
    const modeBtn = document.getElementById('mode-btn');
    const languageBtn = document.getElementById('language-btn');
    const clearWarningCard = document.getElementById('clear-warning-card');

    const appMain = document.getElementById('app-main');
    const sidePanel = document.getElementById('side-panel');
    const sidePanelHandle = document.getElementById('side-panel-handle');
    const sidePanelNav = document.getElementById('side-panel-nav');
    const preferencesSubnav = document.getElementById('preferences-subnav');
    const schedulesSubnav = document.getElementById('schedules-subnav');
    const schedulesListRegion = document.getElementById('schedules-list-region');

    const coursesFilterBtn = document.getElementById('courses-filter-btn');
    const coursesFilterPopover = document.getElementById('courses-filter-popover');
    const subpanelPrefTimes = document.getElementById('subpanel-pref-times');
    const timePickerPopover = document.getElementById('time-picker-popover');
    const timePickerHour = document.getElementById('time-picker-hour');
    const timePickerMinute = document.getElementById('time-picker-minute');
    const timePickerPeriod = document.getElementById('time-picker-period');

    const previewPanel = document.getElementById('preview-panel');
    const timetableScrollContainer = document.getElementById('timetable-scroll-container');
    const transposeBtn = document.getElementById('transpose-btn');
    const schedulesCrnsBtn = document.getElementById('schedules-crns-btn');
    const schedulesCrnsCard = document.getElementById('schedules-crns-card');

    const appFooter = document.getElementById('app-footer');
    const footerInfo = document.getElementById('footer-info');
    const footerCredits = document.getElementById('footer-credits');
    const footerNotes = document.getElementById('footer-notes');
    const footerDisclaimer = document.getElementById('footer-disclaimer');
    const footerRepoLink = document.getElementById('footer-repo-link');

    const VERTICAL_NORMAL_RATIO = 0.45;
    const VERTICAL_EXPANDED_RATIO = 0.82;
    const DRAG_THRESHOLD_PX = 4;
    const VELOCITY_SNAP_THRESHOLD = 0.28; // px per ms upward/downward
    const VELOCITY_WINDOW_MS = 90;

    const state = {
        currentSidePanelWidth: null,
        lastExpandedSidePanelWidth: null,
        hasUserResizedHorizontal: false,
        activeTimeSlotBtn: null,
        ignoreNextHandleClick: false,
        metrics: null
    };

    let syncRafId = 0;

    /* ======================================================================
       Utilities & Dynamic Offscreen Layout Measurements
       ====================================================================== */

    function createMeasureStage() {
        const stage = document.createElement('div');
        stage.setAttribute('aria-hidden', 'true');
        stage.style.cssText = [
            'position:fixed',
            'inset-block-start:-200vh',
            'inset-inline-start:0',
            'width:max-content',
            'height:auto',
            'visibility:hidden',
            'pointer-events:none',
            'margin:0',
            'padding:0',
            'border:0',
            'contain:layout style'
        ].join(';');
        document.body.appendChild(stage);
        return stage;
    }

    function measureCssLength(stage, cssLengthExpr) {
        const probe = document.createElement('div');
        probe.style.cssText = `width:${cssLengthExpr};height:0;padding:0;border:0;`;
        stage.appendChild(probe);
        return probe.getBoundingClientRect().width;
    }

    function measureTablistMetrics(stage, navElement) {
        const navClone = navElement.cloneNode(true);
        const tablistClone = navClone.querySelector('[role="tablist"]');
        const clonedTabs = Array.from(navClone.querySelectorAll('[role="tab"]'));

        navClone.style.containerType = 'normal';
        navClone.style.width = 'max-content';
        tablistClone.style.width = 'max-content';
        for (const tab of clonedTabs) {
            tab.style.flex = '0 0 auto';
            tab.style.width = 'auto';
        }

        stage.appendChild(navClone);

        tablistClone.dataset.compact = 'false';
        const fullWidths = clonedTabs.map((t) => t.getBoundingClientRect().width);
        const maxFullTabWidth = Math.max(0, ...fullWidths);

        tablistClone.dataset.compact = 'true';
        const iconWidths = clonedTabs.map((t) => t.getBoundingClientRect().width);
        const maxIconTabWidth = Math.max(0, ...iconWidths);

        navClone.remove();

        const count = clonedTabs.length || 1;
        return {
            count,
            maxFullTabWidth,
            maxIconTabWidth,
            fullTotalWidth: Math.ceil(maxFullTabWidth * count) + 2,
            iconTotalWidth: Math.ceil(maxIconTabWidth * count) + 2
        };
    }

    function measureTwoLineMinWidth(stage, sourceEl) {
        if (!sourceEl) return 0;
        const cs = getComputedStyle(sourceEl);
        const probe = document.createElement('span');
        probe.style.display = 'block';
        probe.style.font = cs.font;
        probe.style.letterSpacing = cs.letterSpacing;
        probe.style.lineHeight = cs.lineHeight;
        probe.style.margin = '0';
        probe.style.padding = '0';
        probe.style.border = '0';
        probe.textContent = sourceEl.textContent;
        stage.appendChild(probe);

        probe.style.whiteSpace = 'nowrap';
        probe.style.width = 'max-content';
        const oneRect = probe.getBoundingClientRect();
        const fullW = Math.ceil(oneRect.width);
        const lineH = Math.max(10, oneRect.height);

        probe.style.whiteSpace = 'normal';
        probe.style.textWrap = 'balance';
        probe.style.width = 'min-content';
        const minWordW = Math.ceil(probe.getBoundingClientRect().width);

        let lo = Math.min(minWordW, fullW);
        let hi = fullW;
        while (lo < hi) {
            const mid = Math.floor((lo + hi) / 2);
            probe.style.width = `${mid}px`;
            const r = probe.getBoundingClientRect();
            if (r.height <= lineH * 2.35 && probe.scrollWidth <= mid + 1) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }

        const result = Math.min(fullW, hi + 2);
        probe.remove();
        return result;
    }

    function measureMetrics() {
        const stage = createMeasureStage();
        try {
            const handleThickness = Math.max(12, Math.round(measureCssLength(stage, 'var(--handle-thickness)')));
            const minTruncTextPx = measureCssLength(stage, 'var(--min-trunc-text-width)');
            const timeColWidth = measureCssLength(stage, 'var(--time-col-width)');
            const dayHeaderColWidth = measureCssLength(stage, 'var(--day-header-col-width)');
            const dayColMinWidth = measureCssLength(stage, 'var(--day-col-min-width)');

            // Side-panel tablist widths (cloning <nav> avoids [hidden] ancestor collapse)
            const mainTabs = measureTablistMetrics(stage, sidePanelNav);
            const prefTabs = measureTablistMetrics(stage, preferencesSubnav);
            const schedTabs = measureTablistMetrics(stage, schedulesSubnav);

            // Structural horizontal chrome on #side-panel in horizontal mode (handle + 1px border-inline-end)
            const sideBorderPx = 1;
            const sidePanelChrome = handleThickness + sideBorderPx;

            // Minimum side panel width = minimum intrinsic width of Preferences -> Times table (+ panel padding & handle chrome)
            let subpanelTimesMinWidth = Math.max(prefTabs.iconTotalWidth, mainTabs.iconTotalWidth);
            if (subpanelPrefTimes) {
                const subpanelClone = subpanelPrefTimes.cloneNode(true);
                subpanelClone.hidden = false;
                subpanelClone.querySelector('#time-picker-popover')?.remove();
                subpanelClone.style.cssText = 'flex:0 0 auto;width:max-content;overflow:visible;';
                const timesTableClone = subpanelClone.querySelector('#pref-times-table');
                if (timesTableClone) {
                    timesTableClone.style.width = 'min-content';
                }
                stage.appendChild(subpanelClone);
                subpanelTimesMinWidth = Math.ceil(subpanelClone.getBoundingClientRect().width);
                subpanelClone.remove();
            }

            const minSidePanelContentWidth = Math.max(
                subpanelTimesMinWidth,
                prefTabs.iconTotalWidth,
                mainTabs.iconTotalWidth
            );
            const defaultSidePanelContentWidth = Math.max(
                minSidePanelContentWidth,
                mainTabs.fullTotalWidth,
                prefTabs.fullTotalWidth,
                schedTabs.fullTotalWidth
            );

            const minSidePanelWidth = Math.ceil(minSidePanelContentWidth + sidePanelChrome);
            const defaultSidePanelWidth = Math.ceil(defaultSidePanelContentWidth + sidePanelChrome);
            const oneIconMainTabWidth = Math.ceil(mainTabs.maxIconTabWidth);

            // Header widths
            const headerClone = document.createElement('header');
            headerClone.id = 'app-header';
            headerClone.style.containerType = 'normal';
            headerClone.style.width = 'max-content';
            const titleClone = appTitle.cloneNode(true);
            const actionsClone = headerActions.cloneNode(true);
            headerClone.append(titleClone, actionsClone);
            stage.appendChild(headerClone);

            headerClone.dataset.compact = 'false';
            const headerStyle = getComputedStyle(appHeader);
            const headerPadX = parseFloat(headerStyle.paddingLeft) + parseFloat(headerStyle.paddingRight);
            const headerBorderX = parseFloat(headerStyle.borderLeftWidth) + parseFloat(headerStyle.borderRightWidth);
            const headerGap = parseFloat(headerStyle.columnGap || headerStyle.gap) || 0;
            const headerFullThreshold = Math.ceil(
                titleClone.getBoundingClientRect().width +
                actionsClone.getBoundingClientRect().width +
                headerPadX +
                headerBorderX +
                headerGap
            ) + 2;
            headerClone.remove();

            // Footer widths across 4 segmented intervals
            const footerStyle = getComputedStyle(appFooter);
            const footerPadX = parseFloat(footerStyle.paddingLeft) + parseFloat(footerStyle.paddingRight);
            const footerBorderX = parseFloat(footerStyle.borderLeftWidth) + parseFloat(footerStyle.borderRightWidth);
            const footerGap = parseFloat(footerStyle.columnGap || footerStyle.gap) || 0;

            const footerClone = document.createElement('footer');
            footerClone.id = 'app-footer';
            footerClone.style.containerType = 'normal';
            footerClone.style.width = 'max-content';
            const infoClone = footerInfo.cloneNode(true);
            infoClone.style.width = 'max-content';
            infoClone.style.overflow = 'visible';
            infoClone.style.flex = '0 0 auto';
            delete infoClone.dataset.footerStage;

            const repoClone = footerRepoLink.cloneNode(true);
            footerClone.append(infoClone, repoClone);
            stage.appendChild(footerClone);

            const repoW = repoClone.getBoundingClientRect().width;
            const footerChromeX = footerPadX + footerBorderX + footerGap + repoW;

            // Interval 1 minimum: all 5 segments on one line
            infoClone.dataset.footerStage = '1';
            const footerStage1AllW = Math.ceil(infoClone.getBoundingClientRect().width) + 2;

            // Balanced 2-line target widths for notes & disclaimer
            const notes2LineW = measureTwoLineMinWidth(stage, footerNotes);
            const disclaimer2LineW = measureTwoLineMinWidth(stage, footerDisclaimer);
            root.style.setProperty('--footer-notes-2line-w', `${notes2LineW}px`);
            root.style.setProperty('--footer-disclaimer-2line-w', `${disclaimer2LineW}px`);

            // Interval 2 minimum: credits + dot + 2-line notes + dot + 2-line disclaimer
            infoClone.dataset.footerStage = '2';
            const footerStage2WithCreditsW = Math.ceil(infoClone.getBoundingClientRect().width) + 2;

            // Interval 3 minimum: 2-line notes + dot + 2-line disclaimer (credits hidden)
            infoClone.dataset.footerStage = '3';
            const footerStage3WithNotesW = Math.ceil(infoClone.getBoundingClientRect().width) + 2;

            // Interval 4 minimum: only disclaimer (keeps <= 2 lines without truncating) + repo link
            const footerMinWidth = Math.ceil(footerChromeX + disclaimer2LineW);

            footerClone.remove();

            // Day header abbreviation label widths (English / Arabic)
            const langKey = root.lang === 'ar' ? 'ar' : 'en';
            const dayAbbrs = Array.from(document.querySelectorAll('.day-header abbr'));
            const abbrProbe = document.createElement('span');
            abbrProbe.style.whiteSpace = 'nowrap';
            if (dayAbbrs[0]) {
                const abbrStyle = getComputedStyle(dayAbbrs[0]);
                abbrProbe.style.font = abbrStyle.font;
                abbrProbe.style.letterSpacing = abbrStyle.letterSpacing;
            }
            stage.appendChild(abbrProbe);

            let maxDayFullW = 0;
            let maxDayShortW = 0;
            for (const abbr of dayAbbrs) {
                const fullText = abbr.getAttribute(`data-full-${langKey}`) || '';
                const shortText = abbr.getAttribute(`data-short-${langKey}`) || '';
                abbrProbe.textContent = fullText;
                maxDayFullW = Math.max(maxDayFullW, abbrProbe.getBoundingClientRect().width);
                abbrProbe.textContent = shortText;
                maxDayShortW = Math.max(maxDayShortW, abbrProbe.getBoundingClientRect().width);
            }
            abbrProbe.remove();

            return {
                handleThickness,
                sidePanelChrome,
                subpanelTimesMinWidth,
                minSidePanelWidth,
                defaultSidePanelWidth,
                oneIconMainTabWidth,
                mainTabs,
                prefTabs,
                schedTabs,
                timeColWidth,
                dayHeaderColWidth,
                dayColMinWidth,
                headerFullThreshold,
                footerChromeX,
                footerStage1AllW,
                footerStage2WithCreditsW,
                footerStage3WithNotesW,
                notes2LineW,
                disclaimer2LineW,
                footerMinWidth,
                maxDayFullW: Math.ceil(maxDayFullW) + 2,
                maxDayShortW: Math.ceil(maxDayShortW) + 2
            };
        } finally {
            stage.remove();
        }
    }

    function getPreviewMinWidth() {
        const m = state.metrics;
        const isTransposed = timetableScrollContainer.dataset.transposed === 'true';
        const sideColW = isTransposed ? m.dayHeaderColWidth : m.timeColWidth;
        return Math.ceil(sideColW + m.dayColMinWidth + 2);
    }

    function applyMinConstraints() {
        const m = state.metrics;
        if (!m) return;

        const previewMinWidth = getPreviewMinWidth();
        const layout = appMain.dataset.layout === 'vertical' ? 'vertical' : 'horizontal';
        const isCollapsed = sidePanel.dataset.collapsed === 'true';

        root.style.setProperty('--side-panel-min-width', `${m.minSidePanelWidth}px`);
        root.style.setProperty('--preview-min-width', `${previewMinWidth}px`);

        if (state.currentSidePanelWidth == null || !state.hasUserResizedHorizontal) {
            state.currentSidePanelWidth = m.defaultSidePanelWidth;
            state.lastExpandedSidePanelWidth = m.defaultSidePanelWidth;
        } else {
            state.currentSidePanelWidth = Math.max(m.minSidePanelWidth, state.currentSidePanelWidth);
            if (state.lastExpandedSidePanelWidth != null) {
                state.lastExpandedSidePanelWidth = Math.max(m.minSidePanelWidth, state.lastExpandedSidePanelWidth);
            }
        }
        root.style.setProperty('--side-panel-width', `${Math.round(state.currentSidePanelWidth)}px`);

        const activeSideW = layout === 'horizontal'
            ? (isCollapsed ? m.handleThickness : state.currentSidePanelWidth)
            : 0;
        const appMinWidth = layout === 'horizontal'
            ? Math.max(Math.ceil(activeSideW + previewMinWidth), m.footerMinWidth)
            : Math.max(m.subpanelTimesMinWidth, previewMinWidth, m.footerMinWidth);

        root.style.setProperty('--app-min-width', `${Math.ceil(appMinWidth)}px`);
        root.style.setProperty('--app-min-height', layout === 'vertical' ? '28rem' : '24rem');
    }

    /* ======================================================================
       Responsive Layout & Space-Driven Adaptation
       ====================================================================== */

    function updateMainLayoutMode() {
        const nextLayout = window.innerWidth < window.innerHeight ? 'vertical' : 'horizontal';
        const changed = appMain.dataset.layout !== nextLayout;
        appMain.dataset.layoutManaged = 'true';
        appMain.dataset.layout = nextLayout;

        if (changed) {
            delete sidePanel.dataset.dragging;
            delete sidePanel.dataset.overlay;
            root.style.removeProperty('--side-panel-height');
        }

        syncHandleAriaExpanded();
        applyMinConstraints();
    }

    function syncHandleAriaExpanded() {
        if (appMain.dataset.layout === 'vertical') {
            const expanded = sidePanel.dataset.snap !== 'minimized';
            sidePanelHandle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        } else {
            const expanded = sidePanel.dataset.collapsed !== 'true';
            sidePanelHandle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        }
    }

    function syncHeaderResponsiveness() {
        const m = state.metrics;
        if (!m) return;
        const headerW = appHeader.clientWidth;
        appHeader.dataset.compact = headerW < m.headerFullThreshold ? 'true' : 'false';
    }

    function syncTablistResponsiveness() {
        const m = state.metrics;
        if (!m) return;

        const pairs = [
            [sidePanelNav, m.mainTabs],
            [preferencesSubnav, m.prefTabs],
            [schedulesSubnav, m.schedTabs]
        ];

        const fallbackContentW = Math.max(0, sidePanel.clientWidth - (
            appMain.dataset.layout === 'horizontal' ? m.sidePanelChrome : 0
        ));

        for (const [nav, metrics] of pairs) {
            const tablist = nav.querySelector('[role="tablist"]');
            if (!tablist) continue;
            // Read live width when visible; fall back to side-panel content width if ancestor tabpanel is [hidden]
            const liveW = tablist.clientWidth;
            const availW = liveW > 0 ? liveW : fallbackContentW;
            tablist.dataset.compact = availW < metrics.fullTotalWidth ? 'true' : 'false';
        }
    }

    function syncFooterResponsiveness() {
        const m = state.metrics;
        if (!m) return;

        const availInfoW = appFooter.clientWidth - m.footerChromeX;
        let stage = '4';
        if (availInfoW >= m.footerStage1AllW) {
            stage = '1';
        } else if (availInfoW >= m.footerStage2WithCreditsW) {
            stage = '2';
        } else if (availInfoW >= m.footerStage3WithNotesW) {
            stage = '3';
        }

        footerInfo.dataset.footerStage = stage;
    }

    function syncDayAbbreviations() {
        const m = state.metrics;
        if (!m) return;

        const firstHeader = document.querySelector('.day-header');
        if (!firstHeader) return;

        const cs = getComputedStyle(firstHeader);
        const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const availW = firstHeader.clientWidth - padX;
        const langKey = root.lang === 'ar' ? 'ar' : 'en';

        let mode = 'narrow';
        if (availW >= m.maxDayFullW) {
            mode = 'full';
        } else if (availW >= m.maxDayShortW) {
            mode = 'short';
        }

        const abbrs = document.querySelectorAll('.day-header abbr');
        for (const abbr of abbrs) {
            const fullText = abbr.getAttribute(`data-full-${langKey}`) || '';
            const chosenText = abbr.getAttribute(`data-${mode}-${langKey}`) || fullText;
            abbr.title = fullText;
            if (abbr.textContent !== chosenText) {
                abbr.textContent = chosenText;
            }
        }
    }

    function syncResponsiveUI() {
        syncHeaderResponsiveness();
        syncTablistResponsiveness();
        syncFooterResponsiveness();
        syncDayAbbreviations();
        if (clearWarningCard.open) {
            positionClearWarningCard();
        }
        if (timePickerPopover.open && state.activeTimeSlotBtn) {
            positionTimePickerPopover(state.activeTimeSlotBtn);
        }
    }

    function scheduleResponsiveSync() {
        if (syncRafId) return;
        syncRafId = requestAnimationFrame(() => {
            syncRafId = 0;
            syncResponsiveUI();
        });
    }

    /* ======================================================================
       Side Panel Resize Handle (Horizontal Collapse/Drag & Vertical 3-Snap)
       ====================================================================== */

    function setHorizontalCollapsed(collapsed) {
        if (collapsed) {
            if (sidePanel.dataset.collapsed !== 'true' && state.currentSidePanelWidth != null) {
                state.lastExpandedSidePanelWidth = state.currentSidePanelWidth;
            }
            sidePanel.dataset.collapsed = 'true';
        } else {
            sidePanel.dataset.collapsed = 'false';
            const restoreW = state.lastExpandedSidePanelWidth ?? state.metrics.defaultSidePanelWidth;
            state.currentSidePanelWidth = Math.max(state.metrics.minSidePanelWidth, restoreW);
            root.style.setProperty('--side-panel-width', `${Math.round(state.currentSidePanelWidth)}px`);
        }

        if (collapsed) {
            closeSidePanelPopovers();
        }
        syncHandleAriaExpanded();
        applyMinConstraints();
        syncResponsiveUI();
    }

    function setVerticalSnap(snapName) {
        delete sidePanel.dataset.dragging;
        delete sidePanel.dataset.overlay;
        root.style.removeProperty('--side-panel-height');
        sidePanel.dataset.snap = snapName;

        if (snapName === 'minimized') {
            closeSidePanelPopovers();
        }
        syncHandleAriaExpanded();
        syncResponsiveUI();
    }

    function toggleSidePanelFromClick() {
        if (appMain.dataset.layout === 'vertical') {
            const current = sidePanel.dataset.snap || 'normal';
            setVerticalSnap(current === 'normal' ? 'minimized' : 'normal');
        } else {
            const isCollapsed = sidePanel.dataset.collapsed === 'true';
            setHorizontalCollapsed(!isCollapsed);
        }
    }

    function setupResizeHandle() {
        let dragSession = null;

        sidePanelHandle.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;

            const layout = appMain.dataset.layout === 'vertical' ? 'vertical' : 'horizontal';
            const rect = sidePanel.getBoundingClientRect();
            const now = e.timeStamp || performance.now();

            dragSession = {
                pointerId: e.pointerId,
                layout,
                startX: e.clientX,
                startY: e.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
                didDrag: false,
                samples: [{ y: e.clientY, t: now }]
            };

            try {
                sidePanelHandle.setPointerCapture(e.pointerId);
            } catch (_) {
                // Ignore if pointer capture is unavailable in synthetic test environments
            }
        });

        sidePanelHandle.addEventListener('pointermove', (e) => {
            if (!dragSession || e.pointerId !== dragSession.pointerId) return;

            const dx = e.clientX - dragSession.startX;
            const dy = e.clientY - dragSession.startY;
            if (!dragSession.didDrag && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
                return;
            }
            dragSession.didDrag = true;

            const m = state.metrics;
            if (!m) return;

            if (dragSession.layout === 'horizontal') {
                const isRtl = root.dir === 'rtl';
                const inlineDelta = isRtl ? -dx : dx;
                const rawWidth = dragSession.startWidth + inlineDelta;

                const minSideW = m.minSidePanelWidth;
                const collapseThreshold = Math.max(m.handleThickness + 1, Math.round(minSideW * 0.8));
                const previewMinW = getPreviewMinWidth();
                const viewportW = root.clientWidth || window.innerWidth;
                const maxDragW = Math.max(minSideW, viewportW - previewMinW, dragSession.startWidth);

                if (rawWidth <= collapseThreshold) {
                    if (sidePanel.dataset.collapsed !== 'true') {
                        sidePanel.dataset.collapsed = 'true';
                        closeSidePanelPopovers();
                    }
                } else {
                    const clampedW = Math.round(Math.max(minSideW, Math.min(rawWidth, maxDragW)));
                    sidePanel.dataset.collapsed = 'false';
                    state.currentSidePanelWidth = clampedW;
                    state.lastExpandedSidePanelWidth = clampedW;
                    state.hasUserResizedHorizontal = true;
                    root.style.setProperty('--side-panel-width', `${clampedW}px`);
                }

                syncHandleAriaExpanded();
                applyMinConstraints();
                syncResponsiveUI();
                return;
            }

            // Vertical mode drag
            const now = e.timeStamp || performance.now();
            dragSession.samples.push({ y: e.clientY, t: now });
            const cutoff = now - VELOCITY_WINDOW_MS;
            while (dragSession.samples.length > 2 && dragSession.samples[0].t < cutoff) {
                dragSession.samples.shift();
            }

            const mainH = appMain.clientHeight || window.innerHeight;
            const minH = m.handleThickness;
            const normalH = Math.round(mainH * VERTICAL_NORMAL_RATIO);
            const expandedH = Math.max(normalH + 1, Math.round(mainH * VERTICAL_EXPANDED_RATIO));
            const rawHeight = dragSession.startHeight - dy;
            const clampedH = Math.round(Math.max(minH, Math.min(rawHeight, expandedH)));

            sidePanel.dataset.snap = 'normal';
            sidePanel.dataset.dragging = 'true';
            if (clampedH > normalH) {
                sidePanel.dataset.overlay = 'true';
            } else {
                delete sidePanel.dataset.overlay;
            }
            root.style.setProperty('--side-panel-height', `${clampedH}px`);
            syncHandleAriaExpanded();
            syncResponsiveUI();
        });

        function finishDrag(e) {
            if (!dragSession || e.pointerId !== dragSession.pointerId) return;
            const session = dragSession;
            dragSession = null;

            try {
                if (sidePanelHandle.hasPointerCapture(e.pointerId)) {
                    sidePanelHandle.releasePointerCapture(e.pointerId);
                }
            } catch (_) {
                // Ignore
            }

            if (!session.didDrag) {
                return;
            }

            state.ignoreNextHandleClick = true;
            setTimeout(() => {
                state.ignoreNextHandleClick = false;
            }, 0);

            if (session.layout === 'horizontal') {
                applyMinConstraints();
                syncResponsiveUI();
                return;
            }

            // Determine release velocity in vertical mode and snap cleanly
            const m = state.metrics;
            const mainH = appMain.clientHeight || window.innerHeight;
            const minH = m ? m.handleThickness : 18;
            const normalH = Math.round(mainH * VERTICAL_NORMAL_RATIO);
            const expandedH = Math.max(normalH + 1, Math.round(mainH * VERTICAL_EXPANDED_RATIO));
            const currentH = sidePanel.getBoundingClientRect().height;

            const samples = session.samples;
            const endTime = e.timeStamp || performance.now();
            const first = samples[0];
            const last = samples[samples.length - 1];
            let vUp = 0;
            if (first && last && last !== first && (endTime - last.t) <= 100) {
                const dt = Math.max(1, last.t - first.t);
                vUp = (first.y - last.y) / dt; // positive when dragging UP
            }

            const stops = [
                { name: 'minimized', h: minH },
                { name: 'normal', h: normalH },
                { name: 'expanded', h: expandedH }
            ];

            let chosen = 'normal';
            if (vUp > VELOCITY_SNAP_THRESHOLD) {
                const nextUp = stops.find((s) => s.h > currentH - 12) || stops[stops.length - 1];
                chosen = nextUp.name;
            } else if (vUp < -VELOCITY_SNAP_THRESHOLD) {
                const rev = [...stops].reverse();
                const nextDown = rev.find((s) => s.h < currentH + 12) || stops[0];
                chosen = nextDown.name;
            } else {
                let bestDist = Infinity;
                for (const s of stops) {
                    const dist = Math.abs(currentH - s.h);
                    if (dist < bestDist) {
                        bestDist = dist;
                        chosen = s.name;
                    }
                }
            }

            setVerticalSnap(chosen);
        }

        sidePanelHandle.addEventListener('pointerup', finishDrag);
        sidePanelHandle.addEventListener('pointercancel', finishDrag);

        sidePanelHandle.addEventListener('click', (e) => {
            if (state.ignoreNextHandleClick && e.detail > 0) {
                state.ignoreNextHandleClick = false;
                return;
            }
            state.ignoreNextHandleClick = false;
            toggleSidePanelFromClick();
        });
    }

    /* ======================================================================
       Tabs, State Toggles, Translation & Popovers / Dialogs
       ====================================================================== */

    function activateTab(tablist, targetTab) {
        const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
        const uniqueControlIds = new Set(
            tabs.map((t) => t.getAttribute('aria-controls')).filter(Boolean)
        );
        const togglePanels = uniqueControlIds.size > 1;
        const selectedPanelId = targetTab.getAttribute('aria-controls');

        for (const tab of tabs) {
            const isSelected = tab === targetTab;
            tab.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            if (togglePanels) {
                const panelId = tab.getAttribute('aria-controls');
                const panel = panelId ? document.getElementById(panelId) : null;
                if (panel) {
                    panel.hidden = !isSelected;
                }
            }
        }

        if (!togglePanels && selectedPanelId && selectedPanelId === 'schedules-list-region' && schedulesListRegion) {
            if (targetTab.dataset.filter) {
                schedulesListRegion.dataset.filter = targetTab.dataset.filter;
            }
        }

        closeSidePanelPopovers();
        syncResponsiveUI();
    }

    function setupTabs() {
        const tablists = Array.from(document.querySelectorAll('#side-panel [role="tablist"]'));
        for (const tablist of tablists) {
            const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));

            tablist.addEventListener('click', (e) => {
                const tab = e.target.closest('[role="tab"]');
                if (!tab || !tablist.contains(tab)) return;
                activateTab(tablist, tab);
            });

            tablist.addEventListener('keydown', (e) => {
                const current = document.activeElement?.closest('[role="tab"]');
                if (!current || !tablist.contains(current)) return;

                const isRtl = root.dir === 'rtl';
                const nextKey = isRtl ? 'ArrowLeft' : 'ArrowRight';
                const prevKey = isRtl ? 'ArrowRight' : 'ArrowLeft';
                const idx = tabs.indexOf(current);
                if (idx === -1) return;

                let nextIdx = -1;
                if (e.key === nextKey) {
                    nextIdx = (idx + 1) % tabs.length;
                } else if (e.key === prevKey) {
                    nextIdx = (idx - 1 + tabs.length) % tabs.length;
                } else if (e.key === 'Home') {
                    nextIdx = 0;
                } else if (e.key === 'End') {
                    nextIdx = tabs.length - 1;
                }

                if (nextIdx !== -1) {
                    e.preventDefault();
                    const nextTab = tabs[nextIdx];
                    nextTab.focus();
                    activateTab(tablist, nextTab);
                }
            });
        }
    }

    function toggleMode() {
        const currentMode = root.dataset.mode === 'light' ? 'light' : 'dark';
        const nextMode = currentMode === 'dark' ? 'light' : 'dark';
        root.dataset.mode = nextMode;
        modeBtn.dataset.currentMode = nextMode;
        modeBtn.dataset.targetMode = currentMode;
        modeBtn.setAttribute('aria-pressed', nextMode === 'dark' ? 'true' : 'false');

        const iconSpan = modeBtn.querySelector('.icon');
        if (iconSpan) {
            iconSpan.textContent = nextMode === 'dark' ? '🌘' : '☀️';
        }
    }

    function applyTranslations(lang) {
        const attrName = `data-${lang}`;
        for (const el of document.querySelectorAll('[data-en][data-ar]')) {
            const translated = el.getAttribute(attrName);
            if (translated == null) continue;
            if (el.hasAttribute('aria-label')) {
                el.setAttribute('aria-label', translated);
            } else if (el.hasAttribute('title')) {
                el.setAttribute('title', translated);
            } else if (el.hasAttribute('placeholder')) {
                el.setAttribute('placeholder', translated);
            } else if (el.childElementCount === 0) {
                el.textContent = translated;
            }
        }
    }

    function toggleLanguage() {
        const currentLang = root.lang === 'ar' ? 'ar' : 'en';
        const nextLang = currentLang === 'en' ? 'ar' : 'en';
        const nextDir = nextLang === 'ar' ? 'rtl' : 'ltr';

        root.lang = nextLang;
        root.dir = nextDir;
        languageBtn.dataset.currentLang = nextLang;
        languageBtn.dataset.targetLang = currentLang;

        const abbrIcon = languageBtn.querySelector('.icon');
        if (abbrIcon) {
            abbrIcon.lang = nextLang === 'en' ? 'ar' : 'en';
        }

        applyTranslations(nextLang);
        state.metrics = measureMetrics();
        if (!state.hasUserResizedHorizontal) {
            state.currentSidePanelWidth = state.metrics.defaultSidePanelWidth;
            state.lastExpandedSidePanelWidth = state.metrics.defaultSidePanelWidth;
        }
        applyMinConstraints();
        syncResponsiveUI();
    }

    function toggleTranspose() {
        const current = timetableScrollContainer.dataset.transposed === 'true';
        const next = !current;
        timetableScrollContainer.dataset.transposed = next ? 'true' : 'false';
        transposeBtn.setAttribute('aria-pressed', next ? 'true' : 'false');
        applyMinConstraints();
        syncResponsiveUI();
    }

    function positionClearWarningCard() {
        if (!clearWarningCard.open) return;
        const isRtl = root.dir === 'rtl';
        const headerRect = appHeader.getBoundingClientRect();
        const btnRect = clearBtn.getBoundingClientRect();
        const cardW = clearWarningCard.offsetWidth || 304;
        const maxInline = Math.max(8, appHeader.clientWidth - cardW - 8);
        const rawInlineStart = isRtl
            ? (headerRect.right - btnRect.right)
            : (btnRect.left - headerRect.left);
        const clampedInlineStart = Math.max(8, Math.min(Math.round(rawInlineStart), maxInline));

        clearWarningCard.style.insetInlineEnd = 'auto';
        clearWarningCard.style.insetInlineStart = `${clampedInlineStart}px`;
    }

    function positionTimePickerPopover(anchorBtn) {
        if (!subpanelPrefTimes || !timePickerPopover.open || !anchorBtn) return;
        const isRtl = root.dir === 'rtl';
        const panelRect = subpanelPrefTimes.getBoundingClientRect();
        const btnRect = anchorBtn.getBoundingClientRect();
        const popW = timePickerPopover.offsetWidth || 160;
        const maxInline = Math.max(8, subpanelPrefTimes.clientWidth - popW - 8);

        const rawTop = (btnRect.bottom - panelRect.top) + subpanelPrefTimes.scrollTop + 4;
        const rawInlineStart = isRtl
            ? (panelRect.right - btnRect.right) + Math.abs(subpanelPrefTimes.scrollLeft)
            : (btnRect.left - panelRect.left) + subpanelPrefTimes.scrollLeft;

        const clampedInlineStart = Math.max(8, Math.min(Math.round(rawInlineStart), maxInline));
        timePickerPopover.style.top = `${Math.round(rawTop)}px`;
        timePickerPopover.style.insetInlineStart = `${clampedInlineStart}px`;
    }

    function syncTimePickerInputsFromButton(btn) {
        const timeEl = btn.querySelector('time');
        const datetime = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent.trim()) : '';
        const match = /^(\d{2}):(\d{2})$/.exec(datetime);
        if (!match) return;

        let hour24 = parseInt(match[1], 10);
        const minuteStr = match[2];
        const periodStr = hour24 >= 12 ? 'PM' : 'AM';
        let hour12 = hour24 % 12;
        if (hour12 === 0) hour12 = 12;
        const hour12Str = String(hour12).padStart(2, '0');

        if (timePickerHour && Array.from(timePickerHour.options).some((o) => o.value === hour12Str)) {
            timePickerHour.value = hour12Str;
        }
        if (timePickerMinute && Array.from(timePickerMinute.options).some((o) => o.value === minuteStr)) {
            timePickerMinute.value = minuteStr;
        }
        if (timePickerPeriod) {
            timePickerPeriod.value = periodStr;
        }
    }

    function closeClearWarningCard() {
        if (clearWarningCard.open) {
            clearWarningCard.close();
        }
        clearBtn.setAttribute('aria-expanded', 'false');
    }

    function closeCoursesFilterPopover() {
        if (coursesFilterPopover.open) {
            coursesFilterPopover.close();
        }
        coursesFilterBtn.setAttribute('aria-expanded', 'false');
    }

    function closeTimePickerPopover() {
        if (timePickerPopover.open) {
            timePickerPopover.close();
        }
        state.activeTimeSlotBtn = null;
    }

    function closeSchedulesCrnsCard() {
        if (schedulesCrnsCard.open) {
            schedulesCrnsCard.close();
        }
        schedulesCrnsBtn.setAttribute('aria-expanded', 'false');
    }

    function closeSidePanelPopovers() {
        closeCoursesFilterPopover();
        closeTimePickerPopover();
    }

    function setupDialogsAndPopovers() {
        clearBtn.setAttribute('aria-expanded', clearWarningCard.open ? 'true' : 'false');

        clearBtn.addEventListener('click', () => {
            if (clearWarningCard.open) {
                closeClearWarningCard();
            } else {
                clearWarningCard.show();
                clearBtn.setAttribute('aria-expanded', 'true');
                positionClearWarningCard();
            }
        });

        clearWarningCard.addEventListener('close', () => {
            clearBtn.setAttribute('aria-expanded', 'false');
        });

        coursesFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (coursesFilterPopover.open) {
                closeCoursesFilterPopover();
            } else {
                coursesFilterPopover.show();
                coursesFilterBtn.setAttribute('aria-expanded', 'true');
            }
        });

        if (subpanelPrefTimes) {
            subpanelPrefTimes.addEventListener('click', (e) => {
                const slotBtn = e.target.closest('.time-slot-btn');
                if (!slotBtn) return;
                e.stopPropagation();
                if (timePickerPopover.open && state.activeTimeSlotBtn === slotBtn) {
                    closeTimePickerPopover();
                } else {
                    state.activeTimeSlotBtn = slotBtn;
                    syncTimePickerInputsFromButton(slotBtn);
                    if (!timePickerPopover.open) {
                        timePickerPopover.show();
                    }
                    positionTimePickerPopover(slotBtn);
                }
            });
        }

        schedulesCrnsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (schedulesCrnsCard.open) {
                closeSchedulesCrnsCard();
            } else {
                schedulesCrnsCard.show();
                schedulesCrnsBtn.setAttribute('aria-expanded', 'true');
            }
        });

        document.addEventListener('pointerdown', (e) => {
            if (
                coursesFilterPopover.open &&
                !coursesFilterPopover.contains(e.target) &&
                !coursesFilterBtn.contains(e.target)
            ) {
                closeCoursesFilterPopover();
            }

            if (
                timePickerPopover.open &&
                !timePickerPopover.contains(e.target) &&
                !e.target.closest('.time-slot-btn')
            ) {
                closeTimePickerPopover();
            }

            if (
                schedulesCrnsCard.open &&
                !schedulesCrnsCard.contains(e.target) &&
                !schedulesCrnsBtn.contains(e.target)
            ) {
                closeSchedulesCrnsCard();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            closeClearWarningCard();
            closeCoursesFilterPopover();
            closeTimePickerPopover();
            closeSchedulesCrnsCard();
        });
    }

    function setupObservers() {
        window.addEventListener('resize', () => {
            updateMainLayoutMode();
            syncResponsiveUI();
        });

        if (typeof ResizeObserver === 'function') {
            const ro = new ResizeObserver(() => {
                scheduleResponsiveSync();
            });
            ro.observe(appHeader);
            ro.observe(sidePanel);
            ro.observe(previewPanel);
            ro.observe(appFooter);
        }
    }

    function init() {
        state.metrics = measureMetrics();
        updateMainLayoutMode();
        syncResponsiveUI();

        modeBtn.addEventListener('click', toggleMode);
        languageBtn.addEventListener('click', toggleLanguage);
        transposeBtn.addEventListener('click', toggleTranspose);

        setupTabs();
        setupResizeHandle();
        setupDialogsAndPopovers();
        setupObservers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
