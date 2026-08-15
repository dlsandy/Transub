(function(T) {
    const p = T.__ELECTRON__,
        D = T.TransubSubtitleSplit,
        oe = T.TransubSubtitleQc,
        z = T.TransubSubtitleMeta,
        se = T.TransubSubtitleGlossary,
        _ = T.TransubSubtitleTextPresets,
        Xr = T.TransubSubtitleWorkflows,
        Ne = T.TransubSubtitleFluency,
        Gn = T.TransubSubtitleChinese;
    if (!D) throw new Error("subtitle-split-core.js must load before subtitle-editor.js");
    if (!oe) throw new Error("subtitle-qc-core.js must load before subtitle-editor.js");
    if (!z) throw new Error("subtitle-meta-core.js must load before subtitle-editor.js");
    if (!se) throw new Error("subtitle-glossary-core.js must load before subtitle-editor.js");
    if (!_) throw new Error("subtitle-text-presets-core.js must load before subtitle-editor.js");
    if (!Xr) throw new Error("subtitle-workflows-core.js must load before subtitle-editor.js");
    if (!Ne) throw new Error("subtitle-fluency-core.js must load before subtitle-editor.js");
    if (!Gn) throw new Error("subtitle-chinese-core.js must load before subtitle-editor.js");
    const j = T.TransubEditorParts;
    if (!j?.utils) throw new Error("subtitle-editor/utils.js must load before subtitle-editor.js");
    if (!j?.installUndo) throw new Error("subtitle-editor/undo.js must load before subtitle-editor.js");
    if (!j?.installModals) throw new Error("subtitle-editor/modals.js must load before subtitle-editor.js");
    if (!j?.installBootProgress) throw new Error("subtitle-editor/boot.js must load before subtitle-editor.js");
    if (!j?.installPrefs) throw new Error("subtitle-editor/prefs.js must load before subtitle-editor.js");
    if (!j?.installLayout) throw new Error("subtitle-editor/layout.js must load before subtitle-editor.js");
    if (!j?.installWorkflows) throw new Error("subtitle-editor/workflows.js must load before subtitle-editor.js");
    if (!j?.installKeptAndMarkers) throw new Error("subtitle-editor/kept-and-markers.js must load before subtitle-editor.js");
    if (!j?.installAssStylesUi) throw new Error("subtitle-editor/ass-styles-ui.js must load before subtitle-editor.js");
    if (!j?.installAssOverrideUi) throw new Error("subtitle-editor/ass-override-ui.js must load before subtitle-editor.js");
    if (!j?.installJassubPreview) throw new Error("subtitle-editor/jassub-preview.js must load before subtitle-editor.js");
    if (!T.TransubAssStyles) throw new Error("ass-styles-core.js must load before subtitle-editor.js");
    if (!T.TransubAssOverride) throw new Error("ass-override-core.js must load before subtitle-editor.js");
    const {
        esc: b,
        basename: G,
        formatDisplayTime: Z,
        parseInputTime: Yr,
        cloneCues: Jr,
        cuesEqual: Tl,
        cueEndMs: I,
        cueDurationMs: V,
        formatDurationSec: xt,
        textCharCount: qe,
        lineCharCount: es,
        computeCps: Mt,
        getCueWarnings: Zt,
        findPlaybackIndex: ua,
        clampTargetCps: ma,
        describeVideoCodec: ts,
        buildFindRegex: Kn
    } = j.utils, fa = "\u6587\u672C\u4E3A\u8FDE\u7EED\u4E66\u5199\uFF08\u65E0\u7A7A\u683C\u4E0E\u6362\u884C\uFF09\uFF0C\u65E0\u6CD5\u81EA\u52A8\u5206\u5272\u3002\u8BF7\u4F7F\u7528\u5149\u6807\u6216\u64AD\u653E\u5934\u624B\u52A8\u5206\u5272\u3002", t = {
        ready: !1,
        dirty: !1,
        path: "",
        videoPath: "",
        videoCodec: "",
        videoWidth: 0,
        videoHeight: 0,
        library: null,
        librarySaveIntent: "current",
        format: "srt",
        header: [],
        cues: [],
        selectedIndex: -1,
        playbackIndex: -1,
        previewTextTrack: null,
        textTrackRefreshTimer: null,
        overlayText: "",
        overlaySourceText: "",
        overlayVisible: !1,
        pairPath: "",
        pairCues: [],
        pairFormat: "srt",
        pairHeader: [],
        pairDirty: !1,
        pairReadOnly: !1,
        libraryCompareVersionId: "",
        libraryCompareLabel: "",
        dualRole: null,
        dualDisplayMode: "both",
        dualLineOrder: "source-first",
        cueBoundaryTimer: null,
        playheadTimer: null,
        lastPlaybackSyncAt: 0,
        timelineFollowRaf: 0,
        lastPlayheadLabel: "",
        detailSyncing: !1,
        detailRenderedDurSec: null,
        detailUndoGrouped: !1,
        undoRecording: !1,
        undoStack: [],
        redoStack: [],
        find: {
            active: !1,
            matches: [],
            currentIndex: -1
        },
        initialSnapshot: null,
        savedSnapshot: null,
        silenceSplitBusy: !1,
        retranscribeBusy: !1,
        reconstructBusy: !1,
        inferenceKind: "",
        computeBusy: !1,
        computeBusyLabel: "",
        translateEngine: "",
        jobAbortRequested: !1,
        selectedIndices: new Set,
        selectionAnchor: -1,
        sidecarMeta: null,
        cueMeta: [],
        markers: null,
        keptTranscript: null,
        lastQcResult: null,
        glossary: {
            version: 1,
            entries: []
        },
        globalGlossary: {
            version: 1,
            entries: []
        },
        projectGlossary: {
            version: 1,
            entries: []
        },
        glossaryScope: "global",
        glossaryEditingId: "",
        glossaryIssues: [],
        textPresetsDoc: {
            version: 2,
            updatedAt: null,
            groups: []
        },
        textPresetEditingId: "",
        textPresetsQuery: "",
        breakWords: null,
        listFilter: "all",
        qcIssueIndexSet: new Set,
        qcTypeFilter: null,
        autoFocus: !1,
        waveformEnabled: !0,
        waveform: {
            peaks: null,
            durationSec: 0,
            videoPath: "",
            loading: !1,
            cacheKey: ""
        },
        timeline: {
            dragging: null,
            panning: null,
            durationMs: 0,
            viewStartMs: 0,
            viewEndMs: 0,
            minViewMs: 2e3,
            zoom: 5,
            fitted: !1
        }
    };
    let e = {},
        H = null,
        Bl = null,
        Bt = null,
        As = null,
        Ov = null,
        Jp = null,
        Xt = null,
        Yt = null,
        st = null,
        Vn = !1,
        Jt = !1,
        Ue = "",
        en = null;
    const pa = 45e3;
    let tn = null;
    const ga = 180;
    let Le = 0,
        it = 0,
        ns = 0;
    const O = T.TransubDualSubtitle || null,
        rs = "transub-editor-dual-display",
        ss = "transub-editor-dual-line-order";

    function zn() {
        try {
            const n = localStorage.getItem(rs);
            if (O) return O.normalizeDualDisplayMode(n || "both");
            if (n === "source" || n === "target" || n === "both") return n
        } catch {}
        return "both"
    }

    function ha(n) {
        const r = O ? O.normalizeDualDisplayMode(n) : n === "source" || n === "target" ? n : "both";
        t.dualDisplayMode = r;
        try {
            localStorage.setItem(rs, r)
        } catch {}
        e.dualDisplaySelect && (e.dualDisplaySelect.value = r), It(!0)
    }

    function nn() {
        try {
            const n = localStorage.getItem(ss);
            if (O) return O.normalizeDualLineOrder(n || "source-first");
            if (n === "target-first") return "target-first"
        } catch {}
        return "source-first"
    }

    function ya(n) {
        const r = O ? O.normalizeDualLineOrder(n) : n === "target-first" ? "target-first" : "source-first";
        t.dualLineOrder = r;
        try {
            localStorage.setItem(ss, r)
        } catch {}
        e.dualLineOrderSelect && (e.dualLineOrderSelect.value = r), It(!0)
    }

    function kt() {
        if (!e.dualDisplaySelect) return;
        const n = U();
        e.dualDisplaySelect.classList.toggle("hidden", !n), e.dualLineOrderSelect?.classList.toggle("hidden", !n), e.exportDualBtn?.classList.toggle("hidden", !n), e.exportDualMenuBtn?.classList.toggle("hidden", !n), e.exportDualAssBtn?.classList.toggle("hidden", !n), e.cueTable?.classList.toggle("has-dual-pair", n), document.querySelectorAll(".ctx-dual-only").forEach(r => {
            r.classList.toggle("hidden", !n)
        })
    }

    function U() {
        return !!t.pairPath && Array.isArray(t.pairCues) && t.pairCues.length > 0
    }

    function va() {
        const styleCol = !!(t.showAssStyleColumn || t.format === "ass" || t.format === "ssa");
        return (U() ? 7 : 6) + (styleCol ? 1 : 0)
    }

    function syncAssStyleColumn() {
        const on = !!(t.showAssStyleColumn || t.format === "ass" || t.format === "ssa");
        e.cueTable?.classList.toggle("has-ass-style-col", on)
    }

    async function loadSystemFontsForAss() {
        if (t._systemFontsLoading) return;
        t._systemFontsLoading = !0;
        try {
            let fonts = [];
            if (p?.transubListSystemFonts) {
                const res = await p.transubListSystemFonts();
                if (res?.ok && Array.isArray(res.fonts)) fonts = res.fonts;
            }
            if (!fonts.length && typeof document !== "undefined" && typeof document.fonts?.values === "function") {
                try {
                    for (const face of document.fonts.values()) {
                        const family = String(face.family || "").replace(/["']/g, "").trim();
                        if (family) fonts.push(family);
                    }
                } catch {}
            }
            const uniq = Array.from(new Set(fonts.map(n => String(n || "").trim()).filter(Boolean)));
            t.systemFonts = uniq.map(n => n.toLowerCase());
            const datalist = document.getElementById("editorAssFontSuggestions");
            if (datalist && uniq.length) {
                const preferred = ["Microsoft YaHei", "Source Han Sans SC", "Noto Sans CJK SC", "Arial", "SimHei"];
                const merged = [...preferred, ...uniq.filter(n => !preferred.some(p => p.toLowerCase() === n.toLowerCase()))].slice(0, 80);
                datalist.innerHTML = merged.map(n => `<option value="${b(n)}"></option>`).join("")
            }
        } catch {
            t.systemFonts = []
        } finally {
            t._systemFontsLoading = !1
        }
    }

    function rn() {
        t.pairPath = "", t.pairCues = [], t.pairFormat = "srt", t.pairHeader = [], t.pairDirty = !1, t.pairReadOnly = !1, t.libraryCompareVersionId = "", t.libraryCompareLabel = "", t.dualRole = null, as(), kt(), syncLibraryBar()
    }

    function sn(n) {
        const r = G(n),
            i = r.lastIndexOf(".");
        return i > 0 ? r.slice(0, i) : r
    }

    function is(n) {
        return n ? sn(n) : ""
    }
    async function Sa(n, r, {
        preferTargetPrimary: i = !0
    } = {}) {
        if (rn(), !O || !n || !p?.transubReadSubtitle) return null;
        const s = is(r) || O.parseSubtitleStemParts(sn(n), "").videoStem,
            a = O.inferDualRole(sn(n), s);
        if (!a.role || !(a.videoStem || s)) return null;
        const o = String(n).match(/(\.[^.]+)$/),
            l = o ? o[1] : ".srt",
            c = String(n).replace(/[/\\][^/\\]+$/, ""),
            u = n.includes("\\") ? "\\" : "/",
            m = a.videoStem || s,
            f = O.listPairSuffixCandidates(a.role, a.pairSuffix);
        let g = "",
            h = [];
        if (r && p.transubListSubtitleSidecars) try {
            h = ((await p.transubListSubtitleSidecars({
                videoPath: r
            }))?.sidecars || []).filter(y => y.editable), g = O.findComplementarySidecarPath(n, m, h, {
                primaryRole: a.role,
                preferredPairSuffix: a.pairSuffix
            }) || ""
        } catch {}
        if (!g)
            for (const v of f) {
                const y = `${c}${u}${m}.${v}${l}`;
                if (y !== n) try {
                    const k = await p.transubReadSubtitle({
                        path: y
                    });
                    if (k?.ok && Array.isArray(k.cues) && k.cues.length) {
                        g = y;
                        break
                    }
                } catch {}
            }
        if (!g || g === n) return null;
        try {
            const v = await p.transubReadSubtitle({
                path: g
            });
            return v?.ok ? i && a.role === "source" ? {
                swapToTarget: !0,
                targetPath: g,
                sourcePath: n
            } : (
                // Drop any prior library compare markers — filesystem pair is writable.
                t.pairReadOnly = !1,
                t.libraryCompareVersionId = "",
                t.libraryCompareLabel = "",
                t.pairPath = g,
                t.pairCues = Array.isArray(v.cues) ? v.cues : [],
                as(),
                t.pairFormat = v.format || t.format || "srt",
                t.pairHeader = Array.isArray(v.header) ? v.header : [],
                t.pairDirty = !1,
                t.dualRole = a.role,
                t.dualDisplayMode = zn(),
                t.dualLineOrder = nn(),
                e.dualDisplaySelect && (e.dualDisplaySelect.value = t.dualDisplayMode),
                e.dualLineOrderSelect && (e.dualLineOrderSelect.value = t.dualLineOrder),
                kt(),
                syncLibraryBar(),
                {
                    swapToTarget: !1,
                    pairPath: g,
                    role: a.role
                }
            ) : null
        } catch {
            return rn(), null
        }
    }

    function as() {
        t._pairOverlapIndex = null
    }

    function ba() {
        return !t.pairCues?.length || !O?.buildOverlapIndex ? null : ((!t._pairOverlapIndex || t._pairOverlapIndex.cues !== t.pairCues) && (t._pairOverlapIndex = O.buildOverlapIndex(t.pairCues)), t._pairOverlapIndex)
    }

    function an(n) {
        if (!n || !t.pairCues?.length || !O) return "";
        const r = Number(n.endMs),
            i = Number(n.startMs) || 0,
            s = Number.isFinite(r) ? r : i,
            a = O.findBestOverlapCue(t.pairCues, i, s, {
                index: ba()
            });
        return String(a.cue?.text || "").trim()
    }
    async function os() {
        if (t.pairReadOnly) return {
            ok: !1,
            error: "对照副轨为只读"
        };
        if (!t.pairPath || !p?.transubWriteSubtitle) return {
            ok: !1
        };
        const n = await p.transubWriteSubtitle({
            path: t.pairPath,
            format: t.pairFormat || t.format || "srt",
            cues: t.pairCues,
            header: t.pairHeader,
            backupMode: "off"
        });
        return n?.ok && (t.pairDirty = !1), n
    }
    async function on() {
        if (!U() || !O) {
            d("\u5F53\u524D\u6CA1\u6709\u914D\u5BF9\u7684\u53CC\u8BED\u5B57\u5E55", "err");
            return
        }
        if (!p?.transubExportSubtitle) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5BFC\u51FA", "err");
            return
        }
        x();
        const n = t.dualLineOrder || nn(),
            r = O.buildMergedDualCues(t.cues, t.pairCues, {
                primaryRole: t.dualRole || "target",
                order: n
            });
        if (!r.length) {
            d("\u5408\u5E76\u7ED3\u679C\u4E3A\u7A7A", "err");
            return
        }
        const i = O.suggestMergedExportName(t.path || "subtitle.srt");
        let s = i;
        if (t.path) {
            const m = String(t.path).replace(/[/\\][^/\\]+$/, ""),
                f = t.path.includes("\\") ? "\\" : "/";
            s = `${m}${f}${i}`
        }
        const a = await p.transubExportSubtitle({
            title: "\u5BFC\u51FA\u5408\u5E76\u53CC\u8BED\u5B57\u5E55",
            defaultName: s,
            format: t.format || "srt",
            cues: r,
            header: t.header
        });
        if (a?.canceled) return;
        if (!a?.ok) {
            d(a?.error || "\u5BFC\u51FA\u5931\u8D25", "err");
            return
        }
        const o = t.path,
            l = t.pairPath,
            c = a.path;
        if (await ie("\u5408\u5E76\u540E\u662F\u5426\u5220\u9664\u6E90\u5B57\u5E55\u6587\u4EF6\uFF1F", {
                title: "\u5220\u9664\u6E90\u5B57\u5E55",
                detail: `\u5DF2\u5BFC\u51FA\uFF1A${G(c)}
\u5C06\u5220\u9664\uFF1A
\xB7 ${G(o)}
\xB7 ${G(l)}

\u9009\u62E9\u300C\u5220\u9664\u300D\u540E\u4E0D\u53EF\u6062\u590D\uFF08\u5C06\u6253\u5F00\u5408\u5E76\u540E\u7684\u53CC\u8BED\u6587\u4EF6\uFF09\u3002`,
                okLabel: "\u5220\u9664",
                cancelLabel: "\u4FDD\u7559",
                type: "warning"
            }) && p?.transubDeleteSubtitleFiles) {
            const m = await p.transubDeleteSubtitleFiles({
                paths: [o, l].filter(Boolean)
            });
            if (!m?.ok) {
                d(`\u5DF2\u5BFC\u51FA\u53CC\u8BED\uFF0C\u4F46\u5220\u9664\u6E90\u6587\u4EF6\u5931\u8D25\uFF1A${m?.error||"\u672A\u77E5\u9519\u8BEF"}`, "err");
                return
            }
            rn(), t.dirty = !1, t.pairDirty = !1, c && c !== o ? (await mn(c, t.videoPath), d(`\u5DF2\u5BFC\u51FA\u5E76\u5220\u9664\u6E90\u6587\u4EF6\uFF1A${G(c)}`, "ok")) : d(`\u5DF2\u5BFC\u51FA\u53CC\u8BED\u5E76\u5220\u9664\u6E90\u6587\u4EF6\uFF1A${G(c)}`, "ok");
            return
        }
        d(`\u5DF2\u5BFC\u51FA\u53CC\u8BED\uFF1A${G(a.path)}`, "ok")
    }

    function ls() {
        en && (clearInterval(en), en = null)
    }

    function xa() {
        ls(), en = setInterval(() => {
            cs().catch(n => {
                d(`\u8349\u7A3F\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF1A${n?.message||n}`, "err")
            })
        }, pa)
    }
    async function cs() {
        if (!(!t.dirty || !t.path || !p?.transubWriteSubtitleDraft)) try {
            x(), await p.transubWriteSubtitleDraft({
                path: t.path,
                format: t.format,
                header: t.header,
                cues: t.cues
            })
        } catch (n) {
            throw d(`\u8349\u7A3F\u81EA\u52A8\u4FDD\u5B58\u5931\u8D25\uFF1A${n?.message||n}`, "err"), n
        }
    }
    async function Ma() {
        if (!(!t.path || !p?.transubClearSubtitleDraft)) try {
            await p.transubClearSubtitleDraft({
                path: t.path
            })
        } catch {}
    }
    async function Ba(n) {
        if (!n || !p?.transubCheckSubtitleDraft) return null;
        const r = await p.transubCheckSubtitleDraft({
            path: n
        });
        if (!r?.ok || !r.offer || !r.draft) return null;
        const i = r.savedAt ? new Date(r.savedAt).toLocaleString() : "\u672A\u77E5\u65F6\u95F4";
        if (!await ie(`\u53D1\u73B0\u672A\u4FDD\u5B58\u8349\u7A3F\uFF08${i}\uFF0C\u7EA6 ${r.cueCount||0} \u6761\uFF09\u3002\u662F\u5426\u6062\u590D\uFF1F
\u9009\u300C\u53D6\u6D88\u300D\u5219\u4E22\u5F03\u8349\u7A3F\u5E76\u6253\u5F00\u6587\u4EF6\u5185\u5BB9\u3002`)) {
            try {
                await p.transubClearSubtitleDraft({
                    path: n
                })
            } catch {}
            return null
        }
        return r.draft
    }
    async function ka() {
        try {
            const n = await p?.transWithAiGetOptions?.({});
            Ue = String(n?.options?.ffmpegPath || "").trim()
        } catch {
            Ue = ""
        }
    }

    function ln(n = {}) {
        const r = {
            ...n
        };
        return Ue && (r.ffmpegPath = Ue), r
    }

    function applyLibrarySession(n) {
        const lib = n?.library && typeof n.library === "object" ? n.library : n;
        const versionId = String(lib?.versionId || n?.versionId || "").trim();
        const mediaId = String(lib?.mediaId || n?.mediaId || "").trim();
        if (!versionId && !mediaId) {
            t.library = null;
            syncLibraryBar();
            return
        }
        const mediaLinked = lib?.mediaLinked != null
            ? !!lib.mediaLinked
            : (n?.mediaLinked != null ? !!n.mediaLinked : !!(t.videoPath || lib?.mediaId));
        const mediaExists = lib?.mediaExists != null
            ? !!lib.mediaExists
            : (n?.mediaExists != null ? !!n.mediaExists : !!t.videoPath);
        t.library = {
            mediaId,
            trackId: String(lib?.trackId || n?.trackId || "").trim(),
            versionId,
            role: String(lib?.role || n?.role || "").trim(),
            roleLabel: String(lib?.roleLabel || n?.roleLabel || "").trim(),
            recipeSummary: String(lib?.recipeSummary || n?.recipeSummary || "").trim(),
            contentRef: String(lib?.contentRef || n?.contentRef || "").trim(),
            exportPath: String(lib?.exportPath || n?.exportPath || "").trim(),
            isActive: !!(lib?.isActive ?? n?.isActive),
            mediaTitle: String(lib?.mediaTitle || n?.mediaTitle || "").trim(),
            openedFromBlob: !!(lib?.openedFromBlob ?? n?.openedFromBlob),
            mediaLinked,
            mediaExists,
            abPairAvailable: !!(lib?.abPairAvailable ?? n?.abPairAvailable),
            abVersionIdA: String(lib?.abVersionIdA || n?.abVersionIdA || "").trim(),
            abVersionIdB: String(lib?.abVersionIdB || n?.abVersionIdB || "").trim()
        };
        syncLibraryBar()
    }

    function syncLibraryBar() {
        const bar = e.libraryBar;
        if (!bar) return;
        const lib = t.library;
        if (!lib?.versionId && !lib?.mediaId) {
            bar.classList.add("hidden");
            return
        }
        bar.classList.remove("hidden");
        const title = lib.mediaTitle || (t.videoPath ? G(t.videoPath) : "未命名作品");
        if (e.libraryTitle) {
            e.libraryTitle.textContent = title;
            e.libraryTitle.title = title
        }
        if (e.libraryRole) e.libraryRole.textContent = lib.roleLabel || lib.role || "字幕";
        if (e.libraryActive) e.libraryActive.classList.toggle("hidden", !lib.isActive);
        if (e.libraryRecipe) {
            const recipe = lib.recipeSummary || "—";
            e.libraryRecipe.textContent = recipe;
            e.libraryRecipe.title = recipe
        }
        const linkedInLib = lib.mediaLinked != null ? !!lib.mediaLinked : !1;
        const mediaBad = !t.videoPath;
        if (e.libraryMediaStatus) {
            e.libraryMediaStatus.classList.toggle("hidden", !mediaBad);
            if (mediaBad) {
                e.libraryMediaStatus.textContent = linkedInLib ? "影缺失" : "未关联媒体";
                e.libraryMediaStatus.className = "editor-chip editor-chip-warn shrink-0"
            }
        }
        if (e.libraryFixMediaBtn) {
            e.libraryFixMediaBtn.classList.toggle("hidden", !mediaBad);
            e.libraryFixMediaBtn.title = linkedInLib ? "重新选择媒体文件" : "选择并关联媒体"
        }
        if (e.librarySaveIntent) {
            const intent = t.librarySaveIntent === "draft" || t.librarySaveIntent === "ab"
                ? t.librarySaveIntent
                : "current";
            e.librarySaveIntent.value = intent
        }
        const hasTrack = !!(lib?.trackId || lib?.versionId);
        if (e.libraryAbDiffBtn) e.libraryAbDiffBtn.disabled = !hasTrack;
        if (e.libraryRerunBtn) e.libraryRerunBtn.disabled = !lib?.versionId;
        if (e.libraryLoadCompareBtn) {
            const compareOn = !!(t.libraryCompareVersionId && U());
            e.libraryLoadCompareBtn.disabled = !hasTrack;
            e.libraryLoadCompareBtn.classList.toggle("is-active", compareOn);
            e.libraryLoadCompareBtn.title = compareOn
                ? `卸下${t.libraryCompareLabel || "对照"}副轨`
                : (lib.abPairAvailable ? "挂载对照 A/B 为只读副轨" : "挂载对照副轨（需先在库中标 A/B）");
            const icon = e.libraryLoadCompareBtn.querySelector("i");
            if (icon) icon.className = compareOn ? "fa fa-unlink" : "fa fa-columns"
        }
    }

    async function refreshEditorVideoFromPath(nextPath, { force = false } = {}) {
        const want = String(nextPath || "").trim();
        const cur = String(t.videoPath || "").trim();
        const norm = (s) => String(s || "").replace(/\\/g, "/").toLowerCase();
        if (!want) {
            if (cur || force) await Is("");
            return
        }
        if (!force && cur && norm(cur) === norm(want)) return;
        await Is(want)
    }

    async function applyLibraryMediaUpdate(payload) {
        const mid = String(payload?.mediaId || "").trim();
        if (!mid || !t.library?.mediaId || mid !== t.library.mediaId) return;
        t.library = {
            ...t.library,
            mediaLinked: payload.cleared ? !1 : (payload.mediaLinked != null ? !!payload.mediaLinked : !!payload.videoPath),
            mediaExists: payload.cleared ? !1 : (payload.mediaExists != null ? !!payload.mediaExists : !!payload.videoPath),
            mediaTitle: String(payload.mediaTitle || t.library.mediaTitle || "").trim() || t.library.mediaTitle
        };
        syncLibraryBar();
        if (payload.cleared) {
            await refreshEditorVideoFromPath("", { force: !0 });
            d("库中已清除媒体关联", "warn");
            return
        }
        const next = String(payload.videoPath || "").trim();
        if (next) {
            const before = String(t.videoPath || "").trim();
            await refreshEditorVideoFromPath(next, { force: !t.videoPath });
            syncLibraryBar();
            if (before !== String(t.videoPath || "").trim()) d("已同步库中媒体关联", "ok")
        }
    }

    function loadLibrarySaveIntent() {
        try {
            const v = localStorage.getItem("transub.editor.librarySaveIntent");
            if (v === "draft" || v === "current" || v === "ab") t.librarySaveIntent = v
        } catch {}
    }

    function persistLibrarySaveIntent() {
        try {
            const v = t.librarySaveIntent === "draft" || t.librarySaveIntent === "ab"
                ? t.librarySaveIntent
                : "current";
            localStorage.setItem("transub.editor.librarySaveIntent", v)
        } catch {}
    }

    let _editorInitGen = 0;
    function ds(n) {
        if (n) {
            if (n.welcome && !n.subPath) {
                if (!Vn) {
                    st = n;
                    return
                }
                t.library = null, syncLibraryBar(), cn();
                return
            }
            if (n.subPath) {
                if (!Vn) {
                    st = n;
                    return
                }
                const r = String(n.action || "").trim();
                const i = (s) => String(s || "").replace(/\\/g, "/").toLowerCase();
                const nextVid = String(n.library?.versionId || n.versionId || "").trim();
                const curVid = String(t.library?.versionId || "").trim();
                const versionChanged = !!(nextVid && curVid && nextVid !== curVid);
                const hasLibraryPayload = !!(n.library && (n.library.versionId || n.library.mediaId || n.versionId || n.mediaId));
                const s = t.ready && t.path && i(t.path) === i(n.subPath) && t.cues.length > 0;
                if (s && !versionChanged) {
                    if (hasLibraryPayload) applyLibrarySession(n);
                    else {
                        t.library = null;
                        syncLibraryBar()
                    }
                    void (async () => {
                        const nextVideo = String(n.videoPath || "").trim();
                        if (nextVideo) await refreshEditorVideoFromPath(nextVideo, { force: !t.videoPath });
                        else if (n.library && (n.library.mediaLinked === !1 || n.library.mediaExists === !1)) {
                            await refreshEditorVideoFromPath("", { force: !0 })
                        }
                        syncLibraryBar()
                    })();
                    if (r === "film-context-reconstruct") {
                        Ve({
                            mode: "film",
                            forceAll: !0
                        })
                    }
                    return
                }
                Un();
                const gen = ++_editorInitGen;
                void (async () => {
                    if (versionChanged && t.dirty) {
                        const ok = await ie("当前字幕未保存，切换到库中另一版本将丢失修改，继续？");
                        if (!ok || gen !== _editorInitGen) return
                    }
                    const opened = await fn(n.subPath, n.videoPath || "", {
                        skipDirtyConfirm: versionChanged,
                        dirtyMessage: versionChanged
                            ? "当前字幕未保存，切换库版本将丢失修改，继续？"
                            : "",
                        clearLibrary: !hasLibraryPayload
                    });
                    if (gen !== _editorInitGen) return;
                    if (opened === !1) return;
                    if (hasLibraryPayload) applyLibrarySession(n);
                    else if (!t.library) syncLibraryBar();
                    if (r === "film-context-reconstruct" && t.cues.length && i(t.path) === i(n.subPath)) {
                        Ve({
                            mode: "film",
                            forceAll: !0
                        })
                    }
                })()
            }
        }
    }
    p?.onSubtitleEditorInit?.(ds);
    p?.onTransubLibraryMediaUpdated?.((payload) => {
        void applyLibraryMediaUpdate(payload)
    });

    function d(n, r) {
        e.statusLine && (e.statusLine.textContent = n || "", e.statusLine.className = `status-msg${r==="err"?" err":r==="ok"?" ok":r==="warn"?" warn":""}`)
    }

    function wa(n) {
        const r = Date.parse(String(n || ""));
        if (!Number.isFinite(r)) return "";
        const i = Math.round((Date.now() - r) / 1e3);
        if (i < 60) return "\u521A\u521A";
        if (i < 3600) return `${Math.floor(i/60)} \u5206\u949F\u524D`;
        if (i < 86400) return `${Math.floor(i/3600)} \u5C0F\u65F6\u524D`;
        if (i < 86400 * 7) return `${Math.floor(i/86400)} \u5929\u524D`;
        try {
            return new Date(r).toLocaleString()
        } catch {
            return ""
        }
    }

    function cn() {
        e.welcome && (e.welcome.classList.remove("hidden"), Gr(), d("\u5C31\u7EEA", ""), us())
    }

    function Un() {
        e.welcome && (e.welcome.classList.add("hidden"), e.welcomeIconWrap?.classList.remove("is-dragover"))
    }
    async function us() {
        if (!e.welcomeHistoryList) return;
        let n = [];
        try {
            const r = await p?.transubGetEditorHistory?.();
            r?.ok && Array.isArray(r.entries) && (n = r.entries)
        } catch {}
        if (!n.length) {
            e.welcomeHistoryList.innerHTML = '<div class="editor-welcome-history-empty">\u6682\u65E0\u6700\u8FD1\u7F16\u8F91\u8BB0\u5F55</div>', e.welcomeClearBtn && (e.welcomeClearBtn.disabled = !0);
            return
        }
        e.welcomeClearBtn && (e.welcomeClearBtn.disabled = !1), e.welcomeHistoryList.innerHTML = n.map(r => {
            const i = r.exists === !1,
                s = wa(r.openedAt),
                a = i ? s ? `${s} \xB7 \u6587\u4EF6\u4E0D\u5B58\u5728` : "\u6587\u4EF6\u4E0D\u5B58\u5728" : s;
            const mediaPath = r.videoPath || r.path || "";
            return `<div class="editor-welcome-history-item${i?" is-missing":""}" role="listitem">
                <button type="button" class="editor-welcome-history-open" data-path="${b(r.path)}" data-video="${b(r.videoPath||"")}" title="${b(r.path)}">
                    <span class="editor-welcome-history-name">${b(r.basename||G(r.path))}</span>
                    <span class="editor-welcome-history-path">${b(r.path)}</span>
                    ${a?`<span class="editor-welcome-history-meta">${b(a)}</span>`:""}
                </button>
                <button type="button" class="editor-welcome-history-lib" data-open-library data-media-path="${b(mediaPath)}" title="在字幕库中查看">库</button>
            </div>`
        }).join("")
    }
    async function Ca(n, r) {
        if (!(!n || !p?.transubAppendEditorHistory)) try {
            await p.transubAppendEditorHistory({
                path: n,
                videoPath: r || "",
                basename: G(n)
            })
        } catch {}
    }
    async function Ea() {
        if (await ie("\u786E\u5B9A\u6E05\u9664\u5168\u90E8\u5B57\u5E55\u7F16\u8F91\u5386\u53F2\uFF1F", {
                title: "\u6E05\u9664\u5386\u53F2\u8BB0\u5F55",
                okLabel: "\u6E05\u9664",
                detail: "\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002"
            })) {
            try {
                await p?.transubClearEditorHistory?.()
            } catch {}
            await us(), d("\u5DF2\u6E05\u9664\u7F16\u8F91\u5386\u53F2", "ok")
        }
    }

    function Ia(n) {
        if (!n) return "";
        const r = n.path || "";
        return r || p?.getPathForFile?.(n) || ""
    }

    function ms(n) {
        const r = String(n || "").toLowerCase();
        return [".srt", ".vtt", ".lrc", ".ass", ".ssa"].some(i => r.endsWith(i))
    }
    async function Pa(n) {
        const r = n?.files;
        if (!r?.length) {
            d("\u672A\u8BC6\u522B\u5230\u53EF\u6253\u5F00\u7684\u5B57\u5E55\u6587\u4EF6", "err");
            return
        }
        let i = "";
        for (const s of r) {
            const a = Ia(s);
            if (a && ms(a)) {
                i = a;
                break
            }
            if (!a && ms(s.name || "")) {
                d("\u65E0\u6CD5\u83B7\u53D6\u62D6\u653E\u6587\u4EF6\u8DEF\u5F84", "err");
                return
            }
        }
        if (!i) {
            d("\u8BF7\u62D6\u653E SRT / VTT / LRC / ASS \u5B57\u5E55\u6587\u4EF6", "err");
            return
        }
        await fn(i, "", { clearLibrary: !0 })
    }

    function La() {
        e.welcomeOpenBtn?.addEventListener("click", () => {
            rr()
        }), e.welcomeOpenGeneratorBtn?.addEventListener("click", () => {
            Ai()
        }), e.welcomeOpenLibraryBtn?.addEventListener("click", () => {
            openSubtitleLibraryFromEditor()
        }), e.welcomeClearBtn?.addEventListener("click", () => {
            Ea()
        }), e.welcomeHistoryList?.addEventListener("click", s => {
            const libBtn = s.target.closest?.("[data-open-library]");
            if (libBtn) {
                s.preventDefault();
                const mediaPath = libBtn.getAttribute("data-media-path") || "";
                void (async () => {
                    try {
                        const res = await p?.transubOpenSubtitleLibrary?.({ mediaPath });
                        res?.ok === !1 && d(res?.error || "无法打开字幕库", "err")
                    } catch (err) {
                        d(err?.message || "无法打开字幕库", "err")
                    }
                })();
                return
            }
            const a = s.target.closest?.("[data-path]");
            if (!a) return;
            const o = a.getAttribute("data-path") || "",
                l = a.getAttribute("data-video") || "";
            o && fn(o, l, { clearLibrary: !0 })
        });
        const n = e.welcomeIconWrap || e.welcomeIcon || e.welcome;
        if (!n) return;
        let r = 0;
        const i = s => {
            e.welcomeIconWrap?.classList.toggle("is-dragover", !!s)
        };
        n.addEventListener("dragenter", s => {
            s.preventDefault(), r += 1, i(!0)
        }), n.addEventListener("dragover", s => {
            s.preventDefault(), s.dataTransfer && (s.dataTransfer.dropEffect = "copy"), i(!0)
        }), n.addEventListener("dragleave", s => {
            s.preventDefault(), r = Math.max(0, r - 1), r === 0 && i(!1)
        }), n.addEventListener("drop", s => {
            s.preventDefault(), r = 0, i(!1), Pa(s.dataTransfer)
        }), e.welcome?.addEventListener("dragover", s => s.preventDefault()), e.welcome?.addEventListener("drop", s => s.preventDefault())
    }

    function fs() {
        document.title = t.path ? `${t.dirty?"* ":""}Transub Editor \u2014 ${G(t.path)}` : "Transub Editor"
    }

    function P(n) {
        const r = !!n,
            i = t.dirty !== r;
        t.dirty = r, e.dirtyBadge && e.dirtyBadge.classList.toggle("hidden", !t.dirty), i && fs()
    }

    function ps(n) {
        return ua(t.cues, n, t.playbackIndex)
    }

    function x() {
        if (t.detailSyncing || t.selectedIndex < 0 || t.selectedIndex >= t.cues.length) return;
        const n = t.cues[t.selectedIndex],
            r = Yr(e.detailStart?.value, t.format);
        r != null && (n.startMs = r);
        const i = Number(e.detailDuration?.value),
            s = V(n) / 1e3;
        Number.isFinite(i) && i > 0 && (Math.abs(i - s) > .05 && t.detailRenderedDurSec != null && Math.abs(i - t.detailRenderedDurSec) < .001 || (n.endMs = n.startMs + Math.round(i * 1e3))), e.detailText && (n.text = e.detailText.value)
    }

    function ye() {
        if (t.overlayText = "", t.overlayVisible = !1, tr(), !t.ready || !e.video) return;
        const n = !e.video.paused && !e.video.ended;
        t.cueBoundaryTimer && (clearTimeout(t.cueBoundaryTimer), t.cueBoundaryTimer = null), ks(e.video.currentTime || 0, !0), n && ot()
    }

    function wt() {
        if (t.selectedIndex < 0) return;
        const n = t.cues[t.selectedIndex],
            r = e.detailText?.value ?? n.text ?? "",
            i = V(n),
            s = Mt(r, i),
            a = yt();
        if (e.detailCps)
            if (!s) e.detailCps.textContent = "CPS \u2014", e.detailCps.style.color = "var(--ed-accent)", e.detailCps.style.fontWeight = "500";
            else {
                const u = Number(s);
                e.detailCps.textContent = `\u5F53\u524D CPS ${s}\uFF08\u76EE\u6807 ${a}\uFF09`, u > a * 1.05 ? (e.detailCps.style.color = "var(--ed-warn-text)", e.detailCps.style.fontWeight = "600") : (e.detailCps.style.color = "var(--ed-accent)", e.detailCps.style.fontWeight = "500")
            } e.lineLen && (e.lineLen.textContent = String(es(r))), e.textLen && (e.textLen.textContent = String(qe(r))), e.detailEnd && (e.detailEnd.value = Z(I(n), t.format));
        const o = t.selectedIndex > 0 ? t.cues[t.selectedIndex - 1] : null,
            l = t.selectedIndex < t.cues.length - 1 ? t.cues[t.selectedIndex + 1] : null,
            c = Zt(n, o, l);
        if (e.detailWarn) {
            const u = t.cueMeta[t.selectedIndex],
                m = u?.source === "asr" ? "ASR" : u?.source === "heuristic" ? "\u542F\u53D1\u5F0F\u4F30\u8BA1" : "",
                f = u?.low ? `\u4F4E\u7F6E\u4FE1 ${(u.confidence*100).toFixed(0)}%\uFF08${m||(u.flags||[]).map(g=>z.flagLabel(g)).join(" \xB7 ")||"\u4F30\u8BA1"}\uFF09` : u?.source === "asr" && u.confidence != null ? `ASR \u7F6E\u4FE1 ${(u.confidence*100).toFixed(0)}%` : "";
            if (c.msg.length) e.detailWarn.textContent = [c.msg.join(" \xB7 "), f].filter(Boolean).join(" \xB7 "), e.detailWarn.classList.remove("hidden");
            else if (f) e.detailWarn.textContent = `${f}\uFF0C\u53EF\u53F3\u952E\u91CD\u8F6C\u5199\u6216\u6807\u8BB0\u4E3A\u53EF\u4FE1`, e.detailWarn.classList.remove("hidden");
            else {
                const g = s ? Number(s) : null;
                g != null && g > a * 1.2 && qe(r) >= 8 && !D.isConnectedText(r) ? (e.detailWarn.textContent = "\u8BFB\u901F\u8FC7\u5FEB\uFF0C\u5EFA\u8BAE\u4F7F\u7528\u667A\u80FD\u5206\u5272", e.detailWarn.classList.remove("hidden")) : (e.detailWarn.textContent = "", e.detailWarn.classList.add("hidden"))
            }
        }
    }

    function gs() {
        const n = t.selectedIndex;
        if (n < 0 || n >= t.cues.length) return null;
        const r = t.cues[n],
            i = {
                startMs: r.startMs,
                endMs: r.endMs,
                text: r.text
            };
        e.detailText != null && (i.text = e.detailText.value);
        const s = Yr(e.detailStart?.value, t.format);
        s != null && (i.startMs = s);
        const a = Number(e.detailDuration?.value);
        return Number.isFinite(a) && a > 0 && (i.endMs = i.startMs + Math.round(a * 1e3)), i
    }

    function at() {
        const n = t.selectedIndex;
        if (!(n >= 0 && n < t.cues.length)) {
            e.prevCueBtn && (e.prevCueBtn.disabled = !0), e.nextCueBtn && (e.nextCueBtn.disabled = !0), e.deleteCueBtn && (e.deleteCueBtn.disabled = !0), e.splitCueBtn && (e.splitCueBtn.disabled = !0), e.smartSplitCueBtn && (e.smartSplitCueBtn.disabled = !0), e.silenceSplitCueBtn && (e.silenceSplitCueBtn.disabled = !0), e.compressRepCueBtn && (e.compressRepCueBtn.disabled = !0), e.splitLinesBtn && (e.splitLinesBtn.disabled = !0), e.splitSpacesBtn && (e.splitSpacesBtn.disabled = !0), e.charDurBtn && (e.charDurBtn.disabled = !0), e.smartDurBtn && (e.smartDurBtn.disabled = !0), e.audioSnapBtn && (e.audioSnapBtn.disabled = !0), Qe();
            return
        }
        const i = gs() || t.cues[n],
            s = String(i.text || ""),
            a = s.trim(),
            o = !!a,
            l = o && s.includes(`
`),
            c = o && /\s/.test(s);
        if (e.prevCueBtn && (e.prevCueBtn.disabled = n <= 0), e.nextCueBtn && (e.nextCueBtn.disabled = n >= t.cues.length - 1), e.deleteCueBtn && (e.deleteCueBtn.disabled = !1), e.splitCueBtn && (e.splitCueBtn.disabled = !1), e.smartSplitCueBtn && (e.smartSplitCueBtn.disabled = !o), e.silenceSplitCueBtn && (e.silenceSplitCueBtn.disabled = t.silenceSplitBusy || !$t(i) || !t.videoPath || !p?.ffmpegDetectSilence), e.compressRepCueBtn) {
            const m = !!a && a.length >= 3 && (/(.)\1{2,}/.test(a) || /(.{2,6})\1{1,}/.test(a)) && !!Ne.compressRepetitionInText(a)?.changed;
            e.compressRepCueBtn.disabled = !m
        }
        e.splitLinesBtn && (e.splitLinesBtn.disabled = !l), e.splitSpacesBtn && (e.splitSpacesBtn.disabled = !c), e.charDurBtn && (e.charDurBtn.disabled = !qe(s)), e.smartDurBtn && (e.smartDurBtn.disabled = t.silenceSplitBusy || !Dt(i) || !t.videoPath || !p?.ffmpegDetectSilence), e.audioSnapBtn && (e.audioSnapBtn.disabled = t.silenceSplitBusy || t.retranscribeBusy || !Tt(i) || !t.videoPath || !p?.ffmpegDetectSilence), Qe()
    }

    function R(n = {}) {
        t.detailSyncing = !0;
        const r = t.selectedIndex,
            i = r >= 0 && r < t.cues.length,
            s = !!n.fromPlayback;
        if (e.detailPane && (e.detailPane.style.opacity = i ? "1" : "0.5"), !i) {
            e.detailStart && (e.detailStart.value = ""), e.detailDuration && (e.detailDuration.value = ""), e.detailEnd && (e.detailEnd.value = ""), e.detailText && (e.detailText.value = ""), e.detailCps && (e.detailCps.textContent = "CPS \u2014"), e.lineLen && (e.lineLen.textContent = "0"), e.textLen && (e.textLen.textContent = "0"), e.detailWarn && e.detailWarn.classList.add("hidden"), e.detailPairWrap && e.detailPairWrap.classList.add("hidden"), e.detailPairText && (e.detailPairText.textContent = ""), s || at(), t.detailRenderedDurSec = null, t.detailSyncing = !1;
            return
        }
        const a = t.cues[r];
        if (e.detailStart && (e.detailStart.value = Z(a.startMs, t.format)), e.detailDuration && (e.detailDuration.value = xt(V(a))), e.detailEnd && (e.detailEnd.value = Z(I(a), t.format)), e.detailText && (e.detailText.value = a.text || ""), e.detailPairWrap && e.detailPairText)
            if (U()) {
                const o = an(a);
                e.detailPairText.textContent = o || "\uFF08\u65E0\u65F6\u95F4\u91CD\u53E0\u7684\u5BF9\u7167\uFF09", e.detailPairWrap.classList.remove("hidden");
                e.detailPairLabel && (e.detailPairLabel.textContent = t.libraryCompareLabel
                    ? `${t.libraryCompareLabel}（只读）`
                    : (t.pairReadOnly ? "对照轨（只读）" : "对照轨"))
            } else e.detailPairText.textContent = "", e.detailPairWrap.classList.add("hidden");
        s || at(), wt(), t.detailRenderedDurSec = V(a) / 1e3, t.detailSyncing = !1
    }

    function Qe() {
        const n = e.retranscribeDurBtn || e.retranscribeCueBtn;
        n && (n.disabled = t.retranscribeBusy || t.silenceSplitBusy || t.computeBusy || !t.videoPath || !p?.transubTranscribeRange)
    }

    function Qn() {
        t.selectedIndices instanceof Set || (t.selectedIndices = new Set), t.selectedIndex >= 0 && t.selectedIndex < t.cues.length ? t.selectedIndices.size || t.selectedIndices.add(t.selectedIndex) : t.selectedIndices.size && ([...t.selectedIndices].some(n => n >= 0 && n < t.cues.length) || t.selectedIndices.clear())
    }

    function J() {
        return Qn(), [...t.selectedIndices].filter(n => Number.isInteger(n) && n >= 0 && n < t.cues.length).sort((n, r) => n - r)
    }

    function We(n, r, i = {}) {
        const s = t.selectedIndex,
            a = new Set;
        for (const c of n || []) {
            const u = Number(c);
            Number.isInteger(u) && u >= 0 && u < t.cues.length && a.add(u)
        }
        t.selectedIndices = a;
        let o = Number(r);
        (!Number.isInteger(o) || o < 0 || o >= t.cues.length) && (o = a.size ? Math.max(...a) : -1);
        const l = !!i.fromPlayback;
        o !== t.selectedIndex && ((!l || !Nr()) && x(), t.selectedIndex = o, o >= 0 && R({
            fromPlayback: l
        })), t.selectionAnchor = o, l ? Da(s, o) : ve(), !l && e.timelineCues && e.timelineCues.querySelectorAll(".editor-timeline-cue").forEach(c => {
            const u = Number(c.getAttribute("data-tl-idx"));
            c.classList.toggle("selected", a.has(u) || u === t.selectedIndex)
        })
    }

    function Da(n, r) {
        if (n !== r) {
            if (n >= 0) {
                const i = e.cueBody?.querySelector(`tr[data-cue-idx="${n}"]`);
                if (i) {
                    const s = t.selectedIndices.has(n);
                    i.classList.toggle("cue-row-selected", s)
                }
            }
            if (r >= 0) {
                const i = e.cueBody?.querySelector(`tr[data-cue-idx="${r}"]`);
                i && i.classList.add("cue-row-selected")
            }
        }
    }

    function ve() {
        if (!e.cueBody) return;
        Qn();
        const n = t.find.active && t.find.currentIndex >= 0 ? t.find.matches[t.find.currentIndex]?.cueIdx : -1,
            r = new Set(t.find.active ? t.find.matches.map(i => i.cueIdx) : []);
        e.cueBody.querySelectorAll("tr[data-cue-idx]").forEach(i => {
            const s = Number(i.dataset.cueIdx),
                a = t.selectedIndices.has(s) || s === t.selectedIndex;
            i.classList.toggle("cue-row-selected", a), i.classList.toggle("cue-row-playing", s === t.playbackIndex), i.classList.toggle("cue-row-find-hit", r.has(s)), i.classList.toggle("cue-row-find-current", s === n), i.classList.toggle("cue-row-low-conf", !!t.cueMeta[s]?.low), i.classList.toggle("cue-row-qc", !!t.qcIssueIndexSet?.has(s))
        })
    }

    function Zn() {
        return {
            maxCps: Number(e.qcMaxCps?.value) || Number(e.smartMaxCps?.value) || 18,
            minSec: Number(e.qcMinSec?.value) || .5,
            maxSec: Number(e.qcMaxSec?.value) || 10,
            lowThreshold: z.DEFAULT_LOW_THRESHOLD
        }
    }

    function He() {
        t.cueMeta = z.mergeConfidenceAnnotations(t.cues, t.sidecarMeta, Zn());
        const n = z.summarizeLowConfidence(t.cueMeta);
        e.lowConfBadge && (n.low > 0 ? (e.lowConfBadge.textContent = `\u4F4E\u7F6E\u4FE1 ${n.low>99?"99+":n.low}`, e.lowConfBadge.classList.remove("hidden"), e.lowConfBadge.title = n.summary) : (e.lowConfBadge.textContent = "0", e.lowConfBadge.classList.add("hidden"), e.lowConfBadge.title = "\u65E0\u53EF\u7591\u6761\u76EE"))
    }
    async function Ta(n) {
        if (t.sidecarMeta = null, !n || !p?.transubReadSubtitleMeta) {
            He();
            return
        }
        try {
            const r = await p.transubReadSubtitleMeta({
                path: n
            });
            r?.ok && r.meta && (t.sidecarMeta = r.meta)
        } catch {
            t.sidecarMeta = null
        }
        He()
    }
    async function dn() {
        if (!t.path || !p?.transubWriteSubtitleMeta) return;
        const n = z.buildSidecarDocument(t.cues, t.cueMeta, {
            sourceSub: G(t.path),
            markers: t.markers || void 0
        });
        t.sidecarMeta = n;
        try {
            await p.transubWriteSubtitleMeta({
                path: t.path,
                meta: n
            })
        } catch {}
    }

    function C(n = {}) {
        if (!e.cueBody) return;
        const r = !!n.listOnly,
            i = !!n.reuseMeta,
            s = va();
        if (kt(), !t.cues.length) {
            e.cueBody.innerHTML = `<tr><td colspan="${s}" class="px-3 py-6 text-center text-xs" style="color:var(--ed-faint)">\u65E0\u5B57\u5E55\u6761\u76EE</td></tr>`, e.filterCount && (e.filterCount.textContent = ""), r || me(), t.selectedIndex = -1, t.cueMeta = [], r || (R(), ye(), je(null), _t()), i || He();
            return
        }
        i || (He(), Ii());
        const a = Vt();
        if (e.filterCount && (e.filterCount.textContent = t.listFilter === "all" ? "" : `\u663E\u793A ${a.length} / ${t.cues.length}`), a.length) {
            const o = U(),
                l = e.cueTable?.querySelector(".col-pair-head");
            l && (l.textContent = t.dualRole === "source" ? "\u8BD1\u6587\u5BF9\u7167" : "\u539F\u6587\u5BF9\u7167"), syncAssStyleColumn();
            const c = T.TransubCueListWindow,
                u = e.listWrap || e.cueBody?.closest?.(".editor-list-wrap"),
                m = c?.shouldVirtualize?.(a.length);
            let f = a,
                g = 0,
                h = 0;
            if (m && u) {
                const k = c.computeWindow({
                    scrollTop: u.scrollTop || 0,
                    viewportHeight: u.clientHeight || 400,
                    total: a.length
                });
                if (f = a.slice(k.start, k.end), g = k.topPad, h = k.bottomPad, !t._listScrollBound) {
                    t._listScrollBound = !0;
                    let q = 0;
                    u.addEventListener("scroll", () => {
                        q || (q = requestAnimationFrame(() => {
                            q = 0, !(!e.video?.paused && Et()) && C({
                                listOnly: !0,
                                reuseMeta: !0
                            })
                        }))
                    }, {
                        passive: !0
                    })
                }
            }
            const v = (k, q) => k > 0 ? `<tr class="cue-pad-row" data-pad="${q}"><td colspan="${s}" style="height:${k}px;padding:0;border:0;line-height:0"></td></tr>` : "",
                y = f.map(k => $a(k, o)).join("");
            e.cueBody.innerHTML = `${v(g,"top")}${y}${v(h,"bottom")}`
        } else {
            const o = t.listFilter === "all" ? "\u65E0\u5B57\u5E55\u6761\u76EE" : "\u5F53\u524D\u7B5B\u9009\u65E0\u5339\u914D\u6761\u76EE";
            e.cueBody.innerHTML = `<tr><td colspan="${s}" class="px-3 py-6 text-center text-xs" style="color:var(--ed-faint)">${o}</td></tr>`
        }
        t.selectedIndex >= t.cues.length && (t.selectedIndex = t.cues.length - 1), t.selectedIndex < 0 && t.cues.length && (t.selectedIndex = 0), ve(), !r && (R(), tr(), ye(), i && xr(), _t(), me(), qr())
    }

    function hs(n) {
        const r = H?.getCueMarkerForIndex?.(n),
            s = r?.reviewStatus,
            a = [];
        return s === "approved" ? a.push('<span title="\u5DF2\u901A\u8FC7">\u2713</span>') : s === "edited" && a.push('<span title="\u5DF2\u6539">\u270E</span>'), !!H?.cueCoversBookmark?.(n) && (t.listFilter === "bookmarks" ? a.push(`<button type="button" class="cue-bm-remove" data-remove-bm="${n}" title="\u79FB\u9664\u8BE5\u4E66\u7B7E" aria-label="\u79FB\u9664\u4E66\u7B7E"><i class="fa fa-bookmark" aria-hidden="true"></i><span class="cue-bm-remove-x">\xD7</span></button>`) : a.push('<span class="cue-bm-mark" title="\u8986\u76D6\u4E66\u7B7E"><i class="fa fa-bookmark" aria-hidden="true"></i></span>')), a.join("")
    }

    function ys(n, r) {
        const i = t.cueMeta[n],
            s = !!i?.low,
            a = i?.confidence != null && Number.isFinite(Number(i.confidence)) ? Math.round(Number(i.confidence) * 100) : null,
            o = i?.source === "asr" ? "ASR" : i?.source === "heuristic" ? "\u4F30\u8BA1" : i?.source === "sidecar" ? "\u5143\u6570\u636E" : "";
        return s ? `\u4F4E\u7F6E\u4FE1${a!=null?` ${a}%`:""}${o?` \xB7 ${o}`:""}\uFF1A\u5EFA\u8BAE\u68C0\u67E5\u6216\u91CD\u8F6C\u5199` : i?.source === "asr" && a != null ? `ASR \u7F6E\u4FE1 ${a}% \xB7 ${r||""}` : r || ""
    }

    function $a(n, r) {
        const i = t.cues[n],
            s = n > 0 ? t.cues[n - 1] : null,
            a = n < t.cues.length - 1 ? t.cues[n + 1] : null,
            o = Zt(i, s, a),
            l = String(i.text || "").replace(/\s+/g, " ").trim(),
            c = r ? String(an(i) || "").replace(/\s+/g, " ").trim() : "",
            u = !!t.cueMeta[n]?.low,
            m = Mt(i.text, V(i)),
            f = m != null ? Number(m) : null,
            g = f != null && f > 18,
            h = hs(n),
            v = b(ys(n, l)),
            styleCol = !!(t.showAssStyleColumn || t.format === "ass" || t.format === "ssa"),
            styleName = String(i?.ass?.style || "").trim() || "Default";
        return `
            <tr class="${u?"cue-row-low-conf":""}" data-cue-idx="${n}" title="${v}">
                <td class="text-xs tabular-nums align-middle col-idx" style="color:var(--ed-muted)">${h}${n+1}${u?'<span class="low-conf-dot" aria-label="\u4F4E\u7F6E\u4FE1">!</span>':""}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle ${o.start?"cell-warn":""}">${b(Z(i.startMs,t.format))}</td>
                <td class="font-mono text-[11px] tabular-nums align-middle ${o.end?"cell-warn":""}">${b(Z(I(i),t.format))}</td>
                <td class="text-[11px] tabular-nums align-middle ${o.dur?"cell-warn":""}">${b(xt(V(i)))}</td>
                <td class="cue-cps-cell align-middle ${g?"hot":""}">${m!=null?b(m):"\u2014"}</td>
                ${styleCol?`<td class="cell-style align-middle col-style" title="${b(styleName)}">${b(styleName)}</td>`:""}
                <td class="cell-text align-middle">${b(l||"\u2014")}</td>
                ${r?`<td class="cell-pair align-middle" title="${b(c||"")}">${b(c||"\u2014")}</td>`:""}
            </tr>`
    }

    function Se(n) {
        if (!e.cueBody || n < 0 || n >= t.cues.length) return;
        const r = e.cueBody.querySelector(`tr[data-cue-idx="${n}"]`);
        if (!r) {
            if (Nr() && t.selectedIndex === n) return;
            C({
                listOnly: !0,
                reuseMeta: !0
            });
            return
        }
        const i = t.cues[n],
            s = n > 0 ? t.cues[n - 1] : null,
            a = n < t.cues.length - 1 ? t.cues[n + 1] : null,
            o = Zt(i, s, a),
            l = r.querySelectorAll("td"),
            c = String(i.text || "").replace(/\s+/g, " ").trim(),
            m = !!t.cueMeta[n]?.low;
        if (r.classList.toggle("cue-row-low-conf", m), r.classList.toggle("cue-row-qc", !!t.qcIssueIndexSet?.has(n)), r.title = ys(n, c), l[0]) {
            const f = hs(n);
            l[0].innerHTML = `${f}${n+1}${m?'<span class="low-conf-dot" aria-label="\u4F4E\u7F6E\u4FE1">!</span>':""}`
        }
        if (l[1] && (l[1].textContent = Z(i.startMs, t.format), l[1].classList.toggle("cell-warn", o.start)), l[2] && (l[2].textContent = Z(I(i), t.format), l[2].classList.toggle("cell-warn", o.end)), l[3] && (l[3].textContent = xt(V(i)), l[3].classList.toggle("cell-warn", o.dur)), l[4]) {
            const f = Mt(i.text, V(i)),
                g = f != null ? Number(f) : null;
            l[4].textContent = f ?? "\u2014", l[4].className = `cue-cps-cell align-middle${g!=null&&g>18?" hot":""}`
        }
        {
            const styleCol = !!(t.showAssStyleColumn || t.format === "ass" || t.format === "ssa"),
                textIdx = styleCol ? 6 : 5,
                pairIdx = styleCol ? 7 : 6,
                styleName = String(i?.ass?.style || "").trim() || "Default";
            styleCol && l[5] && (l[5].textContent = styleName, l[5].title = styleName), l[textIdx] && (l[textIdx].textContent = c || "\u2014"), U() && l[pairIdx] && (l[pairIdx].textContent = String(an(i) || "").replace(/\s+/g, " ").trim() || "\u2014", l[pairIdx].title = l[pairIdx].textContent === "\u2014" ? "" : l[pairIdx].textContent)
        }
        n > 0 && vs(n - 1), n < t.cues.length - 1 && vs(n + 1)
    }

    function Aa(n) {
        if (n < 0 || n >= t.cues.length || !z?.scoreCueConfidence) return;
        Array.isArray(t.cueMeta) || (t.cueMeta = []);
        const r = t.cues[n],
            i = Zn(),
            s = z.scoreCueConfidence(r, n, t.cues, i),
            a = typeof z.findSidecarEntry == "function" ? z.findSidecarEntry(t.sidecarMeta?.entries, r, n) : null;
        let o = {
            ...s,
            fingerprint: z.cueFingerprint?.(r)
        };
        if (a?.confirmed === !0) o = {
            confidence: 1,
            flags: ["confirmed"],
            low: !1,
            source: "confirmed",
            fingerprint: o.fingerprint
        };
        else if (a?.confidence != null && Number.isFinite(Number(a.confidence))) {
            const l = Math.max(.05, Math.min(.95, Number(i.lowThreshold) || .55)),
                c = Math.max(0, Math.min(1, Number(a.confidence))),
                u = String(a.source || "sidecar");
            (u === "asr" || u === "sidecar" || u === "retranscribe") && (o = {
                confidence: c,
                flags: Array.isArray(a.flags) ? a.flags.slice() : [],
                low: c < l,
                source: u,
                fingerprint: o.fingerprint,
                avgLogprob: a.avgLogprob,
                noSpeechProb: a.noSpeechProb
            })
        }
        if (t.cueMeta[n] = o, e.lowConfBadge && z.summarizeLowConfidence) {
            const l = z.summarizeLowConfidence(t.cueMeta);
            l.low > 0 ? (e.lowConfBadge.textContent = `\u4F4E\u7F6E\u4FE1 ${l.low>99?"99+":l.low}`, e.lowConfBadge.classList.remove("hidden"), e.lowConfBadge.title = l.summary) : e.lowConfBadge.classList.add("hidden")
        }
    }

    function Fa() {
        t._qcBadgeTimer && clearTimeout(t._qcBadgeTimer), t._qcBadgeTimer = setTimeout(() => {
            t._qcBadgeTimer = null, xr({
                updateRows: !0
            })
        }, 420)
    }

    function vs(n) {
        const r = e.cueBody?.querySelector(`tr[data-cue-idx="${n}"]`);
        if (!r || n < 0 || n >= t.cues.length) return;
        const i = t.cues[n],
            s = n > 0 ? t.cues[n - 1] : null,
            a = n < t.cues.length - 1 ? t.cues[n + 1] : null,
            o = Zt(i, s, a),
            l = r.querySelectorAll("td");
        l[1]?.classList.toggle("cell-warn", o.start), l[2]?.classList.toggle("cell-warn", o.end), l[3]?.classList.toggle("cell-warn", o.dur)
    }

    function X(n, r = {}) {
        if (n < 0 || n >= t.cues.length || r.fromPlayback && !Et()) return;
        const i = !!r.additive;
        if (!!r.range && t.selectionAnchor >= 0) {
            const a = t.selectionAnchor,
                o = Math.min(a, n),
                l = Math.max(a, n),
                c = [];
            for (let u = o; u <= l; u += 1) c.push(u);
            if (i) {
                const u = new Set(J());
                c.forEach(m => u.add(m)), We(u, n, {
                    fromPlayback: !!r.fromPlayback
                })
            } else We(c, n, {
                fromPlayback: !!r.fromPlayback
            });
            t.selectionAnchor = a
        } else if (i) {
            if (Qn(), t.selectedIndices.has(n) && t.selectedIndices.size > 1) {
                t.selectedIndices.delete(n);
                const a = t.selectedIndices.has(t.selectedIndex) ? t.selectedIndex : Math.max(...t.selectedIndices);
                We(t.selectedIndices, a, {
                    fromPlayback: !!r.fromPlayback
                })
            } else t.selectedIndices.add(n), We(t.selectedIndices, n, {
                fromPlayback: !!r.fromPlayback
            });
            t.selectionAnchor = n
        } else We([n], n, {
            fromPlayback: !!r.fromPlayback
        });
        if (r.seek && e.video) {
            const a = Math.max(0, t.cues[n].startMs / 1e3);
            e.video.currentTime = a, r.play && e.video.play().catch(() => {})
        }
        if (r.scroll && (e.cueBody?.querySelector(`tr[data-cue-idx="${n}"]`)?.scrollIntoView({
                block: "nearest",
                behavior: r.fromPlayback ? "auto" : "smooth"
            }), !r.fromPlayback)) {
            const o = t.cues[n];
            if (o && he()) {
                const l = Math.round((o.startMs + I(o)) / 2);
                Wi(l, {
                    marginRatio: .08
                }) && Be()
            }
        }
        r.fromPlayback || H?.refreshContextActionBar?.()
    }

    function Ss() {
        const n = Vt();
        if (!n.length) {
            d("\u5F53\u524D\u7B5B\u9009\u4E0B\u6CA1\u6709\u53EF\u9009\u9879", "warn");
            return
        }
        We(n, n[n.length - 1]), H?.refreshContextActionBar?.(), d(`\u5DF2\u9009\u4E2D ${n.length} \u6761`, "ok")
    }
    async function Xn() {
        const n = J();
        if (n.length < 2) {
            d("\u8BF7\u81F3\u5C11\u9009\u4E2D\u4E24\u6761\u76F8\u90BB\u5B57\u5E55\u4EE5\u5408\u5E76", "err");
            return
        }
        for (let l = 1; l < n.length; l += 1)
            if (n[l] !== n[l - 1] + 1) {
                d("\u53EA\u80FD\u5408\u5E76\u8FDE\u7EED\u76F8\u90BB\u7684\u9009\u4E2D\u6761\u76EE", "err");
                return
            } if (!await ie(`\u5408\u5E76\u9009\u4E2D\u7684 ${n.length} \u6761\u5B57\u5E55\uFF1F`)) return;
        x(), $();
        const r = n[0],
            i = n[n.length - 1],
            s = t.cues[r].startMs,
            a = I(t.cues[i]),
            o = n.map(l => String(t.cues[l].text || "").trim()).filter(Boolean).join(`
`);
        t.cues.splice(r, i - r + 1, {
            startMs: s,
            endMs: a,
            text: o
        }), We([r], r), P(!0), C(), d(`\u5DF2\u5408\u5E76\u4E3A\u7B2C ${r+1} \u6761`, "ok")
    }

    function Ra() {
        tn && clearTimeout(tn), tn = setTimeout(() => {
            tn = null, at()
        }, ga)
    }

    function Ze(n = {}) {
        if (t.detailSyncing || t.selectedIndex < 0) return;
        n.skipUndo || bl();
        const r = t.cues[t.selectedIndex],
            i = r ? r.startMs : null,
            s = r ? I(r) : null;
        x(), P(!0), Aa(t.selectedIndex), Se(t.selectedIndex), wt(), n.immediateButtons ? at() : Ra(), Fa(), t.detailRenderedDurSec = V(t.cues[t.selectedIndex]) / 1e3, Ov?.isAssContext?.() && Jp?.scheduleSync?.(), t.selectedIndex === t.playbackIndex && (t.overlayText = "", It());
        const a = t.cues[t.selectedIndex];
        (!a || a.startMs !== i || I(a) !== s || n.forceResync) && ye(), t.selectedIndex >= 0 && Ut(t.selectedIndex)
    }

    function bs(n) {
        if (t.selectedIndex < 0) return;
        $();
        const r = Number(e.detailDuration?.value),
            i = Number.isFinite(r) ? r : V(t.cues[t.selectedIndex]) / 1e3,
            s = Math.max(.1, Math.round((i + n) * 100) / 100);
        e.detailDuration && (e.detailDuration.value = s.toFixed(3)), Ze({
            skipUndo: !0
        }), me()
    }

    function xs(n) {
        if (t.selectedIndex < 0) return;
        $();
        const r = t.cues[t.selectedIndex],
            i = V(r);
        r.startMs = Math.max(0, r.startMs + n), r.endMs = r.startMs + i, R(), Ze({
            skipUndo: !0
        }), me()
    }

    function Yn() {
        if (t.selectedIndex < 0 || !e.video) return;
        $();
        const n = t.cues[t.selectedIndex],
            r = V(n);
        n.startMs = De(), n.endMs = n.startMs + r, R(), Ze({
            skipUndo: !0
        }), me()
    }

    function Jn() {
        if (t.selectedIndex < 0 || !e.video) return;
        const n = t.cues[t.selectedIndex],
            r = De();
        if (r <= n.startMs) {
            d("\u7ED3\u675F\u65F6\u95F4\u5FC5\u987B\u665A\u4E8E\u8D77\u59CB\u65F6\u95F4", "err");
            return
        }
        $(), n.endMs = r, R(), Ze({
            skipUndo: !0
        }), me()
    }

    function Xe() {
        const n = document.activeElement;
        return !n || !e.listWrap ? !1 : n === e.listWrap || e.listWrap.contains(n)
    }

    function un() {
        const n = document.activeElement;
        return n ? !!(e.videoWrap && (n === e.videoWrap || e.videoWrap.contains(n)) || e.timelinePanel && (n === e.timelinePanel || e.timelinePanel.contains(n))) : !1
    }

    function Ct(n) {
        if (!n || !n.matches) return !1;
        if (n.matches('textarea, [contenteditable="true"]')) return !0;
        if (!n.matches("input")) return !1;
        const r = String(n.type || "text").toLowerCase();
        return !["button", "checkbox", "radio", "range", "file", "reset", "submit", "color", "image"].includes(r)
    }

    function er() {
        if (e.listWrap) try {
            e.listWrap.focus({
                preventScroll: !0
            })
        } catch {
            e.listWrap.focus()
        }
    }

    function Ms() {
        if (e.videoWrap) try {
            e.videoWrap.focus({
                preventScroll: !0
            })
        } catch {
            e.videoWrap.focus()
        }
    }

    function Bs() {
        e.video && (e.video.paused || e.video.ended ? e.video.play().catch(() => {}) : e.video.pause())
    }

    function De() {
        return Math.round((e.video?.currentTime || 0) * 1e3)
    }

    function Et() {
        return t.autoFocus === !0
    }

    function ks(n, r = !0) {
        if (!t.ready) return;
        const i = Math.round((Number(n) || 0) * 1e3),
            s = ps(i);
        if (s !== t.playbackIndex) {
            const a = t.playbackIndex;
            t.playbackIndex = s, Oa(a, s), Et() && Ei(s)
        }
        r && (t.lastPlayheadLabel = "", e.playheadTime && (e.playheadTime.textContent = Z(i, t.format), t.lastPlayheadLabel = e.playheadTime.textContent), tt(i)), It()
    }

    function $l() {
        if (t.overlayText = "", t.overlaySourceText = "", t.overlayVisible = !1, e.videoSubtitle && e.videoSubtitle.classList.add("hidden"), e.videoSubtitleText && (e.videoSubtitleText.textContent = ""), e.videoSubtitleSource && (e.videoSubtitleSource.textContent = ""), Ov?.resetOverlayStyles?.(), t.previewTextTrack) try {
            t.previewTextTrack.mode = "hidden"
        } catch {}
    }

    function It(n = !1) {
        if (!e.videoSubtitle || !e.videoSubtitleText) return;
        const r = t.playbackIndex;
        let i = "",
            s = "";
        if (r >= 0 && r < t.cues.length) {
            const u = t.cues[r];
            i = String(u.text || "").trim(), t.pairPath && t.pairCues.length && (s = an(u))
        }
        let a = "",
            o = "",
            l = !1;
        if (O && t.dualRole && (i || s)) {
            const u = O.composeDualOverlayText({
                primaryText: i,
                pairedText: s,
                primaryRole: t.dualRole,
                displayMode: t.dualDisplayMode || "both",
                lineOrder: t.dualLineOrder || "source-first"
            });
            a = u.sourceText, o = u.targetText, l = u.visible
        } else o = i, l = !!i;
        if (Ov?.isAssContext?.() && Jp?.onOverlayRefresh?.()) {
            t.overlayText = `${a}
${o}
${t.dualLineOrder||""}`, t.overlaySourceText = a, t.overlayVisible = !1;
            return
        }
        const c = `${a}
${o}
${t.dualLineOrder||""}`;
        if (!(!n && c === t.overlayText && a === t.overlaySourceText && l === t.overlayVisible)) {
            if (t.overlayText = c, t.overlaySourceText = a, t.overlayVisible = l, !l) {
                e.videoSubtitle.classList.add("hidden"), e.videoSubtitleText.textContent = "", e.videoSubtitleSource && (e.videoSubtitleSource.textContent = ""), e.videoSubtitle.classList.remove("line-order-target-first"), Ov?.resetOverlayStyles?.();
                return
            }
            e.videoSubtitleSource && (e.videoSubtitleSource.textContent = a), e.videoSubtitleText.textContent = o, e.videoSubtitle.classList.toggle("line-order-target-first", (t.dualLineOrder || "source-first") === "target-first" && !!(a && o)), e.videoSubtitle.classList.remove("hidden")
        }
        if (l && Ov?.isAssContext?.()) {
            const u = r >= 0 ? t.cues[r] : null;
            Ov.applyPreviewToOverlay({
                primaryText: o,
                sourceText: a,
                primaryCue: u
            })
        } else if (!Ov?.isAssContext?.()) Ov?.resetOverlayStyles?.()
    }

    function Na(n) {
        const r = e.listWrap;
        if (!r || !n) return !1;
        const i = r.getBoundingClientRect(),
            s = n.getBoundingClientRect();
        return s.top >= i.top - 2 && s.bottom <= i.bottom + 2
    }

    function tr() {
        t.textTrackRefreshTimer && clearTimeout(t.textTrackRefreshTimer), t.textTrackRefreshTimer = setTimeout(() => {
            t.textTrackRefreshTimer = null, ws()
        }, 300)
    }

    function ws() {
        if (t.previewTextTrack) try {
            t.previewTextTrack.mode = "hidden"
        } catch {}
    }

    function qa(n, r) {
        const i = [];
        if (r >= 0 && r < t.cues.length) {
            const s = I(t.cues[r]);
            s > n + 5 && i.push(s)
        }
        if (r >= 0 && r + 1 < t.cues.length) {
            const s = t.cues[r + 1].startMs;
            s > n + 5 && i.push(s)
        }
        if (r < 0 && t.cues.length) {
            let s = 0,
                a = t.cues.length - 1,
                o = -1;
            for (; s <= a;) {
                const l = s + a >> 1;
                t.cues[l].startMs > n + 5 ? (o = l, a = l - 1) : s = l + 1
            }
            o >= 0 && i.push(t.cues[o].startMs)
        }
        return i.length ? Math.min(...i) : null
    }

    function Cs() {
        t.cueBoundaryTimer && (clearTimeout(t.cueBoundaryTimer), t.cueBoundaryTimer = null), t.playheadTimer && (clearInterval(t.playheadTimer), t.playheadTimer = null), t.timelineFollowRaf && (cancelAnimationFrame(t.timelineFollowRaf), t.timelineFollowRaf = 0)
    }

    function ot() {
        if (t.cueBoundaryTimer && (clearTimeout(t.cueBoundaryTimer), t.cueBoundaryTimer = null), !e.video || e.video.paused || e.video.ended) return;
        const n = (e.video.currentTime || 0) * 1e3,
            r = Math.max(.05, e.video.playbackRate || 1);
        let i = qa(n, t.playbackIndex);
        if (i == null) {
            const a = (e.video.duration || 0) * 1e3;
            if (a > n + 50) i = a;
            else return
        }
        const s = Math.min(250, Math.max(20, (i - n) / r));
        t.cueBoundaryTimer = setTimeout(() => {
            t.cueBoundaryTimer = null, !(!e.video || e.video.paused) && (Ce(!1), ot())
        }, s)
    }

    function Wa() {
        t.playheadTimer && clearInterval(t.playheadTimer), t.playheadTimer = setInterval(() => {
            e.video && !e.video.paused && Yo(!1)
        }, 1e3)
    }

    function Ha() {
        document.body.classList.add("editor-video-playing"), Ce(!0), ot(), Wa(), Wr()
    }

    function Es() {
        document.body.classList.remove("editor-video-playing"), Cs(), Ce(!0), Wr()
    }

    function Oa(n, r) {
        if (n !== r && (n >= 0 && e.cueBody?.querySelector(`tr[data-cue-idx="${n}"]`)?.classList.remove("cue-row-playing"), r >= 0)) {
            const i = e.cueBody?.querySelector(`tr[data-cue-idx="${r}"]`);
            i && i.classList.add("cue-row-playing")
        }
    }

    function Ce(n = !0) {
        !t.ready || !e.video || ks(e.video.currentTime || 0, n)
    }

    function nr() {
        if (e.videoHint) {
            if (t.videoPath) {
                const n = ts(t.videoCodec, t.videoWidth, t.videoHeight),
                    r = n ? ` \xB7 ${n}` : "";
                e.videoHint.textContent = `${G(t.videoPath)}${r} \xB7 Space \u64AD\u653E \xB7 Ctrl+S \u4FDD\u5B58`
            } else e.videoHint.textContent = "\u672A\u5173\u8054\u5A92\u4F53\uFF0C\u53EF\u70B9\u51FB\u300C\u5173\u8054\u5A92\u4F53\u300D\uFF1B\u4EA6\u53EF\u4EC5\u7F16\u8F91\u6587\u672C\u4E0E\u65F6\u95F4\u8F74";
            e.videoEmpty && e.videoEmpty.classList.toggle("visible", !t.videoPath), qr(), Nn(), me()
        }
    }
    async function _a(n) {
        if (t.videoCodec = "", t.videoWidth = 0, t.videoHeight = 0, !!n) try {
            const r = await p?.ffmpegProbe?.(ln({
                path: n
            }));
            r?.ok && (t.videoCodec = r.codec || "", t.videoWidth = r.width || 0, t.videoHeight = r.height || 0)
        } catch {}
    }
    async function Is(n) {
        if (!e.video) return;
        if (e.video.pause(), e.video.removeAttribute("src"), e.video.load(), t.videoPath = n || "", t.waveform.peaks = null, t.waveform.cacheKey = "", t.waveform.videoPath = "", !n) {
            nr(), Ge();
            return
        }
        const r = await p?.transubResolveMediaUrl?.({
            path: n
        });
        if (!r?.ok) {
            d(r?.error || `\u89C6\u9891\u52A0\u8F7D\u5931\u8D25\uFF1A${G(n)}`, "err"), nr();
            return
        }
        t.videoPath = r.path || n;
        const i = [r.fileUrl, r.url].filter(Boolean);
        let s = !1;
        for (const a of i)
            if (s = await new Promise(o => {
                    const l = () => {
                            u(), o(!0)
                        },
                        c = () => {
                            u(), o(!1)
                        },
                        u = () => {
                            e.video.removeEventListener("loadedmetadata", l), e.video.removeEventListener("error", c)
                        };
                    e.video.addEventListener("loadedmetadata", l, {
                        once: !0
                    }), e.video.addEventListener("error", c, {
                        once: !0
                    }), e.video.src = a, e.video.load()
                }), s) break;
        s ? (e.video.classList.remove("hidden"), await _a(t.videoPath), nr(), ye(), t.waveformEnabled && Wn(), new Set(["hevc", "h265", "av1"]).has(String(t.videoCodec || "").toLowerCase()) && d(`\u5DF2\u52A0\u8F7D\u89C6\u9891\uFF08${ts(t.videoCodec,t.videoWidth,t.videoHeight)}\uFF09\u3002 \u82E5\u64AD\u653E\u5361\u987F\uFF0C\u53EF\u5C1D\u8BD5\u7528 H.264 \u7F16\u7801\u7248\u672C\uFF0C\u6216\u5728 Microsoft Store \u5B89\u88C5\u300CHEVC \u89C6\u9891\u6269\u5C55\u300D\u3002`, "ok")) : d(`\u89C6\u9891\u65E0\u6CD5\u64AD\u653E\uFF1A${G(t.videoPath)}\uFF08\u683C\u5F0F\u6216\u7F16\u7801\u53EF\u80FD\u4E0D\u53D7\u652F\u6301\uFF09`, "err")
    }
    async function Ps(n, r) {
        if (!e.sidecarSelect || !n) {
            e.sidecarSelect?.classList.add("hidden");
            return
        }
        const s = ((await p?.transubListSubtitleSidecars?.({
            videoPath: n
        }))?.sidecars || []).filter(a => a.editable);
        if (s.length <= 1) {
            e.sidecarSelect.classList.add("hidden");
            return
        }
        e.sidecarSelect.classList.remove("hidden"), e.sidecarSelect.innerHTML = s.map(a => {
            let o = `${a.basename} (${a.format.toUpperCase()})`;
            if (O && t.videoPath) {
                const l = is(t.videoPath),
                    c = O.inferDualRole(sn(a.path), l).role;
                c === "source" ? o = `${a.basename}\uFF08\u539F\u6587\uFF09` : c === "target" && (o = `${a.basename}\uFF08\u8BD1\u6587\uFF09`)
            }
            return `<option value="${b(a.path)}" ${a.path===r?"selected":""}>${b(o)}</option>`
        }).join("")
    }
    async function mn(n, r, i = {}) {
        const s = i.allowRoleSwap !== !1,
            a = G(n);
        Jt = !0, Vi({
            title: "\u6B63\u5728\u52A0\u8F7D\u5B57\u5E55",
            detail: a ? `\u6B63\u5728\u8BFB\u53D6 ${a}\u2026` : "\u6B63\u5728\u8BFB\u53D6\u5B57\u5E55\u2026",
            statusMessage: a ? `\u6B63\u5728\u52A0\u8F7D ${a}\u2026` : "\u6B63\u5728\u52A0\u8F7D\u5B57\u5E55\u2026"
        });
        try {
            Cs(), document.body.classList.remove("editor-video-playing"), t.textTrackRefreshTimer && (clearTimeout(t.textTrackRefreshTimer), t.textTrackRefreshTimer = null), await _r();
            const o = await p?.transubReadSubtitle?.({
                path: n
            });
            if (!o?.ok) return d(o?.error || "\u52A0\u8F7D\u5B57\u5E55\u5931\u8D25", "err"), !1;
            const l = await Ba(o.path);
            x(), t.path = o.path, t.videoPath = r || "", t.format = l?.format || o.format, t.header = Array.isArray(l?.header) ? l.header : o.header || [], t.cues = Array.isArray(l?.cues) ? l.cues : o.cues || [], t.selectedIndex = t.cues.length ? 0 : -1, t.selectedIndices = t.selectedIndex >= 0 ? new Set([t.selectedIndex]) : new Set, t.selectionAnchor = t.selectedIndex, t.playbackIndex = -1, t.previewTextTrack = null, t.overlayText = "", t.overlaySourceText = "", t.overlayVisible = !1, t.detailRenderedDurSec = null, t.lastPlayheadLabel = "", t.sidecarMeta = null, t.cueMeta = [], rn(), P(!!l), xl(), xa(), fs(), e.formatBadge && (e.formatBadge.textContent = String(t.format || o.format).toUpperCase()), e.cueCount && (e.cueCount.textContent = `${t.cues.length} \u6761`), syncAssStyleColumn(), Ov?.syncToolbarVisibility?.(), qr(), Ml(), jr({
                detail: `\u5DF2\u8BFB\u53D6 ${t.cues.length} \u6761\uFF0C\u6B63\u5728\u51C6\u5907\u7F16\u8F91\u533A\u2026`,
                statusMessage: `\u6B63\u5728\u6E32\u67D3 ${t.cues.length} \u6761\u5B57\u5E55\u2026`
            }), await Ta(o.path), H?.loadMarkersFromSidecar?.(), Jo(), await Br(o.path), await _r(), C(), jr({
                detail: t.videoPath ? `\u6B63\u5728\u5173\u8054\u89C6\u9891 ${G(t.videoPath)}\u2026` : "\u5B57\u5E55\u5DF2\u5C31\u7EEA\uFF0C\u6B63\u5728\u5B8C\u6210\u6536\u5C3E\u2026",
                statusMessage: t.videoPath ? "\u6B63\u5728\u52A0\u8F7D\u5173\u8054\u89C6\u9891\u2026" : "\u6B63\u5728\u5B8C\u6210\u52A0\u8F7D\u2026"
            }), await _r(), await Is(t.videoPath);
            const c = await Sa(o.path, t.videoPath);
            if (s && c?.swapToTarget && c.targetPath) return Jt = !1, mn(c.targetPath, t.videoPath, {
                allowRoleSwap: !1
            });
            U() && C(), await H?.refreshKeptTranscript?.(), ws(), It(!0), await Ps(t.videoPath, o.path);
            const u = z.summarizeLowConfidence(t.cueMeta).low,
                m = l ? "\uFF08\u5DF2\u6062\u590D\u8349\u7A3F\uFF09" : "",
                f = U() ? `\uFF0C\u5DF2\u914D\u5BF9\u5BF9\u7167\u8F68 ${G(t.pairPath)}` : "",
                g = t.keptTranscript?.found ? "\uFF0C\u539F\u6587\u7F13\u5B58\u53EF\u7528" : "";
            d(u ? `\u5DF2\u52A0\u8F7D ${t.cues.length} \u6761\u5B57\u5E55\uFF0C\u5176\u4E2D ${u} \u6761\u4F4E\u7F6E\u4FE1${m}${f}${g}` : `\u5DF2\u52A0\u8F7D ${t.cues.length} \u6761\u5B57\u5E55${m}${f}${g}`, "ok"), Un();
            try {
                await p?.transubEditorRegisterPath?.({
                    path: o.path
                })
            } catch {}
            return Ca(o.path, t.videoPath || ""), setTimeout(() => {
                Bt?.startTour?.({
                    force: !1
                })
            }, 600), !0
        } finally {
            Jt = !1, Gr()
        }
    }
    async function fn(n, r, opts = {}) {
        if (!opts.skipDirtyConfirm && t.ready && t.dirty && !await ie(opts.dirtyMessage || "\u5F53\u524D\u5B57\u5E55\u672A\u4FDD\u5B58\uFF0C\u6253\u5F00\u65B0\u6587\u4EF6\u5C06\u4E22\u5931\u4FEE\u6539\uFF0C\u7EE7\u7EED\uFF1F")) return !1;
        if (opts.clearLibrary) {
            t.library = null;
            syncLibraryBar()
        }
        Un();
        let i = String(r || "").trim();
        try {
            if (n) {
                Vi({
                    title: "\u6B63\u5728\u6253\u5F00\u5B57\u5E55",
                    detail: i ? "\u6B63\u5728\u786E\u8BA4\u5173\u8054\u5A92\u4F53\u2026" : "\u6B63\u5728\u67E5\u627E\u540C\u76EE\u5F55\u540C\u540D\u5A92\u4F53\u2026",
                    statusMessage: `\u6B63\u5728\u52A0\u8F7D ${G(n)}\u2026`
                });
                const a = await p?.transubGuessVideoForSubtitle?.({
                    path: n,
                    preferPath: i
                });
                a?.ok && a.videoPath ? i = a.videoPath : i && a?.ok && !a.videoPath && (i = "")
            }
            if (!await mn(n, i)) {
                t.path || cn();
                return !1
            }
            t.ready = !0;
            return !0
        } catch (s) {
            Gr(), t.path || cn(), d(s?.message || "\u6253\u5F00\u5B57\u5E55\u5931\u8D25", "err");
            return !1
        }
    }
    async function rr() {
        const n = await p?.transubSelectSubtitle?.({
            title: "\u9009\u62E9\u8981\u7F16\u8F91\u7684\u5B57\u5E55\u6587\u4EF6"
        });
        if (typeof On == "function" ? On() : ht(), !n?.ok) {
            d(n?.error || "\u6253\u5F00\u5B57\u5E55\u5931\u8D25", "err");
            return
        }
        if (n.canceled || !n.path) return;
        t.library = null, syncLibraryBar(), await fn(n.path, n.videoPath || "")
    }
    async function Ls() {
        const n = await p?.transubSelectEditorVideo?.({
            defaultPath: t.videoPath || t.path,
            title: "\u9009\u62E9\u5173\u8054\u5A92\u4F53"
        });
        if (typeof On == "function" ? On() : ht(), !n?.ok) {
            d(n?.error || "\u9009\u62E9\u5A92\u4F53\u5931\u8D25", "err");
            return
        }
        if (n.canceled || !n.path) return;
        await Is(n.path), await Ps(n.path, t.path);
        if (t.library?.mediaId) {
            try {
                const linked = await p?.transubLibrarySetMediaPath?.({
                    mediaId: t.library.mediaId,
                    mediaPath: n.path
                });
                if (linked?.ok) {
                    t.library = {
                        ...t.library,
                        mediaLinked: !0,
                        mediaExists: !0,
                        mediaTitle: linked.media?.title || t.library.mediaTitle
                    };
                    syncLibraryBar()
                } else if (linked?.error) {
                    d(linked.error, "warn")
                }
            } catch { /* ignore */ }
        }
        e.splitModal && !e.splitModal.classList.contains("hidden") && $e(), e.silenceSplitModal && !e.silenceSplitModal.classList.contains("hidden") && Je(), d(`\u5DF2\u5173\u8054\u5A92\u4F53\uFF1A${G(n.path)}`, "ok")
    }
    async function Pt() {
        if (x(), !t.cues.length) {
            d("\u65E0\u6CD5\u4FDD\u5B58\uFF1A\u5B57\u5E55\u4E3A\u7A7A", "err");
            return
        }
        const lib = t.library;
        const intent = lib
            ? (t.librarySaveIntent === "draft" || t.librarySaveIntent === "ab" ? t.librarySaveIntent : "current")
            : "current";
        const asCurrent = !lib || intent === "current";
        const writePayload = {
            path: t.path,
            format: t.format,
            cues: t.cues,
            header: t.header,
            videoPath: t.videoPath || ""
        };
        if (lib?.versionId || lib?.mediaId) {
            writePayload.libraryParentVersionId = lib.versionId || "";
            writePayload.librarySetActive = asCurrent;
            writePayload.librarySource = "edit";
            if (intent === "ab") {
                writePayload.libraryTags = ["对照B"];
                writePayload.libraryNote = "对照B";
                writePayload.librarySetActive = !1
            } else if (intent === "draft") {
                writePayload.libraryNote = writePayload.libraryNote || "草稿"
            }
        }
        const n = await p?.transubWriteSubtitle?.(writePayload);
        if (!n?.ok) {
            d(n?.error || "\u4FDD\u5B58\u5931\u8D25", "err");
            return
        }
        if (n.libraryIngest?.versionId) {
            t.library = {
                ...(t.library || {}),
                versionId: n.libraryIngest.versionId,
                mediaId: n.libraryIngest.mediaId || lib?.mediaId || "",
                trackId: n.libraryIngest.trackId || lib?.trackId || "",
                isActive: n.libraryIngest.setActive != null
                    ? !!n.libraryIngest.setActive
                    : !!lib?.isActive
            };
            syncLibraryBar()
        }
        P(!1), t.savedSnapshot = Jr(t.cues), He(), await dn(), await Ma();
        let okMsg = n.backupPath ? "\u5DF2\u4FDD\u5B58\uFF08\u5E76\u5199\u5165 .bak\uFF09" : "\u5DF2\u4FDD\u5B58";
        if (lib && n.libraryIngest) {
            okMsg = intent === "ab"
                ? "已保存为对照 B（未抢当前）"
                : (asCurrent ? "已保存并设为库当前版" : "已保存为库草稿（未抢当前）")
        }
        d(okMsg, "ok"), e.saveStatus && (e.saveStatus.textContent = "\u5DF2\u4FDD\u5B58", setTimeout(() => {
            e.saveStatus && (e.saveStatus.textContent = "")
        }, 2e3))
    }

    function Lt() {
        x(), $();
        const n = De();
        let r = n + 2e3;
        for (const a of t.cues)
            if (a.startMs > n) {
                r = Math.min(r, a.startMs - 1);
                break
            } r <= n && (r = n + 500);
        const i = {
            index: t.cues.length + 1,
            startMs: n,
            endMs: r,
            text: ""
        };
        t.cues.push(i), t.cues.sort((a, o) => a.startMs - o.startMs);
        const s = t.cues.indexOf(i);
        P(!0), t.selectedIndex = s >= 0 ? s : 0, C(), X(t.selectedIndex, {
            scroll: !0,
            seek: !0
        }), e.detailText?.focus(), d(`\u5DF2\u5728 ${Z(n,t.format)} \u63D2\u5165\u65B0\u5B57\u5E55`, "ok")
    }
    async function pn() {
        const n = J();
        if (!n.length && t.selectedIndex < 0) return;
        const r = n.length ? n : [t.selectedIndex],
            i = r.length === 1 ? `\u5220\u9664\u7B2C ${r[0]+1} \u6761\u5B57\u5E55\uFF1F` : `\u5220\u9664\u9009\u4E2D\u7684 ${r.length} \u6761\u5B57\u5E55\uFF1F`;
        if (!await ie(i)) return;
        x(), $();
        const s = new Set(r),
            a = t.cues.filter((u, m) => !s.has(m)),
            o = Math.min(...r);
        let l = 0;
        for (let u = 0; u < o; u += 1) s.has(u) || (l += 1);
        t.cues.splice(0, t.cues.length, ...a);
        const c = a.length ? Math.min(l, a.length - 1) : -1;
        We(c >= 0 ? [c] : [], c), P(!0), C(), d(r.length === 1 ? `\u5DF2\u5220\u9664\u7B2C ${r[0]+1} \u6761` : `\u5DF2\u5220\u9664 ${r.length} \u6761\u5B57\u5E55`, "ok")
    }

    function lt(n, r = {}) {
        if (t.selectedIndex < 0) return;
        x();
        const i = t.selectedIndex,
            s = t.cues[i],
            a = Ye(n, s, r);
        if (a.error) {
            d(a.error, "err");
            return
        }
        mr(i, a.cues, r)
    }

    function Ds() {
        if (t.selectedIndex < 0) return;
        x();
        const n = t.selectedIndex,
            r = t.cues[n],
            i = qe(r.text);
        if (!i) {
            d("\u5F53\u524D\u5B57\u5E55\u65E0\u6587\u672C\uFF0C\u65E0\u6CD5\u6309\u5B57\u6570\u8C03\u8282\u65F6\u957F", "err");
            return
        }
        const s = yt(),
            a = 500,
            o = 1e4,
            l = 1;
        let c = Math.ceil(i / s * 1e3);
        c = Math.max(a, Math.min(o, c));
        let u = r.startMs + c;
        const m = n < t.cues.length - 1 ? t.cues[n + 1] : null;
        m && (u = Math.min(u, m.startMs - l)), u = Math.max(r.startMs + a, u);
        const f = I(r);
        if (u === f) {
            d(`\u7B2C ${n+1} \u6761\u65F6\u957F\u5DF2\u5408\u9002\uFF08CPS ${Mt(r.text,V(r))}\uFF09`, "ok");
            return
        }
        $(), r.endMs = u, P(!0), Se(n), t.selectedIndex === n && R(), ye();
        const g = Mt(r.text, V(r));
        d(`\u5DF2\u6309\u5B57\u6570\u8C03\u8282\u7B2C ${n+1} \u6761\u65F6\u957F\u4E3A ${xt(V(r))} \u79D2` + (g ? `\uFF08CPS ${g}\uFF09` : ""), "ok")
    }

    const batchCueFilterPlan = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts && globalThis.TransubEditorParts.batchCueFilterPlan)
        || (typeof window !== 'undefined' && window.TransubEditorParts && window.TransubEditorParts.batchCueFilterPlan)
        || null;
    const retranscribeRangePlan = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts && globalThis.TransubEditorParts.retranscribeRangePlan)
        || (typeof window !== 'undefined' && window.TransubEditorParts && window.TransubEditorParts.retranscribeRangePlan)
        || null;
    const audioSnapDurationPlan = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts && globalThis.TransubEditorParts.audioSnapDurationPlan)
        || (typeof window !== 'undefined' && window.TransubEditorParts && window.TransubEditorParts.audioSnapDurationPlan)
        || null;

    function Dt(n) {
        return audioSnapDurationPlan
            ? audioSnapDurationPlan.isEligibleForSmartDuration(n, V)
            : !(!n || V(n) < 600)
    }

    function Tt(n) {
        return audioSnapDurationPlan
            ? audioSnapDurationPlan.isEligibleForAudioSnap(n, V)
            : !(!n || V(n) < 300)
    }

    async function Ts(n, r = {}) {
        if (!audioSnapDurationPlan) return {
            error: "智能调时核心未加载"
        };
        return audioSnapDurationPlan.planSmartDurationFromSilence(n, r, {
            videoPath: t.videoPath,
            ffmpegPath: Ue || '',
            splitApi: D,
            getEndMs: I,
            cues: t.cues,
            isCancelled: ne,
            detectSilence: (opts) => p?.ffmpegDetectSilence?.(ln(opts))
        })
    }

    async function $s(n, r, i = {}) {
        if (!audioSnapDurationPlan) return {
            error: "音频贴边核心未加载"
        };
        return audioSnapDurationPlan.planAudioSnapFromSilence(n, r, i, {
            videoPath: t.videoPath,
            ffmpegPath: Ue || '',
            splitApi: D,
            getEndMs: I,
            cues: t.cues,
            isCancelled: ne,
            detectSilence: (opts) => p?.ffmpegDetectSilence?.(ln(opts))
        })
    }

    async function snapSelectedCueToAudio(n = {}) {
        if (t.silenceSplitBusy || t.retranscribeBusy) {
            d("\u5DF2\u6709\u5206\u6790\u4EFB\u52A1\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7A0D\u5019", "err");
            return
        }
        if (t.selectedIndex < 0) return;
        x();
        const r = t.selectedIndex,
            i = t.cues[r];
        if (!Tt(i)) {
            d("\u5F53\u524D\u5B57\u5E55\u65F6\u957F\u8FC7\u77ED\uFF0C\u65E0\u6CD5\u8D34\u8FB9", "err");
            return
        }
        if (!t.videoPath || !p?.ffmpegDetectSilence) {
            d("\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u4F7F\u7528\u6309\u97F3\u9891\u8D34\u8FB9", "err");
            return
        }
        const s = {
            ...gn(n),
            padMs: n.padMs ?? 400,
            allowExtend: n.allowExtend !== !1
        };
        Te(!0), Ee({
            title: "\u6B63\u5728\u6309\u97F3\u9891\u8D34\u8FB9",
            detail: `\u6B63\u5728\u5206\u6790\u7B2C ${r+1} \u6761\u5B57\u5E55\u7684\u8BED\u97F3\u8FB9\u754C\u2026`,
            indeterminate: !0,
            statusMessage: "\u6B63\u5728\u5206\u6790\u89C6\u9891\u9759\u97F3\u2026"
        }), e.silenceProgressHint && (e.silenceProgressHint.textContent = "\u6839\u636E\u9759\u97F3\u68C0\u6D4B\u5C06\u5B57\u5E55\u8D77\u6B62\u8D34\u5230\u8BED\u97F3\u8FB9\u754C\uFF0C\u6587\u672C\u4FDD\u6301\u4E0D\u53D8"), await ce();
        try {
            const a = await $s(i, r, s);
            if (a.error) {
                d(a.error, a.unchanged ? "ok" : "err");
                return
            }
            $(), i.startMs = a.startMs, i.endMs = a.endMs, P(!0), Se(r), t.selectedIndex === r && R(), ye();
            const o = a.startDelta ? `\u8D77\u59CB ${a.startDelta>0?"+":""}${(a.startDelta/1e3).toFixed(2)}s` : "\u8D77\u59CB\u4E0D\u53D8",
                l = a.endDelta ? `\u7ED3\u675F ${a.endDelta>0?"+":""}${(a.endDelta/1e3).toFixed(2)}s` : "\u7ED3\u675F\u4E0D\u53D8";
            d(`\u5DF2\u6309\u97F3\u9891\u8D34\u8FB9\u7B2C ${r+1} \u6761\uFF1A${o} \xB7 ${l}`, "ok")
        } finally {
            Te(!1), Ie(), e.silenceProgressHint && (e.silenceProgressHint.textContent = "FFmpeg \u6B63\u5728\u5206\u6790\u5173\u8054\u89C6\u9891\u7684\u97F3\u9891\u9759\u97F3\u70B9\uFF0C\u8BF7\u52FF\u5173\u95ED\u7A97\u53E3")
        }
    }
    async function Fs(n = {}) {
        if (t.silenceSplitBusy || t.selectedIndex < 0) return;
        x();
        const r = t.selectedIndex,
            i = t.cues[r];
        if (!Dt(i)) {
            d("\u5F53\u524D\u5B57\u5E55\u65F6\u957F\u8FC7\u77ED\uFF0C\u65E0\u6CD5\u667A\u80FD\u8C03\u8282", "err");
            return
        }
        if (!t.videoPath || !p?.ffmpegDetectSilence) {
            d("\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u4F7F\u7528\u667A\u80FD\u8C03\u8282\u65F6\u957F", "err");
            return
        }
        const s = gn(n);
        Ee({
            title: "\u6B63\u5728\u5206\u6790\u9759\u97F3",
            detail: `\u6B63\u5728\u5206\u6790\u7B2C ${r+1} \u6761\u5B57\u5E55\u7684\u5B9E\u9645\u8BED\u97F3\u65F6\u957F\u2026`,
            indeterminate: !0,
            statusMessage: "\u6B63\u5728\u5206\u6790\u89C6\u9891\u9759\u97F3\u2026"
        }), await ce();
        try {
            const a = await Ts(i, {
                ...s,
                cueIndex: r
            });
            if (a.error) {
                d(a.error, a.unchanged ? "ok" : "err");
                return
            }
            const o = Qs(i, r, a.newEndMs, !0),
                l = I(i),
                c = o - l;
            if (Math.abs(c) < 80) {
                d(`\u7B2C ${r+1} \u6761\u65F6\u957F\u5DF2\u63A5\u8FD1\u5B9E\u9645\u8BED\u97F3\uFF0C\u65E0\u9700\u8C03\u6574`, "ok");
                return
            }
            $(), i.endMs = o, P(!0), Se(r), t.selectedIndex === r && R(), ye();
            const u = (Math.abs(c) / 1e3).toFixed(3),
                m = c < 0 ? "\u7F29\u77ED" : "\u5EF6\u957F";
            d(`\u5DF2\u667A\u80FD\u8C03\u8282\u7B2C ${r+1} \u6761\u65F6\u957F\uFF1A${xt(V(i))} \u79D2\uFF08${m} ${u} \u79D2\uFF09`, "ok")
        } finally {
            Ie()
        }
    }

    function $t(n) {
        const r = String(n?.text || "").trim();
        return !r || V(n) < 600 ? !1 : D.isConnectedText(r) ? typeof D.getSilenceTextBreakIndices != "function" ? !1 : D.getSilenceTextBreakIndices(r, {
            breakWords: hn(),
            includePunctuation: !0
        }).length > 0 : !0
    }

    function Te(n) {
        t.silenceSplitBusy = !!n, n || (t.jobAbortRequested = !1), e.silenceSplitBtn && (e.silenceSplitBtn.disabled = t.silenceSplitBusy), e.silenceSplitConfirm && (e.silenceSplitConfirm.disabled = t.silenceSplitBusy), e.batchDurConfirm && (e.batchDurConfirm.disabled = t.silenceSplitBusy), e.splitConfirm && vn() === "silence" && (e.splitConfirm.disabled = t.silenceSplitBusy), e.silenceProgressCancel && (e.silenceProgressCancel.disabled = !(t.silenceSplitBusy || t.retranscribeBusy)), t.selectedIndex >= 0 && R()
    }

    function ne() {
        return !!t.jobAbortRequested
    }
    async function sr() {
        if (!(!t.silenceSplitBusy && !t.retranscribeBusy) && !t.jobAbortRequested) {
            t.jobAbortRequested = !0, e.silenceProgressDetail && (e.silenceProgressDetail.textContent = "\u6B63\u5728\u53D6\u6D88\u2026"), e.silenceProgressCancel && (e.silenceProgressCancel.disabled = !0);
            try {
                // Match reconstruct cancel: engine / Sakura / Advanced / TWAI / FFmpeg
                // (dual-pass may be mid ASR or mid text-MT when Esc is pressed).
                if (t.retranscribeBusy) {
                    await Promise.allSettled([
                        p?.transubEngineCancel?.(),
                        p?.transubSakuraCancelTranslate?.(),
                        p?.transubAdvancedCancelContextReconstruct?.(),
                        p?.transWithAiCancel?.(),
                    ])
                }
                await p?.ffmpegCancel?.()
            } catch {}
            d("\u6B63\u5728\u53D6\u6D88\u2026", "warn")
        }
    }
    async function ce() {
        await new Promise(n => {
            requestAnimationFrame(() => setTimeout(n, 0))
        })
    }

    function Ee(n = {}) {
        if (!e.silenceProgress) return;
        const r = Math.max(0, Math.floor(Number(n.total) || 0)),
            i = Math.max(0, Math.floor(Number(n.current) || 0)),
            s = n.indeterminate != null ? !!n.indeterminate : r <= 1;
        e.silenceProgress.classList.remove("hidden"), e.silenceProgress.setAttribute("aria-busy", "true"), e.silenceProgress.classList.toggle("indeterminate", s), e.silenceProgressTitle && (e.silenceProgressTitle.textContent = n.title || "\u6B63\u5728\u5206\u6790\u9759\u97F3"), e.silenceProgressDetail && (e.silenceProgressDetail.textContent = n.detail || "\u8BF7\u7A0D\u5019\uFF0CFFmpeg \u6B63\u5728\u5206\u6790\u97F3\u9891\u2026"), e.silenceProgressHint && (e.silenceProgressHint.textContent = n.hint || "FFmpeg \u6B63\u5728\u5206\u6790\u5173\u8054\u89C6\u9891\u7684\u97F3\u9891\u9759\u97F3\u70B9\uFF0C\u5904\u7406\u65F6\u95F4\u8F83\u957F\u65F6\u8BF7\u8010\u5FC3\u7B49\u5F85"), e.silenceProgressCount && (r > 1 ? (e.silenceProgressCount.textContent = `${Math.min(i,r)} / ${r}`, e.silenceProgressCount.classList.remove("hidden")) : e.silenceProgressCount.classList.add("hidden")), e.silenceProgressTrack && e.silenceProgressTrack.classList.remove("hidden"), de({
            current: i,
            total: r,
            indeterminate: s
        }), n.statusMessage && d(n.statusMessage, ""), t.jobAbortRequested = !1, Te(!0), e.silenceProgressCancel && (e.silenceProgressCancel.disabled = !1)
    }

    function de(n = {}) {
        if (!e.silenceProgress || e.silenceProgress.classList.contains("hidden")) return;
        const r = Math.max(0, Math.floor(Number(n.total) || 0)),
            i = Math.max(0, Math.floor(Number(n.current) || 0)),
            s = n.indeterminate != null ? !!n.indeterminate : e.silenceProgress.classList.contains("indeterminate");
        if (n.detail && e.silenceProgressDetail && (e.silenceProgressDetail.textContent = n.detail), n.title && e.silenceProgressTitle && (e.silenceProgressTitle.textContent = n.title), r > 1) {
            if (e.silenceProgress.classList.remove("indeterminate"), e.silenceProgressTrack && e.silenceProgressTrack.classList.remove("hidden"), e.silenceProgressCount && (e.silenceProgressCount.textContent = `${Math.min(i,r)} / ${r}`, e.silenceProgressCount.classList.remove("hidden")), e.silenceProgressBar) {
                const a = r > 0 ? Math.round(i / r * 100) : 0;
                e.silenceProgressBar.style.width = `${Math.max(0,Math.min(100,a))}%`
            }
        } else s && e.silenceProgressBar && (e.silenceProgressBar.style.width = "");
        n.statusMessage && d(n.statusMessage, "")
    }

    function Ie() {
        e.silenceProgress && (e.silenceProgress.classList.add("hidden"), e.silenceProgress.classList.remove("indeterminate"), e.silenceProgress.setAttribute("aria-busy", "false"), e.silenceProgressBar && (e.silenceProgressBar.style.width = "0%"), e.silenceProgressCount && e.silenceProgressCount.classList.add("hidden"), Te(!1), t.selectedIndex >= 0 && R())
    }

    function gn(n = {}, r = "batch") {
        const i = Ke();
        let s = n.silenceDb ?? i.silenceDb,
            a = n.silenceDur ?? i.silenceDur;
        return r === "cue" && (s = Math.max(Number(s) || -30, -30), a = Math.min(Math.max(.05, Number(a) || .12), .12)), {
            silenceDb: s,
            silenceDur: a,
            fixOverlap: n.fixOverlap ?? i.fixOverlap
        }
    }
    async function ir(n = {}) {
        if (t.silenceSplitBusy) return {
            ok: !1,
            error: "\u9759\u97F3\u5206\u6790\u6B63\u5728\u8FDB\u884C\u4E2D"
        };
        if (t.selectedIndex < 0) return {
            ok: !1,
            error: "\u672A\u9009\u4E2D\u5B57\u5E55"
        };
        x();
        const r = t.selectedIndex,
            i = gs() || t.cues[r],
            s = gn(n, "cue");
        Ee({
            title: "\u6B63\u5728\u5206\u6790\u9759\u97F3",
            detail: `\u6B63\u5728\u5206\u6790\u7B2C ${r+1} \u6761\u5B57\u5E55\u7684\u97F3\u9891\u9759\u97F3\u70B9\u2026`,
            indeterminate: !0,
            statusMessage: "\u6B63\u5728\u5206\u6790\u89C6\u9891\u9759\u97F3\u2026"
        }), await ce();
        try {
            const a = await Rs(i, s);
            return a.error ? (d(a.error, "err"), {
                ok: !1,
                error: a.error
            }) : (mr(r, a.cues, s), a.meta?.silenceCount && d(`\u5DF2\u6309 ${a.meta.silenceCount} \u5904\u9759\u97F3\u5206\u5272\u4E3A ${a.cues.length} \u6761`, "ok"), {
                ok: !0,
                cues: a.cues,
                meta: a.meta
            })
        } finally {
            Ie()
        }
    }

    function ar() {
        if (!e.cueContextMenu) return;
        const n = t.selectedIndex >= 0 && t.selectedIndex < t.cues.length,
            r = n ? String(t.cues[t.selectedIndex].text || "").trim() : "",
            i = n && !!r,
            s = i && String(t.cues[t.selectedIndex].text || "").includes(`
`),
            a = i && /\s/.test(String(t.cues[t.selectedIndex].text || "")),
            o = n && $t(t.cues[t.selectedIndex]) && !!t.videoPath && !!p?.ffmpegDetectSilence && !t.silenceSplitBusy,
            l = n && !!e.video,
            c = n && !!e.video,
            u = n && qe(t.cues[t.selectedIndex].text) > 0,
            m = n && Dt(t.cues[t.selectedIndex]) && !!t.videoPath && !!p?.ffmpegDetectSilence && !t.silenceSplitBusy,
            f = n && Tt(t.cues[t.selectedIndex]) && !!t.videoPath && !!p?.ffmpegDetectSilence && !t.silenceSplitBusy && !t.retranscribeBusy;
        e.cueContextMenu.querySelectorAll("[data-ctx-action]").forEach(g => {
            const h = g.dataset.ctxAction;
            h === "split-modal" || h === "split-smart" || h === "split-silence" || h === "split-lines" || h === "split-spaces" ? h === "split-lines" ? g.disabled = !s : h === "split-spaces" ? g.disabled = !a : h === "split-silence" ? g.disabled = !o : g.disabled = !i : h === "split-silence-all" ? g.disabled = t.silenceSplitBusy || !t.videoPath || !p?.ffmpegDetectSilence || !t.cues.some(v => $t(v)) : h === "align-start" ? g.disabled = !l : h === "align-end" ? g.disabled = !c : h === "char-dur" ? g.disabled = !u : h === "smart-dur" ? g.disabled = !m : h === "audio-snap" ? g.disabled = !f : h === "audio-snap-batch" ? g.disabled = !t.videoPath || !p?.ffmpegDetectSilence || t.silenceSplitBusy || t.retranscribeBusy || !t.cues.length : h === "retranscribe" ? (g.disabled = !n || t.retranscribeBusy || t.silenceSplitBusy || t.computeBusy || !t.videoPath || !p?.transubTranscribeRange, g.textContent = "\u91CD\u8F6C\u5199\u672C\u6761\u2026") : h === "sakura-translate" ? g.disabled = !n || t.reconstructBusy || t.computeBusy || !(p?.transubSakuraTranslate || p?.transubAdvancedSmartTranslate) : h === "smart-translate" ? g.disabled = !n || t.reconstructBusy || t.computeBusy || !p?.transubAdvancedSmartTranslate : h === "retranslate" || h === "retranscribe-dual" ? g.disabled = !n || !U() || t.retranscribeBusy || t.silenceSplitBusy || t.computeBusy || !t.videoPath || !p?.transubTranscribeRange : h === "retranscribe-dur" ? g.disabled = t.retranscribeBusy || t.silenceSplitBusy || t.computeBusy || !t.videoPath || !p?.transubTranscribeRange : h === "confirm-meta" || h === "delete" ? g.disabled = !n : h === "insert" && (g.disabled = !1)
        })
    }

    function ct() {
        e.cueContextMenu && e.cueContextMenu.classList.add("hidden")
    }

    function ja(n, r) {
        if (!e.cueContextMenu) return;
        kt(), ar();
        const i = e.cueContextMenu;
        i.classList.remove("hidden"), i.style.visibility = "hidden", i.style.left = "0", i.style.top = "0";
        const s = i.getBoundingClientRect();
        i.style.visibility = "";
        const a = 8;
        let o = n,
            l = r;
        o + s.width > window.innerWidth - a && (o = window.innerWidth - s.width - a), l + s.height > window.innerHeight - a && (l = window.innerHeight - s.height - a), i.style.left = `${Math.max(a,o)}px`, i.style.top = `${Math.max(a,l)}px`
    }

    function or(n, r, i, {
        scroll: s = !1
    } = {}) {
        !Number.isFinite(n) || n < 0 || n >= t.cues.length || (J().includes(n) ? (t.selectedIndex = n, R()) : X(n, {
            scroll: s
        }), ja(r, i))
    }

    function Ga(n) {
        switch (ct(), n) {
            case "split-modal":
                Os();
                break;
            case "split-smart": {
                const r = Ke();
                lt("smart", {
                    smartMaxChars: r.smartMaxChars,
                    smartLineChars: r.smartLineChars,
                    useCps: r.useCps,
                    fixOverlap: r.fixOverlap
                });
                break
            }
            case "split-silence":
                ir();
                break;
            case "split-silence-all":
                vr("all");
                break;
            case "split-lines":
                lt("lines");
                break;
            case "split-spaces":
                lt("spaces");
                break;
            case "align-start":
                Yn();
                break;
            case "align-end":
                Jn();
                break;
            case "char-dur":
                Ds();
                break;
            case "smart-dur":
                Fs();
                break;
            case "audio-snap":
                snapSelectedCueToAudio();
                break;
            case "audio-snap-batch":
                yo();
                break;
            case "retranscribe":
                io();
                break;
            case "sakura-translate":
                we({
                    engine: "auto",
                    forceSelected: !0
                });
                break;
            case "smart-translate":
                we({
                    engine: "smart",
                    forceSelected: !0
                });
                break;
            case "retranslate":
                Ns();
                break;
            case "retranscribe-dual":
                qs();
                break;
            case "retranscribe-dur":
                ur();
                break;
            case "confirm-meta":
                eo();
                break;
            case "insert":
                Lt();
                break;
            case "delete":
                pn();
                break;
            default:
                break
        }
    }

    function lr() {
        return {
            charCount: Number(e.splitCharCount?.value) || 20,
            count: Number(e.splitCount?.value) || 2,
            smartMaxChars: Number(e.splitSmartMaxChars?.value) || 20,
            smartLineChars: Number(e.splitSmartLineChars?.value) || 18,
            silenceDb: Number(e.splitSilenceDb?.value) || -35,
            silenceDur: Number(e.splitSilenceDur?.value) || .25,
            useCps: e.splitUseCps?.checked !== !1,
            fixOverlap: e.splitFixOverlap?.checked !== !1
        }
    }

    const cueSplitPlan = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts && globalThis.TransubEditorParts.cueSplitPlan)
        || (typeof window !== 'undefined' && window.TransubEditorParts && window.TransubEditorParts.cueSplitPlan)
        || null;

    function Ka(n) {
        return cueSplitPlan ? cueSplitPlan.timingModeFromUseCps(n) : (n ? "cps" : "proportional")
    }

    function Va() {
        return cueSplitPlan ? cueSplitPlan.cpsTimingOpts(yt) : {
            targetCps: yt(),
            minDurMs: 500
        }
    }

    function za(n) {
        return D.splitTextByLines(n)
    }

    function Ua(n) {
        return D.splitTextBySpaces(n)
    }

    function Qa(n, r) {
        return D.splitTextByCharCount(n, r)
    }

    function Za(n, r) {
        return D.splitTextIntoNParts(n, r)
    }

    function cr(n, r) {
        return D.splitTextAtIndex(n, r)
    }

    function dt(n, r, i, s = "proportional", a = {}) {
        return D.buildCuesFromTexts(n, r, i, s, a)
    }

    function Xa(n, r, i, s) {
        return cueSplitPlan ? cueSplitPlan.splitAtPlayheadMidpoint(n, r, i, s, I) : null
    }

    function Ya(n) {
        return cueSplitPlan ? cueSplitPlan.needsBreakWords(n) : (n === "chars" || n === "count" || n === "silence")
    }

    function Ja(n) {
        return D.normalizeBreakWords(String(n || "").split(/[,，;；|／/\n\r\t]+/).map(r => r.trim()))
    }

    function hn() {
        return vt()
    }

    function yn(n, r) {
        return cueSplitPlan ? cueSplitPlan.connectedSplitGuard(n, r, D, hn) : null
    }

    function Ye(n, r, i = {}) {
        if (!cueSplitPlan) return {
            error: "分割核心未加载"
        };
        return cueSplitPlan.planCueSplit(n, r, i, {
            splitApi: D,
            getEndMs: I,
            getTargetCps: yt,
            getBreakWords: hn,
            getCursorIndex: (text) => {
                const m = e.detailText;
                return m ? m.selectionStart : text.length
            },
            getPlayheadMs: () => De(),
            hasVideo: !!e.video
        })
    }
    const silenceSplitPlan = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts && globalThis.TransubEditorParts.silenceSplitPlan)
        || (typeof window !== 'undefined' && window.TransubEditorParts && window.TransubEditorParts.silenceSplitPlan)
        || null;

    async function Rs(n, r = {}) {
        if (!silenceSplitPlan) return {
            error: "静音切分核心未加载"
        };
        return silenceSplitPlan.planSilenceCueSplit(n, {
            ...r,
            detailDurationSec: Number(e.detailDuration?.value)
        }, {
            videoPath: t.videoPath,
            ffmpegPath: Ue || '',
            splitApi: D,
            getEndMs: I,
            getBreakWords: hn,
            connectedGuard: yn,
            isCancelled: ne,
            detectSilence: (opts) => p?.ffmpegDetectSilence?.(opts)
        })
    }

    function At() {
        Sr(t.cues, {
            fixOverlap: !0,
            fixCps: !1,
            enforceMinDur: !1,
            enforceMaxDur: !1,
            gapMs: 1
        })
    }
    async function eo() {
        if (t.selectedIndex < 0 || t.selectedIndex >= t.cues.length) return;
        x(), He();
        const n = t.selectedIndex;
        t.cueMeta[n] = {
            confidence: 1,
            flags: ["confirmed"],
            low: !1,
            source: "confirmed",
            fingerprint: z.cueFingerprint(t.cues[n]),
            confirmed: !0
        }, await dn(), C(), d(`\u5DF2\u5C06\u7B2C ${n+1} \u6761\u6807\u8BB0\u4E3A\u53EF\u4FE1`, "ok")
    }

    function to({
        requireVideo: n = !0
    } = {}) {
        if (t.retranscribeBusy || t.silenceSplitBusy) return d("\u5DF2\u6709\u5206\u6790\u4EFB\u52A1\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7A0D\u5019", "err"), !1;
        if (t.computeBusy) return d(t.computeBusyLabel ? `\u5DF2\u6709${t.computeBusyLabel}\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5` : "\u5176\u5B83\u7A97\u53E3\u6709\u5F15\u64CE\u6216 LLM \u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "err"), !1;
        if (n) {
            if (!t.videoPath) return d("\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u91CD\u8F6C\u5199", "err"), !1;
            if (!p?.transubTranscribeRange) return d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u533A\u95F4\u91CD\u8F6C\u5199", "err"), !1
        }
        return !0
    }

    function no(n, r) {
        t.cueMeta = z.annotateCuesConfidence(t.cues, Zn());
        for (let i = 0; i < r; i += 1) {
            const s = n + i;
            t.cues[s] && (t.cueMeta[s] = {
                confidence: .88,
                flags: ["retranscribe"],
                low: !1,
                source: "retranscribe",
                fingerprint: z.cueFingerprint(t.cues[s])
            })
        }
    }
    function friendlyJobAbortMessage(n) {
        return retranscribeRangePlan
            ? retranscribeRangePlan.friendlyJobAbortMessage(n)
            : (String(n || "").trim() || "处理失败")
    }

    function isJobAbortResult(n) {
        return retranscribeRangePlan
            ? retranscribeRangePlan.isJobAbortResult(n)
            : !!(n && (n.cancelled || n.code === "cancelled" || n.code === "aborted"))
    }
    async function ut(n) {
        const r = Math.max(0, Math.round(Number(n.startMs) || 0)),
            i = Math.max(r + 200, Math.round(Number(n.endMs) || 0)),
            s = Math.max(0, Math.min(2e3, Math.round(Number(n.padMs ?? 350)))),
            a = n.mode === "cue" ? "cue" : "range",
            o = n.snapAfter === !0,
            l = n.dualPass === !0 && U();
        let c = n.writeAs === "target" ? "target" : n.writeAs === "source" ? "source" : null;
        c || (c = n.task === "translate" ? "target" : "source");
        const u = l ? "transcribe" : c === "target" ? "translate" : "transcribe";
        let m = null;
        c === "target" && !l && (m = await jn());
        const f = l || c === "source" || !m?.textMt;
        if (!to({
                requireVideo: f
            })) return {
            ok: !1
        };
        if (i - r < 200) return d("\u91CD\u8F6C\u5199\u65F6\u95F4\u8303\u56F4\u8FC7\u77ED", "err"), {
            ok: !1
        };
        t.retranscribeBusy = !0, t.jobAbortRequested = !1, Qe();
        const g = l ? "\u53CC\u8BED\u91CD\u8DD1" : c === "target" ? "\u91CD\u8F6C\u5199 \xB7 \u8BD1\u6587" : "\u91CD\u8F6C\u5199 \xB7 \u539F\u6587";
        let h = u,
            v = g;
        Ee({
            title: g,
            detail: n.detail || `\u622A\u53D6\u5E76\u5904\u7406 ${((i-r)/1e3).toFixed(1)}s\u2026`,
            indeterminate: !0,
            statusMessage: `${g}\u8FDB\u884C\u4E2D\u2026`
        }), e.silenceProgressHint && (e.silenceProgressHint.textContent = l ? "\u5C06\u4F9D\u6B21\uFF1A\u8BED\u97F3\u8BC6\u522B\u539F\u6587 \u2192 \u6309\u8BBE\u7F6E\u7FFB\u8BD1\u8BD1\u6587\uFF1B\u52A0\u8F7D\u6A21\u578B\u65F6\u8BF7\u7A0D\u5019\u3002\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002" : c === "target" ? U() ? "\u5C06\u6309\u8BBE\u7F6E\u4E2D\u7684\u7FFB\u8BD1\u65B9\u5F0F\u751F\u6210\u8BD1\u6587\u5E76\u5199\u5165\u8BD1\u6587\u8F68\uFF1B\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002" : "\u5C06\u6309\u8BBE\u7F6E\u4E2D\u7684\u7FFB\u8BD1\u65B9\u5F0F\u8986\u76D6\u5F53\u524D\u5B57\u5E55\u8BD1\u6587\uFF1B\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002" : U() && t.dualRole === "target" ? "\u5C06\u8BED\u97F3\u8BC6\u522B\u7ED3\u679C\u5199\u5165\u539F\u6587\u5BF9\u7167\u8F68\uFF0C\u4E0D\u4F1A\u8986\u76D6\u8BD1\u6587\u3002\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002" : "\u5C06\u5BF9\u9009\u5B9A\u65F6\u95F4\u6BB5\u505A\u8BED\u97F3\u8BC6\u522B\uFF1B\u52A0\u8F7D\u6A21\u578B\u65F6\u8BF7\u7A0D\u5019\u3002\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002"), await ce();
        const y = (N, W, B) => {
            if (retranscribeRangePlan?.spliceCuesForRetranscribe) {
                return retranscribeRangePlan.spliceCuesForRetranscribe(N, r, i, W, {
                    mode: a,
                    selectedIndex: B,
                    replaceCuesInTimeRange: z.replaceCuesInTimeRange,
                });
            }
            // Fail closed: still splice cues if plan module failed to load.
            if (a === "cue" && B >= 0 && B < N.length) {
                N.splice(B, 1, ...W);
                return { selectAt: B, replacedCount: 1 };
            }
            const w = z.replaceCuesInTimeRange(N, r, i, W);
            N.splice(0, N.length, ...w.cues);
            return { selectAt: w.insertAt, replacedCount: w.replaced };
        },
            k = async (N, W) => {
                h = N, v = W || g, e.silenceProgressTitle && (e.silenceProgressTitle.textContent = v);
                const B = await p.transubTranscribeRange({
                    mediaPath: t.videoPath,
                    startMs: r,
                    endMs: i,
                    padMs: s,
                    ffmpegPath: Ue,
                    subtitlePath: t.path || void 0,
                    options: {
                        task: N,
                        mergeSegments: !1,
                        subFormats: "srt"
                    }
                });
                if (ne() || isJobAbortResult(B)) return {
                    ok: !1,
                    cancelled: !0
                };
                if (!B?.ok || !Array.isArray(B.cues) || !B.cues.length) return {
                    ok: !1,
                    error: friendlyJobAbortMessage(B?.error || `${W||"\u5904\u7406"}\u5931\u8D25`),
                    cancelled: isJobAbortResult(B)
                };
                const M = B.cues.map(L => {
                    const row = {
                        startMs: L.startMs,
                        endMs: L.endMs,
                        text: String(L.text || "").trim()
                    };
                    const meta = L.meta && typeof L.meta === "object" ? L.meta : null;
                    const avg = L.avgLogprob ?? L.avg_logprob ?? meta?.avgLogprob ?? meta?.avg_logprob;
                    const noSp = L.noSpeechProb ?? L.no_speech_prob ?? meta?.noSpeechProb ?? meta?.no_speech_prob;
                    const conf = L.confidence ?? meta?.confidence;
                    const score = L.score ?? meta?.score;
                    const prob = L.probability ?? L.prob ?? meta?.probability ?? meta?.prob;
                    if (avg != null) row.avgLogprob = avg;
                    if (noSp != null) row.noSpeechProb = noSp;
                    if (conf != null) row.confidence = conf;
                    if (score != null) row.score = score;
                    if (prob != null) row.probability = prob;
                    return row
                }).filter(L => L.text);
                return M.length ? {
                    ok: !0,
                    cues: M
                } : {
                    ok: !1,
                    error: `${W||"\u5904\u7406"}\u7ED3\u679C\u4E3A\u7A7A`
                }
            }, q = async (N, W) => {
                h = "translate", v = W || g, e.silenceProgressTitle && (e.silenceProgressTitle.textContent = v);
                const B = await jn();
                if (!B.textMt) return k("translate", W);
                de({
                    detail: `\u6B63\u5728\u7528${B.label}\u7FFB\u8BD1 ${N.length} \u6761\u2026`,
                    statusMessage: `${B.label}\u4E2D\u2026`
                }), e.silenceProgressHint && (e.silenceProgressHint.textContent = B.faithfulTone ? `\u8BBE\u7F6E\uFF1A${B.label}\uFF08\u5FE0\u5B9E\u8BED\u6C14\uFF09\u3002\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002` : `\u8BBE\u7F6E\uFF1A${B.label}\u3002\u53EF\u70B9\u53D6\u6D88\u6216\u6309 Esc \u4E2D\u6B62\u3002`);
                const M = N.map((F, re) => ({
                        index: re,
                        startMs: F.startMs,
                        endMs: F.endMs,
                        text: F.text
                    })),
                    L = await El(M, {
                        engine: B.engine,
                        faithfulTone: B.faithfulTone
                    });
                if (ne() || isJobAbortResult(L)) return {
                    ok: !1,
                    cancelled: !0
                };
                if (!L?.ok) return {
                    ok: !1,
                    error: friendlyJobAbortMessage(L?.error || `${W||"\u7FFB\u8BD1"}\u5931\u8D25`),
                    cancelled: isJobAbortResult(L)
                };
                const w = new Map((L.cues || []).map(F => [Number(F.index), String(F.text ?? "").trim()])),
                    A = N.map((F, re) => ({
                        startMs: F.startMs,
                        endMs: F.endMs,
                        text: w.get(re) || ""
                    })).filter(F => F.text);
                return A.length ? {
                    ok: !0,
                    cues: A,
                    via: L.label || B.label
                } : {
                    ok: !1,
                    error: `${W||"\u7FFB\u8BD1"}\u7ED3\u679C\u4E3A\u7A7A`
                }
            };
        let te = null;
        try {
            te = p.onTransubRetranscribeProgress?.(S => {
                if (ne()) return;
                const ui = retranscribeRangePlan
                    ? retranscribeRangePlan.mapRetranscribeProgressUi(S, {
                        dualPass: l,
                        task: h,
                        fallbackTitle: v,
                    })
                    : null;
                if (!ui?.detail) return;
                de({
                    detail: ui.detail,
                    statusMessage: ui.statusMessage || ui.detail
                });
                if (e.silenceProgressTitle && ui.title) e.silenceProgressTitle.textContent = ui.title;
                if (e.silenceProgressHint && ui.hint) e.silenceProgressHint.textContent = ui.hint;
            }) || null;
            const N = p.onSakuraTranslateProgress?.(S => {
                    if (ne() || h !== "translate") return;
                    const E = String(S?.message || S?.detail || "").trim();
                    E && de({
                        detail: E,
                        statusMessage: E
                    })
                }) || null,
                W = p.onAdvancedReconstructProgress?.(S => {
                    if (ne() || h !== "translate" || S?.feature && S.feature !== "smartTranslate") return;
                    const E = String(S?.message || S?.detail || "").trim();
                    E && de({
                        detail: E,
                        statusMessage: E
                    })
                }) || null,
                B = te;
            te = () => {
                try {
                    B?.()
                } catch {}
                try {
                    N?.()
                } catch {}
                try {
                    W?.()
                } catch {}
            };
            let M = null,
                L = null;
            if (l) {
                const S = await k("transcribe", "\u53CC\u8BED \xB7 \u539F\u6587");
                if (!S.ok) return S.cancelled ? d("\u53CC\u8BED\u91CD\u8DD1\u5DF2\u53D6\u6D88", "warn") : d(S.error || "\u539F\u6587\u751F\u6210\u5931\u8D25", "err"), {
                    ok: !1,
                    cancelled: !!S.cancelled
                };
                M = S.cues;
                const E = await q(M, "\u53CC\u8BED \xB7 \u8BD1\u6587");
                E.ok ? L = E.cues : E.cancelled ? d("\u53CC\u8BED\u91CD\u8DD1\u5DF2\u53D6\u6D88\uFF08\u539F\u6587\u5DF2\u66F4\u65B0\uFF1B\u8BD1\u6587\u672A\u5B8C\u6210\uFF09", "warn") : d(E.error || "\u8BD1\u6587\u751F\u6210\u5931\u8D25", "err")
            } else if (c === "target") {
                const S = Il(r, i, a);
                if (!S.length) return d("\u6240\u9009\u8303\u56F4\u5185\u6CA1\u6709\u53EF\u7FFB\u8BD1\u7684\u539F\u6587", "err"), {
                    ok: !1
                };
                const E = await q(S, "\u91CD\u8F6C\u5199 \xB7 \u8BD1\u6587");
                if (!E.ok) return E.cancelled ? d("\u91CD\u8F6C\u5199\u5DF2\u53D6\u6D88", "warn") : d(E.error || "\u8BD1\u6587\u751F\u6210\u5931\u8D25", "err"), {
                    ok: !1,
                    cancelled: !!E.cancelled
                };
                L = E.cues
            } else {
                const S = await k("transcribe", "\u91CD\u8F6C\u5199 \xB7 \u539F\u6587");
                if (!S.ok) return S.cancelled ? d("\u91CD\u8F6C\u5199\u5DF2\u53D6\u6D88", "warn") : d(S.error || "\u91CD\u8F6C\u5199\u5931\u8D25", "err"), {
                    ok: !1,
                    cancelled: !!S.cancelled
                };
                M = S.cues
            }
            $();
            let w = t.selectedIndex >= 0 ? t.selectedIndex : 0,
                A = 0,
                F = !1;
            const pairWritable = U() && !t.pairReadOnly;
            const re = S => {
                    if (S?.length)
                        if (pairWritable && t.dualRole === "target") A = y(t.pairCues, S, -1).replacedCount, t.pairDirty = !0, F = !0;
                        else {
                            const E = y(t.cues, S, a === "cue" ? t.selectedIndex : -1);
                            w = E.selectAt, A = E.replacedCount
                        }
                },
                pe = S => {
                    if (S?.length)
                        if (pairWritable && t.dualRole === "source") {
                            const E = y(t.pairCues, S, -1);
                            A = Math.max(A, E.replacedCount), t.pairDirty = !0, F = !0
                        } else if (U() && t.dualRole === "target") {
                        const E = y(t.cues, S, a === "cue" ? t.selectedIndex : -1);
                        w = E.selectAt, A = Math.max(A, E.replacedCount)
                    } else {
                        const E = y(t.cues, S, a === "cue" ? t.selectedIndex : -1);
                        w = E.selectAt, A = E.replacedCount
                    }
                };
            if (l) {
                if (re(M), pe(L), !L?.length && M?.length && F) return await os(), P(!0), C(), d("\u7FFB\u8BD1\u5931\u8D25\uFF0C\u4F46\u539F\u6587\u5BF9\u7167\u8F68\u5DF2\u66F4\u65B0\u5E76\u4FDD\u5B58", "warn"), {
                    ok: !1
                };
                if (!L?.length) return d("\u53CC\u8BED\u91CD\u8DD1\u5931\u8D25", "err"), {
                    ok: !1
                }
            } else c === "target" ? pe(L) : re(M);
            // Merge ASR confidence sidecar for source-track range retranscribe.
            if (M?.length && t.path && typeof z.mergeRangeAsrConfidenceFromCues === "function" && c !== "target") {
                try {
                    t.sidecarMeta = z.mergeRangeAsrConfidenceFromCues(t.sidecarMeta, M, {
                        startMs: r,
                        endMs: i,
                        sourceSub: G(t.path)
                    });
                    He()
                } catch {}
            }
            At();
            const le = (L || M || []).length;
            let ge = 0;
            if (o && t.videoPath && p?.ffmpegDetectSilence && !F) {
                const S = [];
                for (let Y = 0; Y < le; Y += 1) {
                    const rt = w + Y;
                    rt >= 0 && rt < t.cues.length && S.push(rt)
                }
                const E = gn({});
                Ee({
                    title: "\u6B63\u5728\u6309\u97F3\u9891\u8D34\u8FB9",
                    detail: `\u5904\u7406\u5B8C\u6210\uFF0C\u6B63\u5728\u8D34\u8FB9 ${S.length} \u6761\u2026`,
                    current: 0,
                    total: S.length,
                    statusMessage: `\u8D34\u8FB9 0/${S.length}\u2026`
                }), e.silenceProgressHint && (e.silenceProgressHint.textContent = "\u6839\u636E\u9759\u97F3\u5FAE\u8C03\u8D77\u6B62\u65F6\u95F4\uFF0C\u6587\u672C\u4FDD\u6301\u4E0D\u53D8"), await ce();
                for (let Y = 0; Y < S.length; Y += 1) de({
                    current: Y,
                    total: S.length,
                    detail: `\u6B63\u5728\u8D34\u8FB9\u7B2C ${Y+1}/${S.length} \u6761\u2026`,
                    statusMessage: `\u8D34\u8FB9 ${Y+1}/${S.length}\u2026`
                }), await ce(), (await Zs(S[Y], {
                    ...E,
                    padMs: 400,
                    allowExtend: !0
                })).status === "adjusted" && (ge += 1)
            }
            if (F) {
                const S = await os();
                S?.ok || d(S?.error || "\u5BF9\u7167\u8F68\u4FDD\u5B58\u5931\u8D25", "err")
            }
            no(w, le), await dn(), t.selectedIndex = Math.min(Math.max(w, 0), t.cues.length - 1), P(!0), C();
            const bt = ((i - r) / 1e3).toFixed(1),
                Qt = o && ge ? `\uFF0C\u8D34\u8FB9 ${ge}/${le}` : "";
            return d(`\u5DF2${l?"\u53CC\u8BED\u91CD\u8DD1":c==="target"?"\u91CD\u8F6C\u5199\u4E3A\u8BD1\u6587":"\u91CD\u8F6C\u5199\u4E3A\u539F\u6587"} ${bt}s\uFF1A\u66FF\u6362 ${A} \u6761 \u2192 ${le} \u6761${Qt}${!l&&c==="source"&&F?"\uFF08\u5DF2\u5199\u5165\u539F\u6587\u5BF9\u7167\u8F68\uFF0C\u8BD1\u6587\u672A\u6539\uFF09":!l&&c==="target"&&F?"\uFF08\u5DF2\u5199\u5165\u8BD1\u6587\u5BF9\u7167\u8F68\uFF0C\u539F\u6587\u672A\u6539\uFF09":""}`, "ok"), {
                ok: !0,
                newCount: le,
                replacedCount: A,
                snappedCount: ge
            }
        } catch (N) {
            const W = N?.name === "AbortError" || N?.code === "cancelled" || N?.code === "aborted";
            return d(W ? "\u64CD\u4F5C\u5DF2\u4E2D\u6B62\u6216\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u91CD\u8BD5" : friendlyJobAbortMessage(N?.message || "\u5904\u7406\u5931\u8D25"), W ? "warn" : "err"), {
                ok: !1,
                cancelled: !!W
            }
        } finally {
            if (typeof te == "function") try {
                te()
            } catch {}
            t.retranscribeBusy = !1, Ie(), e.silenceProgressHint && (e.silenceProgressHint.textContent = "FFmpeg \u6B63\u5728\u5206\u6790\u5173\u8054\u89C6\u9891\u7684\u97F3\u9891\u9759\u97F3\u70B9\uFF0C\u8BF7\u52FF\u5173\u95ED\u7A97\u53E3"), Qe()
        }
    }
    async function ro({
        title: n = "\u91CD\u8F6C\u5199"
    } = {}) {
        const i = nt().writeAs !== "target",
            s = await ll("\u8BF7\u9009\u62E9\u8F6C\u5F55\u76EE\u6807", {
                title: n,
                detail: `\u539F\u6587\uFF1A\u8BED\u97F3\u8BC6\u522B\uFF08\u6E90\u8BED\u8A00\uFF09
\u8BD1\u6587\uFF1A\u6309\u8BBE\u7F6E\u4E2D\u7684\u7FFB\u8BD1\u65B9\u5F0F\uFF08\u63A8\u7406\u7FFB\u8BD1 / \u667A\u80FD / \u673A\u5668\u7FFB\u8BD1\uFF09`,
                buttons: ["\u539F\u6587", "\u8BD1\u6587", "\u53D6\u6D88"],
                defaultId: i ? 0 : 1,
                cancelId: 2
            });
        return s === 0 ? "source" : s === 1 ? "target" : null
    }

    function dr() {
        return document.querySelector('input[name="editorRetranscribeWriteAs"]:checked')?.value === "target" ? "target" : "source"
    }

    function so(n) {
        const r = n === "target" ? "target" : "source",
            i = document.querySelector(`input[name="editorRetranscribeWriteAs"][value="${r}"]`);
        i && (i.checked = !0)
    }
    async function Ns() {
        if (t.selectedIndex < 0 || t.selectedIndex >= t.cues.length) {
            d("\u8BF7\u5148\u9009\u4E2D\u4E00\u6761\u5B57\u5E55", "err");
            return
        }
        if (!U()) {
            d("\u5F53\u524D\u6CA1\u6709\u914D\u5BF9\u53CC\u8BED\u8F68\uFF0C\u65E0\u6CD5\u5355\u72EC\u91CD\u8BD1", "err");
            return
        }
        x();
        const n = t.selectedIndex,
            r = t.cues[n],
            i = nt();
        await ut({
            startMs: r.startMs,
            endMs: I(r),
            padMs: i.padMs ?? 350,
            mode: "cue",
            writeAs: "target",
            snapAfter: !1,
            detail: `\u6B63\u5728\u91CD\u8BD1\u7B2C ${n+1} \u6761\u2026`
        })
    }
    async function qs() {
        if (t.selectedIndex < 0 || t.selectedIndex >= t.cues.length) {
            d("\u8BF7\u5148\u9009\u4E2D\u4E00\u6761\u5B57\u5E55", "err");
            return
        }
        if (!U()) {
            d("\u5F53\u524D\u6CA1\u6709\u914D\u5BF9\u53CC\u8BED\u8F68", "err");
            return
        }
        x();
        const n = t.selectedIndex,
            r = t.cues[n],
            i = nt();
        await ut({
            startMs: r.startMs,
            endMs: I(r),
            padMs: i.padMs ?? 350,
            mode: "cue",
            dualPass: !0,
            snapAfter: i.snapAfter !== !1,
            detail: `\u6B63\u5728\u53CC\u8BED\u91CD\u8DD1\u7B2C ${n+1} \u6761\u2026`
        })
    }
    async function io() {
        if (t.selectedIndex < 0 || t.selectedIndex >= t.cues.length) {
            d("\u8BF7\u5148\u9009\u4E2D\u4E00\u6761\u5B57\u5E55", "err");
            return
        }
        x();
        const n = await ro({
            title: "\u91CD\u8F6C\u5199\u672C\u6761"
        });
        if (!n) return;
        const r = t.selectedIndex,
            i = t.cues[r],
            s = nt();
        Kr({
            ...s,
            writeAs: n
        }), await ut({
            startMs: i.startMs,
            endMs: I(i),
            padMs: s.padMs ?? 350,
            mode: "cue",
            writeAs: n,
            snapAfter: s.snapAfter !== !1,
            detail: n === "target" ? `\u6B63\u5728\u5C06\u7B2C ${r+1} \u6761\u91CD\u8F6C\u5199\u4E3A\u8BD1\u6587\u2026` : `\u6B63\u5728\u5C06\u7B2C ${r+1} \u6761\u91CD\u8F6C\u5199\u4E3A\u539F\u6587\u2026`
        })
    }

    function Ws() {
        return document.querySelector('input[name="editorRetranscribeDurStart"]:checked')?.value || "selected"
    }

    function Hs() {
        const selectedStartMs = (t.selectedIndex >= 0 && t.selectedIndex < t.cues.length)
            ? t.cues[t.selectedIndex].startMs
            : null;
        return retranscribeRangePlan
            ? retranscribeRangePlan.planDurationWindow({
                durationSec: ml(e.retranscribeDurSec?.value),
                padMs: e.retranscribeDurPadMs?.value,
                startMode: Ws(),
                selectedStartMs,
                playheadMs: De(),
            })
            : {
                startMs: De(),
                endMs: De() + 30000,
                durationSec: 30,
                padMs: 350,
                startMode: Ws(),
            }
    }

    function Oe() {
        if (!e.retranscribeDurPreview) return;
        if (x(), !t.videoPath) {
            e.retranscribeDurPreview.textContent = "\u8BF7\u5148\u5173\u8054\u89C6\u9891", e.retranscribeDurPreview.classList.add("err");
            return
        }
        Ws() === "selected" && (t.selectedIndex < 0 || t.selectedIndex >= t.cues.length) && (e.retranscribeDurPreview.textContent = "\u672A\u9009\u4E2D\u5B57\u5E55\uFF0C\u5C06\u6539\u7528\u64AD\u653E\u5934\u4F5C\u4E3A\u8D77\u59CB", e.retranscribeDurPreview.classList.remove("err"));
        const r = Hs(),
            i = z.collectOverlappingCueIndices(t.cues, r.startMs, r.endMs),
            s = Z(r.startMs, t.format),
            a = Z(r.endMs, t.format),
            l = retranscribeRangePlan
                ? retranscribeRangePlan.resolveRetranscribeWriteSuffix({
                    writeAs: dr(),
                    hasDual: U(),
                    dualRole: t.dualRole,
                })
                : "";
        e.retranscribeDurPreview.textContent = retranscribeRangePlan
            ? retranscribeRangePlan.buildRetranscribeDurPreviewText({
                startLabel: s,
                endLabel: a,
                durationSec: r.durationSec,
                overlapCount: i.length,
                writeSuffix: l,
            })
            : `${s} → ${a}`, e.retranscribeDurPreview.classList.remove("err"), document.querySelectorAll("[data-retranscribe-dur-preset]").forEach(c => {
            const u = Number(c.getAttribute("data-retranscribe-dur-preset"));
            c.classList.toggle("active", Math.abs(u - r.durationSec) < .01)
        })
    }

    function ur() {
        if (!e.retranscribeDurModal) return;
        if (!t.videoPath) {
            d("\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u91CD\u8F6C\u5199", "err");
            return
        }
        x();
        const n = nt();
        e.retranscribeDurSec && (e.retranscribeDurSec.value = String(n.durationSec)), e.retranscribeDurPadMs && (e.retranscribeDurPadMs.value = String(n.padMs)), e.retranscribeDurSnapAfter && (e.retranscribeDurSnapAfter.checked = n.snapAfter !== !1), so(n.writeAs);
        const r = document.querySelector(`input[name="editorRetranscribeDurStart"][value="${n.startMode}"]`);
        if (r) r.checked = !0;
        else {
            const i = document.querySelector('input[name="editorRetranscribeDurStart"][value="selected"]');
            i && (i.checked = !0)
        }
        Q(e.retranscribeDurModal, e.retranscribeDurConfirm), Oe()
    }

    function Ft() {
        K(e.retranscribeDurModal)
    }
    async function ao() {
        x();
        const n = Hs();
        if (!t.videoPath) {
            Oe();
            return
        }
        const r = e.retranscribeDurSnapAfter?.checked !== !1,
            i = dr();
        Kr({
            durationSec: n.durationSec,
            padMs: n.padMs,
            startMode: n.startMode,
            snapAfter: r,
            writeAs: i
        }), Ft(), await ut({
            startMs: n.startMs,
            endMs: n.endMs,
            padMs: n.padMs,
            mode: "range",
            writeAs: i,
            snapAfter: r,
            detail: i === "target" ? `\u6B63\u5728\u91CD\u8F6C\u5199\u4E3A\u8BD1\u6587 ${n.durationSec}s\uFF08${Z(n.startMs,t.format)} \u2192 ${Z(n.endMs,t.format)}\uFF09\u2026` : `\u6B63\u5728\u91CD\u8F6C\u5199\u4E3A\u539F\u6587 ${n.durationSec}s\uFF08${Z(n.startMs,t.format)} \u2192 ${Z(n.endMs,t.format)}\uFF09\u2026`
        })
    }

    function oo() {
        Nn();
        let videoDurationMs = t.timeline.durationMs;
        if (e.video && Number.isFinite(e.video.duration) && e.video.duration > 0) {
            videoDurationMs = Math.round(e.video.duration * 1e3);
        }
        return retranscribeRangePlan
            ? retranscribeRangePlan.planFullMediaWindow({
                padMs: e.retranscribeDurPadMs?.value,
                videoDurationMs,
                cueEndMsList: t.cues.map((a) => I(a)),
            })
            : { startMs: 0, endMs: Math.max(videoDurationMs || 0, 200), durationSec: 0, padMs: 350 }
    }

    async function lo() {
        if (x(), !t.videoPath) {
            Oe();
            return
        }
        const n = oo();
        if (n.endMs - n.startMs < 200) {
            d("\u65E0\u6CD5\u786E\u5B9A\u6574\u6BB5\u65F6\u957F\uFF0C\u8BF7\u5148\u52A0\u8F7D\u89C6\u9891", "err");
            return
        }
        const r = z.collectOverlappingCueIndices(t.cues, n.startMs, n.endMs),
            i = n.durationSec >= 60 ? `${Math.floor(n.durationSec/60)}\u5206${Math.round(n.durationSec%60)}\u79D2` : `${n.durationSec}s`,
            s = dr(),
            a = s === "target" ? "\u8BD1\u6587" : "\u539F\u6587";
        if (!await ie(`\u786E\u5B9A\u5168\u90E8\u91CD\u8F6C\u5199\u4E3A${a}\uFF08\u7EA6 ${i}\uFF09\uFF1F\u5C06\u66FF\u6362\u65F6\u95F4\u7A97\u5185 ${r.length} \u6761\u91CD\u53E0\u5B57\u5E55\uFF0C\u6B64\u64CD\u4F5C\u53EF\u64A4\u9500\u3002`)) return;
        const l = e.retranscribeDurSnapAfter?.checked !== !1,
            c = nt();
        Kr({
            durationSec: c.durationSec,
            padMs: n.padMs,
            startMode: c.startMode,
            snapAfter: l,
            writeAs: s
        }), Ft(), await ut({
            startMs: n.startMs,
            endMs: n.endMs,
            padMs: n.padMs,
            mode: "range",
            writeAs: s,
            snapAfter: l,
            detail: `\u6B63\u5728\u5168\u90E8\u91CD\u8F6C\u5199\u4E3A${a} ${n.durationSec}s\uFF08${Z(n.startMs,t.format)} \u2192 ${Z(n.endMs,t.format)}\uFF09\u2026`
        })
    }

    function mr(n, r, i = {}) {
        if (!r?.length) return;
        $(), t.cues.splice(n, 1, ...r), (typeof i.fixOverlap == "boolean" ? i.fixOverlap : e.splitFixOverlap?.checked !== !1) && At(), t.selectedIndex = n, P(!0), C(), X(n, {
            scroll: !0
        });
        const a = D.summarizeSplitCues(r),
            o = a.cpsMin != null ? ` \xB7 CPS ${a.cpsMin.toFixed(1)}\u2013${a.cpsMax.toFixed(1)}` : "";
        d(`\u5DF2\u5206\u5272\u4E3A ${r.length} \u6761\u5B57\u5E55${o}`, "ok")
    }

    function vn() {
        return document.querySelector('input[name="editorSplitMode"]:checked')?.value || "smart"
    }

    function co(n) {
        if (n.error) return {
            text: n.error,
            isErr: !0
        };
        const r = D.summarizeSplitCues(n.cues);
        if (r.count < 2) return {
            text: "\u65E0\u6CD5\u62C6\u6210\u591A\u6761",
            isErr: !0
        };
        const i = r.cpsMin != null ? ` \xB7 \u9884\u4F30 CPS ${r.cpsMin.toFixed(1)}\u2013${r.cpsMax.toFixed(1)}` : "";
        return {
            text: `\u5C06\u62C6\u6210 ${r.count} \u6761${i}`,
            isErr: !1
        }
    }

    function $e() {
        const n = vn();
        if (e.splitCharCount && (e.splitCharCount.disabled = n !== "chars"), e.splitCount && (e.splitCount.disabled = n !== "count"), document.querySelectorAll(".split-smart-extra input").forEach(a => {
                a.disabled = n !== "smart"
            }), document.querySelectorAll(".split-silence-extra input").forEach(a => {
                a.disabled = n !== "silence"
            }), e.splitUseCps && (e.splitUseCps.disabled = n === "silence" || n === "playhead" || n === "count"), t.selectedIndex < 0) {
            e.splitPreview && (e.splitPreview.textContent = "\u2014", e.splitPreview.classList.remove("err"));
            return
        }
        x();
        const r = t.cues[t.selectedIndex],
            i = I(r);
        let s = "";
        if (e.splitHint) {
            if (n === "cursor" && e.detailText) {
                const a = e.detailText.selectionStart,
                    o = r.text || "";
                (a <= 0 || a >= o.length) && (s = "\u63D0\u793A\uFF1A\u5728\u6587\u672C\u6846\u4E2D\u5C06\u5149\u6807\u7F6E\u4E8E\u8981\u5206\u5272\u7684\u4F4D\u7F6E")
            } else if (n === "playhead" && e.video) {
                const a = De();
                (a <= r.startMs || a >= i) && (s = "\u63D0\u793A\uFF1A\u64AD\u653E\u5934\u9700\u4F4D\u4E8E\u5F53\u524D\u5B57\u5E55\u7684\u8D77\u6B62\u65F6\u95F4\u4E4B\u95F4")
            } else if (n === "lines" && !String(r.text || "").includes(`
`)) s = "\u63D0\u793A\uFF1A\u5F53\u524D\u6587\u672C\u65E0\u6362\u884C\uFF0C\u5EFA\u8BAE\u9009\u62E9\u5176\u4ED6\u65B9\u5F0F";
            else if (n === "spaces" && !/\s/.test(String(r.text || ""))) s = "\u63D0\u793A\uFF1A\u5F53\u524D\u6587\u672C\u65E0\u7A7A\u683C\uFF0C\u5EFA\u8BAE\u9009\u62E9\u5176\u4ED6\u65B9\u5F0F";
            else if (n === "smart") {
                const a = Ye("smart", r, {
                    ...lr(),
                    fixOverlap: !1
                });
                a.error && (s = a.error)
            } else if (n === "silence")
                if (!t.videoPath) s = "\u63D0\u793A\uFF1A\u8BF7\u5148\u70B9\u51FB\u9876\u680F\u300C\u5173\u8054\u89C6\u9891\u300D";
                else if (!p?.ffmpegDetectSilence) s = "\u63D0\u793A\uFF1A\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u9759\u97F3\u5206\u6790";
            else {
                const a = yn("silence", r.text || "");
                a && (s = a)
            }
            s ? (e.splitHint.textContent = s, e.splitHint.classList.remove("hidden")) : (e.splitHint.textContent = "", e.splitHint.classList.add("hidden"))
        }
        if (e.splitPreview && t.selectedIndex >= 0)
            if (n === "silence")
                if (!t.videoPath) e.splitPreview.textContent = "\u9700\u5173\u8054\u89C6\u9891\u540E\u624D\u80FD\u6309\u9759\u97F3\u5207\u5206", e.splitPreview.classList.add("err");
                else {
                    const a = yn("silence", r.text || "");
                    a ? (e.splitPreview.textContent = a, e.splitPreview.classList.add("err")) : (e.splitPreview.textContent = "\u6267\u884C\u65F6\u5C06\u5206\u6790\u8BE5\u65F6\u95F4\u6BB5\u5185\u7684\u9759\u97F3\u70B9\uFF0C\u5E76\u7ED3\u5408\u7A7A\u683C/\u65AD\u53E5\u8BCD/\u6807\u70B9\u5206\u914D\u6587\u672C", e.splitPreview.classList.remove("err"))
                }
        else {
            const a = Ye(n, r, lr()),
                o = co(a);
            e.splitPreview.textContent = o.text, e.splitPreview.classList.toggle("err", o.isErr)
        }
    }

    function Os() {
        if (t.selectedIndex < 0) return;
        x();
        const n = t.cues[t.selectedIndex];
        if (!String(n.text || "").trim()) {
            d("\u5F53\u524D\u5B57\u5E55\u65E0\u6587\u672C\uFF0C\u65E0\u6CD5\u5206\u5272", "err");
            return
        }
        e.splitModal && (fl(), Q(e.splitModal, e.splitConfirm), $e())
    }

    function Rt() {
        K(e.splitModal)
    }
    async function uo() {
        if (t.selectedIndex < 0) return;
        x();
        const n = t.selectedIndex,
            r = t.cues[n],
            i = vn(),
            s = {
                ...lr(),
                charCount: Number(e.splitCharCount?.value) || 20,
                count: Number(e.splitCount?.value) || 2
            };
        if (i === "silence") {
            try {
                const o = await ir(s);
                if (!o?.ok) {
                    e.splitHint && o?.error && (e.splitHint.textContent = o.error, e.splitHint.classList.remove("hidden"));
                    return
                }
                Vr(), Rt()
            } finally {
                e.splitConfirm && (e.splitConfirm.disabled = !1)
            }
            return
        }
        const a = Ye(i, r, s);
        if (a.error) {
            e.splitHint ? (e.splitHint.textContent = a.error, e.splitHint.classList.remove("hidden")) : d(a.error, "err");
            return
        }
        Vr(), Rt(), mr(n, a.cues, s)
    }
    async function fr() {
        x();
        const n = String(e.findInput?.value ?? ""),
            r = t._findToken = (t._findToken || 0) + 1;
        if (!n) return t.find.active = !1, t.find.matches = [], t.find.currentIndex = -1, r;
        t.find.active = !0;
        const i = !!e.findCase?.checked,
            s = T.TransubFindReplace;
        let a = [];
        if (Yt?.collectFindMatchesAsync) a = await Yt.collectFindMatchesAsync(t.cues, n, i, {
            abortId: r,
            isAborted: () => r !== t._findToken
        });
        else if (s?.collectFindMatches) a = s.collectFindMatches(t.cues, n, i);
        else {
            const o = Kn(n, i);
            t.cues.forEach((l, c) => {
                const u = l.text ?? "";
                let m;
                for (;
                    (m = o.exec(u)) !== null;) a.push({
                    cueIdx: c,
                    start: m.index,
                    end: m.index + m[0].length
                }), m[0].length === 0 && (o.lastIndex += 1)
            })
        }
        return r !== t._findToken || (t.find.matches = a, a.length ? (t.find.currentIndex < 0 || t.find.currentIndex >= a.length) && (t.find.currentIndex = 0) : t.find.currentIndex = -1), r
    }

    function be(n) {
        if (!e.findStatus) return;
        if (n) {
            e.findStatus.textContent = n, e.findStatus.classList.toggle("err", n.includes("\u672A\u627E\u5230") || n.includes("\u8BF7\u8F93\u5165"));
            return
        }
        const r = t.find.matches.length;
        if (!String(e.findInput?.value ?? "").trim()) {
            e.findStatus.textContent = "\u2014", e.findStatus.classList.remove("err");
            return
        }
        if (!r) {
            e.findStatus.textContent = "\u672A\u627E\u5230\u5339\u914D\u9879", e.findStatus.classList.add("err");
            return
        }
        e.findStatus.textContent = `\u7B2C ${t.find.currentIndex+1} / ${r} \u5904 \xB7 \u6D89\u53CA ${new Set(t.find.matches.map(i=>i.cueIdx)).size} \u6761\u5B57\u5E55`, e.findStatus.classList.remove("err")
    }

    function Sn(n) {
        if (!t.find.matches.length) return;
        const r = t.find.matches.length,
            i = (n % r + r) % r;
        t.find.currentIndex = i;
        const s = t.find.matches[i];
        X(s.cueIdx, {
            scroll: !0
        }), requestAnimationFrame(() => {
            e.detailText && (e.detailText.focus(), e.detailText.setSelectionRange(s.start, s.end))
        }), ve(), be()
    }
    async function Nt(n = {}) {
        const r = String(e.findInput?.value ?? "").trim();
        if (!r) return t._findToken = (t._findToken || 0) + 1, t.find.active = !1, t.find.matches = [], t.find.currentIndex = -1, t.listFilter === "find" ? C() : ve(), be("\u8BF7\u8F93\u5165\u8981\u67E5\u627E\u7684\u5185\u5BB9"), !1;
        const i = t.find._lastQuery,
            s = t.find._lastCase,
            a = !!e.findCase?.checked;
        return await fr() !== t._findToken ? !1 : (t.find._lastQuery = r, t.find._lastCase = a, t.find.matches.length ? (n.keepIndex && i === r && s === a && t.find.currentIndex >= 0 || (n.startIndex != null ? t.find.currentIndex = Math.max(0, Math.min(n.startIndex, t.find.matches.length - 1)) : t.find.currentIndex = 0), t.listFilter === "find" && C(), n.navigate !== !1 ? Sn(t.find.currentIndex) : (ve(), be()), !0) : (t.listFilter === "find" ? C() : ve(), be("\u672A\u627E\u5230\u5339\u914D\u9879"), !1))
    }

    function _s(n = {}) {
        t._findDebounceTimer && clearTimeout(t._findDebounceTimer), t._findDebounceTimer = setTimeout(() => {
            t._findDebounceTimer = null, Nt(n)
        }, 200)
    }
    async function js() {
        if (!String(e.findInput?.value ?? "").trim()) {
            be("\u8BF7\u8F93\u5165\u8981\u67E5\u627E\u7684\u5185\u5BB9");
            return
        }!t.find.matches.length && !await Nt({
            navigate: !1
        }) || Sn(t.find.currentIndex + 1)
    }
    async function Gs() {
        if (!String(e.findInput?.value ?? "").trim()) {
            be("\u8BF7\u8F93\u5165\u8981\u67E5\u627E\u7684\u5185\u5BB9");
            return
        }!t.find.matches.length && !await Nt({
            navigate: !1
        }) || Sn(t.find.currentIndex - 1)
    }
    async function Ks() {
        if (!t.find.matches.length && (!await Nt() || !t.find.matches.length)) return;
        const n = t.find.matches[t.find.currentIndex];
        if (!n) return;
        x(), $();
        const r = t.cues[n.cueIdx],
            i = r.text ?? "",
            s = e.replaceInput?.value ?? "";
        r.text = i.slice(0, n.start) + s + i.slice(n.end), P(!0), Se(n.cueIdx), t.selectedIndex === n.cueIdx && e.detailText && (e.detailText.value = r.text);
        const a = t.find.currentIndex;
        await fr(), t.find.matches.length ? Sn(Math.min(a, t.find.matches.length - 1)) : (ve(), be("\u5DF2\u6210\u529F\u66FF\u6362 1 \u5904")), d("\u5DF2\u6210\u529F\u66FF\u6362 1 \u5904", "ok")
    }
    async function mo() {
        const n = String(e.findInput?.value ?? "").trim();
        if (!n) {
            be("\u8BF7\u8F93\u5165\u8981\u67E5\u627E\u7684\u5185\u5BB9");
            return
        }
        x(), $();
        const r = !!e.findCase?.checked,
            i = Kn(n, r),
            s = e.replaceInput?.value ?? "";
        let a = 0;
        for (const l of t.cues) {
            const c = l.text ?? "",
                u = c.replace(i, () => (a += 1, s));
            u !== c && (l.text = u)
        }
        if (!a) {
            be("\u672A\u627E\u5230\u5339\u914D\u9879");
            return
        }
        P(!0), C(), await fr(), t.find.currentIndex = t.find.matches.length ? 0 : -1, t.listFilter === "find" ? C() : ve();
        const o = `\u5DF2\u6210\u529F\u66FF\u6362 ${a} \u5904`;
        be(o), d(o, "ok")
    }

    function qt(n = !1) {
        if (e.findReplaceModal) {
            Q(e.findReplaceModal, n ? e.replaceInput : e.findInput);
            const r = e.detailText && document.activeElement === e.detailText && e.detailText.selectionStart !== e.detailText.selectionEnd ? e.detailText.value.slice(e.detailText.selectionStart, e.detailText.selectionEnd) : "";
            r && e.findInput && !e.findInput.value && (e.findInput.value = r), requestAnimationFrame(() => {
                const i = n ? e.replaceInput : e.findInput;
                i?.focus(), i?.select?.()
            }), String(e.findInput?.value ?? "").trim() ? Nt({
                navigate: !1
            }) : be()
        }
    }

    function mt() {
        K(e.findReplaceModal), t.find.active = !1, t.find.matches = [], t.find.currentIndex = -1, ve()
    }

    function Vs() {
        return document.querySelector('input[name="editorBatchDurMode"]:checked')?.value || "fixed"
    }

    function zs() {
        return document.querySelector('input[name="editorBatchDurCond"]:checked')?.value || "all"
    }

    function Us() {
        const n = zs();
        return {
            mode: Vs(),
            condition: n,
            targetSec: Number(e.batchDurTarget?.value) || 2,
            silenceDb: Number(e.batchDurSilenceDb?.value) || -35,
            silenceDur: Number(e.batchDurSilenceDur?.value) || .25,
            snapPadMs: Math.max(0, Math.min(2e3, Math.round(Number(e.batchDurSnapPadMs?.value) || 400))),
            shorterSec: Number(e.batchDurShorter?.value) || 1,
            longerSec: Number(e.batchDurLonger?.value) || 5,
            minSec: Number(e.batchDurMin?.value) || .5,
            maxSec: Number(e.batchDurMax?.value) || 10,
            cpsAbove: Number(e.batchDurCpsAbove?.value) || 20,
            cpsBelow: Number(e.batchDurCpsBelow?.value) || 8,
            textKeyword: String(e.batchDurText?.value ?? "").trim(),
            avoidOverlap: !!e.batchDurAvoidOverlap?.checked
        }
    }

    function bn(n) {
        const r = V(n) / 1e3;
        if (r <= 0) return null;
        const i = qe(n.text);
        return i ? i / r : null
    }

    function fo(n) {
        const r = t.cues[n];
        if (!r) return !1;
        const i = n > 0 ? t.cues[n - 1] : null,
            s = n < t.cues.length - 1 ? t.cues[n + 1] : null,
            a = I(r);
        return !!(i && r.startMs < I(i) || s && a > s.startMs)
    }

    function po(n, r, i) {
        return audioSnapDurationPlan
            ? audioSnapDurationPlan.cueMatchesBatchDurCondition(n, r, i, {
                getCueDurMs: V,
                getCps: bn,
                hasOverlap: fo,
                selectedIndexes: J(),
                selectedIndex: t.selectedIndex
            })
            : !1
    }

    function Qs(n, r, i, s = !0) {
        return audioSnapDurationPlan
            ? audioSnapDurationPlan.clampEndMsAvoidOverlap(n, r, i, t.cues, {
                gapMs: 1,
                minDurMs: 500,
                allowNextClamp: s !== !1
            })
            : Math.max(n.startMs + 500, Math.round(Number(i) || 0))
    }

    async function go(n, r = {}) {
        const i = t.cues[n];
        if (!i || !Dt(i)) return {
            status: "skipped",
            reason: "\u65F6\u957F\u8FC7\u77ED"
        };
        const s = await Ts(i, {
            ...r,
            cueIndex: n
        });
        if (s.cancelled || ne()) return {
            status: "skipped",
            cancelled: !0,
            reason: "\u5DF2\u53D6\u6D88"
        };
        if (s.error) return {
            status: s.unchanged ? "unchanged" : "skipped",
            reason: s.error
        };
        const a = Qs(i, n, s.newEndMs, r.avoidOverlap),
            o = I(i),
            l = a - o;
        return Math.abs(l) < 80 ? {
            status: "unchanged"
        } : (i.endMs = a, {
            status: "adjusted",
            deltaMs: l,
            savedMs: o - a,
            extendedMs: l > 0 ? l : 0
        })
    }
    async function Zs(n, r = {}) {
        const i = t.cues[n];
        if (!i || !Tt(i)) return {
            status: "skipped",
            reason: "\u65F6\u957F\u8FC7\u77ED"
        };
        const s = await $s(i, n, r);
        return s.cancelled || ne() ? {
            status: "skipped",
            cancelled: !0,
            reason: "\u5DF2\u53D6\u6D88"
        } : s.error ? {
            status: s.unchanged ? "unchanged" : "skipped",
            reason: s.error
        } : (i.startMs = s.startMs, i.endMs = s.endMs, {
            status: "adjusted",
            startDelta: s.startDelta || 0,
            endDelta: s.endDelta || 0
        })
    }

    function ft(n) {
        x();
        const r = [];
        return t.cues.forEach((i, s) => {
            po(i, s, n) && (n.mode === "silence" && !Dt(i) || n.mode === "audio_snap" && !Tt(i) || r.push(s))
        }), r
    }

    function ae() {
        const n = zs(),
            r = Vs(),
            i = r === "silence",
            s = r === "audio_snap",
            a = i || s;
        if (e.batchDurHint && (s ? e.batchDurHint.textContent = "\u6309\u6761\u4EF6\u7B5B\u9009\u540E\uFF0C\u5C06\u8D77\u6B62\u65F6\u95F4\u8D34\u5230\u8BED\u97F3\u8FB9\u754C\uFF08\u4FDD\u7559\u539F\u6587\uFF09\u3002" : i ? e.batchDurHint.textContent = "\u6309\u6761\u4EF6\u7B5B\u9009\u540E\uFF0C\u6309\u5B9E\u9645\u8BED\u97F3\u8FB9\u754C\u7F29\u77ED\u6216\u5EF6\u957F\u7ED3\u675F\u65F6\u95F4\uFF08\u4FDD\u6301\u8D77\u59CB\u4E0D\u53D8\uFF09\u3002" : e.batchDurHint.textContent = "\u6309\u6761\u4EF6\u7B5B\u9009\u5B57\u5E55\u540E\u6279\u91CF\u8C03\u6574\u7ED3\u675F\u65F6\u95F4\uFF08\u4FDD\u6301\u8D77\u59CB\u65F6\u95F4\u4E0D\u53D8\uFF09\u3002"), e.batchDurFixedWrap && e.batchDurFixedWrap.classList.toggle("hidden", a), e.batchDurSilenceWrap && e.batchDurSilenceWrap.classList.toggle("hidden", !a), e.batchDurSnapPadWrap && e.batchDurSnapPadWrap.classList.toggle("hidden", !s), e.batchDurAvoidOverlapRow && e.batchDurAvoidOverlapRow.classList.toggle("hidden", s), e.batchDurTarget && (e.batchDurTarget.disabled = a), e.batchDurSilenceDb && (e.batchDurSilenceDb.disabled = !a), e.batchDurSilenceDur && (e.batchDurSilenceDur.disabled = !a), e.batchDurSnapPadMs && (e.batchDurSnapPadMs.disabled = !s), e.batchDurShorter && (e.batchDurShorter.disabled = n !== "shorter"), e.batchDurLonger && (e.batchDurLonger.disabled = n !== "longer"), e.batchDurMin && (e.batchDurMin.disabled = n !== "between"), e.batchDurMax && (e.batchDurMax.disabled = n !== "between"), e.batchDurCpsAbove && (e.batchDurCpsAbove.disabled = n !== "cps_above"), e.batchDurCpsBelow && (e.batchDurCpsBelow.disabled = n !== "cps_below"), e.batchDurText && (e.batchDurText.disabled = n !== "text_contains"), !e.batchDurPreview) return;
        const o = Us();
        if (o.mode === "silence" || o.mode === "audio_snap") {
            if (!t.videoPath || !p?.ffmpegDetectSilence) {
                e.batchDurPreview.textContent = o.mode === "audio_snap" ? "\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u4F7F\u7528\u6309\u97F3\u9891\u8D34\u8FB9" : "\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u4F7F\u7528\u6309\u9759\u97F3\u667A\u80FD\u65F6\u957F", e.batchDurPreview.classList.add("err");
                return
            }
            if (o.condition === "text_contains" && !o.textKeyword) {
                e.batchDurPreview.textContent = "\u8BF7\u8F93\u5165\u6587\u672C\u5173\u952E\u8BCD", e.batchDurPreview.classList.add("err");
                return
            }
            if (o.condition === "selected" && t.selectedIndex < 0) {
                e.batchDurPreview.textContent = "\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u7684\u5B57\u5E55\u6761\u76EE", e.batchDurPreview.classList.add("err");
                return
            }
            const c = ft(o);
            if (!c.length) {
                e.batchDurPreview.textContent = "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5B57\u5E55", e.batchDurPreview.classList.add("err");
                return
            }
            e.batchDurPreview.textContent = o.mode === "audio_snap" ? `\u5C06\u5BF9 ${c.length} \u6761\u5B57\u5E55\u9010\u6761\u5206\u6790\u9759\u97F3\u5E76\u8D34\u8FB9\u8D77\u6B62\uFF08\u6267\u884C\u65F6\u5C06\u663E\u793A\u8FDB\u5EA6\uFF09` : `\u5C06\u5BF9 ${c.length} \u6761\u5B57\u5E55\u9010\u6761\u5206\u6790\u9759\u97F3\u5E76\u7F29\u77ED/\u5EF6\u957F\u65F6\u957F\uFF08\u6267\u884C\u65F6\u5C06\u663E\u793A\u8FDB\u5EA6\uFF09`, e.batchDurPreview.classList.remove("err");
            return
        }
        if (o.targetSec <= 0 || !Number.isFinite(o.targetSec)) {
            e.batchDurPreview.textContent = "\u8BF7\u8F93\u5165\u6709\u6548\u7684\u76EE\u6807\u65F6\u957F", e.batchDurPreview.classList.add("err");
            return
        }
        if (o.condition === "text_contains" && !o.textKeyword) {
            e.batchDurPreview.textContent = "\u8BF7\u8F93\u5165\u6587\u672C\u5173\u952E\u8BCD", e.batchDurPreview.classList.add("err");
            return
        }
        if (o.condition === "selected" && t.selectedIndex < 0) {
            e.batchDurPreview.textContent = "\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u7684\u5B57\u5E55\u6761\u76EE", e.batchDurPreview.classList.add("err");
            return
        }
        const l = ft(o);
        if (!l.length) {
            e.batchDurPreview.textContent = "\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u5B57\u5E55", e.batchDurPreview.classList.add("err");
            return
        }
        e.batchDurPreview.textContent = `\u5C06\u8C03\u6574 ${l.length} \u6761\u5B57\u5E55\u4E3A ${o.targetSec.toFixed(2)} \u79D2`, e.batchDurPreview.classList.remove("err")
    }

    function ho() {
        const n = Ke();
        e.batchDurSilenceDb && (e.batchDurSilenceDb.value = String(n.silenceDb)), e.batchDurSilenceDur && (e.batchDurSilenceDur.value = String(n.silenceDur))
    }

    function pr() {
        e.batchDurModal && (x(), ho(), Q(e.batchDurModal, e.batchDurTarget), ae())
    }

    function yo() {
        if (!t.videoPath || !p?.ffmpegDetectSilence) {
            d("\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u4F7F\u7528\u6309\u97F3\u9891\u8D34\u8FB9", "err");
            return
        }
        const n = document.querySelector('input[name="editorBatchDurMode"][value="audio_snap"]');
        n && (n.checked = !0), pr()
    }

    function _e() {
        K(e.batchDurModal)
    }

    function vo() {
        const n = Us();
        if (n.mode === "silence") {
            Xs(n);
            return
        }
        if (n.mode === "audio_snap") {
            Ys(n);
            return
        }
        if (n.targetSec <= 0 || !Number.isFinite(n.targetSec)) {
            ae();
            return
        }
        if (n.condition === "text_contains" && !n.textKeyword) {
            ae();
            return
        }
        const r = ft(n);
        if (!r.length) {
            ae();
            return
        }
        $();
        const i = Math.round(n.targetSec * 1e3);
        let s = 0;
        for (const a of r) {
            const o = t.cues[a];
            let l = o.startMs + i;
            n.avoidOverlap && a < t.cues.length - 1 && (l = Math.min(l, t.cues[a + 1].startMs - 1)), l = Math.max(o.startMs + 100, l), l !== I(o) && (s += 1), o.endMs = l
        }
        P(!0), C(), t.selectedIndex >= 0 && R(), _e(), d(`\u5DF2\u6279\u91CF\u8C03\u6574 ${s||r.length} \u6761\u5B57\u5E55\u65F6\u957F\u4E3A ${n.targetSec.toFixed(2)} \u79D2`, "ok")
    }
    async function Xs(n) {
        if (t.silenceSplitBusy) return;
        if (!t.videoPath || !p?.ffmpegDetectSilence) {
            ae();
            return
        }
        if (n.condition === "text_contains" && !n.textKeyword) {
            ae();
            return
        }
        const r = ft(n);
        if (!r.length) {
            ae();
            return
        }
        const i = {
                silenceDb: n.silenceDb,
                silenceDur: n.silenceDur,
                avoidOverlap: n.avoidOverlap
            },
            s = r.length;
        $();
        let a = 0,
            o = 0,
            l = 0;
        Te(!0), Ee({
            title: "\u6B63\u5728\u6279\u91CF\u8C03\u8282\u65F6\u957F",
            detail: `\u51C6\u5907\u5206\u6790 ${s} \u6761\u5B57\u5E55\u7684\u5B9E\u9645\u8BED\u97F3\u65F6\u957F\u2026`,
            current: 0,
            total: s,
            statusMessage: `\u6B63\u5728\u6279\u91CF\u5206\u6790\u9759\u97F3\uFF080/${s}\uFF09\u2026`
        }), await ce();
        let c = !1;
        try {
            for (let f = 0; f < r.length; f += 1) {
                if (ne()) {
                    c = !0;
                    break
                }
                const g = r[f];
                de({
                    current: f,
                    total: s,
                    detail: `\u6B63\u5728\u5206\u6790\u7B2C ${f+1}/${s} \u6761\uFF08\u539F\u5E8F\u53F7 ${g+1}\uFF09\u2026`,
                    statusMessage: `\u6B63\u5728\u5206\u6790\u9759\u97F3 ${f+1}/${s}\u2026`
                }), await ce();
                const h = await go(g, i);
                if (ne() || h?.cancelled) {
                    c = !0;
                    break
                }
                h.status === "adjusted" ? (a += 1, Se(g)) : h.status === "unchanged" ? l += 1 : o += 1;
                let v = `\u7B2C ${f+1}/${s} \u6761${h.status==="unchanged"?"\u65E0\u9700\u8C03\u6574":"\u5DF2\u8DF3\u8FC7"}`;
                if (h.status === "adjusted") {
                    const y = Number(h.deltaMs) || -Number(h.savedMs) || 0,
                        k = y < 0 ? "\u7F29\u77ED" : "\u5EF6\u957F";
                    v = `\u7B2C ${f+1}/${s} \u6761\u5DF2${k} ${(Math.abs(y)/1e3).toFixed(2)} \u79D2`
                }
                de({
                    current: f + 1,
                    total: s,
                    detail: v,
                    statusMessage: `\u6B63\u5728\u5206\u6790\u9759\u97F3 ${f+1}/${s}\u2026`
                })
            }
        } finally {
            Te(!1), Ie()
        }
        if (c) {
            a && (P(!0), C(), t.selectedIndex >= 0 && R()), _e(), d(`\u5DF2\u53D6\u6D88\u6279\u91CF\u8C03\u8282\uFF08\u5DF2\u5904\u7406 ${a} \u6761\uFF09`, "warn");
            return
        }
        if (!a) {
            ae();
            const f = o ? `\uFF0C\u8DF3\u8FC7 ${o} \u6761` : "",
                g = l ? `\uFF0C${l} \u6761\u5DF2\u63A5\u8FD1\u5B9E\u9645\u8BED\u97F3` : "";
            d(`\u5DF2\u5206\u6790 ${s} \u6761\uFF0C\u5747\u65E0\u9700\u8C03\u6574\u65F6\u957F${g}${f}`, "err"), ye();
            return
        }
        P(!0), C(), t.selectedIndex >= 0 && R(), _e();
        const u = o ? `\uFF0C\u8DF3\u8FC7 ${o} \u6761` : "",
            m = l ? `\uFF0C${l} \u6761\u65E0\u9700\u8C03\u6574` : "";
        d(`\u5DF2\u6309\u9759\u97F3\u6279\u91CF\u8C03\u8282 ${a} \u6761\u5B57\u5E55\u65F6\u957F${m}${u}`, "ok")
    }
    async function Ys(n) {
        if (t.silenceSplitBusy || t.retranscribeBusy) return;
        if (!t.videoPath || !p?.ffmpegDetectSilence) {
            ae();
            return
        }
        if (n.condition === "text_contains" && !n.textKeyword) {
            ae();
            return
        }
        const r = ft(n);
        if (!r.length) {
            ae();
            return
        }
        const i = {
                silenceDb: n.silenceDb,
                silenceDur: n.silenceDur,
                padMs: n.snapPadMs ?? 400,
                allowExtend: !0
            },
            s = r.length;
        $();
        let a = 0,
            o = 0,
            l = 0;
        Te(!0), Ee({
            title: "\u6B63\u5728\u6279\u91CF\u6309\u97F3\u9891\u8D34\u8FB9",
            detail: `\u51C6\u5907\u5206\u6790 ${s} \u6761\u5B57\u5E55\u7684\u8BED\u97F3\u8FB9\u754C\u2026`,
            current: 0,
            total: s,
            statusMessage: `\u6B63\u5728\u6279\u91CF\u8D34\u8FB9\uFF080/${s}\uFF09\u2026`
        }), e.silenceProgressHint && (e.silenceProgressHint.textContent = "\u6839\u636E\u9759\u97F3\u68C0\u6D4B\u5C06\u5B57\u5E55\u8D77\u6B62\u8D34\u5230\u8BED\u97F3\u8FB9\u754C\uFF0C\u6587\u672C\u4FDD\u6301\u4E0D\u53D8"), await ce();
        let c = !1;
        try {
            for (let f = 0; f < r.length; f += 1) {
                if (ne()) {
                    c = !0;
                    break
                }
                const g = r[f];
                de({
                    current: f,
                    total: s,
                    detail: `\u6B63\u5728\u8D34\u8FB9\u7B2C ${f+1}/${s} \u6761\uFF08\u539F\u5E8F\u53F7 ${g+1}\uFF09\u2026`,
                    statusMessage: `\u6B63\u5728\u8D34\u8FB9 ${f+1}/${s}\u2026`
                }), await ce();
                const h = await Zs(g, i);
                if (ne() || h?.cancelled) {
                    c = !0;
                    break
                }
                h.status === "adjusted" ? (a += 1, Se(g)) : h.status === "unchanged" ? l += 1 : o += 1, de({
                    current: f + 1,
                    total: s,
                    detail: h.status === "adjusted" ? `\u7B2C ${f+1}/${s} \u6761\u5DF2\u8D34\u8FB9` : `\u7B2C ${f+1}/${s} \u6761${h.status==="unchanged"?"\u65E0\u9700\u8C03\u6574":"\u5DF2\u8DF3\u8FC7"}`,
                    statusMessage: `\u6B63\u5728\u8D34\u8FB9 ${f+1}/${s}\u2026`
                })
            }
        } finally {
            Te(!1), Ie(), e.silenceProgressHint && (e.silenceProgressHint.textContent = "FFmpeg \u6B63\u5728\u5206\u6790\u5173\u8054\u89C6\u9891\u7684\u97F3\u9891\u9759\u97F3\u70B9\uFF0C\u8BF7\u52FF\u5173\u95ED\u7A97\u53E3")
        }
        if (c) {
            a && (P(!0), C(), t.selectedIndex >= 0 && R()), _e(), d(`\u5DF2\u53D6\u6D88\u6279\u91CF\u8D34\u8FB9\uFF08\u5DF2\u5904\u7406 ${a} \u6761\uFF09`, "warn");
            return
        }
        if (!a) {
            ae();
            const f = o ? `\uFF0C\u8DF3\u8FC7 ${o} \u6761` : "",
                g = l ? `\uFF0C${l} \u6761\u5DF2\u8D34\u8FD1\u8BED\u97F3` : "";
            d(`\u5DF2\u5206\u6790 ${s} \u6761\uFF0C\u5747\u672A\u8C03\u6574\u65F6\u95F4\u8F74${g}${f}`, "err"), ye();
            return
        }
        P(!0), C(), t.selectedIndex >= 0 && R(), _e();
        const u = o ? `\uFF0C\u8DF3\u8FC7 ${o} \u6761` : "",
            m = l ? `\uFF0C${l} \u6761\u65E0\u9700\u8C03\u6574` : "";
        d(`\u5DF2\u6309\u97F3\u9891\u8D34\u8FB9 ${a} \u6761\u5B57\u5E55${m}${u}`, "ok"), ye()
    }

    function Js() {
        return document.querySelector('input[name="editorSmartSplitCond"]:checked')?.value || "cps_above"
    }

    function ei() {
        return {
            condition: Js(),
            smartMaxChars: Number(e.smartSplitMaxChars?.value) || 20,
            smartLineChars: Number(e.smartSplitLineChars?.value) || 18,
            cpsAbove: Number(e.smartSplitCpsAbove?.value) || 18,
            lineLen: Number(e.smartSplitLineLen?.value) || 18,
            durLongSec: Number(e.smartSplitDurLong?.value) || 6,
            charsLong: Number(e.smartSplitCharsLong?.value) || 24,
            useCps: e.smartSplitUseCps?.checked !== !1,
            fixOverlap: e.smartSplitFixOverlap?.checked !== !1
        }
    }

    function So(n, r, i) {
        return batchCueFilterPlan
            ? batchCueFilterPlan.cueMatchesSmartSplitCondition(n, r, i, {
                getCps: bn,
                getCueDurMs: V,
                charLen: qe,
                lineLen: es,
                selectedIndex: t.selectedIndex,
            })
            : !1
    }

    function gr(n) {
        x();
        return batchCueFilterPlan
            ? batchCueFilterPlan.collectSmartSplitMatches(t.cues, n, {
                getCps: bn,
                getCueDurMs: V,
                charLen: qe,
                lineLen: es,
                selectedIndex: t.selectedIndex,
            })
            : []
    }

    function bo(n) {
        const r = gr(n);
        return batchCueFilterPlan
            ? batchCueFilterPlan.previewSmartSplitPlan(r, t.cues, n, Ye)
            : { matched: 0, splitCount: 0, added: 0, summary: "没有符合条件的字幕" }
    }

    function Ae() {
        const n = Js();
        if (e.smartSplitCpsAbove && (e.smartSplitCpsAbove.disabled = n !== "cps_above"), e.smartSplitLineLen && (e.smartSplitLineLen.disabled = n !== "line_long"), e.smartSplitDurLong && (e.smartSplitDurLong.disabled = n !== "dur_long"), e.smartSplitCharsLong && (e.smartSplitCharsLong.disabled = n !== "chars_long"), !e.smartSplitPreview) return;
        if (x(), !t.cues.length) {
            e.smartSplitPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.smartSplitPreview.classList.add("err");
            return
        }
        if (n === "selected" && t.selectedIndex < 0) {
            e.smartSplitPreview.textContent = "\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u7684\u5B57\u5E55\u6761\u76EE", e.smartSplitPreview.classList.add("err");
            return
        }
        const r = ei(),
            i = bo(r);
        e.smartSplitPreview.textContent = i.summary, e.smartSplitPreview.classList.toggle("err", i.splitCount === 0)
    }

    function hr() {
        e.smartSplitModal && (x(), Q(e.smartSplitModal, e.smartSplitConfirm), Ae())
    }

    function xn() {
        K(e.smartSplitModal)
    }

    function xo() {
        const n = ei();
        if (n.condition === "selected" && t.selectedIndex < 0) {
            Ae();
            return
        }
        const r = gr(n).sort((o, l) => l - o);
        if (!r.length) {
            Ae();
            return
        }
        const i = {
            smartMaxChars: n.smartMaxChars,
            smartLineChars: n.smartLineChars,
            useCps: n.useCps,
            fixOverlap: !1
        };
        $();
        let s = 0,
            a = 0;
        for (const o of r) {
            const l = Ye("smart", t.cues[o], i);
            !l.cues || l.cues.length < 2 || (t.cues.splice(o, 1, ...l.cues), s += 1, a += l.cues.length - 1)
        }
        if (!s) {
            Ae();
            return
        }
        n.fixOverlap && At(), P(!0), C(), t.selectedIndex >= 0 && R(), xn(), d(`\u5DF2\u667A\u80FD\u5206\u5272 ${s} \u6761\u5B57\u5E55\uFF0C\u65B0\u589E ${a} \u6761`, "ok")
    }

    function ti() {
        return document.querySelector('input[name="editorSilenceSplitCond"]:checked')?.value || "all"
    }

    function ni() {
        return {
            condition: ti(),
            silenceDb: Number(e.silenceSplitDb?.value) || -35,
            silenceDur: Number(e.silenceSplitDur?.value) || .25,
            durLongSec: Number(e.silenceSplitDurLong?.value) || 3,
            cpsAbove: Number(e.silenceSplitCpsAbove?.value) || 18,
            charsLong: Number(e.silenceSplitCharsLong?.value) || 16,
            fixOverlap: e.silenceSplitFixOverlap?.checked !== !1
        }
    }

    function Mo(n, r, i) {
        return batchCueFilterPlan
            ? batchCueFilterPlan.cueMatchesSilenceSplitCondition(n, r, i, {
                canSilenceSplitCue: $t,
                getCps: bn,
                getCueDurMs: V,
                charLen: qe,
                selectedIndex: t.selectedIndex,
            })
            : !1
    }

    function yr(n) {
        x();
        return batchCueFilterPlan
            ? batchCueFilterPlan.collectSilenceSplitMatches(t.cues, n, {
                canSilenceSplitCue: $t,
                getCps: bn,
                getCueDurMs: V,
                charLen: qe,
                selectedIndex: t.selectedIndex,
            })
            : []
    }

    function ri(n) {
        const r = yr(n);
        return batchCueFilterPlan
            ? batchCueFilterPlan.previewSilenceSplitPlan({
                matchedIndexes: r,
                hasVideo: !!t.videoPath,
                hasFfmpegDetectSilence: !!p?.ffmpegDetectSilence,
                condition: n,
                selectedIndex: t.selectedIndex,
            })
            : { matched: 0, summary: "请先关联视频", isErr: !0 }
    }

    function Bo() {
        const n = Ke();
        e.silenceSplitDb && (e.silenceSplitDb.value = String(n.silenceDb)), e.silenceSplitDur && (e.silenceSplitDur.value = String(n.silenceDur)), e.silenceSplitFixOverlap && (e.silenceSplitFixOverlap.checked = n.fixOverlap)
    }

    function Je() {
        const n = ti();
        if (e.silenceSplitDurLong && (e.silenceSplitDurLong.disabled = n !== "dur_long"), e.silenceSplitCpsAbove && (e.silenceSplitCpsAbove.disabled = n !== "cps_above"), e.silenceSplitCharsLong && (e.silenceSplitCharsLong.disabled = n !== "chars_long"), !e.silenceSplitPreview) return;
        if (x(), !t.cues.length) {
            e.silenceSplitPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.silenceSplitPreview.classList.add("err");
            return
        }
        const r = ni(),
            i = ri(r);
        e.silenceSplitPreview.textContent = i.summary, e.silenceSplitPreview.classList.toggle("err", !!i.isErr)
    }

    function vr(n) {
        if (e.silenceSplitModal) {
            if (x(), Bo(), n) {
                const r = document.querySelector(`input[name="editorSilenceSplitCond"][value="${n}"]`);
                r && (r.checked = !0)
            }
            Q(e.silenceSplitModal, e.silenceSplitConfirm), Je()
        }
    }

    function Wt() {
        K(e.silenceSplitModal)
    }
    async function si() {
        if (t.silenceSplitBusy) return;
        const n = ni(),
            r = ri(n);
        if (r.isErr || !r.matched) {
            Je();
            return
        }
        const i = yr(n).sort((f, g) => g - f),
            s = {
                silenceDb: n.silenceDb,
                silenceDur: n.silenceDur,
                fixOverlap: !1
            };
        $();
        let a = 0,
            o = 0,
            l = 0;
        const c = i.length;
        Ee({
            title: "\u6B63\u5728\u6279\u91CF\u5206\u6790\u9759\u97F3",
            detail: `\u51C6\u5907\u5904\u7406 ${c} \u6761\u5B57\u5E55\u2026`,
            current: 0,
            total: c,
            statusMessage: `\u6B63\u5728\u6279\u91CF\u5206\u6790\u9759\u97F3\uFF080/${c}\uFF09\u2026`
        }), await ce();
        let u = !1;
        try {
            for (let f = 0; f < i.length; f += 1) {
                if (ne()) {
                    u = !0;
                    break
                }
                const g = i[f];
                de({
                    current: f,
                    total: c,
                    detail: `\u6B63\u5728\u5206\u6790\u7B2C ${f+1}/${c} \u6761\uFF08\u539F\u5E8F\u53F7 ${g+1}\uFF09\u2026`,
                    statusMessage: `\u6B63\u5728\u5206\u6790\u9759\u97F3 ${f+1}/${c}\u2026`
                }), await ce();
                const h = await Rs(t.cues[g], s);
                if (ne() || h?.cancelled) {
                    u = !0;
                    break
                }
                if (!h.cues || h.cues.length < 2) {
                    l += 1, de({
                        current: f + 1,
                        total: c,
                        detail: `\u7B2C ${f+1}/${c} \u6761\u672A\u68C0\u6D4B\u5230\u53EF\u5206\u5272\u9759\u97F3\uFF0C\u5DF2\u8DF3\u8FC7`
                    });
                    continue
                }
                t.cues.splice(g, 1, ...h.cues), a += 1, o += h.cues.length - 1, de({
                    current: f + 1,
                    total: c,
                    detail: `\u7B2C ${f+1}/${c} \u6761\u5DF2\u5206\u5272\u4E3A ${h.cues.length} \u6761`,
                    statusMessage: `\u6B63\u5728\u5206\u6790\u9759\u97F3 ${f+1}/${c}\u2026`
                })
            }
        } finally {
            Ie()
        }
        if (u) {
            a && (P(!0), C(), t.selectedIndex >= 0 && R()), Wt(), d(`\u5DF2\u53D6\u6D88\u6279\u91CF\u9759\u97F3\u5206\u5272\uFF08\u5DF2\u5206\u5272 ${a} \u6761\uFF09`, "warn");
            return
        }
        if (!a) {
            Je(), d(`\u5DF2\u5206\u6790 ${i.length} \u6761\uFF0C\u5747\u672A\u68C0\u6D4B\u5230\u53EF\u5206\u5272\u7684\u9759\u97F3`, "err");
            return
        }
        n.fixOverlap && (Ee({
            title: "\u6B63\u5728\u6574\u7406\u65F6\u95F4\u8F74",
            detail: "\u5206\u5272\u5B8C\u6210\uFF0C\u6B63\u5728\u4FEE\u590D\u91CD\u53E0\u2026",
            indeterminate: !0,
            statusMessage: "\u6B63\u5728\u4FEE\u590D\u5206\u5272\u540E\u7684\u65F6\u95F4\u91CD\u53E0\u2026"
        }), await ce(), At(), Ie()), P(!0), C(), t.selectedIndex >= 0 && R(), Wt();
        const m = l ? `\uFF0C\u8DF3\u8FC7 ${l} \u6761` : "";
        d(`\u5DF2\u6309\u9759\u97F3\u5206\u5272 ${a} \u6761\u5B57\u5E55\uFF0C\u65B0\u589E ${o} \u6761${m}`, "ok")
    }

    function ii() {
        return {
            fixOverlap: !!e.smartFixOverlap?.checked,
            fixCps: !!e.smartFixCps?.checked,
            enforceMinDur: !!e.smartEnforceMin?.checked,
            enforceMaxDur: !!e.smartEnforceMax?.checked,
            maxCps: Number(e.smartMaxCps?.value) || 18,
            minSec: Number(e.smartMinSec?.value) || .5,
            maxSec: Number(e.smartMaxSec?.value) || 10,
            gapMs: Math.max(0, Math.round(Number(e.smartGapMs?.value) || 1))
        }
    }

    function Ht() {
        const n = ii();
        if (e.smartMaxCps && (e.smartMaxCps.disabled = !n.fixCps), e.smartMinSec && (e.smartMinSec.disabled = !n.enforceMinDur), e.smartMaxSec && (e.smartMaxSec.disabled = !n.enforceMaxDur), !e.smartPreview) return;
        if (x(), !t.cues.length) {
            e.smartPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.smartPreview.classList.add("err");
            return
        }
        if (!n.fixOverlap && !n.fixCps && !n.enforceMinDur && !n.enforceMaxDur) {
            e.smartPreview.textContent = "\u8BF7\u81F3\u5C11\u9009\u62E9\u4E00\u9879\u8C03\u6574\u89C4\u5219", e.smartPreview.classList.add("err");
            return
        }
        const r = ai(n);
        e.smartPreview.textContent = r.summary, e.smartPreview.classList.toggle("err", r.affected === 0)
    }

    function ai(n) {
        const r = Jr(t.cues),
            i = Sr(r, n);
        return batchCueFilterPlan
            ? batchCueFilterPlan.previewSmartAdjustSummary(i)
            : { affected: 0, summary: "当前字幕无需调整" }
    }

    function Sr(n, r) {
        return oe.applySmartAdjustToCues(n, r)
    }

    function br() {
        const n = Ke();
        return {
            maxCps: Number(e.qcMaxCps?.value) || Number(e.smartMaxCps?.value) || 18,
            minSec: Number(e.qcMinSec?.value) || .5,
            maxSec: Number(e.qcMaxSec?.value) || 10,
            gapMs: Math.max(0, Math.round(Number(e.qcGapMs?.value) || 1)),
            smartMaxChars: n.smartMaxChars,
            smartLineChars: n.smartLineChars,
            targetCps: yt()
        }
    }

    function je(n, r = {}) {
        if (!n) {
            t.lastQcResult = null, t.qcIssueIndexes = [], t.qcIssueIndexSet = new Set, e.qcBtn && e.qcBadge && (e.qcBtn.classList.remove("has-issues"), e.qcBadge.textContent = "0", e.qcBtn.title = "\u626B\u63CF\u65F6\u95F4\u8F74 / \u901A\u987A\u5EA6\u95EE\u9898\u5E76\u4E00\u952E\u4FEE\u590D"), H?.refreshContextActionBar?.(), r.updateRows && ve();
            return
        }
        const {
            summary: i
        } = n;
        if (t.lastQcResult = n, t.qcIssueIndexes = (n.issues || []).map(s => Number(s?.index)).filter(s => Number.isInteger(s)), t.qcIssueIndexSet = new Set(t.qcIssueIndexes), e.qcBtn && e.qcBadge) {
            const s = i?.total || 0;
            e.qcBadge.textContent = String(s > 99 ? "99+" : s), e.qcBtn.classList.toggle("has-issues", s > 0), e.qcBtn.title = s > 0 ? `${oe.summarizeScan(i)}\uFF08\u70B9\u51FB\u6253\u5F00\u8D28\u91CF\u68C0\u67E5\uFF09` : "\u626B\u63CF\u65F6\u95F4\u8F74 / \u901A\u987A\u5EA6\u95EE\u9898\u5E76\u4E00\u952E\u4FEE\u590D"
        }
        H?.refreshContextActionBar?.(), r.updateRows && ve()
    }

    function xr(n = {}) {
        if (!t.cues.length) {
            je(null, n);
            return
        }
        const r = br();
        if (Xt?.scanCueIssuesAsync && t.cues.length >= 120) {
            const i = t._qcScanToken = (t._qcScanToken || 0) + 1;
            Xt.scanCueIssuesAsync(t.cues, r, oe).then(s => {
                i === t._qcScanToken && je(s, n)
            }).catch(() => {
                i === t._qcScanToken && je(oe.scanCueIssues(t.cues, r), n)
            });
            return
        }
        je(oe.scanCueIssues(t.cues, r), n)
    }

    function xe() {
        return se.mergeGlossaries(t.globalGlossary, t.projectGlossary)
    }

    function Mr() {
        const n = t.glossaryScope === "project" ? t.projectGlossary : t.globalGlossary;
        t.glossary = se.normalizeGlossary(n)
    }

    function oi() {
        const n = se.normalizeGlossary(t.glossary);
        t.glossary = n, t.glossaryScope === "project" ? t.projectGlossary = n : t.globalGlossary = n
    }

    function ko() {
        return e.glossaryScopeProject?.checked ? "project" : "global"
    }

    function Ot() {
        if (e.glossaryScopeGlobal && (e.glossaryScopeGlobal.checked = t.glossaryScope !== "project"), e.glossaryScopeProject) {
            e.glossaryScopeProject.checked = t.glossaryScope === "project";
            const n = !t.path;
            e.glossaryScopeProject.disabled = n, e.glossaryScopeProjectLabel && (e.glossaryScopeProjectLabel.classList.toggle("opacity-50", n), e.glossaryScopeProjectLabel.title = n ? "\u8BF7\u5148\u4FDD\u5B58\u5B57\u5E55\u6587\u4EF6\u540E\u518D\u7F16\u8F91\u9879\u76EE\u672F\u8BED\u8868" : "\u4EC5\u4F5C\u7528\u4E8E\u5F53\u524D\u5B57\u5E55\u6587\u4EF6\u65C1\u7684\u9879\u76EE\u672F\u8BED\u8868")
        }
    }
    async function Br(n = t.path) {
        if (!p?.transubGetGlossary) {
            t.globalGlossary = {
                version: 1,
                entries: []
            }, t.projectGlossary = {
                version: 1,
                entries: []
            }, Mr(), _t();
            return
        }
        try {
            const r = await p.transubGetGlossary({
                scope: "global"
            });
            t.globalGlossary = r?.ok && r.glossary ? se.normalizeGlossary(r.glossary) : {
                version: 1,
                entries: []
            }
        } catch {
            t.globalGlossary = {
                version: 1,
                entries: []
            }
        }
        if (t.projectGlossary = {
                version: 1,
                entries: []
            }, n) try {
            const r = await p.transubGetGlossary({
                scope: "project",
                subtitlePath: n
            });
            r?.ok && r.glossary && (t.projectGlossary = se.normalizeGlossary(r.glossary))
        } catch {
            t.projectGlossary = {
                version: 1,
                entries: []
            }
        }
        Mr(), _t()
    }
    async function wo() {
        await Br(t.path)
    }
    async function kr() {
        if (oi(), !p?.transubSaveGlossary) return !1;
        try {
            const n = {
                glossary: t.glossary,
                scope: t.glossaryScope
            };
            if (t.glossaryScope === "project") {
                if (!t.path) return d("\u8BF7\u5148\u4FDD\u5B58\u5B57\u5E55\u6587\u4EF6\u540E\u518D\u5199\u5165\u9879\u76EE\u672F\u8BED\u8868", "err"), !1;
                n.subtitlePath = t.path
            }
            const r = await p.transubSaveGlossary(n);
            if (r?.ok && r.glossary) {
                const i = se.normalizeGlossary(r.glossary);
                t.glossary = i, t.glossaryScope === "project" ? t.projectGlossary = i : t.globalGlossary = i
            }
            return !!r?.ok
        } catch {
            return !1
        }
    }
    async function Co(n) {
        const r = n === "project" ? "project" : "global";
        if (r === t.glossaryScope) {
            Ot();
            return
        }
        if (r === "project" && !t.path) {
            d("\u8BF7\u5148\u4FDD\u5B58\u5B57\u5E55\u6587\u4EF6\u540E\u518D\u7F16\u8F91\u9879\u76EE\u672F\u8BED\u8868", "err"), Ot();
            return
        }
        oi(), t.glossaryScope = r, Mr(), et(), Ot(), Fe()
    }

    function _t() {
        if (!e.glossaryBtn || !e.glossaryBadge) return;
        const n = xe();
        if (!t.cues.length || !n?.entries?.length) {
            e.glossaryBtn.classList.remove("has-issues"), e.glossaryBadge.textContent = "0", t.glossaryIssues = [];
            return
        }
        const r = se.scanGlossaryIssues(t.cues, n);
        t.glossaryIssues = r.issues;
        const i = r.summary.total || 0;
        e.glossaryBadge.textContent = String(i > 99 ? "99+" : i), e.glossaryBtn.classList.toggle("has-issues", i > 0), e.glossaryBtn.title = i > 0 ? `${se.summarizeGlossaryScan(r.summary)}\uFF08\u70B9\u51FB\u6253\u5F00\u672F\u8BED\u8868\uFF09` : "\u672F\u8BED\u8868\u4E0E\u4E13\u540D\u4E00\u81F4\u6027"
    }

    function et() {
        t.glossaryEditingId = "", e.glossaryCanonical && (e.glossaryCanonical.value = ""), e.glossaryAliases && (e.glossaryAliases.value = ""), e.glossaryCaseSensitive && (e.glossaryCaseSensitive.checked = !1), e.glossaryEnabled && (e.glossaryEnabled.checked = !0), wr()
    }

    function li(n) {
        if (!n) {
            et();
            return
        }
        t.glossaryEditingId = n.id, e.glossaryCanonical && (e.glossaryCanonical.value = n.canonical || ""), e.glossaryAliases && (e.glossaryAliases.value = (n.aliases || []).join(", ")), e.glossaryCaseSensitive && (e.glossaryCaseSensitive.checked = !!n.caseSensitive), e.glossaryEnabled && (e.glossaryEnabled.checked = n.enabled !== !1), wr()
    }

    function wr() {
        if (!e.glossaryEntryList) return;
        const n = t.glossary?.entries || [];
        if (!n.length) {
            e.glossaryEntryList.innerHTML = '<div class="glossary-entry-item" style="cursor:default;color:rgb(156 163 175);">\u6682\u65E0\u672F\u8BED\uFF0C\u8BF7\u65B0\u5EFA\u6216\u5BFC\u5165</div>';
            return
        }
        e.glossaryEntryList.innerHTML = n.map(r => {
            const i = r.id === t.glossaryEditingId ? " active" : "",
                s = (r.aliases || []).join(" \xB7 ") || "\uFF08\u65E0\u522B\u540D\uFF09",
                a = r.enabled === !1 ? "\uFF08\u5DF2\u505C\u7528\uFF09" : "";
            return `<button type="button" class="glossary-entry-item${i}" data-glossary-id="${b(r.id)}" role="listitem"><span class="g-can">${b(r.canonical)}${b(a)}</span><span class="g-alias">${b(s)}</span></button>`
        }).join("")
    }

    function Eo(n) {
        if (e.glossaryIssueList) {
            if (!n?.length) {
                e.glossaryIssueList.innerHTML = '<div class="glossary-issue-item" style="cursor:default;color:rgb(156 163 175);">\u6682\u65E0\u4E00\u81F4\u6027\u95EE\u9898</div>';
                return
            }
            e.glossaryIssueList.innerHTML = n.slice(0, 40).map(r => {
                const i = r.cueIndices?.length ? ` \xB7 \u5B57\u5E55 #${r.cueIndices.slice(0,5).map(a=>a+1).join(",")}${r.cueIndices.length>5?"\u2026":""}` : "",
                    s = r.cueIndices?.[0];
                return `<button type="button" class="glossary-issue-item" data-glossary-issue-idx="${s??""}" data-glossary-entry-id="${b(r.entryId)}" role="listitem" title="\u70B9\u51FB\u5B9A\u4F4D\u5E76\u9009\u4E2D\u672F\u8BED">${b(r.message)}${b(i)}</button>`
            }).join("")
        }
    }

    function ci(n) {
        const r = (t.glossary?.entries || []).find(i => i.id === String(n));
        li(r || null)
    }

    function Io() {
        et(), e.glossaryCanonical?.focus()
    }

    function jt() {
        if (!e.breakWordsChips) return;
        const n = vt();
        n.length ? e.breakWordsChips.innerHTML = n.map(r => `<span class="break-words-chip" data-break-word="${b(r)}"><span>${b(r)}</span><button type="button" data-break-word-remove="${b(r)}" title="\u79FB\u9664\u300C${b(r)}\u300D" aria-label="\u79FB\u9664 ${b(r)}">&times;</button></span>`).join("") : e.breakWordsChips.innerHTML = '<span style="font-size:0.72rem;color:var(--ed-faint)">\u6682\u65E0\u65AD\u53E5\u8BCD\u3002\u6DFB\u52A0\u540E\uFF0C\u667A\u80FD\u65AD\u53E5\u4E0E\u9759\u97F3\u5206\u5272\u4F1A\u4F18\u5148\u5728\u8FD9\u4E9B\u8BCD\u4E4B\u540E\u5207\u5F00\u3002</span>', e.breakWordsStatus && (e.breakWordsStatus.textContent = n.length ? `\u5F53\u524D ${n.length} \u4E2A\u65AD\u53E5\u8BCD\uFF0C\u5DF2\u7528\u4E8E\u667A\u80FD\u65AD\u53E5\u4E0E\u9759\u97F3\u5206\u5272` : "\u672A\u8BBE\u7F6E\u65AD\u53E5\u8BCD\u65F6\uFF0C\u667A\u80FD\u65AD\u53E5/\u9759\u97F3\u5206\u5272\u53EA\u6309\u6807\u70B9\u4E0E\u7A7A\u767D\u5BF9\u9F50", e.breakWordsStatus.classList.remove("err"))
    }

    function Gt() {
        e.breakWordsModal && (vt(), jt(), Q(e.breakWordsModal, e.breakWordsInput))
    }

    function Cr() {
        K(e.breakWordsModal)
    }

    function di() {
        const n = Ja(e.breakWordsInput?.value);
        if (!n.length) {
            d("\u8BF7\u8F93\u5165\u8981\u6DFB\u52A0\u7684\u65AD\u53E5\u8BCD", "err"), e.breakWordsInput?.focus();
            return
        }
        const r = D.normalizeBreakWords([...vt(), ...n]);
        _n(r), e.breakWordsInput && (e.breakWordsInput.value = ""), jt(), d(`\u5DF2\u66F4\u65B0\u65AD\u53E5\u8BCD\uFF08\u5171 ${r.length} \u4E2A\uFF09`, "ok"), e.breakWordsInput?.focus()
    }

    function Po(n) {
        const r = vt().filter(i => i.toLowerCase() !== String(n || "").toLowerCase());
        _n(r), jt(), d(`\u5DF2\u79FB\u9664\u65AD\u53E5\u8BCD\u300C${n}\u300D`, "ok")
    }

    function Lo() {
        const n = ul();
        _n(n), jt(), d(`\u5DF2\u6062\u590D\u9ED8\u8BA4\u65AD\u53E5\u8BCD\uFF08${n.length} \u4E2A\uFF09`, "ok")
    }

    function Do() {
        _n([]), jt(), d("\u5DF2\u6E05\u7A7A\u65AD\u53E5\u8BCD", "ok")
    }
    async function To() {
        if (!p?.transubImportGlossary) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5BFC\u5165\u672F\u8BED\u8868", "err");
            return
        }
        const n = await p.transubImportGlossary();
        if (ht(), !(!n || n.canceled)) {
            if (!n.ok) {
                d(n.error || "\u5BFC\u5165\u672F\u8BED\u8868\u5931\u8D25", "err");
                return
            }
            t.glossary = se.normalizeGlossary(n.glossary), t.glossaryScope === "project" ? t.projectGlossary = t.glossary : t.globalGlossary = t.glossary, et(), Fe(), d(`\u5DF2\u5BFC\u5165 ${t.glossary.entries.length} \u6761\u672F\u8BED`, "ok")
        }
    }
    async function $o() {
        if (!p?.transubExportGlossary) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5BFC\u51FA\u672F\u8BED\u8868", "err");
            return
        }
        await kr();
        const n = await p.transubExportGlossary();
        if (ht(), !(!n || n.canceled)) {
            if (!n.ok) {
                d(n.error || "\u5BFC\u51FA\u672F\u8BED\u8868\u5931\u8D25", "err");
                return
            }
            d(`\u672F\u8BED\u8868\u5DF2\u5BFC\u51FA\uFF1A${G(n.path||"")}`, "ok")
        }
    }

    function Fe() {
        x(), wr(), Ot();
        const n = xe(),
            r = se.scanGlossaryIssues(t.cues, n);
        if (t.glossaryIssues = r.issues, Eo(r.issues), e.glossaryPreview) {
            const i = t.glossaryScope === "project" ? "\u9879\u76EE" : "\u5168\u5C40";
            if (!t.glossary.entries.length) e.glossaryPreview.textContent = `\u5F53\u524D\u4E3A${i}\u672F\u8BED\u8868\uFF0C\u8BF7\u5148\u6DFB\u52A0\u672F\u8BED\u6761\u76EE`, e.glossaryPreview.classList.add("err");
            else if (!t.cues.length) e.glossaryPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.glossaryPreview.classList.add("err");
            else {
                const s = t.glossaryScope === "project" && t.globalGlossary?.entries?.length ? `\uFF08\u626B\u63CF/\u7EDF\u4E00\u4F7F\u7528\u5408\u5E76\u540E\u7684 ${n.entries.length} \u6761\u6709\u6548\u672F\u8BED\uFF09` : "";
                e.glossaryPreview.textContent = `${se.summarizeGlossaryScan(r.summary)}${s}`, e.glossaryPreview.classList.toggle("err", r.summary.total > 0)
            }
        }
        _t()
    }
    async function Er() {
        e.glossaryModal && (await Br(t.path), Ot(), et(), Q(e.glossaryModal, e.glossaryCanonical), Fe())
    }

    function Ir() {
        K(e.glossaryModal)
    }
    async function Ao() {
        const n = String(e.glossaryCanonical?.value || "").trim();
        if (!n) {
            d("\u6807\u51C6\u5199\u6CD5\u4E0D\u80FD\u4E3A\u7A7A", "err");
            return
        }
        const r = se.upsertEntry(t.glossary, {
            id: t.glossaryEditingId || void 0,
            canonical: n,
            aliases: e.glossaryAliases?.value || "",
            caseSensitive: !!e.glossaryCaseSensitive?.checked,
            enabled: e.glossaryEnabled?.checked !== !1
        });
        if (!r.ok) {
            d(r.error || "\u4FDD\u5B58\u6761\u76EE\u5931\u8D25", "err");
            return
        }
        if (t.glossary = r.glossary, !await kr()) {
            d("\u672F\u8BED\u8868\u4FDD\u5B58\u5931\u8D25", "err");
            return
        }
        li(r.entry), Fe(), d(`\u5DF2\u4FDD\u5B58\u672F\u8BED\u300C${n}\u300D`, "ok")
    }
    async function Fo() {
        if (!t.glossaryEditingId) {
            et();
            return
        }
        await ie("\u786E\u5B9A\u5220\u9664\u5F53\u524D\u672F\u8BED\u6761\u76EE\uFF1F") && (t.glossary = se.removeEntry(t.glossary, t.glossaryEditingId), await kr(), et(), Fe(), d("\u5DF2\u5220\u9664\u672F\u8BED\u6761\u76EE", "ok"))
    }
    async function ui(n = null) {
        if (x(), !t.cues.length) {
            Fe();
            return
        }
        const r = se.applyGlossaryToCues(t.cues, xe(), {
            entryIds: n || void 0
        });
        if (!r.stats.replaceCount) {
            Fe(), d(r.summary, "ok");
            return
        }
        $(), t.cues.splice(0, t.cues.length, ...r.cues), P(!0), C(), t.selectedIndex >= 0 && R(), Fe(), d(r.summary, "ok")
    }

    function Mn() {
        if (!e.textPresetsBadge) return;
        const n = t.textPresetsDoc?.groups?.length || 0;
        e.textPresetsBadge.textContent = String(n), e.textPresetsBtn?.classList.toggle("has-presets", n > 0)
    }
    async function Pr() {
        if (!p?.transubGetTextPresets) {
            t.textPresetsDoc = _.emptyPresetsDoc(), Mn();
            return
        }
        try {
            const n = await p.transubGetTextPresets();
            n?.ok && n.presetsDoc ? t.textPresetsDoc = _.normalizePresetsDoc(n.presetsDoc) : t.textPresetsDoc?.groups?.length || (t.textPresetsDoc = _.normalizePresetsDoc({
                groups: _.defaultStarterGroups()
            }))
        } catch {
            t.textPresetsDoc?.groups?.length || (t.textPresetsDoc = _.emptyPresetsDoc())
        }
        Mn(), $r()
    }
    async function Lr() {
        if (!p?.transubSaveTextPresets) return !1;
        try {
            const n = await p.transubSaveTextPresets({
                presetsDoc: t.textPresetsDoc
            });
            return n?.ok && n.presetsDoc && (t.textPresetsDoc = _.normalizePresetsDoc(n.presetsDoc)), Mn(), $r(), !!n?.ok
        } catch {
            return !1
        }
    }

    function Dr() {
        return [{
            id: _.makeItemId(),
            label: "\u7247\u540D",
            text: "\u300A\u5F71\u7247\u540D\u79F0\u300B",
            startSec: 0,
            endSec: .5
        }, {
            id: _.makeItemId(),
            label: "\u6F14\u5458",
            text: `\u4E3B\u6F14
\u6F14\u5458\u7532`,
            startSec: .6,
            endSec: 1.5
        }]
    }

    function Ro(n) {
        const r = Number(n?.startSec) || 0,
            i = Number(n?.endSec);
        return Number.isFinite(i) && i > r ? Math.round((i - r) * 1e3) / 1e3 : .5
    }

    function Bn(n) {
        if (!e.textPresetItemsHost) return;
        const r = Array.isArray(n) && n.length ? n : Dr();
        e.textPresetItemsHost.innerHTML = r.map(i => {
            const s = Number(i.startSec) || 0,
                a = Ro(i);
            return `
            <div class="text-preset-item-row" data-item-id="${b(i.id||"")}">
                <input type="text" data-tp-field="label" spellcheck="false" placeholder="\u6807\u7B7E" value="${b(i.label||"")}" title="\u6761\u76EE\u6807\u7B7E\uFF0C\u5982\uFF1A\u7247\u540D">
                <input type="number" data-tp-field="startSec" min="0" max="36000" step="0.1" value="${b(String(s))}" title="\u8D77\u59CB\u79D2\uFF08\u76F8\u5BF9\u65F6\u95F4\u57FA\u51C6\uFF09">
                <input type="number" data-tp-field="durationSec" min="0.1" max="36000" step="0.1" value="${b(String(a))}" title="\u65F6\u957F\uFF08\u79D2\uFF09">
                <textarea data-tp-field="text" spellcheck="false" placeholder="\u5B57\u5E55\u6587\u672C" title="\u5B57\u5E55\u6587\u672C">${b(i.text||"")}</textarea>
                <button type="button" class="tp-remove" data-tp-remove title="\u5220\u9664\u6761\u76EE">\u5220</button>
            </div>`
        }).join("")
    }

    function Tr() {
        return e.textPresetItemsHost ? Array.from(e.textPresetItemsHost.querySelectorAll(".text-preset-item-row")).map(n => {
            const r = Number(n.querySelector('[data-tp-field="startSec"]')?.value) || 0,
                i = Number(n.querySelector('[data-tp-field="durationSec"]')?.value) || .5;
            return {
                id: n.getAttribute("data-item-id") || _.makeItemId(),
                label: n.querySelector('[data-tp-field="label"]')?.value || "",
                text: n.querySelector('[data-tp-field="text"]')?.value || "",
                startSec: r,
                endSec: r + Math.max(.1, i)
            }
        }) : []
    }

    function pt() {
        t.textPresetEditingId = "", e.textPresetName && (e.textPresetName.value = ""), e.textPresetAnchor && (e.textPresetAnchor.value = "playhead"), Bn(Dr()), e.textPresetsStatus && (e.textPresetsStatus.textContent = "\u65B0\u5EFA\u7EC4\uFF1A\u8BBE\u7F6E\u7EC4\u540D\u4E0E\u6761\u76EE\u65F6\u95F4\u8F74\u540E\u4FDD\u5B58"), kn()
    }

    function mi(n) {
        if (!n) {
            pt();
            return
        }
        if (t.textPresetEditingId = n.id, e.textPresetName && (e.textPresetName.value = n.name || ""), e.textPresetAnchor && (e.textPresetAnchor.value = n.anchor || "playhead"), Bn(n.items || []), e.textPresetsStatus) {
            const r = _.ANCHOR_LABELS[n.anchor] || n.anchor;
            e.textPresetsStatus.textContent = `\u7F16\u8F91\u300C${n.name}\u300D\xB7 ${n.items.length} \u6761 \xB7 ${r}`
        }
        kn()
    }

    function kn() {
        if (!e.textPresetsList) return;
        const n = _.filterGroups(t.textPresetsDoc, {
            query: t.textPresetsQuery
        });
        if (!n.length) {
            e.textPresetsList.innerHTML = '<div class="glossary-entry-item" style="cursor:default;color:var(--ed-muted)">\u6682\u65E0\u9884\u8BBE\u7EC4\u3002\u53EF\u70B9\u300C\u793A\u4F8B\u300D\u5199\u5165\u300C\u5E38\u89C4\u9884\u8BBE1\u300D\uFF0C\u6216\u65B0\u5EFA\u7EC4\u3002</div>';
            return
        }
        e.textPresetsList.innerHTML = n.map(r => {
            const i = r.id === t.textPresetEditingId ? " active" : "",
                s = _.summarizeGroup(r);
            return `<button type="button" class="glossary-entry-item${i}" data-text-preset-id="${b(r.id)}" role="listitem">
                <span class="g-can">${b(r.name)} <span style="font-weight:400;color:var(--ed-muted)">\xB7 ${r.items.length} \u6761</span></span>
                <span class="g-alias">${b(s)}</span>
            </button>`
        }).join("")
    }

    function $r() {
        if (!e.textPresetQuickSelect) return;
        const n = t.textPresetsDoc?.groups || [],
            r = ['<option value="">\u63D2\u5165\u9884\u8BBE\u7EC4\u2026</option>'];
        n.forEach(i => {
            r.push(`<option value="${b(i.id)}">${b(i.name)}\uFF08${i.items.length}\uFF09</option>`)
        }), r.push('<option value="__manage__">\u7BA1\u7406\u9884\u8BBE\u7EC4\u2026</option>'), e.textPresetQuickSelect.innerHTML = r.join(""), e.textPresetQuickSelect.value = ""
    }
    async function wn() {
        e.textPresetsModal && (await Pr(), e.textPresetsSearch && (e.textPresetsSearch.value = t.textPresetsQuery || ""), pt(), Q(e.textPresetsModal, e.textPresetName))
    }

    function fi() {
        K(e.textPresetsModal)
    }
    async function No() {
        const n = _.upsertGroup(t.textPresetsDoc, {
            id: t.textPresetEditingId || void 0,
            name: e.textPresetName?.value || "",
            anchor: e.textPresetAnchor?.value || "playhead",
            items: Tr()
        });
        if (!n.ok) {
            d(n.error || "\u4FDD\u5B58\u9884\u8BBE\u7EC4\u5931\u8D25", "err"), e.textPresetsStatus && (e.textPresetsStatus.textContent = n.error || "\u4FDD\u5B58\u5931\u8D25");
            return
        }
        if (t.textPresetsDoc = n.doc, !await Lr()) {
            d("\u9884\u8BBE\u7EC4\u4FDD\u5B58\u5931\u8D25", "err");
            return
        }
        mi(n.group), d(`\u5DF2\u4FDD\u5B58\u9884\u8BBE\u7EC4\u300C${n.group.name}\u300D`, "ok")
    }
    async function qo() {
        if (!t.textPresetEditingId) {
            pt();
            return
        }
        await ie("\u786E\u5B9A\u5220\u9664\u5F53\u524D\u9884\u8BBE\u7EC4\uFF1F") && (t.textPresetsDoc = _.removeGroup(t.textPresetsDoc, t.textPresetEditingId), await Lr(), pt(), d("\u5DF2\u5220\u9664\u9884\u8BBE\u7EC4", "ok"))
    }
    async function Wo() {
        const n = _.defaultStarterGroups();
        let r = _.normalizePresetsDoc(t.textPresetsDoc);
        const i = new Set(r.groups.map(a => a.name));
        let s = 0;
        for (const a of n) {
            if (i.has(a.name)) continue;
            const o = _.upsertGroup(r, {
                ...a,
                id: void 0
            });
            o.ok && (r = o.doc, s += 1)
        }
        t.textPresetsDoc = r, await Lr(), kn(), d(s ? `\u5DF2\u6DFB\u52A0 ${s} \u4E2A\u793A\u4F8B\u9884\u8BBE\u7EC4` : "\u793A\u4F8B\u9884\u8BBE\u7EC4\u5DF2\u5B58\u5728", "ok"), e.textPresetsStatus && (e.textPresetsStatus.textContent = s ? `\u5DF2\u6DFB\u52A0 ${s} \u4E2A\u793A\u4F8B\u7EC4` : "\u793A\u4F8B\u5DF2\u5B58\u5728\uFF0C\u672A\u91CD\u590D\u6DFB\u52A0")
    }

    function Ar(n) {
        if (!n?.items?.length) return d("\u9884\u8BBE\u7EC4\u4E3A\u7A7A", "err"), !1;
        x();
        const r = n.anchor === "absolute" ? 0 : De(),
            i = _.buildCuesFromGroup(n, {
                baseMs: r
            });
        if (!i.length) return d("\u9884\u8BBE\u7EC4\u6CA1\u6709\u53EF\u63D2\u5165\u7684\u6761\u76EE", "err"), !1;
        $();
        const s = i.map(l => ({
            index: t.cues.length + 1,
            startMs: l.startMs,
            endMs: l.endMs,
            text: l.text
        }));
        t.cues.push(...s), t.cues.sort((l, c) => l.startMs - c.startMs);
        const a = t.cues.indexOf(s[0]);
        P(!0), t.selectedIndex = a >= 0 ? a : 0, C(), X(t.selectedIndex, {
            scroll: !0,
            seek: !0
        }), e.detailText?.focus();
        const o = n.anchor === "absolute" ? "\u89C6\u9891\u8D77\u70B9" : "\u64AD\u653E\u4F4D\u7F6E";
        return d(`\u5DF2\u63D2\u5165\u9884\u8BBE\u7EC4\u300C${n.name}\u300D\u5171 ${s.length} \u6761\uFF08\u76F8\u5BF9${o}\uFF09`, "ok"), !0
    }

    function Ho(n) {
        const r = _.findGroup(t.textPresetsDoc, n);
        if (!r) {
            d("\u672A\u627E\u5230\u8BE5\u9884\u8BBE\u7EC4", "err");
            return
        }
        Ar(r)
    }
    async function Oo() {
        const n = await p?.transubExportTextPresets?.();
        if (!n?.canceled) {
            if (!n?.ok) {
                d(n?.error || "\u5BFC\u51FA\u5931\u8D25", "err");
                return
            }
            d(`\u5DF2\u5BFC\u51FA\u9884\u8BBE\uFF1A${G(n.path)}`, "ok")
        }
    }
    async function _o() {
        const n = await p?.transubImportTextPresets?.();
        if (!n?.canceled) {
            if (!n?.ok) {
                d(n?.error || "\u5BFC\u5165\u5931\u8D25", "err");
                return
            }
            n.presetsDoc ? t.textPresetsDoc = _.normalizePresetsDoc(n.presetsDoc) : await Pr(), pt(), Mn(), $r(), d(`\u5DF2\u5BFC\u5165 ${t.textPresetsDoc.groups.length} \u4E2A\u9884\u8BBE\u7EC4`, "ok")
        }
    }

    function resolveEditorQcProfile() {
        const api = T.TransubContentProfile;
        if (!api?.classifyContentProfile) return "unknown";
        try {
            const path = t.videoPath || t.path || "";
            return api.classifyContentProfile({
                path,
                fileName: G(path)
            })?.profile || "unknown"
        } catch {
            return "unknown"
        }
    }

    function applyQcProfileDefaultsToUi() {
        const api = T.TransubContentProfile;
        if (!api?.qcPresetForProfile) return "";
        const profile = resolveEditorQcProfile();
        const preset = api.qcPresetForProfile(profile);
        // 仅套用免费规则默认；Pro 项保持不勾选，由用户显式开启
        if (e.qcMaxCps) e.qcMaxCps.value = String(preset.maxCps ?? 18);
        if (e.qcRemoveNoise) e.qcRemoveNoise.checked = !!preset.removeNoise;
        if (e.qcRemoveDup) e.qcRemoveDup.checked = preset.removeDuplicates !== !1;
        if (e.qcCompressRep) e.qcCompressRep.checked = preset.compressRepetition !== !1;
        if (e.qcSmartFix && !e.qcSmartFix.disabled) e.qcSmartFix.checked = !1;
        if (e.qcLlmSplit && !e.qcLlmSplit.disabled) e.qcLlmSplit.checked = !1;
        if (e.qcRetranscribe && !e.qcRetranscribe.disabled) e.qcRetranscribe.checked = !1;
        if (e.qcSemanticReview && !e.qcSemanticReview.disabled) e.qcSemanticReview.checked = !1;
        return api.describeQcPresetHint?.(profile) || ""
    }

    function pi() {
        const n = Ke();
        const profile = resolveEditorQcProfile();
        const preset = T.TransubContentProfile?.qcPresetForProfile?.(profile) || {};
        return {
            fixOverlap: !!e.qcFixOverlap?.checked,
            fixCpsBySplit: !!e.qcFixCpsSplit?.checked,
            fixCpsByExtend: !!e.qcFixCpsExtend?.checked,
            enforceMinDur: !!e.qcEnforceMin?.checked,
            enforceMaxDur: !!e.qcEnforceMax?.checked,
            fixInvalid: !0,
            compressRepetition: !!e.qcCompressRep?.checked,
            removeNoise: !!e.qcRemoveNoise?.checked,
            removeDuplicates: !!e.qcRemoveDup?.checked,
            smartFix: !!e.qcSmartFix?.checked,
            llmSplit: !!e.qcLlmSplit?.checked,
            retranscribeConnected: !!e.qcRetranscribe?.checked,
            semanticReview: !!e.qcSemanticReview?.checked,
            intensity: preset.intensity || "light",
            maxSmartCues: Number(preset.maxSmartCues) || 40,
            profile,
            maxCps: Number(e.qcMaxCps?.value) || 18,
            minSec: Number(e.qcMinSec?.value) || .5,
            maxSec: Number(e.qcMaxSec?.value) || 10,
            gapMs: Math.max(0, Math.round(Number(e.qcGapMs?.value) || 1)),
            smartMaxChars: n.smartMaxChars,
            smartLineChars: n.smartLineChars,
            targetCps: yt(),
            useCpsTime: n.useCps !== !1
        }
    }
    const qcSummaryUi = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts && globalThis.TransubEditorParts.qcSummaryUi)
        || (typeof window !== 'undefined' && window.TransubEditorParts && window.TransubEditorParts.qcSummaryUi)
        || null;
    const Cn = qcSummaryUi && qcSummaryUi.QC_ISSUE_TYPE_DEFS ? qcSummaryUi.QC_ISSUE_TYPE_DEFS : [];

    function jo(n, r) {
        return qcSummaryUi ? qcSummaryUi.filterIssuesByType(n, r) : (r ? (n || []).filter(i => (i.types || []).includes(r)) : n || [])
    }

    function Go(n) {
        const r = n || null;
        t.qcTypeFilter = qcSummaryUi
            ? qcSummaryUi.nextQcTypeFilter(t.qcTypeFilter, r)
            : (r == null ? null : (t.qcTypeFilter === r ? null : r));
        gt()
    }

    function gi(n, {
        emptyHint: r
    } = {}) {
        if (!e.qcIssueList) return;
        if (qcSummaryUi) {
            e.qcIssueList.innerHTML = qcSummaryUi.buildQcIssueListHtml(n, {
                emptyHint: r
            });
            return
        }
        e.qcIssueList.innerHTML = ''
    }

    function hi(n, r) {
        return qcSummaryUi ? qcSummaryUi.qcChipClass(n, r) : ('qc-chip' + (n ? (' ' + n) : '') + (r ? ' active' : ''))
    }

    function yi(n) {
        if (!e.qcSummaryBar) return;
        if (qcSummaryUi) {
            const built = qcSummaryUi.buildQcSummaryBarHtml(n, t.qcTypeFilter);
            t.qcTypeFilter = built.nextFilter;
            e.qcSummaryBar.innerHTML = built.html;
            return
        }
        e.qcSummaryBar.innerHTML = ''
    }

    function vi({
        filtered: n = !1
    } = {}) {
        const r = pi();
        if (!n) return {
            ok: !0,
            opts: r,
            label: null
        };
        const i = t.qcTypeFilter;
        if (!i) return {
            ok: !1,
            opts: null,
            label: null,
            reason: "\u8BF7\u5148\u70B9\u51FB\u4E0A\u65B9\u6807\u7B7E\u7B5B\u9009\u95EE\u9898\u7C7B\u578B"
        };
        const a = Cn.find(l => l.type === i)?.label || i,
            o = oe.buildQcOptionsForIssueType(r, i);
        return o ? {
            ok: !0,
            opts: {
                ...o,
                issueTypeFilter: i
            },
            label: a
        } : {
            ok: !1,
            opts: null,
            label: a,
            reason: `\u300C${a}\u300D\u65E0\u6CD5\u81EA\u52A8\u4FEE\u590D\uFF0C\u8BF7\u624B\u5DE5\u4FEE\u6539\u6216\u91CD\u8F6C\u5199`
        }
    }

    function gt() {
        const n = pi(),
            r = n.fixCpsBySplit || n.fixCpsByExtend;
        if (e.qcMaxCps && (e.qcMaxCps.disabled = !r), e.qcMinSec && (e.qcMinSec.disabled = !n.enforceMinDur), e.qcMaxSec && (e.qcMaxSec.disabled = !n.enforceMaxDur), x(), !e.qcPreview) return;
        if (!t.cues.length) {
            t.qcTypeFilter = null, yi({
                total: 0
            }), gi([]), e.qcPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.qcPreview.classList.add("err"), e.qcFixFiltered && (e.qcFixFiltered.disabled = !0);
            return
        }
        const i = oe.scanCueIssues(t.cues, n);
        yi(i.summary);
        const s = jo(i.issues, t.qcTypeFilter),
            a = Cn.find(c => c.type === t.qcTypeFilter);
        gi(s, {
            emptyHint: t.qcTypeFilter && i.issues.length ? `\u5F53\u524D\u7C7B\u578B\u300C${a?.label||t.qcTypeFilter}\u300D\u65E0\u5339\u914D\u95EE\u9898` : ""
        });
        const o = vi({
            filtered: !0
        });
        if (e.qcFixFiltered && (e.qcFixFiltered.disabled = !o.ok, e.qcFixFiltered.title = o.ok ? `\u4EC5\u4FEE\u590D\u300C${o.label}\u300D\u76F8\u5173\u95EE\u9898` : o.reason || "\u8BF7\u5148\u7B5B\u9009\u53EF\u81EA\u52A8\u4FEE\u590D\u7684\u95EE\u9898\u7C7B\u578B"), t.qcTypeFilter) {
            if (!o.ok) e.qcPreview.textContent = o.reason, e.qcPreview.classList.add("err");
            else {
                const filteredScan = {
                    issues: s,
                    summary: i.summary
                };
                const c = oe.buildQcFixEstimate
                    ? oe.buildQcFixEstimate(t.cues, {
                        ...o.opts,
                        beforeScan: filteredScan
                    })
                    : oe.buildQcFixPlan(t.cues, {
                        ...o.opts,
                        estimateOnly: !0
                    });
                e.qcPreview.textContent = `\u7B5B\u9009\u4FEE\u590D\uFF08${o.label}\uFF09\uFF1A${c.summary}`, e.qcPreview.classList.toggle("err", !c.ok)
            }
            return
        }
        const l = oe.buildQcFixEstimate
            ? oe.buildQcFixEstimate(t.cues, {
                ...n,
                beforeScan: i
            })
            : oe.buildQcFixPlan(t.cues, {
                ...n,
                estimateOnly: !0
            });
        e.qcPreview.textContent = l.summary, e.qcPreview.classList.toggle("err", !l.ok)
    }

    function Fr() {
        e.qcModal && (t.qcTypeFilter = null, x(), e.qcMaxCps && e.smartMaxCps && (e.qcMaxCps.value = e.smartMaxCps.value), void syncQcSmartFixGate().then(() => {
            const hint = applyQcProfileDefaultsToUi();
            hint && e.qcPreview && (e.qcPreview.textContent = hint, e.qcPreview.classList.remove("err"))
        }), Q(e.qcModal, e.qcConfirm), gt())
    }

    function En() {
        K(e.qcModal)
    }

    let _qcGateCache = {
        at: 0,
        entitled: !1,
        semanticEntitled: !1
    };
    const QC_GATE_TTL_MS = 3e4;

    async function syncQcSmartFixGate() {
        const wrap = e.qcSmartFixWrap;
        const box = e.qcSmartFix;
        const splitWrap = e.qcLlmSplitWrap;
        const splitBox = e.qcLlmSplit;
        const reWrap = e.qcRetranscribeWrap;
        const reBox = e.qcRetranscribe;
        const semWrap = e.qcSemanticWrap;
        const semBox = e.qcSemanticReview;
        let entitled = !1;
        let semanticEntitled = !1;
        const now = Date.now();
        if (_qcGateCache.at && now - _qcGateCache.at < QC_GATE_TTL_MS) {
            entitled = _qcGateCache.entitled;
            semanticEntitled = _qcGateCache.semanticEntitled
        } else {
            try {
                const requireFeat = p?.transubAdvancedRequireFeature;
                if (requireFeat) {
                    const [gate, fb, semGate] = await Promise.all([
                        requireFeat({ featureId: "qcSmartFix" }),
                        requireFeat({ featureId: "contextReconstruct" }),
                        requireFeat({ featureId: "bilingualSemanticReview" })
                    ]);
                    entitled = !!(gate?.ok || fb?.ok);
                    semanticEntitled = !!(semGate?.ok || entitled)
                }
            } catch {
                entitled = !1;
                semanticEntitled = !1
            }
            _qcGateCache = {
                at: now,
                entitled,
                semanticEntitled
            }
        }
        const hasVideo = !!t.videoPath && !!p?.transubTranscribeRange;
        const hasDual = !!(t.pairCues?.length || t.pairPath);
        if (wrap && box) {
            wrap.classList.toggle("opacity-50", !entitled);
            wrap.title = entitled ? "Pro：规则修复后对剩余通顺度/连续文本调用大模型润色" : "需解锁 Pro 后可用";
            box.disabled = !entitled;
            if (!entitled) box.checked = !1
        }
        if (splitWrap && splitBox) {
            splitWrap.classList.toggle("opacity-50", !entitled);
            splitWrap.title = entitled ? "Pro：对规则无法切开的长句/高读速用大模型断句" : "需解锁 Pro 后可用";
            splitBox.disabled = !entitled;
            if (!entitled) splitBox.checked = !1
        }
        if (reWrap && reBox) {
            const reOk = entitled && hasVideo;
            reWrap.classList.toggle("opacity-50", !reOk);
            reWrap.title = !entitled
                ? "需解锁 Pro 后可用"
                : (hasVideo ? "Pro：对无法分割的连续高读速区间局部重转写" : "请先关联视频");
            reBox.disabled = !reOk;
            if (!reOk) reBox.checked = !1
        }
        if (semWrap && semBox) {
            const semOk = semanticEntitled && hasDual && !!p?.transubAdvancedBilingualSemanticReview;
            semWrap.classList.toggle("opacity-50", !semOk);
            semWrap.title = !semanticEntitled
                ? "需解锁 Pro 后可用"
                : (hasDual ? "Pro：对问题条双语语义审阅并采纳建议译文" : "请先加载对照轨或原文缓存");
            semBox.disabled = !semOk;
            if (!semOk) semBox.checked = !1
        }
        return entitled
    }

    async function runQcLlmSplitPhase(qcOpts = {}) {
        const smartApi = T.TransubSubtitleQcSmart;
        if (!smartApi?.selectQcLlmSplitTargets || !p?.transubAdvancedQcLlmSplit) {
            return {
                ok: !1,
                skipped: !0,
                summary: "智能断句不可用"
            }
        }
        // 断句挑选不需要通顺度
        const scan = qcOpts._reuseScan || oe.scanCueIssues(t.cues, {
            ...qcOpts,
            checkFluency: !1
        });
        const targets = smartApi.selectQcLlmSplitTargets(scan.issues, {
            maxTargets: 24
        });
        if (!targets.length) {
            return {
                ok: !0,
                skipped: !0,
                summary: smartApi.summarizeQcLlmSplitPlan(targets)
            }
        }
        d(smartApi.summarizeQcLlmSplitPlan(targets), "info");
        const prefs = typeof Ke == "function" ? Ke() : null;
        const items = smartApi.buildQcLlmSplitPayload(t.cues, targets, {
            smartMaxChars: Number(qcOpts.smartMaxChars) || Number(prefs?.smartMaxChars) || 20
        });
        try {
            const res = await p.transubAdvancedQcLlmSplit({
                cues: items
            });
            if (!res?.ok) {
                return {
                    ok: !1,
                    summary: res?.error || "智能断句失败"
                }
            }
            const applied = smartApi.applyQcLlmSplitResults(t.cues, res.splits || [], {
                targetCps: yt(),
                minSec: Number(qcOpts.minSec) || .5,
                useCpsTime: !0
            });
            if (!applied.splitCount) {
                return {
                    ok: !0,
                    skipped: !0,
                    summary: "智能断句无可用切分"
                }
            }
            $(), t.cues.splice(0, t.cues.length, ...applied.cues);
            if (oe.applySmartAdjustToCues) {
                oe.applySmartAdjustToCues(t.cues, {
                    fixOverlap: !0,
                    fixCps: !1,
                    enforceMinDur: !1,
                    enforceMaxDur: !1,
                    gapMs: Number(qcOpts.gapMs) || 1
                })
            }
            return {
                ok: !0,
                summary: `智能断句 ${applied.splitCount} 条(+${applied.added})`,
                splitCount: applied.splitCount,
                added: applied.added
            }
        } catch (err) {
            return {
                ok: !1,
                summary: err?.message || "智能断句失败"
            }
        }
    }

    async function runQcRetranscribePhase(qcOpts = {}) {
        const smartApi = T.TransubSubtitleQcSmart;
        if (!smartApi?.selectQcRetranscribeTargets || !smartApi.buildQcRetranscribeRanges) {
            return {
                ok: !1,
                skipped: !0,
                summary: "重转写模块不可用"
            }
        }
        if (!t.videoPath || !p?.transubTranscribeRange) {
            return {
                ok: !0,
                skipped: !0,
                summary: "未关联视频，跳过局部重转写"
            }
        }
        const scan = qcOpts._reuseScan || oe.scanCueIssues(t.cues, {
            ...qcOpts,
            checkFluency: !1
        });
        const targets = smartApi.selectQcRetranscribeTargets(scan.issues);
        const ranges = smartApi.buildQcRetranscribeRanges(t.cues, targets.map(n => n.index), {
            maxRanges: 8,
            maxDurationSec: 45,
            mergeAdjacentGapMs: 800
        });
        if (!ranges.length) {
            return {
                ok: !0,
                skipped: !0,
                summary: smartApi.summarizeQcRetranscribePlan(ranges)
            }
        }
        d(smartApi.summarizeQcRetranscribePlan(ranges), "info");
        let okCount = 0,
            failCount = 0,
            replaced = 0;
        for (let ri = 0; ri < ranges.length; ri += 1) {
            const range = ranges[ri];
            d(`局部重转写 ${ri+1}/${ranges.length}（${range.indexes.length} 条）…`, "info");
            try {
                const res = await ut({
                    startMs: range.startMs,
                    endMs: range.endMs,
                    padMs: smartApi.DEFAULT_PAD_MS || 350,
                    mode: "range",
                    writeAs: "source",
                    snapAfter: !0,
                    detail: `QC 连续文本重转写 ${ri+1}/${ranges.length}`
                });
                if (res?.ok) {
                    okCount += 1, replaced += Number(res.replacedCount) || 0
                } else if (res?.cancelled) {
                    return {
                        ok: !1,
                        cancelled: !0,
                        summary: `局部重转写已取消（完成 ${okCount}/${ranges.length} 窗）`,
                        okCount,
                        failCount
                    }
                } else {
                    failCount += 1, d(res?.error || "局部重转写失败", "err")
                }
            } catch (err) {
                failCount += 1, d(err?.message || "局部重转写失败", "err")
            }
        }
        return {
            ok: failCount === 0,
            summary: `局部重转写 ${okCount}/${ranges.length} 窗${replaced?` · 替换约 ${replaced} 条`:""}${failCount?` · 失败 ${failCount}`:""}`,
            okCount,
            failCount,
            replaced,
            rangeCount: ranges.length
        }
    }

    async function Si({
        filtered: n = !1
    } = {}) {
        const r = vi({
            filtered: n
        });
        if (!r.ok) {
            e.qcPreview && r.reason && (e.qcPreview.textContent = r.reason, e.qcPreview.classList.add("err")), gt();
            return
        }
        const i = r.opts;
        const wantSmart = !!i.smartFix && !n;
        const wantLlmSplit = !!i.llmSplit && !n;
        const wantRetranscribe = !!i.retranscribeConnected && !n;
        const wantSemantic = !!i.semanticReview && !n;
        if (wantSmart || wantLlmSplit || wantRetranscribe || wantSemantic) {
            const okPro = await syncQcSmartFixGate();
            if (!okPro && (wantSmart || wantLlmSplit || wantRetranscribe)) {
                d("智能处理需解锁 Pro，已改为仅规则修复", "warn");
                i.smartFix = !1, i.llmSplit = !1, i.retranscribeConnected = !1
            } else if (wantRetranscribe && (!t.videoPath || !p?.transubTranscribeRange)) {
                d("未关联视频，跳过局部重转写", "warn");
                i.retranscribeConnected = !1
            }
            if (wantSemantic && (!t.pairCues?.length && !t.pairPath || !p?.transubAdvancedBilingualSemanticReview)) {
                d("无对照轨，跳过双语语义审阅", "warn");
                i.semanticReview = !1
            }
            if (wantSemantic && e.qcSemanticReview?.disabled) i.semanticReview = !1
        }
        const hasRuleFix = !!(i.fixOverlap || i.fixCpsBySplit || i.fixCpsByExtend || i.enforceMinDur || i.enforceMaxDur || i.compressRepetition || i.fixInvalid || i.removeNoise || i.removeDuplicates);
        const wantAnySmart = !!(wantSmart && i.smartFix) || !!(wantLlmSplit && i.llmSplit) || !!(wantRetranscribe && i.retranscribeConnected) || !!(wantSemantic && i.semanticReview);
        // dry-run：不改写 cues，确认后再写回
        let ruleApplied = null;
        if (hasRuleFix) {
            ruleApplied = oe.applyQcFixes(t.cues, i)
        }
        const hasRuleEffect = oe.hasQcFixEffect
            ? oe.hasQcFixEffect(ruleApplied?.stats)
            : !!(ruleApplied?.stats?.affected || ruleApplied?.stats?.splitCount || ruleApplied?.stats?.compressRepFixed || ruleApplied?.stats?.noiseRemoved);
        if (!hasRuleEffect && !wantAnySmart) {
            e.qcPreview && (e.qcPreview.textContent = ruleApplied?.summary || "无需修复", e.qcPreview.classList.add("err")), gt();
            return
        }
        if (hasRuleEffect && oe.buildQcReviewRows) {
            const review = oe.buildQcReviewRows(t.cues, ruleApplied.cues);
            const rows = review?.rows || review || [];
            const structural = !!(review?.structural);
            const promptReview = St?.promptReconstructReview;
            let accepted = null;
            if (typeof promptReview == "function") {
                accepted = await promptReview(rows, {
                    title: "QC 修复对照",
                    lead: structural
                        ? "本次含分割或删除，条数将变化。确认后整体应用右侧修复结果；取消则不改写规则修复。"
                        : "左边为修复前，右边为修复后。勾选要应用的条目后确认（可编辑右侧文本）；取消则不改写。",
                    beforeLabel: "修复前",
                    afterLabel: "修复后"
                })
            } else {
                accepted = rows.filter(row => row.changed).map(row => ({
                    index: row.index,
                    text: row.after
                }))
            }
            if (accepted === null) {
                d("已取消规则修复", "warn");
                ruleApplied = null;
                if (!wantAnySmart) {
                    gt();
                    return
                }
            } else if (!accepted.length) {
                d("未勾选任何规则修复", "warn");
                ruleApplied = null;
                if (!wantAnySmart) {
                    gt();
                    return
                }
            } else if (oe.applyQcAcceptedFixes) {
                const merged = oe.applyQcAcceptedFixes(t.cues, ruleApplied.cues, accepted);
                if (merged) ruleApplied = {
                    ...ruleApplied,
                    cues: merged
                };
                else ruleApplied = null
            }
        }
        const showWait = !!wantAnySmart;
        let progressUnsub = null;
        // 半透明推理遮罩（holdBusy:false），勿用启动遮罩（不透明会整窗空白）
        const qcWait = (detail) => {
            const msg = detail || "正在执行质量修复…";
            d(msg, "info");
            if (!showWait || typeof Ui != "function") return;
            const overlay = document.getElementById("editorReconstructProgress");
            if (!overlay || overlay.classList.contains("hidden")) {
                Ui({
                    kind: "qc-smart",
                    badge: "QC 处理",
                    title: "QC 处理中，请稍候",
                    detail: msg,
                    hint: "可能调用大模型或局部重转写；界面仍可看见，请勿关闭窗口。",
                    indeterminate: !0,
                    pct: 5,
                    holdBusy: !1
                })
            } else if (typeof Qi == "function") {
                Qi({
                    title: "QC 处理中，请稍候",
                    message: msg,
                    indeterminate: !0
                })
            }
        };
        if (showWait) {
            qcWait("正在执行质量修复…");
            progressUnsub = p.onAdvancedReconstructProgress?.(a => {
                if (!a) return;
                const mode = String(a.mode || "");
                if (mode && mode !== "qc-smart" && mode !== "semantic-review" && mode !== "single" && mode !== "batch") return;
                qcWait(a.message || a.detail || "QC 处理进行中…")
            }) || null
        } else {
            d("正在规则修复，请稍候…", "info")
        }
        try {
            x();
            if (ruleApplied?.cues && (oe.hasQcFixEffect ? oe.hasQcFixEffect(ruleApplied.stats) : (ruleApplied.stats?.affected || ruleApplied.stats?.splitCount || ruleApplied.stats?.compressRepFixed || ruleApplied.stats?.noiseRemoved))) {
                $();
                t.cues.splice(0, t.cues.length, ...ruleApplied.cues), P(!0), C(), t.selectedIndex >= 0 && R();
                const o = ruleApplied.remainingText
                    ? `\uFF0C${ruleApplied.remainingText}`
                    : (ruleApplied.remaining?.total ? `\uFF0C\u4ECD\u6709 ${ruleApplied.remaining.total} \u6761\u5F85\u5904\u7406` : "");
                const l = n && r.label ? `\uFF08${r.label}\uFF09` : "";
                d(`\u8D28\u91CF\u4FEE\u590D\u5B8C\u6210${l}${o}`, "ok")
            }
            En();
            let reuseScan = ruleApplied?.scan || null;
            if (i.llmSplit) {
                qcWait("智能断句中，请稍候…");
                const splitRes = await runQcLlmSplitPhase({
                    ...i,
                    _reuseScan: reuseScan
                });
                d(splitRes.summary || "智能断句结束", splitRes.ok ? "ok" : "err");
                if (splitRes.splitCount) {
                    P(!0), C(), t.selectedIndex >= 0 && R();
                    reuseScan = null
                }
            }
            if (i.retranscribeConnected) {
                qcWait("局部重转写中，请稍候…");
                const reRes = await runQcRetranscribePhase({
                    ...i,
                    _reuseScan: reuseScan
                });
                d(reRes.summary || "局部重转写结束", reRes.cancelled ? "warn" : reRes.ok ? "ok" : "err");
                if (reRes.cancelled) return;
                if (!reRes.skipped) reuseScan = null;
                C(), t.selectedIndex >= 0 && R()
            }
            const smartApi = T.TransubSubtitleQcSmart;
            let polishedIndexes = [];
            if (i.smartFix && St?.runContextReconstructOnce && smartApi?.selectQcSmartTargets) {
                const scan = reuseScan || oe.scanCueIssues(t.cues, i);
                reuseScan = null;
                const targets = smartApi.selectQcSmartTargets(scan.issues, {
                    maxSmartCues: Number(i.maxSmartCues) || 40
                });
                if (!targets.length) {
                    d("规则修复后无需智能润色", "info")
                } else {
                    const cueIndexes = targets.map(s => s.index);
                    polishedIndexes = cueIndexes;
                    qcWait(`智能润色 ${cueIndexes.length} 条，请稍候…`);
                    d(`开始智能润色剩余 ${cueIndexes.length} 条…`, "info");
                    const smartRes = await St.runContextReconstructOnce({
                        cueIndexes,
                        scope: "selected",
                        mode: "basic",
                        intensity: i.intensity || "light",
                        windowCues: 16,
                        preserveTiming: !0,
                        skipReview: !1,
                        userNote: smartApi.QC_SMART_NOTE || "",
                        note: smartApi.QC_SMART_NOTE || ""
                    });
                    d(smartRes?.summary || "QC 智能润色结束", smartRes?.status === "failed" ? "err" : smartRes?.status === "cancelled" ? "warn" : "ok");
                    if (smartRes?.status === "cancelled") return;
                    // 润色结束会收起遮罩；若还有后续阶段则重新打开 QC 外壳
                    if (i.semanticReview) qcWait("智能润色已完成…")
                }
            }
            if (i.semanticReview) {
                qcWait("双语语义审阅中，请稍候…");
                const semRes = await runQcSemanticReviewPhase(i, {
                    preferIndexes: polishedIndexes
                });
                d(semRes.summary || "语义审阅结束", semRes.ok ? (semRes.changed ? "ok" : "info") : "err");
                if (semRes.changed) P(!0), C(), t.selectedIndex >= 0 && R()
            }
        } finally {
            if (typeof progressUnsub == "function") try {
                progressUnsub()
            } catch {}
            // 收起 QC 遮罩；若仍在润色 busy 则留给对应流程关闭
            if (showWait && typeof Zi == "function" && !t.reconstructBusy) Zi();
            // 兜底：绝不留下启动遮罩（不透明全白）
            typeof Gr == "function" && Gr()
        }
    }

    async function runQcSemanticReviewPhase(qcOpts = {}, extra = {}) {
        const smartApi = T.TransubSubtitleQcSmart;
        if (!smartApi?.buildQcSemanticPairs || !p?.transubAdvancedBilingualSemanticReview) {
            return {
                ok: !1,
                summary: "语义审阅不可用"
            }
        }
        const pairCues = t.pairCues?.length ? t.pairCues : await H?.loadKeptCues?.();
        if (!pairCues?.length) {
            return {
                ok: !1,
                summary: "需要对照轨或原文缓存"
            }
        }
        const scan = oe.scanCueIssues(t.cues, qcOpts);
        const indexes = smartApi.selectQcSemanticIndexes(scan.issues, {
            maxPairs: 40,
            preferIndexes: extra.preferIndexes || []
        });
        if (!indexes.length) {
            return {
                ok: !0,
                skipped: !0,
                changed: 0,
                summary: "无需双语语义审阅"
            }
        }
        const dualApi = O || T.TransubDualSubtitle;
        const pairs = smartApi.buildQcSemanticPairs(t.cues, pairCues, indexes, dualApi);
        if (!pairs.length) {
            return {
                ok: !0,
                skipped: !0,
                changed: 0,
                summary: "无可审校的双语条目"
            }
        }
        d(`开始语义审阅 ${pairs.length} 条…`, "info");
        const review = await p.transubAdvancedBilingualSemanticReview({
            pairs,
            suggestFixes: !0,
            note: smartApi.QC_SEMANTIC_NOTE || ""
        });
        if (!review?.ok) {
            return {
                ok: !1,
                summary: review?.error || "语义审阅失败"
            }
        }
        t.lastSemanticReview = review;
        H?.refreshContextActionBar?.();
        const issues = Array.isArray(review.issues) ? review.issues : [];
        if (!issues.length) {
            return {
                ok: !0,
                changed: 0,
                summary: review.summary || "语义审阅：未发现问题"
            }
        }
        const applied = smartApi.applyQcSemanticSuggestions(t.cues, issues);
        if (applied.changed) {
            $();
            t.cues.splice(0, t.cues.length, ...applied.cues)
        }
        return {
            ok: !0,
            changed: applied.changed,
            issueCount: issues.length,
            summary: applied.changed
                ? `语义采纳 ${applied.changed}/${issues.filter(s => s.suggestedTarget).length || applied.changed} 条`
                : (review.summary || `语义审阅：${issues.length} 处（无建议译文）`)
        }
    }

    function bi() {
        e.smartAdjustModal && (x(), Q(e.smartAdjustModal, e.smartAdjustConfirm), Ht())
    }

    function In() {
        K(e.smartAdjustModal)
    }

    function Ko() {
        const n = ii();
        if (!n.fixOverlap && !n.fixCps && !n.enforceMinDur && !n.enforceMaxDur) {
            Ht();
            return
        }
        if (x(), !ai(n).affected) {
            Ht();
            return
        }
        $();
        const i = Sr(t.cues, n);
        P(!0), C(), In(), d(`\u667A\u80FD\u8C03\u6574\u5B8C\u6210\uFF0C\u5DF2\u66F4\u65B0 ${i.affected} \u6761\u5B57\u5E55`, "ok")
    }

    function xi() {
        return {
            removeEmpty: !!e.noiseRemoveEmpty?.checked,
            removeFragments: !!e.noiseRemoveFragments?.checked,
            removeSoundEffects: !!e.noiseRemoveSoundEffects?.checked,
            removeSymbolOnly: !!e.noiseRemoveSymbolOnly?.checked,
            removeDuplicates: !!e.noiseRemoveDuplicates?.checked,
            removeHallucinations: !!e.noiseRemoveHallucinations?.checked
        }
    }

    function Pn() {
        if (!e.removeNoisePreview) return;
        const n = xi();
        if (!n.removeEmpty && !n.removeFragments && !n.removeSoundEffects && !n.removeSymbolOnly && !n.removeDuplicates && !n.removeHallucinations) {
            e.removeNoisePreview.textContent = "\u8BF7\u81F3\u5C11\u52FE\u9009\u4E00\u9879\u6E05\u7406\u89C4\u5219", e.removeNoisePreview.classList.add("err"), e.removeNoiseConfirm && (e.removeNoiseConfirm.disabled = !0);
            return
        }
        const {
            stats: r
        } = Ne.removeNoiseFromCues(t.cues, n);
        e.removeNoisePreview.classList.remove("err"), e.removeNoisePreview.textContent = Ne.summarizeNoiseRemoval(r), e.removeNoiseConfirm && (e.removeNoiseConfirm.disabled = r.removed <= 0)
    }

    function Mi() {
        e.removeNoiseModal && (x(), Q(e.removeNoiseModal, e.removeNoiseConfirm), Pn())
    }

    function Ln() {
        K(e.removeNoiseModal)
    }

    function Vo() {
        const n = e.chineseDirT2S?.checked ? "t2s" : "s2t",
            r = e.chineseScopeSelected?.checked ? "selected" : "all";
        let i = null;
        r === "selected" && (i = J(), !i.length && t.selectedIndex >= 0 && (i = [t.selectedIndex]));
        const s = e.chineseProtectGlossary?.checked !== !1 ? se.collectProtectTerms(xe()) : [];
        const o = (document.querySelector('input[name="editorChineseLocale"]:checked')?.value
            || e.chineseLocaleTwp?.value
            || "twp").toLowerCase();
        const a = ["twp", "tw", "hk", "t"].includes(o) ? o : "twp";
        return {
            direction: n,
            scope: r,
            indexes: i,
            protectTerms: s,
            locale: a
        }
    }

    function Bi() {
        const n = Vo();
        return n.scope === "selected" && (!n.indexes || !n.indexes.length) ? {
            cues: t.cues.slice(),
            stats: {
                direction: n.direction,
                locale: n.locale,
                cueTotal: t.cues.length,
                cueTouched: 0,
                charChanged: 0,
                cueSkipped: 0
            },
            summary: "\u8BF7\u5148\u9009\u4E2D\u4E00\u6761\u6216\u591A\u6761\u5B57\u5E55"
        } : Gn.convertCues(t.cues, {
            direction: n.direction,
            locale: n.locale,
            indexes: n.indexes,
            protectTerms: n.protectTerms
        })
    }

    function Dn() {
        if (!e.chineseConvertPreview) return;
        if (!t.cues.length) {
            e.chineseConvertPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.chineseConvertPreview.classList.add("err"), e.chineseConvertConfirm && (e.chineseConvertConfirm.disabled = !0);
            return
        }
        const n = Bi(),
            r = e.chineseScopeSelected?.checked && !J().length && t.selectedIndex < 0,
            i = !n.stats.cueTouched;
        e.chineseConvertPreview.textContent = n.summary, e.chineseConvertPreview.classList.toggle("err", r || i), e.chineseConvertConfirm && (e.chineseConvertConfirm.disabled = r || i)
    }

    function ki() {
        e.chineseConvertModal && (x(), Q(e.chineseConvertModal, e.chineseConvertConfirm), Dn())
    }

    function Tn() {
        K(e.chineseConvertModal)
    }

    function zo() {
        x();
        const n = Bi();
        if (!n.stats.cueTouched) {
            Dn(), d(n.summary || "\u65E0\u9700\u8F6C\u6362", "ok");
            return
        }
        $(), t.cues.splice(0, t.cues.length, ...n.cues), P(!0), C(), t.selectedIndex >= 0 && R(), Tn(), d(n.summary, "ok")
    }

    function Uo() {
        const n = e.compressRepScopeSelected?.checked ? "selected" : "all";
        let r = null;
        return n === "selected" && (r = J(), !r.length && t.selectedIndex >= 0 && (r = [t.selectedIndex])), {
            scope: n,
            indexes: r,
            compressSingleChar: e.compressRepSingleChar?.checked !== !1,
            addExclaim: e.compressRepExclaim?.checked !== !1,
            minRepeats: 3
        }
    }

    function wi() {
        const n = Uo();
        return n.scope === "selected" && (!n.indexes || !n.indexes.length) ? {
            cues: t.cues.slice(),
            stats: {
                cueTotal: t.cues.length,
                cueTouched: 0,
                runs: 0,
                charSaved: 0
            },
            summary: "\u8BF7\u5148\u9009\u4E2D\u4E00\u6761\u6216\u591A\u6761\u5B57\u5E55"
        } : Ne.compressRepetitionInCues(t.cues, {
            indexes: n.indexes,
            compressSingleChar: n.compressSingleChar,
            addExclaim: n.addExclaim,
            minRepeats: n.minRepeats
        })
    }

    function Rr() {
        if (!e.compressRepPreview) return;
        if (!t.cues.length) {
            e.compressRepPreview.textContent = "\u6CA1\u6709\u5B57\u5E55\u6761\u76EE", e.compressRepPreview.classList.add("err"), e.compressRepConfirm && (e.compressRepConfirm.disabled = !0);
            return
        }
        const n = wi(),
            r = e.compressRepScopeSelected?.checked && !J().length && t.selectedIndex < 0,
            i = !n.stats.cueTouched;
        e.compressRepPreview.textContent = n.summary, e.compressRepPreview.classList.toggle("err", r || i), e.compressRepConfirm && (e.compressRepConfirm.disabled = r || i)
    }

    function Ci() {
        e.compressRepModal && (x(), Q(e.compressRepModal, e.compressRepConfirm), Rr())
    }

    function $n() {
        K(e.compressRepModal)
    }

    function Qo() {
        x();
        const n = wi();
        if (!n.stats.cueTouched) {
            Rr(), d(n.summary || "\u65E0\u9700\u538B\u7F29", "ok");
            return
        }
        $(), t.cues.splice(0, t.cues.length, ...n.cues), P(!0), C(), t.selectedIndex >= 0 && R(), $n(), d(n.summary.replace(/^将/, "\u5DF2"), "ok")
    }

    function viewingPunctOpts() {
        const selected = !!e.viewingPunctScopeSelected?.checked;
        let indexes = null;
        if (selected) {
            indexes = J();
            if (!indexes.length && t.selectedIndex >= 0) indexes = [t.selectedIndex];
            if (!indexes.length) indexes = [];
        }
        return {
            scope: selected ? "selected" : "all",
            indexes: selected ? indexes : null
        };
    }

    function previewViewingPunct() {
        const n = viewingPunctOpts();
        return n.scope === "selected" && (!n.indexes || !n.indexes.length) ? {
            cues: t.cues.slice(),
            stats: {
                cueTotal: t.cues.length,
                cueTouched: 0,
                charSaved: 0
            },
            summary: "请先选中一条或多条字幕"
        } : Ne.simplifyViewingPunctuationInCues(t.cues, {
            indexes: n.indexes,
            level: 'clear',
        });
    }

    function refreshViewingPunctPreview() {
        if (!e.viewingPunctPreview) return;
        if (!t.cues.length) {
            e.viewingPunctPreview.textContent = "没有字幕条目", e.viewingPunctPreview.classList.add("err"), e.viewingPunctConfirm && (e.viewingPunctConfirm.disabled = !0);
            return
        }
        const n = previewViewingPunct(),
            r = e.viewingPunctScopeSelected?.checked && !J().length && t.selectedIndex < 0,
            i = !n.stats.cueTouched;
        e.viewingPunctPreview.textContent = n.summary, e.viewingPunctPreview.classList.toggle("err", r || i), e.viewingPunctConfirm && (e.viewingPunctConfirm.disabled = r || i)
    }

    function openViewingPunctModal() {
        e.viewingPunctModal && (x(), Q(e.viewingPunctModal, e.viewingPunctConfirm), refreshViewingPunctPreview())
    }

    function closeViewingPunctModal() {
        K(e.viewingPunctModal)
    }

    function confirmViewingPunct() {
        x();
        const n = previewViewingPunct();
        if (!n.stats.cueTouched) {
            refreshViewingPunctPreview(), d(n.summary || "无需精简", "ok");
            return
        }
        $(), t.cues.splice(0, t.cues.length, ...n.cues), P(!0), C(), t.selectedIndex >= 0 && R(), closeViewingPunctModal(), d(n.summary, "ok")
    }

    function Zo() {
        x();
        let n = J();
        if (!n.length && t.selectedIndex >= 0 && (n = [t.selectedIndex]), !n.length) {
            d("\u8BF7\u5148\u9009\u62E9\u4E00\u6761\u5B57\u5E55", "err");
            return
        }
        const r = Ne.compressRepetitionInCues(t.cues, {
            indexes: n,
            compressSingleChar: !0,
            addExclaim: !0,
            minRepeats: 3
        });
        if (!r.stats.cueTouched) {
            d("\u5F53\u524D\u6761\u76EE\u65E0\u9700\u538B\u7F29\u53E0\u8BCD", "ok"), at();
            return
        }
        $(), t.cues.splice(0, t.cues.length, ...r.cues), P(!0), C(), t.selectedIndex >= 0 && R(), d(r.summary.replace(/^将/, "\u5DF2"), "ok")
    }
    async function Xo() {
        const n = xi();
        if (!n.removeEmpty && !n.removeFragments && !n.removeSoundEffects && !n.removeSymbolOnly && !n.removeDuplicates) {
            Pn();
            return
        }
        x();
        const r = Ne.removeNoiseFromCues(t.cues, n);
        if (!r.stats.removed) {
            Pn(), d("\u6CA1\u6709\u53EF\u5220\u9664\u7684\u6742\u97F3\u6761\u76EE", "ok");
            return
        }
        if (!await ie(`\u786E\u5B9A\u5220\u9664 ${r.stats.removed} \u6761\u6742\u97F3\u5B57\u5E55\uFF1F\u6B64\u64CD\u4F5C\u53EF\u64A4\u9500\u3002`)) return;
        $();
        const i = new Set(r.removedIndexes || []);
        let s = -1;
        if (t.selectedIndex >= 0 && !i.has(t.selectedIndex)) {
            let a = 0;
            for (let o = 0; o < t.selectedIndex; o += 1) i.has(o) || (a += 1);
            s = a
        } else r.cues.length && (s = Math.min(Math.max(t.selectedIndex, 0), r.cues.length - 1));
        t.cues.splice(0, t.cues.length, ...r.cues.map(a => ({
            startMs: a.startMs,
            endMs: a.endMs,
            text: a.text
        }))), t.selectedIndex = s, P(!0), C(), Ln(), d(`\u5DF2\u5220\u9664 ${r.stats.removed} \u6761\u6742\u97F3\u5B57\u5E55\uFF0C\u5269\u4F59 ${r.stats.kept} \u6761`, "ok")
    }

    function Yo(n) {
        if (!e.playheadTime) return;
        const r = e.video ? (e.video.currentTime || 0) * 1e3 : 0,
            i = n ? Math.round(r) : Math.floor(r / 1e3) * 1e3,
            s = Z(i, t.format);
        s !== t.lastPlayheadLabel && (t.lastPlayheadLabel = s, e.playheadTime.textContent = s), tt(Math.round(r))
    }

    function Kt(n) {
        x(), $();
        const r = J(),
            i = r.length >= 1 ? r : t.cues.map((s, a) => a);
        for (const s of i) {
            const a = t.cues[s];
            a && (a.startMs = Math.max(0, a.startMs + n), a.endMs != null && (a.endMs = Math.max(a.startMs + 100, a.endMs + n)))
        }
        P(!0), C(), d(r.length >= 1 ? `\u5DF2\u504F\u79FB\u9009\u4E2D ${r.length} \u6761 ${n>0?"+":""}${n}ms` : `\u5DF2\u5168\u4F53\u504F\u79FB ${n>0?"+":""}${n}ms`, "ok")
    }
    T.__transubEditorConfirmClose = async () => t.dirty ? {
        allow: await ie("\u5B57\u5E55\u5DF2\u4FEE\u6539\u4F46\u672A\u4FDD\u5B58\uFF0C\u786E\u5B9A\u8981\u5173\u95ED\u7A97\u53E3\u5417\uFF1F")
    } : {
        allow: !0
    }, T.__transubEditorGetDirty = () => t.dirty, T.__transubEditorSaveBeforeClose = async () => (await Pt(), !t.dirty);

    function Nr() {
        const n = document.activeElement;
        return n ? !!(n === e.detailText || n === e.detailStart || n === e.detailDuration || n.closest?.(".editor-modal:not(.hidden)")) : !1
    }

    function Ei(n) {
        if (Et() && !(!Number.isFinite(n) || n < 0 || n >= t.cues.length) && !(!e.video || e.video.paused || e.video.ended) && !Nr()) {
            if (n === t.selectedIndex) {
                const r = e.cueBody?.querySelector(`tr[data-cue-idx="${n}"]`);
                r && !Na(r) && r.scrollIntoView({
                    block: "nearest",
                    behavior: "auto"
                });
                return
            }
            X(n, {
                scroll: !0,
                fromPlayback: !0
            })
        }
    }

    function Ii() {
        try {
            if (!t.cues.length) {
                je(null);
                return
            }
            je(oe.scanCueIssues(t.cues, br()))
        } catch {
            je(null)
        }
    }

    function Vt() {
        const n = t.cues.length,
            r = Array.from({
                length: n
            }, (i, s) => s);
        if (t.listFilter === "low") return r.filter(i => !!t.cueMeta[i]?.low);
        if (t.listFilter === "qc") return r.filter(i => t.qcIssueIndexSet.has(i));
        if (t.listFilter === "find") return !t.find.active || !t.find.matches.length ? [] : [...new Set(t.find.matches.map(i => i.cueIdx))].sort((i, s) => i - s);
        if (t.listFilter === "review-unseen" || t.listFilter === "review-edited" || t.listFilter === "review-approved") {
            const i = t.listFilter.replace("review-", ""),
                s = H?.markersCore || T.TransubEditorMarkers;
            return s?.filterIndexesByReview ? s.filterIndexesByReview(t.cues, t.markers, i) : r
        }
        if (t.listFilter === "speaker") {
            // Legacy filter removed — treat as all
            return r
        }
        if (t.listFilter === "bookmarks") {
            const i = H?.markersCore || T.TransubEditorMarkers;
            return i?.filterIndexesByBookmarks ? i.filterIndexesByBookmarks(t.cues, t.markers, {
                padMs: 80
            }) : r
        }
        return r
    }

    function Re(n, {
        persist: r = !0
    } = {}) {
        let next = n || "all";
        if (next === "speaker") next = "all";
        t.listFilter = next, document.querySelectorAll("[data-list-filter]").forEach(i => {
            const s = i.getAttribute("data-list-filter") === t.listFilter;
            i.classList.toggle("active", s), i.getAttribute("role") === "menuitemradio" && i.setAttribute("aria-checked", s ? "true" : "false")
        }), Li(), r && ia?.(t.listFilter), C({
            listOnly: !0,
            reuseMeta: !0
        }), H?.refreshContextActionBar?.()
    }

    function Li() {
        const n = e.reviewFilterBtn;
        if (!n) return;
        const r = {
                "review-unseen": "\u672A\u770B",
                "review-edited": "\u5DF2\u6539",
                "review-approved": "\u5DF2\u901A\u8FC7"
            },
            i = Object.prototype.hasOwnProperty.call(r, t.listFilter);
        n.classList.toggle("active", i);
        const s = i ? r[t.listFilter] : "\u5BA1\u6821";
        n.innerHTML = `${s} <i class="fa fa-caret-down" aria-hidden="true"></i>`
    }

    function Jo() {
        const n = typeof sa == "function" ? sa() : {
            filter: "all"
        };
        const filter = n.filter === "speaker" ? "all" : (n.filter || "all");
        if (filter && filter !== "all") {
            Re(filter, {
                persist: filter === n.filter ? !1 : !0
            });
            return
        }
        Re("all", {
            persist: n.filter === "speaker"
        })
    }

    function Ti() {
        He(), Ii();
        const n = [];
        for (let s = 0; s < t.cues.length; s += 1)(t.cueMeta[s]?.low || t.qcIssueIndexSet.has(s)) && n.push(s);
        if (!n.length) {
            d("\u6CA1\u6709\u66F4\u591A\u95EE\u9898\u6761\u76EE", "ok");
            return
        }
        const r = t.selectedIndex,
            i = n.find(s => s > r) ?? n[0];
        X(i, {
            scroll: !0,
            seek: !0
        }), d(`\u95EE\u9898\u6761\u76EE ${n.indexOf(i)+1}/${n.length}`, "warn")
    }

    function qr() {
        const n = !!t.videoPath;
        document.querySelectorAll(".needs-video").forEach(r => {
            r.classList.toggle("is-no-video", !n), n ? r.dataset.titleFull && (r.title = r.dataset.titleFull) : (r.dataset.titleFull || (r.dataset.titleFull = r.title || ""), r.title = `${r.dataset.titleFull||r.title||""}\uFF08\u9700\u5148\u5173\u8054\u89C6\u9891\uFF09`)
        }), [e.playPauseBtn, e.seekBackBtn, e.seekFwdBtn, e.rateSelect, e.volumeSlider].forEach(r => {
            r && (r.disabled = !n)
        }), Qe()
    }
    async function $i() {
        try {
            const n = await p?.transubOpenSettings?.({
                tab: "editor"
            });
            n?.ok === !1 && d(n?.error || "\u65E0\u6CD5\u6253\u5F00\u8BBE\u7F6E", "err")
        } catch (n) {
            d(n?.message || "\u65E0\u6CD5\u6253\u5F00\u8BBE\u7F6E", "err")
        }
    }
    async function Ai() {
        try {
            const n = await p?.transubShowMainWindow?.();
            n?.ok === !1 && d(n?.error || "\u65E0\u6CD5\u6253\u5F00\u5B57\u5E55\u751F\u6210\u5668", "err")
        } catch (n) {
            d(n?.message || "\u65E0\u6CD5\u6253\u5F00\u5B57\u5E55\u751F\u6210\u5668", "err")
        }
    }

    async function openSubtitleLibraryFromEditor() {
        try {
            const mediaPath = String(t.videoPath || "").trim();
            const mediaId = String(t.library?.mediaId || "").trim();
            const versionId = String(t.library?.versionId || "").trim();
            const n = await p?.transubOpenSubtitleLibrary?.({
                mediaPath,
                ...(mediaId ? { mediaId } : {}),
                ...(versionId ? { versionId } : {})
            });
            n?.ok === !1 && d(n?.error || "\u65E0\u6CD5\u6253\u5F00\u5B57\u5E55\u5E93", "err")
        } catch (n) {
            d(n?.message || "\u65E0\u6CD5\u6253\u5F00\u5B57\u5E55\u5E93", "err")
        }
    }

    async function ensureLibraryAbPairIds() {
        const lib = t.library;
        if (!lib) return null;
        if (lib.abVersionIdA && lib.abVersionIdB) return lib;
        const mediaId = String(lib.mediaId || "").trim();
        if (!mediaId) return lib;
        const detail = await p?.transubLibraryGetMedia?.({ mediaId });
        const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
        const hit = tracks.find((tr) => tr.id === lib.trackId && tr.abPairAvailable)
            || tracks.find((tr) => tr.abPairAvailable)
            || tracks.find((tr) => tr.id === lib.trackId);
        if (!hit) return lib;
        t.library = {
            ...lib,
            trackId: hit.id || lib.trackId,
            abPairAvailable: !!hit.abPairAvailable,
            abVersionIdA: String(hit.abVersionIdA || "").trim(),
            abVersionIdB: String(hit.abVersionIdB || "").trim()
        };
        syncLibraryBar();
        return t.library
    }

    async function editorLibraryLoadCompareRef() {
        if (!t.library?.versionId && !t.library?.mediaId) {
            d("当前不是从字幕库打开的版本", "warn");
            return
        }
        if (t.libraryCompareVersionId && U()) {
            if (t.pairDirty && !await ie("副轨有未保存修改，卸下后将丢弃，继续？")) return;
            rn(), C(), R(), d("已卸下对照副轨", "ok");
            return
        }
        const lib = await ensureLibraryAbPairIds();
        const idA = String(lib?.abVersionIdA || "").trim();
        const idB = String(lib?.abVersionIdB || "").trim();
        if (!idA || !idB) {
            d("尚未标记对照 A/B，可在字幕库中标注后再挂载", "warn");
            return
        }
        const cur = String(lib.versionId || "").trim();
        let loadId = idA;
        let label = "对照A";
        if (cur && cur === idA) {
            loadId = idB;
            label = "对照B"
        } else if (cur && cur === idB) {
            loadId = idA;
            label = "对照A"
        }
        if (loadId === cur) {
            d("当前已是该对照版本", "warn");
            return
        }
        if (t.pairDirty && !await ie("挂载对照将替换当前副轨，未保存的副轨修改将丢失，继续？")) return;
        const opened = await p?.transubLibraryOpenVersion?.({ versionId: loadId });
        if (!opened?.ok || !opened.path) {
            d(opened?.error || "无法打开对照版本文件", "err");
            return
        }
        try {
            const doc = await p?.transubReadSubtitle?.({ path: opened.path });
            if (!doc?.ok || !Array.isArray(doc.cues) || !doc.cues.length) {
                d("对照版本内容为空或读取失败", "err");
                return
            }
            t.pairPath = opened.path;
            t.pairCues = doc.cues;
            t.pairFormat = doc.format || t.format || "srt";
            t.pairHeader = Array.isArray(doc.header) ? doc.header : [];
            t.pairDirty = !1;
            t.pairReadOnly = !0;
            t.libraryCompareVersionId = loadId;
            t.libraryCompareLabel = label;
            t.dualRole = t.dualRole === "source" ? "source" : "target";
            t.dualDisplayMode = zn();
            t.dualLineOrder = nn();
            if (e.dualDisplaySelect) e.dualDisplaySelect.value = t.dualDisplayMode;
            if (e.dualLineOrderSelect) e.dualLineOrderSelect.value = t.dualLineOrder;
            as(), kt(), C(), R(), syncLibraryBar();
            d(`已挂载${label}为只读副轨`, "ok")
        } catch (err) {
            d(err?.message || "挂载对照失败", "err")
        }
    }

    async function editorLibraryAbDiff() {
        const trackId = String(t.library?.trackId || "").trim();
        const mediaId = String(t.library?.mediaId || "").trim();
        if (!trackId && !mediaId) {
            d("当前不是从字幕库打开的版本", "warn");
            return
        }
        let res = null;
        if (trackId) {
            res = await p?.transubLibraryDiff?.({ abPair: true, trackId })
        }
        if (!res?.ok && mediaId) {
            const detail = await p?.transubLibraryGetMedia?.({ mediaId });
            const tracks = Array.isArray(detail?.tracks) ? detail.tracks : [];
            const hit = tracks.find((tr) => tr.abPairAvailable)
                || tracks.find((tr) => tr.id === trackId);
            if (hit?.id) res = await p?.transubLibraryDiff?.({ abPair: true, trackId: hit.id })
        }
        if (!res?.ok) {
            d(res?.error || "尚未标记对照 A/B，可在字幕库中标注后再对比", "warn");
            return
        }
        const body = e.libraryDiffBody;
        const meta = e.libraryDiffMeta;
        if (meta) {
            const ab = res.abPair ? "对照A → 对照B · " : "";
            const aSum = res.versionA?.recipeSummary || "—";
            const bSum = res.versionB?.recipeSummary || "—";
            const s = res.stats || {};
            meta.textContent = `${ab}${aSum} → ${bSum} · 相同 ${s.equal || 0} · +${s.added || 0} · -${s.deleted || 0}`
        }
        if (body) {
            const ops = Array.isArray(res.ops) ? res.ops : [];
            body.innerHTML = ops.length
                ? ops.slice(0, 500).map((op) => {
                    const text = b(String(op.text ?? ""));
                    if (op.op === "add") return `<div class="lib-diff-add">+ ${text}</div>`;
                    if (op.op === "del") return `<div class="lib-diff-del">- ${text}</div>`;
                    if (op.op === "skip") return `<div class="lib-diff-skip">${text}</div>`;
                    return `<div class="lib-diff-eq">  ${text}</div>`
                }).join("")
                : '<div class="lib-diff-skip">（无差异）</div>'
        }
        e.libraryDiffModal?.classList.remove("hidden")
    }

    async function editorLibraryRerun() {
        const versionId = String(t.library?.versionId || "").trim();
        if (!versionId) {
            d("当前不是从字幕库打开的版本", "warn");
            return
        }
        if (t.dirty && !await ie("再跑将转到主窗口；未保存的修改仍留在本编辑器。继续？")) return;
        const prepared = await p?.transubLibraryPrepareRerun?.({ versionId });
        if (!prepared?.ok) {
            d(prepared?.error || "准备再跑失败（可能需要 Pro）", "err");
            return
        }
        const started = await p?.transubLibraryStartRetranslate?.({
            mediaPath: prepared.mediaPath,
            sourcePath: prepared.sourcePath,
            keptPath: prepared.keptPath,
            destPath: prepared.destPath,
            hints: prepared.hints,
            recipe: prepared.recipe || null,
            recipeSummary: prepared.hints?.recipeSummary || t.library?.recipeSummary || "",
            sourceVersionId: prepared.sourceVersionId,
            seedVersionId: prepared.seedVersionId
        });
        if (!started?.ok) {
            d(started?.error || "无法转到主窗口重新翻译", "err");
            return
        }
        d("已转到主窗口，请确认重新翻译", "ok")
    }

    function Al() {}

    function Fl() {}

    function Rl() {}

    function el() {
        t.ready ? Be() : e.timelineCues && me({
            skipDuration: !0
        })
    }

    function Wr() {
        if (!e.playPauseBtn || !e.video) return;
        const n = !e.video.paused && !e.video.ended;
        e.playPauseBtn.innerHTML = n ? '<i class="fa fa-pause"></i>' : '<i class="fa fa-play"></i>', e.playPauseBtn.title = n ? "\u6682\u505C (Space)" : "\u64AD\u653E (Space)"
    }

    function Fi(n) {
        if (!e.video || !t.videoPath) return;
        const r = Number.isFinite(e.video.duration) ? e.video.duration : 1 / 0;
        e.video.currentTime = Math.max(0, Math.min(r, (e.video.currentTime || 0) + n)), Ce(!0)
    }

    function Ri() {
        return Math.max(500, Number(t.timeline.minViewMs) || 2e3)
    }

    function Me() {
        return Math.max(1, t.timeline.viewEndMs - t.timeline.viewStartMs)
    }

    function he() {
        const n = Math.max(1, t.timeline.durationMs);
        return Me() < n - 1
    }

    function tl(n) {
        const r = Math.max(1, n || t.timeline.durationMs || 1),
            i = Math.min(Ri(), r);
        return Math.max(1, r / i)
    }

    function Hr(n, r) {
        const i = Number(n),
            s = Number(t.timeline.zoom) || 5,
            a = tl(r);
        return !Number.isFinite(i) || i < 1 ? Math.min(s, a) : Math.max(1, Math.min(a, i))
    }

    function nl() {
        const n = Math.max(1, t.timeline.durationMs),
            r = Me();
        t.timeline.zoom = Hr(n / r, n), t.timeline.fitted = r >= n - 1
    }

    function Ni() {
        const n = Math.max(1, t.timeline.durationMs),
            r = Math.min(Ri(), n);
        let i = Math.max(r, t.timeline.viewEndMs - t.timeline.viewStartMs);
        i = Math.min(i, n);
        let s = Number(t.timeline.viewStartMs) || 0;
        Number.isFinite(s) || (s = 0), s = Math.max(0, Math.min(s, n - i)), t.timeline.viewStartMs = s, t.timeline.viewEndMs = s + i, nl(), Rn()
    }

    function An(n, r, {
        save: i = !0,
        preserveStart: s = !1
    } = {}) {
        const a = Math.max(1, t.timeline.durationMs),
            o = Hr(n, a),
            l = a / o,
            c = t.timeline.viewStartMs,
            u = Me();
        let m;
        if (s && u > 0 && t.timeline.viewEndMs > t.timeline.viewStartMs) m = c;
        else {
            const f = Number.isFinite(r) ? Math.max(0, Math.min(a, r)) : u > 0 ? c + u / 2 : 0,
                g = u > 0 ? Math.max(0, Math.min(1, (f - c) / u)) : .35;
            m = f - g * l
        }
        t.timeline.viewStartMs = m, t.timeline.viewEndMs = m + l, Ni(), i && (t.timeline.zoom = Sl(t.timeline.zoom))
    }

    function qi() {
        An(1, 0, {
            save: !0,
            preserveStart: !1
        })
    }

    function Fn(n, r) {
        t.timeline.viewStartMs = n, t.timeline.viewEndMs = r, Ni()
    }

    function zt(n, r) {
        const i = (Number(t.timeline.zoom) || 1) / Math.max(.01, n);
        An(i, r, {
            save: !0
        })
    }

    function rl(n) {
        return !n || !he() ? !1 : (Fn(t.timeline.viewStartMs + n, t.timeline.viewEndMs + n), !0)
    }

    function Wi(n, {
        marginRatio: r = .12,
        forceCenter: i = !1
    } = {}) {
        if (!he()) return !1;
        const s = Me(),
            a = s * Math.max(0, Math.min(.4, r)),
            o = t.timeline.viewStartMs,
            l = t.timeline.viewEndMs;
        if (!i && n >= o + a && n <= l - a) return !1;
        const c = n - s * .35;
        return Fn(c, c + s), !0
    }

    function Rn() {
        const n = he(),
            r = t._menuTimelineZoomed === !0,
            i = Math.max(1, t.timeline.durationMs),
            s = Me(),
            a = Number(t.timeline.zoom) || i / s;
        if (e.timelineZoomFit && (e.timelineZoomFit.disabled = !n), e.timelineHScrollWrap && (e.timelineHScrollWrap.classList.toggle("hidden", !n), e.timelineHScrollWrap.setAttribute("aria-hidden", n ? "false" : "true")), e.timelineHScroll && n) {
            const o = Math.max(1, i - s),
                l = Math.max(0, Math.min(1, t.timeline.viewStartMs / o)),
                c = Number(e.timelineHScroll.max) || 1e3,
                u = Math.round(l * c);
            Number(e.timelineHScroll.value) !== u && (e.timelineHScroll.value = String(u))
        }
        if (e.timelineStack) {
            const o = n ? ` \xB7 \u5DF2\u653E\u5927 ${a.toFixed(1)}\xD7` : "";
            e.timelineStack.title = `\u70B9\u51FB\u5B9A\u4F4D \xB7 \u62D6\u62FD\u5B57\u5E55\u5757\u8C03\u6574\u65F6\u95F4 \xB7 \u6EDA\u8F6E\u5E73\u79FB \xB7 Ctrl+\u6EDA\u8F6E\u7F29\u653E${o}`
        }
        r !== n && (t._menuTimelineZoomed = n, ee())
    }

    function sl() {
        const n = ke?.getLayoutState?.()?.preset || "classic";
        return {
            autoFocus: t.autoFocus === !0,
            waveform: t.waveformEnabled === !0,
            darkTheme: document.body.classList.contains("editor-theme-dark"),
            timelineZoomed: he(),
            layoutPreset: n
        }
    }

    function ee() {
        p?.transubEditorSyncMenuState && (t._menuTimelineZoomed = he(), p.transubEditorSyncMenuState({
            viewState: sl()
        }))
    }

    function Nn() {
        let n = 0;
        e.video && Number.isFinite(e.video.duration) && e.video.duration > 0 ? n = Math.round(e.video.duration * 1e3) : t.cues.length && (n = Math.max(...t.cues.map(o => I(o)), 1e3));
        const r = Math.max(n, 1e3),
            s = t.timeline.durationMs > 0 && t.timeline.viewEndMs > t.timeline.viewStartMs;
        t.timeline.durationMs = r;
        const a = Hr(t.timeline.zoom || na(), r);
        if (t.timeline.zoom = a, s) An(a, null, {
            save: !1,
            preserveStart: !0
        });
        else {
            const o = e.video ? Math.round((e.video.currentTime || 0) * 1e3) : 0;
            An(a, o, {
                save: !1,
                preserveStart: !1
            })
        }
    }

    function Pe(n) {
        const r = e.timelineTrack;
        if (!r) return 0;
        const i = r.clientWidth || 1,
            s = Me();
        return (n - t.timeline.viewStartMs) / s * i
    }

    function qn(n, r) {
        const i = r || e.timelineTrack;
        if (!i) return 0;
        const s = i.clientWidth || 1,
            a = Me();
        return t.timeline.viewStartMs + n / s * a
    }

    function Hi() {
        if (!e.timelineCues) return !1;
        const n = e.timelineTrack?.clientWidth || 0,
            r = e.timelineCues.querySelectorAll(".editor-timeline-cue");
        if (!r.length && t.cues.length) return !1;
        const i = new Map;
        r.forEach(s => {
            const a = Number(s.getAttribute("data-tl-idx"));
            Number.isInteger(a) && i.set(a, s)
        });
        for (let s = 0; s < t.cues.length; s += 1) {
            const a = t.cues[s],
                o = Pe(a.startMs),
                l = Pe(I(a)),
                c = !(n > 0 && (l < -4 || o > n + 4)),
                u = i.get(s);
            if (c && !u) return !1;
            if (u) {
                if (!c) {
                    u.style.display = "none";
                    continue
                }
                u.style.display = "", u.style.left = `${o}px`, u.style.width = `${Math.max(3,l-o)}px`
            }
        }
        return !0
    }

    function il() {
        t.timelineFollowRaf || (t.timelineFollowRaf = requestAnimationFrame(() => {
            if (t.timelineFollowRaf = 0, !e.video || e.video.paused) return;
            const n = Math.round((e.video.currentTime || 0) * 1e3);
            if (!Wi(n)) {
                tt(n);
                return
            }
            if (!Hi()) {
                me({
                    skipDuration: !0
                });
                return
            }
            Rn(), tt(n), t.waveformEnabled && Ge()
        }))
    }

    function tt(n, {
        follow: r = !1
    } = {}) {
        if (r && e.video && !e.video.paused && he()) {
            const a = Me() * .12,
                o = t.timeline.viewStartMs,
                l = t.timeline.viewEndMs;
            (n < o + a || n > l - a) && il()
        }
        const i = Pe(n);
        e.timelinePlayhead && (e.timelinePlayhead.style.left = `${i}px`), e.waveformPlayhead && t.waveformEnabled && (e.waveformPlayhead.style.left = `${i}px`)
    }

    function ue(n, r) {
        const i = !!n && t.waveformEnabled,
            s = r || "\u6B63\u5728\u52A0\u8F7D\u6CE2\u5F62\u2026";
        e.waveformLoading && (e.waveformLoading.classList.toggle("hidden", !i), e.waveformLoading.setAttribute("aria-hidden", i ? "false" : "true")), e.waveformLoadingText && (e.waveformLoadingText.textContent = s), e.waveformToggle && (e.waveformToggle.classList.toggle("is-loading", i), i ? e.waveformToggle.title = s : t.waveformEnabled && (e.waveformToggle.title = "\u6CE2\u5F62\u65F6\u95F4\u8F74\uFF1A\u5F00\u542F\uFF08\u9ED8\u8BA4\uFF09")), e.waveformRow && e.waveformRow.classList.toggle("is-loading", i)
    }

    function Ge() {
        const n = e.timelineWaveform;
        if (!n || !t.waveformEnabled) return;
        const r = t.waveform.peaks,
            i = e.waveformTrack || e.timelineTrack;
        if (!i || !Array.isArray(r) || !r.length) {
            const te = n.getContext?.("2d");
            te && te.clearRect(0, 0, n.width || 1, n.height || 1);
            return
        }
        const s = i.getBoundingClientRect(),
            a = Math.max(1, Math.floor(s.width)),
            o = Math.max(1, Math.floor(s.height)),
            l = Math.min(2, window.devicePixelRatio || 1),
            c = Math.floor(a * l),
            u = Math.floor(o * l),
            m = n.width !== c || n.height !== u;
        m && (n.width = c, n.height = u, n.style.width = `${a}px`, n.style.height = `${o}px`);
        const f = n.getContext("2d");
        if (!f) return;
        m && f.setTransform(l, 0, 0, l, 0, 0), f.clearRect(0, 0, a, o);
        const g = o / 2;
        f.fillStyle = "rgba(148, 163, 184, 0.9)";
        const h = Math.max(1, (Number(t.waveform.durationSec) > 0 ? t.waveform.durationSec * 1e3 : t.timeline.durationMs) || 1),
            v = Math.max(0, Math.floor(t.timeline.viewStartMs / h * r.length)),
            y = Math.min(r.length, Math.ceil(t.timeline.viewEndMs / h * r.length)),
            k = Math.max(1, y - v),
            q = Math.max(1, Math.floor(k / a));
        for (let te = 0; te < a; te += 1) {
            const N = Math.min(r.length - 1, v + Math.floor(te / a * k));
            let W = r[N] || 0;
            for (let M = 1; M < q && N + M < r.length; M += 1) W = Math.max(W, r[N + M] || 0);
            const B = Math.max(1, W * (o * .45));
            f.fillRect(te, g - B, 1, B * 2)
        }
    }
    async function Wn(n = {}) {
        const r = n.announce === !0;
        if (!t.waveformEnabled) {
            ue(!1);
            return
        }
        if (!t.videoPath) {
            ue(!1), r && d("\u8BF7\u5148\u5173\u8054\u89C6\u9891\u540E\u518D\u663E\u793A\u6CE2\u5F62", "warn");
            return
        }
        if (!p?.ffmpegExtractWaveform) {
            ue(!1), r && d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u6CE2\u5F62\u63D0\u53D6", "err");
            return
        }
        const i = t.videoPath,
            s = `${i}|${t.timeline.durationMs||0}`;
        if (t.waveform.cacheKey === s && Array.isArray(t.waveform.peaks)) {
            ue(!1), Ge(), r && d("\u6CE2\u5F62\u5DF2\u5C31\u7EEA", "ok");
            return
        }
        if (t.waveform.loading) {
            t._waveformReloadPending = !0, ue(!0, "\u6B63\u5728\u52A0\u8F7D\u6CE2\u5F62\u2026");
            return
        }
        const a = t.waveformLoadGen = (t.waveformLoadGen || 0) + 1;
        t._waveformReloadPending = !1, t.waveform.loading = !0, ue(!0, "\u6B63\u5728\u52A0\u8F7D\u6CE2\u5F62\u2026"), d("\u6B63\u5728\u4ECE\u89C6\u9891\u63D0\u53D6\u6CE2\u5F62\uFF0C\u8BF7\u7A0D\u5019\u2026", "");
        try {
            const o = await p.ffmpegExtractWaveform(ln({
                path: i,
                peaksPerSec: 40,
                maxPeaks: 24e3
            }));
            if (a !== t.waveformLoadGen || t.videoPath !== i) {
                ue(!1);
                return
            }
            if (!t.waveformEnabled) {
                ue(!1);
                return
            }
            if (o?.cancelled || ne()) {
                ue(!1), d("\u6CE2\u5F62\u52A0\u8F7D\u5DF2\u53D6\u6D88", "warn");
                return
            }
            if (!o?.ok || !Array.isArray(o.peaks)) {
                ue(!1), o?.error ? d(o.error, "err") : d("\u6CE2\u5F62\u52A0\u8F7D\u5931\u8D25", "err");
                return
            }
            t.waveform.peaks = o.peaks, t.waveform.durationSec = Number(o.durationSec) || 0, t.waveform.videoPath = i, t.waveform.cacheKey = s, Ge(), ue(!1), d("\u6CE2\u5F62\u5DF2\u5C31\u7EEA", "ok")
        } catch (o) {
            a === t.waveformLoadGen && t.videoPath === i && (ue(!1), d(o?.message || "\u6CE2\u5F62\u52A0\u8F7D\u5931\u8D25", "err"))
        } finally {
            a === t.waveformLoadGen && (t.waveform.loading = !1, (!t.waveformEnabled || Array.isArray(t.waveform.peaks)) && ue(!1), t._waveformReloadPending && t.videoPath && t.videoPath !== i && (t._waveformReloadPending = !1, Wn()))
        }
    }

    function al(n) {
        try {
            ke?.refreshPaneMins?.();
        } catch (_) { /* ignore */ }
        if (!n) {
            ue(!1), Ge();
            return
        }
        Wn({
            announce: !0
        }), Ge()
    }

    function Oi() {
        if (!e.timelineMarkers) return;
        const n = e.timelineTrack?.clientWidth || 0,
            r = [],
            i = t.markers?.abLoop;
        if (i && i.aMs != null && i.bMs != null && Number.isFinite(Number(i.aMs)) && Number.isFinite(Number(i.bMs))) {
            const a = Math.min(Number(i.aMs), Number(i.bMs)),
                o = Math.max(Number(i.aMs), Number(i.bMs)),
                l = Pe(a),
                c = Pe(o);
            if (!(n > 0 && (c < -4 || l > n + 4))) {
                const u = i.enabled === !1 ? " opacity:0.45;" : "";
                r.push(`<div class="editor-timeline-ab" style="left:${l}px;width:${Math.max(2,c-l)}px;${u}" title="A-B \u5FAA\u73AF"></div>`)
            }
        }
        const s = Array.isArray(t.markers?.bookmarks) ? t.markers.bookmarks : [];
        for (const a of s) {
            const o = Number(a?.timeMs);
            if (!Number.isFinite(o)) continue;
            const l = Pe(o);
            if (n > 0 && (l < -4 || l > n + 4)) continue;
            const c = String(a.label || "").trim() || Z(o, t.format),
                u = b(String(a.id || ""));
            r.push(`<div class="editor-timeline-bm" data-bm-id="${u}" data-bm-ms="${Math.round(o)}" style="left:${l}px" title="${b(c)}"></div>`)
        }
        e.timelineMarkers.innerHTML = r.join("")
    }

    function me(n = {}) {
        if (!e.timelineCues) return;
        n.skipDuration ? Rn() : Nn();
        const r = t.selectedIndices instanceof Set ? t.selectedIndices : new Set(t.selectedIndex >= 0 ? [t.selectedIndex] : []),
            i = e.timelineTrack?.clientWidth || 0;
        e.timelineCues.innerHTML = t.cues.map((a, o) => {
            const l = a.startMs,
                c = I(a),
                u = Pe(l),
                m = Pe(c);
            if (i > 0 && (m < -4 || u > i + 4)) return "";
            const f = Math.max(3, m - u),
                g = String(a.text || "").replace(/\s+/g, " ").trim();
            return `<div class="editor-timeline-cue${r.has(o)||o===t.selectedIndex?" selected":""}" data-tl-idx="${o}" style="left:${u}px;width:${f}px" title="${b(g)}">
                <div class="tl-handle tl-handle-l" data-tl-handle="l"></div>
                <div class="tl-label">${b(g.slice(0,24))}</div>
                <div class="tl-handle tl-handle-r" data-tl-handle="r"></div>
            </div>`
        }).join(""), Oi();
        const s = e.video ? Math.round((e.video.currentTime || 0) * 1e3) : 0;
        tt(s), t.waveformEnabled && (Ge(), Wn())
    }

    function Be() {
        me({
            skipDuration: !0
        })
    }

    function _i() {
        if (Rn(), !Hi()) {
            Be();
            return
        }
        Oi();
        const n = e.video ? Math.round((e.video.currentTime || 0) * 1e3) : t.timeline.viewStartMs;
        tt(n), t.waveformEnabled && Ge()
    }

    function Hn() {
        Le || (Le = requestAnimationFrame(() => {
            Le = 0, _i()
        }))
    }

    function Ut(n) {
        if (!e.timelineCues || n < 0 || n >= t.cues.length) return !1;
        const r = t.cues[n],
            i = e.timelineCues.querySelector(`.editor-timeline-cue[data-tl-idx="${n}"]`),
            s = e.timelineTrack?.clientWidth || 0,
            a = Pe(r.startMs),
            o = Pe(I(r)),
            l = !(s > 0 && (o < -4 || a > s + 4));
        if (!i) return !l;
        if (!l) return i.style.display = "none", !0;
        i.style.display = "", i.style.left = `${a}px`, i.style.width = `${Math.max(3,o-a)}px`;
        const c = String(r.text || "").replace(/\s+/g, " ").trim();
        i.title = c;
        const u = i.querySelector(".tl-label");
        return u && (u.textContent = c.slice(0, 24)), !0
    }

    function ol() {
        const n = e.timelineTrack;
        if (!n || n.dataset.bound === "1") return;
        n.dataset.bound = "1";
        const r = (o, l) => {
                ct();
                const c = o.clientX,
                    u = t.timeline.viewStartMs,
                    m = t.timeline.viewEndMs,
                    f = Math.max(1, m - u),
                    g = l.clientWidth || 1;
                t.timeline.panning = !0, o.preventDefault();
                const h = y => {
                        if (!t.timeline.panning) return;
                        const k = y.clientX - c,
                            q = -Math.round(k / g * f);
                        Fn(u + q, m + q), Hn()
                    },
                    v = () => {
                        t.timeline.panning = null, window.removeEventListener("mousemove", h), window.removeEventListener("mouseup", v), Le && (cancelAnimationFrame(Le), Le = 0), Be()
                    };
                window.addEventListener("mousemove", h), window.addEventListener("mouseup", v)
            },
            i = o => {
                o?.addEventListener("auxclick", l => {
                    l.button === 1 && l.preventDefault()
                }), o?.addEventListener("mousedown", l => {
                    l.button === 1 && l.preventDefault()
                })
            };
        i(n), i(e.waveformTrack), n.addEventListener("mousedown", o => {
            const l = o.target.closest?.(".editor-timeline-bm");
            if (l) {
                if (o.button !== 0) return;
                o.preventDefault(), o.stopPropagation();
                const B = Number(l.getAttribute("data-bm-ms"));
                e.video && Number.isFinite(B) && B >= 0 && (e.video.currentTime = B / 1e3, Ce(!0));
                return
            }
            const c = o.target.closest?.(".editor-timeline-cue"),
                u = o.target.closest?.("[data-tl-handle]")?.getAttribute("data-tl-handle"),
                m = n.getBoundingClientRect(),
                f = o.clientX - m.left;
            if (o.button === 1 || o.button === 0 && (o.altKey || o.shiftKey) && !c) {
                if (!he()) return;
                r(o, n);
                return
            }
            if (!c) {
                if (!e.video || !t.videoPath || o.button !== 0) return;
                const B = Math.max(0, qn(f));
                e.video.currentTime = B / 1e3, Ce(!0);
                return
            }
            if (o.button !== 0) return;
            const g = Number(c.getAttribute("data-tl-idx"));
            if (!Number.isFinite(g) || g < 0) return;
            X(g, {
                scroll: !0,
                seek: !1
            });
            const h = t.cues[g];
            if (!h) return;
            const v = u === "l" ? "start" : u === "r" ? "end" : "move",
                y = o.clientX,
                k = h.startMs,
                q = I(h);
            t.timeline.dragging = {
                idx: g,
                mode: v,
                originX: y,
                originStart: k,
                originEnd: q
            }, o.preventDefault(), $();
            const te = (B = !1) => {
                    const M = t.timeline.dragging;
                    if (!M) return;
                    const L = t.cues[M.idx];
                    if (L && (Se(M.idx), R(), Ut(M.idx) || Be(), e.video && t.videoPath)) {
                        const w = performance.now();
                        if (B || w - ns >= 50) {
                            ns = w;
                            const A = M.mode === "end" ? I(L) - 1 : L.startMs;
                            e.video.currentTime = Math.max(0, A) / 1e3
                        }
                    }
                },
                N = B => {
                    const M = t.timeline.dragging;
                    if (!M) return;
                    const L = B.clientX - M.originX,
                        w = n.clientWidth || 1,
                        A = Me(),
                        F = Math.round(L / w * A),
                        re = t.cues[M.idx];
                    if (!re) return;
                    let pe, le;
                    M.mode === "move" ? (pe = Math.max(0, M.originStart + F), le = Math.max(pe + 100, M.originEnd + F)) : M.mode === "start" ? (pe = Math.max(0, Math.min(M.originEnd - 100, M.originStart + F)), le = M.originEnd) : (pe = re.startMs, le = Math.max(re.startMs + 100, M.originEnd + F));
                    const ge = T.TransubTimelineMagnet;
                    if (ge && !B.altKey) {
                        const bt = e.video && Number.isFinite(e.video.currentTime) ? Math.round(e.video.currentTime * 1e3) : null,
                            Qt = ge.silenceIntervalsToEdges(t.timeline.silenceIntervals || t.waveform?.silenceIntervals || [], {
                                viewStartMs: t.timeline.viewStartMs,
                                viewEndMs: t.timeline.viewEndMs
                            }),
                            ze = ge.collectSnapTargets(t.cues, M.idx, {
                                playheadMs: bt,
                                silenceEdges: Qt
                            }),
                            fe = ge.thresholdForViewSpan(A, {
                                trackWidthPx: w
                            }),
                            S = ge.snapDragTiming({
                                mode: M.mode,
                                startMs: pe,
                                endMs: le,
                                originStart: M.originStart,
                                originEnd: M.originEnd,
                                targets: ze,
                                thresholdMs: fe
                            });
                        pe = S.startMs, le = S.endMs, M._magnet = S.snapped
                    } else M._magnet = null;
                    re.startMs = pe, re.endMs = le, P(!0), !it && (it = requestAnimationFrame(() => {
                        it = 0, te(!1)
                    }))
                },
                W = () => {
                    const B = t.timeline.dragging,
                        M = B?.idx ?? g,
                        L = B?.mode || v;
                    t.timeline.dragging = null, window.removeEventListener("mousemove", N), window.removeEventListener("mouseup", W), it && (cancelAnimationFrame(it), it = 0);
                    const w = t.cues[M];
                    if (w && e.video && t.videoPath) {
                        const A = L === "end" ? I(w) - 1 : w.startMs;
                        e.video.currentTime = Math.max(0, A) / 1e3
                    }
                    Se(M), R(), tr(), ye(), Be()
                };
            window.addEventListener("mousemove", N), window.addEventListener("mouseup", W)
        }), n.addEventListener("contextmenu", o => {
            const l = o.target.closest?.(".editor-timeline-cue");
            if (!l) return;
            o.preventDefault();
            const c = Number(l.getAttribute("data-tl-idx"));
            or(c, o.clientX, o.clientY, {
                scroll: !0
            })
        });
        const s = e.waveformTrack;
        s && s.dataset.bound !== "1" && (s.dataset.bound = "1", s.addEventListener("mousedown", o => {
            if (!t.waveformEnabled) return;
            if (o.button === 1 || o.button === 0 && (o.altKey || o.shiftKey)) {
                if (!he()) return;
                r(o, s);
                return
            }
            if (o.button !== 0 || !e.video || !t.videoPath) return;
            const l = s.getBoundingClientRect(),
                c = o.clientX - l.left,
                u = Math.max(0, qn(c, s));
            e.video.currentTime = u / 1e3, Ce(!0)
        }), s.addEventListener("contextmenu", o => {
            if (!t.waveformEnabled) return;
            const l = s.getBoundingClientRect(),
                c = o.clientX - l.left,
                u = Math.max(0, qn(c, s)),
                m = ps(u);
            m < 0 || (o.preventDefault(), or(m, o.clientX, o.clientY, {
                scroll: !0
            }))
        }));
        const a = e.timelineStack;
        a && a.dataset.zoomBound !== "1" && (a.dataset.zoomBound = "1", a.addEventListener("wheel", o => {
            if (!t.timeline.durationMs) return;
            const l = (e.timelineTrack || a).getBoundingClientRect(),
                c = o.clientX - l.left,
                u = qn(c);
            if (o.ctrlKey || o.metaKey) {
                o.preventDefault();
                const v = o.deltaY > 0 ? 1.2 : 1 / 1.2;
                zt(v, u), Hn();
                return
            }
            if (!he()) return;
            o.preventDefault();
            const m = Me(),
                f = Math.max(1, l.width || 1),
                g = Math.abs(o.deltaX) > Math.abs(o.deltaY) ? o.deltaX : o.deltaY,
                h = Math.round(g / f * m);
            rl(h) && Hn()
        }, {
            passive: !1
        })), e.timelineZoomIn?.addEventListener("click", () => {
            const o = e.video ? Math.round((e.video.currentTime || 0) * 1e3) : null;
            zt(1 / 1.5, o), Be()
        }), e.timelineZoomOut?.addEventListener("click", () => {
            const o = e.video ? Math.round((e.video.currentTime || 0) * 1e3) : null;
            zt(1.5, o), Be()
        }), e.timelineZoomFit?.addEventListener("click", () => {
            qi(), Be()
        }), e.timelineHScroll?.addEventListener("input", () => {
            if (!he()) return;
            const o = Number(e.timelineHScroll.max) || 1e3,
                l = Math.max(0, Math.min(1, Number(e.timelineHScroll.value) / o)),
                c = Me(),
                u = Math.max(0, t.timeline.durationMs - c),
                m = l * u;
            Fn(m, m + c), Hn()
        }), e.timelineHScroll?.addEventListener("change", () => {
            he() && (Le && (cancelAnimationFrame(Le), Le = 0), Be())
        }), window.addEventListener("resize", () => {
            t.ready && (t._timelineResizeTimer && clearTimeout(t._timelineResizeTimer), t._timelineResizeTimer = setTimeout(() => {
                t._timelineResizeTimer = null, _i() || Be()
            }, 100))
        })
    }

    function ji() {
        e.shortcutsModal && Q(e.shortcutsModal, e.shortcutsClose)
    }

    function Or() {
        K(e.shortcutsModal)
    }
    const Gi = {
        state: t,
        els: e
    };
    j.installModals(Gi);
    const {
        isElementFocusable: Nl,
        clearStaleFocus: ql,
        pickEditorFocusTarget: Wl,
        restoreEditorFocus: ht,
        requestOsRefocus: On,
        releaseFocusFromModal: Hl,
        editorConfirm: ie,
        editorChoice: ll,
        showEditorModal: Q,
        hideEditorModal: K
    } = Gi, Ki = {
        els: e,
        setStatus: d
    };
    j.installBootProgress(Ki);
    const {
        flushBootProgressPaint: _r,
        showBootProgress: Vi,
        updateBootProgress: jr,
        hideBootProgress: Gr
    } = Ki, zi = {
        els: e,
        state: t,
        setStatus: d
    };
    j.installInferenceProgress(zi);
    const {
        showInferenceProgress: Ui,
        updateInferenceProgress: Qi,
        hideInferenceProgress: Zi,
        getInferenceKind: Ol,
        formatInferenceElapsed: cl
    } = zi, Xi = {
        state: t,
        els: e,
        splitCore: D,
        clampTargetCps: ma,
        setStatus: d,
        isAutoFocusEnabled: Et,
        followPlaybackFocus: Ei,
        getSelectedSplitMode: vn,
        onWaveformPrefChanged: al,
        syncMenuState: () => ee()
    };
    j.installPrefs(Xi);
    const {
        loadTargetCpsPrefs: _l,
        saveTargetCpsPrefs: Yi,
        getTargetCps: yt,
        applyTargetCpsPrefs: dl,
        getDefaultBreakWords: ul,
        loadBreakWords: vt,
        saveBreakWords: _n,
        clampRetranscribeDurSec: ml,
        loadRetranscribeDurPrefs: nt,
        saveRetranscribeDurPrefs: Kr,
        loadSplitPrefs: Ke,
        saveSplitPrefs: Vr,
        applySplitPrefsToModal: fl,
        applyAutoFocusUi: jl,
        loadAutoFocusPref: pl,
        toggleAutoFocus: Ji,
        applyTheme: Gl,
        loadTheme: gl,
        toggleTheme: ea,
        applyPanelWidth: Kl,
        loadPanelWidth: hl,
        loadDetailToolsPref: yl,
        loadWaveformPref: vl,
        toggleWaveform: ta,
        loadTimelineZoomPref: na,
        saveTimelineZoomPref: Sl,
        loadFilmHints: zr,
        saveFilmHints: ra,
        loadListFilterPrefs: sa,
        saveListFilterPrefs: ia
    } = Xi;
    let ke = null;
    typeof j.installLayout == "function" && (ke = j.installLayout({
        els: e,
        setStatus: d,
        onLayoutChanged: () => {
            ee()
        },
        onLayoutResized: () => {
            el()
        }
    }));
    const aa = {
        state: t,
        els: e,
        utils: j.utils,
        setDirty: P,
        renderCueList: C,
        setStatus: d,
        syncDetailToCue: x,
        editorConfirm: ie,
        closeFindReplaceModal: mt
    };
    j.installUndo(aa);
    const {
        recordUndoBeforeChange: $,
        beginDetailUndoGroup: bl,
        clearUndoHistory: xl,
        undo: Ur,
        redo: Qr,
        saveInitialSnapshot: Ml,
        restoreInitialSnapshot: Zr
    } = aa, St = j.installWorkflows({
        workflowsCore: Xr,
        state: t,
        els: e,
        electron: p,
        showEditorModal: Q,
        hideEditorModal: K,
        setStatus: d,
        recordUndoBeforeChange: $,
        syncDetailToCue: x,
        setDirty: P,
        renderCueList: C,
        renderDetailPane: R,
        refreshQcBadge: xr,
        getDefaultQcScanOptions: br,
        getTargetCps: yt,
        loadSplitPrefs: Ke,
        loadFilmHints: zr,
        getEffectiveGlossary: xe,
        getSelectedCueIndexes: J,
        getVisibleCueIndexes: Vt,
        qcCore: oe,
        fluencyCore: Ne,
        chineseCore: Gn,
        glossaryCore: se,
        textPresetsCore: _,
        metaCore: z,
        insertPresetGroup: Ar,
        exportMergedDualSubtitle: on,
        saveDocument: Pt,
        flushDraftAutosave: cs,
        shiftAllCues: Kt,
        applyGlossaryUnification: ui,
        openGlossaryModal: Er,
        openBreakWordsModal: Gt,
        openTextPresetsModal: wn,
        openFindReplaceModal: qt,
        openQcModal: Fr,
        restoreInitialSnapshot: Zr,
        mergeSelectedCues: Xn,
        confirmBatchSilenceSplit: si,
        confirmBatchSilenceDurAdjust: Xs,
        confirmBatchAudioSnapAdjust: Ys,
        collectBatchDurMatches: ft,
        collectSmartSplitMatches: gr,
        collectSilenceSplitMatches: yr,
        computeSplitParts: Ye,
        maybeFixOverlapAfterSplit: At,
        cueEndMs: I,
        runRetranscribeRange: ut,
        retranslateSelectedCue: Ns,
        retranscribeDualSelectedCue: qs,
        selectCue: X,
        refreshListRow: Se,
        showSilenceSplitProgress: Ee,
        updateSilenceSplitProgress: de,
        hideSilenceSplitProgress: Ie,
        flushSilenceProgressPaint: ce,
        showInferenceProgress: Ui,
        updateInferenceProgress: Qi,
        hideInferenceProgress: Zi,
        formatInferenceElapsed: cl,
        setSilenceSplitBusy: Te,
        canSilenceSplitCue: $t,
        loadRetranscribeDurPrefs: nt,
        getPlaybackTimeMs: De,
        buildFindRegex: Kn,
        esc: b,
        syncDualDisplaySelectVisibility: kt,
        invalidatePairOverlapIndex: as,
        loadDualDisplayMode: zn,
        loadDualLineOrder: nn,
        savePairDocument: os,
        basename: G
    });
    if (typeof j.installLowConfRetranscribe === "function") {
        Bl = j.installLowConfRetranscribe({
            state: t,
            els: e,
            setStatus: d,
            editorConfirm: ie,
            runRetranscribeRange: ut,
            selectCue: X,
            loadRetranscribeDurPrefs: nt,
            refreshCueMeta: He,
            renderCueList: C,
            metaCore: z,
        });
    }
    H = j.installKeptAndMarkers({
        state: t,
        els: e,
        electron: p,
        setStatus: d,
        recordUndoBeforeChange: $,
        setDirty: P,
        renderCueList: C,
        refreshListRow: Se,
        renderDetailPane: R,
        renderTimeline: me,
        basename: G,
        esc: b,
        showEditorModal: Q,
        hideEditorModal: K,
        hasDualPair: U,
        clearPairTrack: rn,
        syncDualDisplaySelectVisibility: kt,
        loadDualDisplayMode: zn,
        loadDualLineOrder: nn,
        cueEndMs: I,
        getSelectedCueIndexes: J,
        persistCueMeta: dn,
        refreshCueMeta: He,
        qcCore: oe,
        metaCore: z,
        dualCore: O,
        editorConfirm: ie,
        startContextReconstruct: Ve,
        startTextTranslate: we,
        openSmartSplitModal: hr,
        runSemanticBilingualReview: oa,
        exportAssDocument: la,
        exportAssWithSpeakerStyles: la,
        selectCue: X,
        getAssStylesUi: () => As,
        editorChoice: ll
    }), typeof j.createQcWorkerClient == "function" && (Xt = j.createQcWorkerClient({
        workerUrl: "js/subtitle-qc-worker.js"
    })), typeof j.createFindWorkerClient == "function" && (Yt = j.createFindWorkerClient({
        workerUrl: "js/subtitle-find-worker.js",
        findCore: T.TransubFindReplace
    })), window.addEventListener("beforeunload", () => {
        try {
            Xt?.dispose?.()
        } catch {}
        try {
            Yt?.dispose?.()
        } catch {}
        try {
            Jp?.destroy?.()
        } catch {}
        ls(), t._findDebounceTimer && clearTimeout(t._findDebounceTimer), t._qcBadgeTimer && clearTimeout(t._qcBadgeTimer), t._timelineResizeTimer && clearTimeout(t._timelineResizeTimer)
    }), typeof j.installWorkspaceUi == "function" && (Bt = j.installWorkspaceUi({
        state: t,
        els: e,
        setStatus: d,
        showEditorModal: Q,
        hideEditorModal: K
    })), As = j.installAssStylesUi({
        state: t,
        els: e,
        electron: p,
        assStylesCore: T.TransubAssStyles,
        markersCore: T.TransubEditorMarkers,
        setStatus: d,
        showEditorModal: Q,
        hideEditorModal: K,
        recordUndoBeforeChange: $,
        setDirty: P,
        renderCueList: C,
        renderDetailPane: R,
        getSelectedCueIndexes: J,
        editorConfirm: ie,
        esc: b,
        basename: G,
        hasDualPair: U,
        loadDualLineOrder: nn,
        persistMarkers: () => H?.persistMarkers?.(),
        onAssStylesChanged: () => {
            syncAssStyleColumn(), Ov?.syncToolbarVisibility?.(), C({
                listOnly: !0,
                reuseMeta: !0
            }), Jp?.scheduleSync?.(!0), It(!0)
        }
    }), Ov = j.installAssOverrideUi({
        state: t,
        els: e,
        assOverrideCore: T.TransubAssOverride,
        assStylesCore: T.TransubAssStyles,
        setStatus: d,
        recordUndoBeforeChange: $,
        setDirty: P,
        syncDetailToCue: x,
        renderCueList: C,
        renderDetailPane: R,
        refreshOverlay: It
    }), Jp = j.installJassubPreview({
        state: t,
        els: e,
        assStylesCore: T.TransubAssStyles,
        syncDetailToCue: x,
        isAssContext: () => !!Ov?.isAssContext?.(),
        refreshOverlay: It,
        onModeChange: n => {
            n === "jassub" ? It(!0) : n === "off" && Ov?.syncToolbarVisibility?.()
        }
    });
    async function runEditorBilingualReview() {
        const n = T.TransubBilingualReview;
        if (!n?.reviewBilingualPair) {
            d("\u53CC\u8BED\u5BA1\u9605\u6A21\u5757\u672A\u52A0\u8F7D", "err");
            return
        }
        let r = t.pairCues?.length ? t.pairCues : null;
        if (!r?.length && t.keptTranscript?.found && (r = await H?.loadKeptCues?.()), !r?.length) {
            d("\u9700\u8981\u5BF9\u7167\u8F68\u6216\u539F\u6587\u7F13\u5B58\u624D\u80FD\u53CC\u8BED\u5BA1\u9605", "err");
            return
        }
        const i = n.reviewBilingualPair(t.cues, r, {
            glossary: typeof xe == "function" ? xe() : null,
            dualApi: O
        });
        t.lastBilingualReview = i;
        const s = (i.issues || []).slice(0, 14).map(a => {
            const o = n.issueTypeLabel(a.type),
                l = a.primaryIndex != null ? `#${a.primaryIndex+1}` : a.sourceIndex != null ? `\u539F\u6587#${a.sourceIndex+1}` : "";
            return `<li><strong>${b(o)}</strong> ${b(l)} \u2014 ${b(a.message)}</li>`
        }).join("");
        e.genericModal && e.genericModalBody ? (e.genericModalTitle && (e.genericModalTitle.textContent = i.summary), e.genericModalBody.innerHTML = `
                <ul class="text-sm space-y-1 mb-3 max-h-64 overflow-auto">${s||"<li>\u65E0\u95EE\u9898</li>"}</ul>
                <p class="text-xs mb-2" style="color:var(--ed-muted)">\u89C4\u5219\u5BA1\u9605\u514D\u8D39\uFF1B\u8BED\u4E49\u5BA1\u9605\uFF08LLM\uFF09\u9700 Pro\u3002</p>
                <div class="editor-modal-actions">
                    <button type="button" data-kept-action="close">\u5173\u95ED</button>
                    <button type="button" class="primary" data-kept-action="semantic">\u8BED\u4E49\u5BA1\u9605 (Pro)</button>
                </div>
            `, t._genericModalHandler = a => {
            a === "close" && K(e.genericModal), a === "semantic" && (K(e.genericModal), oa(r))
        }, Q(e.genericModal, e.genericModalBody.querySelector("button"))) : d(i.summary, i.issues?.length ? "warn" : "ok")
    }

    function kl(n) {
        const r = O || T.TransubDualSubtitle,
            i = [],
            s = 40;
        for (let a = 0; a < t.cues.length && i.length < s; a += 1) {
            const o = t.cues[a],
                l = Number(o?.startMs) || 0,
                c = I(o),
                u = String(o?.text || "").trim();
            let m = "";
            if (r?.findBestOverlapCue) {
                const f = r.findBestOverlapCue(n, l, c);
                m = String(f?.cue?.text || "").trim()
            } else m = String(n[a]?.text || "").trim();
            !m && !u || i.push({
                index: a,
                source: m,
                target: u
            })
        }
        return i
    }
    async function oa(n) {
        if (!p?.transubAdvancedBilingualSemanticReview) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u8BED\u4E49\u5BA1\u9605", "err");
            return
        }
        if (t.reconstructBusy) {
            d("\u5DF2\u6709\u63A8\u7406\u4EFB\u52A1\u8FDB\u884C\u4E2D\u2026", "warn");
            return
        }
        if (t.computeBusy) {
            d(t.computeBusyLabel ? `\u5DF2\u6709${t.computeBusyLabel}\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5` : "\u5176\u5B83\u7A97\u53E3\u6709\u5F15\u64CE\u6216 LLM \u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "err");
            return
        }
        const r = n?.length ? n : t.pairCues?.length ? t.pairCues : await H?.loadKeptCues?.();
        if (!r?.length) {
            d("\u9700\u8981\u5BF9\u7167\u8F68\u6216\u539F\u6587\u7F13\u5B58\u624D\u80FD\u8BED\u4E49\u5BA1\u9605", "err");
            return
        }
        const i = kl(r);
        if (!i.length) {
            d("\u6CA1\u6709\u53EF\u5BA1\u6821\u7684\u53CC\u8BED\u6761\u76EE", "err");
            return
        }
        Ui({
            kind: "semantic",
            badge: "\u5927\u6A21\u578B\u63A8\u7406",
            title: "\u8BED\u4E49\u5BA1\u9605\u4E2D",
            detail: `\u6B63\u5728\u5BF9\u6BD4 ${i.length} \u6761\u539F\u6587/\u8BD1\u6587\u2026`,
            countText: `${i.length} \u6761`,
            hint: "\u8BED\u4E49\u5BA1\u9605\u4F1A\u8C03\u7528\u5927\u6A21\u578B\u9010\u6BB5\u7406\u89E3\u542B\u4E49\u5DEE\u5F02\uFF0C\u901A\u5E38\u9700\u8981\u6570\u5341\u79D2\u5230\u6570\u5206\u949F\u3002\u8BF7\u52FF\u5173\u95ED\u7A97\u53E3\uFF1B\u53EF\u968F\u65F6\u53D6\u6D88\u3002",
            indeterminate: !0,
            pct: 5
        });
        const s = p.onAdvancedReconstructProgress?.(a => {
            !a || a.mode !== "semantic-review" || Qi({
                message: a.message || a.detail || "\u8BED\u4E49\u5BA1\u9605\u8FDB\u884C\u4E2D\u2026",
                pct: a.pct ?? a.percent,
                phase: a.phase,
                indeterminate: !Number.isFinite(Number(a.pct ?? a.percent))
            })
        }) || null;
        try {
            const a = await p.transubAdvancedBilingualSemanticReview({
                pairs: i,
                suggestFixes: !0
            });
            if (!a?.ok) {
                d(a?.error || "\u8BED\u4E49\u5BA1\u9605\u5931\u8D25", "err");
                return
            }
            const o = Array.isArray(a.issues) ? a.issues : [];
            const suggestCount = o.filter(c => String(c.suggestedTarget || "").trim()).length;
            t.lastSemanticReview = a, H?.refreshContextActionBar?.();
            const l = o.slice(0, 20).map(c => {
                const u = Number(c.index),
                    m = Number.isInteger(u) ? `#${u+1}` : "",
                    sug = String(c.suggestedTarget || "").trim();
                return `<li><button type="button" class="ed-btn-block"${Number.isInteger(u)?` data-kept-action="goto-semantic" data-cue-idx="${u}"`:""}><strong>${b(c.type||"issue")}</strong> ${b(m)} \u2014 ${b(c.message||"")}${sug?`<br><span class="opacity-70">建议：${b(sug.slice(0,80))}</span>`:""}</button></li>`
            }).join("");
            e.genericModal && e.genericModalBody && (e.genericModalTitle && (e.genericModalTitle.textContent = a.summary || "\u8BED\u4E49\u5BA1\u9605"), e.genericModalBody.innerHTML = `
                    <ul class="text-sm space-y-1 mb-3 max-h-64 overflow-auto">${l||"<li>\u65E0\u95EE\u9898</li>"}</ul>
                    <div class="editor-modal-actions">
                        ${suggestCount?'<button type="button" class="primary" data-kept-action="semantic-apply">\u4E00\u952E\u91C7\u7EB3\u5EFA\u8BAE</button>':""}
                        ${o.length?'<button type="button" data-kept-action="semantic-reconstruct">\u8BED\u5883\u91CD\u6784\u9009\u4E2D \u25C6</button>':""}
                        <button type="button" data-kept-action="close">\u5173\u95ED</button>
                    </div>
                `, t._genericModalHandler = (c, u) => {
                if (c === "close") {
                    K(e.genericModal);
                    return
                }
                if (c === "goto-semantic") {
                    const m = Number(u?.target?.closest?.("[data-cue-idx]")?.getAttribute("data-cue-idx"));
                    Number.isInteger(m) && m >= 0 && (X(m, {
                        scroll: !0,
                        seek: !0
                    }), K(e.genericModal));
                    return
                }
                if (c === "semantic-apply") {
                    const smartApi = T.TransubSubtitleQcSmart;
                    if (smartApi?.applyQcSemanticSuggestions) {
                        $();
                        const applied = smartApi.applyQcSemanticSuggestions(t.cues, o);
                        if (applied.changed) {
                            t.cues.splice(0, t.cues.length, ...applied.cues), P(!0), C(), t.selectedIndex >= 0 && R();
                            d(`已采纳 ${applied.changed} 条建议译文`, "ok")
                        } else d("没有可采纳的建议译文", "info")
                    }
                    K(e.genericModal);
                    return
                }
                if (c === "semantic-reconstruct") {
                    const m = o.map(f => Number(f.index)).filter(f => Number.isInteger(f) && f >= 0);
                    m.length && (t.selectedIndices = new Set(m), t.selectedIndex = m[0], C({
                        listOnly: !0,
                        reuseMeta: !0
                    }), R()), K(e.genericModal), Ve({
                        mode: "basic"
                    })
                }
            }, Q(e.genericModal, e.genericModalBody.querySelector("button"))), d(a.summary || "\u8BED\u4E49\u5BA1\u9605\u5B8C\u6210", o.length ? "warn" : "ok")
        } catch (a) {
            d(a?.message || "\u8BED\u4E49\u5BA1\u9605\u5931\u8D25", "err")
        } finally {
            if (typeof s == "function") try {
                s()
            } catch {}
            Zi()
        }
    }
    async function la() {
        if (!p?.transubExportSubtitle) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u5BFC\u51FA", "err");
            return
        }
        if (p.transubAdvancedRequireFeature) {
            const o = await p.transubAdvancedRequireFeature({
                    featureId: "assStyleExport"
                }),
                l = o?.ok ? o : await p.transubAdvancedRequireFeature({
                    featureId: "contextReconstruct"
                });
            if (!l?.ok) {
                d(l?.error || o?.error || "\u5BFC\u51FA ASS \u6837\u5F0F\u9700\u89E3\u9501 Pro", "err");
                return
            }
        }
        if (x(), !t.cues.length) {
            d("\u6CA1\u6709\u53EF\u5BFC\u51FA\u7684\u5B57\u5E55", "err");
            return
        }
        const stylePayload = As?.getExportDocumentPayload?.() || As?.getExportSpeakerPayload?.() || {},
            styles = stylePayload.styles || [],
            header = stylePayload.header || As?.ensureHeader?.() || t.header,
            summary = As?.summarizeExport?.({
                assMode: "document",
                styles,
                cueCount: t.cues.length
            }) || `${styles.length || 1} \u4E2A Style \xB7 ${t.cues.length} \u6761`;
        if (As?.confirmAssExport && !await As.confirmAssExport(summary, "\u5BFC\u51FA ASS\uFF08\u5F53\u524D\u6837\u5F0F\uFF09")) return;
        const i = G(t.path || "subtitle.srt").replace(/\.[^.]+$/, "");
        let s = `${i}.ass`;
        if (t.path) {
            const o = String(t.path).replace(/[/\\][^/\\]+$/, ""),
                l = t.path.includes("\\") ? "\\" : "/";
            s = `${o}${l}${i}.ass`
        }
        const a = await p.transubExportSubtitle({
            title: "\u5BFC\u51FA ASS\uFF08\u5F53\u524D\u6837\u5F0F\uFF09",
            defaultName: s,
            format: "ass",
            assMode: "document",
            cues: t.cues,
            styles,
            header
        });
        if (!a?.canceled) {
            if (!a?.ok) {
                d(a?.error || "ASS \u5BFC\u51FA\u5931\u8D25", "err");
                return
            }
            d(`\u5DF2\u5BFC\u51FA ASS\uFF1A${G(a.path)}`, "ok")
        }
    }

    function ca() {
        return Math.round((e.video?.currentTime || 0) * 1e3)
    }

    function Cl({
        count: n,
        scope: r
    } = {}) {
        const i = e.filmHintModal;
        return !i || !Q || !K ? Promise.resolve({
            title: "",
            synopsis: "",
            terms: "",
            userNote: "",
            intensity: "balanced"
        }) : new Promise(s => {
            const a = typeof zr == "function" ? zr(t.path) : {
                    title: "",
                    synopsis: "",
                    terms: ""
                },
                o = t.path ? G(t.path).replace(/\.(srt|ass|ssa|vtt|json)$/i, "") : "";
            e.filmHintTitleInput && (e.filmHintTitleInput.value = a.title || o || ""), e.filmHintSynopsisInput && (e.filmHintSynopsisInput.value = a.synopsis || "");
            const c = ((typeof xe == "function" ? xe() : null)?.entries || []).filter(y => y?.enabled !== !1 && y?.canonical);
            if (e.filmHintTermsInput) {
                const y = a.terms || "";
                !y.trim() && c.length ? e.filmHintTermsInput.value = c.map(k => String(k.canonical || "").trim()).filter(Boolean).join("\uFF1B") : e.filmHintTermsInput.value = y
            }
            e.filmHintGlossaryHint && (c.length ? (e.filmHintGlossaryHint.textContent = `\u672F\u8BED\u8868\u542B ${c.length} \u6761\uFF0C\u5DF2\u53EF\u586B\u5165\u8BD1\u540D\u533A\uFF08\u53EF\u7F16\u8F91\uFF09`, e.filmHintGlossaryHint.classList.remove("hidden")) : (e.filmHintGlossaryHint.textContent = "", e.filmHintGlossaryHint.classList.add("hidden")));
            const sourceHintEl = e.filmHintSourceHint || document.getElementById("editorFilmHintSourceHint");
            if (sourceHintEl) {
                let coverMsg = "", coverLevel = "none";
                try {
                    const dualApi = T.TransubDualSubtitle;
                    const compare = T.TransubTranscriptCompare;
                    const list = t.cues || [];
                    let withSource = 0;
                    for (const cue of list) {
                        let sourceText = "";
                        if (dualApi && t.pairCues?.length && cue) {
                            const hit = dualApi.findBestOverlapCue(t.pairCues, cue.startMs, cue.endMs);
                            sourceText = String(hit?.cue?.text || "");
                        }
                        if (!sourceText && t.keptTranscript?.cues?.length && cue) {
                            const hit = compare?.findBestOverlapCue?.(t.keptTranscript.cues, cue.startMs, cue.endMs);
                            sourceText = String(hit?.cue?.text || "");
                        }
                        if (sourceText.trim()) withSource += 1;
                    }
                    const total = list.length;
                    const ratio = total ? withSource / total : 0;
                    if (!total) coverMsg = "";
                    else if (withSource === 0) {
                        coverLevel = "none";
                        coverMsg = "未找到原字幕：影片理解将依据译文字幕，建议先挂载或生成原文轨。";
                    } else if (ratio < .5) {
                        coverLevel = "low";
                        coverMsg = `原字幕覆盖约 ${Math.round(ratio*100)}%（${withSource}/${total}）：无原文的条目将用译文补齐理解。`;
                    } else if (withSource < total) {
                        coverLevel = "partial";
                        coverMsg = `原字幕覆盖 ${withSource}/${total} 条；Brief 优先依据原文，缺原文条用译文补齐。`;
                    } else {
                        coverLevel = "full";
                        coverMsg = `已挂载原字幕（${total} 条），Brief 将优先依据原文理解。`;
                    }
                } catch (_) { /* ignore */ }
                if (coverMsg) {
                    sourceHintEl.textContent = coverMsg;
                    sourceHintEl.classList.remove("hidden");
                    sourceHintEl.classList.toggle("is-warn", coverLevel === "none" || coverLevel === "low");
                    sourceHintEl.classList.toggle("is-ok", coverLevel === "full" || coverLevel === "partial");
                } else {
                    sourceHintEl.textContent = "";
                    sourceHintEl.classList.add("hidden");
                    sourceHintEl.classList.remove("is-warn", "is-ok");
                }
            }
            const u = a.intensity || "balanced";
            const pe = () => {
                const y = i.querySelector('input[name="editorFilmHintIntensity"]:checked');
                const k = String(y?.getAttribute("data-help") || "").trim();
                if (e.filmHintIntensityHelp) e.filmHintIntensityHelp.textContent = k
            };
            i.querySelectorAll('input[name="editorFilmHintIntensity"]').forEach(y => {
                y.checked = y.value === u || u !== "light" && u !== "strong" && y.value === "balanced",
                y.addEventListener("change", pe)
            }), pe(), e.filmHintScope && (e.filmHintScope.textContent = r === "selected" ? `\u5C06\u5904\u7406\u9009\u4E2D\u7684 ${n} \u6761\uFF08\u5148\u786E\u8BA4 Brief\uFF0C\u518D\u6309\u573A\u666F\u6539\u5199\uFF09` : `\u5C06\u5904\u7406\u5168\u90E8 ${n} \u6761\uFF08\u5148\u786E\u8BA4 Brief\uFF0C\u518D\u6309\u573A\u666F\u6539\u5199\uFF09`);
            let m = !1;
            const f = y => {
                    m || (m = !0, i.querySelectorAll("[data-film-hint-dismiss]").forEach(k => {
                        k.removeEventListener("click", g)
                    }), i.querySelectorAll('input[name="editorFilmHintIntensity"]').forEach(k => {
                        k.removeEventListener("change", pe)
                    }), e.filmHintConfirm?.removeEventListener("click", h), document.removeEventListener("keydown", v), K(i), s(y))
                },
                g = () => f(null),
                h = () => {
                    const y = String(e.filmHintTitleInput?.value || "").trim().slice(0, 120),
                        k = String(e.filmHintSynopsisInput?.value || "").trim().slice(0, 800),
                        q = String(e.filmHintTermsInput?.value || "").trim().slice(0, 800),
                        te = i.querySelector('input[name="editorFilmHintIntensity"]:checked'),
                        N = String(te?.value || "balanced");
                    typeof ra == "function" && ra(t.path, {
                        title: y,
                        synopsis: k,
                        terms: q,
                        intensity: N
                    });
                    const W = T.TransubAdvancedFilmReconstruct,
                        B = W?.composeFilmUserNote ? W.composeFilmUserNote({
                            title: y,
                            synopsis: k,
                            terms: q
                        }) : [y && `\u7247\u540D\uFF1A${y}`, k && `\u7B80\u4ECB\uFF1A${k}`, q && `\u8BD1\u540D\u4E0E\u8865\u5145\uFF1A${q}`].filter(Boolean).join(`
`);
                    f({
                        title: y,
                        synopsis: k,
                        terms: q,
                        userNote: B,
                        intensity: N
                    })
                },
                v = y => {
                    y.key === "Escape" && (y.preventDefault(), g())
                };
            i.querySelectorAll("[data-film-hint-dismiss]").forEach(y => {
                y.addEventListener("click", g)
            }), e.filmHintConfirm?.addEventListener("click", h), document.addEventListener("keydown", v), Q(i, e.filmHintTitleInput || e.filmHintConfirm)
        })
    }
    async function Ve({
        mode: n = "basic",
        forceAll: r = !1,
        scope: i = null
    } = {}) {
        const s = n === "film";
        if (!t.cues.length) {
            d("\u6CA1\u6709\u5B57\u5E55\u53EF\u91CD\u6784");
            return
        }
        if (t.reconstructBusy) {
            d(s ? "\u91CD\u6784\u8FDB\u884C\u4E2D\u2026" : "\u8BED\u5883\u91CD\u6784\u8FDB\u884C\u4E2D\u2026", "warn");
            return
        }
        if (t.computeBusy) {
            d(t.computeBusyLabel ? `\u5DF2\u6709${t.computeBusyLabel}\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5` : "\u5176\u5B83\u7A97\u53E3\u6709\u5F15\u64CE\u6216 LLM \u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "err");
            return
        }
        let a = "all";
        i === "bookmarks" || i === "filtered" || i === "lowConfidence" || i === "selected" || i === "all" ? a = i : r || (a = J().length ? "selected" : "all");
        let o = t.cues.length;
        if (a === "selected") {
            if (o = J().length, !o) {
                d("\u8BF7\u5148\u9009\u4E2D\u8981\u91CD\u6784\u7684\u5B57\u5E55", "err");
                return
            }
        } else if (a === "bookmarks") {
            if (o = (H?.markersCore || T.TransubEditorMarkers)?.filterIndexesByBookmarks?.(t.cues, t.markers, {
                    padMs: 80
                })?.length || 0, !o) {
                d("\u6CA1\u6709\u8986\u76D6\u4E66\u7B7E\u7684\u5B57\u5E55", "err");
                return
            }
        } else if (a === "filtered") {
            if (o = Vt().length, !o) {
                d("\u5F53\u524D\u7B5B\u9009\u65E0\u5B57\u5E55", "err");
                return
            }
        } else if (a === "lowConfidence" && (o = t.cues.map((m, f) => f).filter(m => t.cueMeta[m]?.low).length, !o)) {
            d("\u6CA1\u6709\u4F4E\u7F6E\u4FE1\u5B57\u5E55", "err");
            return
        }
        const l = a === "selected" ? `\u9009\u4E2D\u7684 ${o} \u6761` : a === "bookmarks" ? `\u4E66\u7B7E\u8986\u76D6\u7684 ${o} \u6761` : a === "filtered" ? `\u5F53\u524D\u7B5B\u9009\u7684 ${o} \u6761` : a === "lowConfidence" ? `\u4F4E\u7F6E\u4FE1 ${o} \u6761` : `\u5168\u90E8 ${o} \u6761`;
        let c = null;
        if (s) {
            if (c = await Cl({
                    count: o,
                    scope: a
                }), !c) {
                d("\u5DF2\u53D6\u6D88\u5F71\u7247\u7406\u89E3\u91CD\u6784");
                return
            }
        } else if (!await ie(`\u5BF9${l}\u505A\u8BED\u5883\u91CD\u6784\uFF1F`)) return;
        e.toolsMenu?.classList.add("hidden");
        const u = await St.runContextReconstructOnce({
            scope: a,
            mode: s ? "film" : "basic",
            filmTitle: c?.title || "",
            filmSynopsis: c?.synopsis || "",
            filmTerms: c?.terms || "",
            userNote: c?.userNote || "",
            intensity: c?.intensity || "balanced"
        });
        d(u?.summary || (s ? "\u5F71\u7247\u7406\u89E3\u91CD\u6784\u7ED3\u675F" : "\u8BED\u5883\u91CD\u6784\u7ED3\u675F"), u?.status === "failed" ? "err" : u?.status === "cancelled" ? "warn" : "ok")
    }
    async function jn() {
        let n = {};
        try {
            n = (await p?.transWithAiGetOptions?.({}))?.options || {}
        } catch {
            n = {}
        }
        const r = !!n.smartTranslateFaithfulTone,
            i = T.TransubSakuraMtCatalog,
            s = typeof i?.resolveTranslateModeFromOptions == "function" ? i.resolveTranslateModeFromOptions(n) : n.smartTranslate ? "smart" : i?.isLlmInferenceMtModel?.(String(n.engineMtModel || "").trim()) || i?.isSakuraMtModel?.(String(n.engineMtModel || "").trim()) || /^sakura-/i.test(String(n.engineMtModel || "").trim()) ? "llm" : "engine",
            a = typeof i?.normalizeTranslateMode == "function" ? i.normalizeTranslateMode(s) : s === "sakura" ? "llm" : s,
            o = typeof i?.translateModeLabel == "function" ? i.translateModeLabel(a) : a === "smart" ? "\u667A\u80FD\u7FFB\u8BD1" : a === "llm" ? "\u63A8\u7406\u7FFB\u8BD1" : "\u673A\u5668\u7FFB\u8BD1";
        if (a === "smart") return {
            engine: "smart",
            mode: "smart",
            label: o,
            faithfulTone: r,
            textMt: !0
        };
        if (a === "llm") {
            const c = String(n.engineMtModel || n.engineLlmMtModel || "").trim();
            return {
                engine: "llm",
                mode: "llm",
                label: c ? `${o}\uFF08${c}\uFF09` : o,
                faithfulTone: r,
                textMt: !0
            }
        }
        const l = String(n.engineMtModel || n.engineOpusMtModel || "").trim();
        return {
            engine: "opus",
            mode: "engine",
            label: l ? `${o}\uFF08${l}\uFF09` : `${o}\uFF08Opus\uFF09`,
            faithfulTone: !1,
            textMt: !0
        }
    }
    async function El(n, r = {}) {
        const i = (Array.isArray(n) ? n : []).map((m, f) => ({
            index: Number.isInteger(Number(m?.index)) ? Number(m.index) : f,
            startMs: m?.startMs,
            endMs: m?.endMs,
            text: String(m?.text ?? "").trim()
        })).filter(m => m.text);
        if (!i.length) return {
            ok: !1,
            error: "\u65E0\u53EF\u7FFB\u8BD1\u6587\u672C"
        };
        let s = r.engine === "smart" || r.engine === "llm" || r.engine === "sakura" || r.engine === "opus" ? r.engine === "sakura" ? "llm" : r.engine : null,
            a = r.faithfulTone;
        if (!s || a == null) {
            const m = await jn();
            if (!m.textMt) return {
                ok: !1,
                code: "unsupported",
                error: m.message || "\u5F53\u524D\u8BBE\u7F6E\u4E0D\u53EF\u7528\u4E8E\u7EAF\u6587\u672C\u7FFB\u8BD1"
            };
            s = s || m.engine, a == null && (a = m.faithfulTone)
        }
        if (s === "opus") {
            const m = p?.transubEngineTranslateCues;
            if (!m) return {
                ok: !1,
                error: "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u673A\u5668\u7FFB\u8BD1"
            };
            const f = await m({
                cues: i,
                glossary: xe(),
                fileName: t.path || t.videoPath || ""
            });
            return f?.ok ? {
                ok: !0,
                cues: Array.isArray(f.cues) ? f.cues : [],
                engine: "opus",
                label: "\u673A\u5668\u7FFB\u8BD1",
                summary: f.summary || f.message || ""
            } : {
                ok: !1,
                error: friendlyJobAbortMessage(f?.error || "\u673A\u5668\u7FFB\u8BD1\u5931\u8D25"),
                code: f?.code,
                cancelled: isJobAbortResult(f)
            }
        }
        const o = s === "smart",
            l = o ? p?.transubAdvancedSmartTranslate : p?.transubSakuraTranslate;
        if (!l) return {
            ok: !1,
            error: o ? "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u667A\u80FD\u7FFB\u8BD1" : "\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u63A8\u7406\u7FFB\u8BD1"
        };
        const c = {
            cues: i,
            glossary: xe(),
            fileName: t.path || t.videoPath || "",
            sourcePath: t.path || ""
        };
        if (o) {
            c.smartTranslateFaithfulTone = !!a;
            c.faithfulTone = !!a;
            try {
                const opts = (await p?.transWithAiGetOptions?.({}))?.options || {};
                c.smartTranslateHybridMt = opts.smartTranslateHybridMt !== false;
                c.smartTranslatePlotPolish = opts.smartTranslatePlotPolish !== false;
                const llmMt = String(opts.engineLlmMtModel || opts.hybridMtModelId || "").trim();
                if (llmMt) {
                    c.engineLlmMtModel = llmMt;
                    c.hybridMtModelId = llmMt;
                }
                const lang = String(opts.language || "").trim();
                if (lang) c.language = lang;
                const variant = String(opts.chineseSubtitleVariant || "").trim();
                if (variant) c.chineseSubtitleVariant = variant;
            } catch (_) {
                c.smartTranslateHybridMt = true;
                c.smartTranslatePlotPolish = true;
            }
        }
        const u = await l(c);
        return u?.ok ? {
            ok: !0,
            cues: Array.isArray(u.cues) ? u.cues : [],
            engine: s,
            label: o ? "\u667A\u80FD\u7FFB\u8BD1" : "\u63A8\u7406\u7FFB\u8BD1",
            summary: u.summary || u.message || ""
        } : {
            ok: !1,
            error: friendlyJobAbortMessage(u?.error || (o ? "\u667A\u80FD\u7FFB\u8BD1\u5931\u8D25" : "\u63A8\u7406\u7FFB\u8BD1\u5931\u8D25")),
            code: u?.code,
            cancelled: isJobAbortResult(u) || u?.code === "cancelled" || u?.code === "aborted"
        }
    }

    function Il(n, r, i) {
        const s = T.TransubDualSubtitle || null;
        return retranscribeRangePlan
            ? retranscribeRangePlan.collectSourceCuesForRange({
                mode: i,
                startMs: n,
                endMs: r,
                cues: t.cues,
                pairCues: t.pairCues,
                selectedIndex: t.selectedIndex,
                dualActive: U(),
                dualRole: t.dualRole,
                getEndMs: I,
                findBestOverlapCue: s?.findBestOverlapCue || null,
            })
            : []
    }
    async function we({
        engine: n = "auto",
        forceAll: r = !1,
        forceSelected: i = !1,
        scope: s = null
    } = {}) {
        let a = n === "advanced" ? "smart" : n === "sakura" ? "llm" : n,
            o = "",
            l = !1;
        if (!a || a === "auto" || a === "settings") {
            const y = await jn();
            if (y.unsupportedText || !y.textMt) {
                await ie(y.message || "\u5F53\u524D\u8BBE\u7F6E\u7684\u7FFB\u8BD1\u65B9\u5F0F\u4E0D\u53EF\u7528\u4E8E\u7F16\u8F91\u5668\u83DC\u5355\u7FFB\u8BD1", {
                    title: `\u5F53\u524D\u8BBE\u7F6E\uFF1A${y.label||"\u673A\u5668\u7FFB\u8BD1"}`,
                    okLabel: "\u77E5\u9053\u4E86",
                    cancelLabel: "\u5173\u95ED",
                    type: "warning"
                }), d(y.message || "\u5F53\u524D\u8BBE\u7F6E\u7684\u7FFB\u8BD1\u65B9\u5F0F\u4E0D\u53EF\u7528\u4E8E\u83DC\u5355\u7FFB\u8BD1", "err");
                return
            }
            a = y.engine, o = y.label, l = !!y.faithfulTone
        } else {
            try {
                l = !!(await p?.transWithAiGetOptions?.({}))?.options?.smartTranslateFaithfulTone
            } catch {
                l = !1
            }
            o = a === "smart" || a === "advanced" ? "\u667A\u80FD\u7FFB\u8BD1" : a === "opus" ? "\u673A\u5668\u7FFB\u8BD1" : "\u63A8\u7406\u7FFB\u8BD1"
        }
        const c = a === "smart" || a === "advanced",
            u = a === "opus";
        if (!t.cues.length) {
            d("\u6CA1\u6709\u5B57\u5E55\u53EF\u7FFB\u8BD1");
            return
        }
        if (t.reconstructBusy) {
            d("\u7FFB\u8BD1\u6216\u91CD\u6784\u8FDB\u884C\u4E2D\u2026", "warn");
            return
        }
        if (t.computeBusy) {
            d(t.computeBusyLabel ? `\u5DF2\u6709${t.computeBusyLabel}\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7B49\u5F85\u5B8C\u6210\u540E\u518D\u8BD5` : "\u5176\u5B83\u7A97\u53E3\u6709\u5F15\u64CE\u6216 LLM \u4EFB\u52A1\u6B63\u5728\u8FD0\u884C\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "err");
            return
        }
        if (c && !p?.transubAdvancedSmartTranslate) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u667A\u80FD\u7FFB\u8BD1", "err");
            return
        }
        if (u && !p?.transubEngineTranslateCues) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u673A\u5668\u7FFB\u8BD1", "err");
            return
        }
        if (!c && !u && !p?.transubSakuraTranslate) {
            d("\u5F53\u524D\u73AF\u5883\u4E0D\u652F\u6301\u63A8\u7406\u7FFB\u8BD1", "err");
            return
        }
        let m = "all";
        if (s === "bookmarks" || s === "filtered" || s === "lowConfidence" || s === "selected" || s === "all") m = s;
        else if (i) {
            if (!J().length) {
                d("\u8BF7\u5148\u9009\u4E2D\u8981\u7FFB\u8BD1\u7684\u5B57\u5E55", "err");
                return
            }
            m = "selected"
        } else r || (m = J().length ? "selected" : "all");
        let f = t.cues.length;
        if (m === "selected") f = J().length;
        else if (m === "bookmarks") {
            if (f = (H?.markersCore || T.TransubEditorMarkers)?.filterIndexesByBookmarks?.(t.cues, t.markers, {
                    padMs: 80
                })?.length || 0, !f) {
                d("\u6CA1\u6709\u8986\u76D6\u4E66\u7B7E\u7684\u5B57\u5E55", "err");
                return
            }
        } else if (m === "filtered" && (f = Vt().length, !f)) {
            d("\u5F53\u524D\u7B5B\u9009\u65E0\u5B57\u5E55", "err");
            return
        }
        o || (o = c ? "\u667A\u80FD\u7FFB\u8BD1" : u ? "\u673A\u5668\u7FFB\u8BD1" : "\u63A8\u7406\u7FFB\u8BD1");
        const g = m === "selected" ? f === 1 ? "\u672C\u6761" : `\u9009\u4E2D\u7684 ${f} \u6761` : m === "bookmarks" ? `\u4E66\u7B7E\u8986\u76D6\u7684 ${f} \u6761` : m === "filtered" ? `\u5F53\u524D\u7B5B\u9009\u7684 ${f} \u6761` : `\u5168\u90E8 ${f} \u6761`;
        if (!await ie(`\u5BF9${g}\u505A\u7FFB\u8BD1\uFF1F\uFF08\u8BBE\u7F6E\uFF1A${o}\uFF09`)) return;
        e.toolsMenu?.classList.add("hidden");
        const v = await St.runTextTranslateOnce({
            scope: m,
            engine: c ? "smart" : u ? "opus" : "llm",
            faithfulTone: l
        });
        d(v?.summary || `\u7FFB\u8BD1\u7ED3\u675F\uFF08${o}\uFF09`, v?.status === "failed" ? "err" : v?.status === "cancelled" ? "warn" : "ok")
    }

    function Pl(n) {
        const r = String(n?.action || "").trim();
        if (r) switch (r) {
            case "open-subtitle":
                rr();
                break;
            case "link-video":
                Ls();
                break;
            case "save":
                Pt();
                break;
            case "export-dual":
                on();
                break;
            case "open-generator":
                Ai();
                break;
            case "open-library":
                openSubtitleLibraryFromEditor();
                break;
            case "open-settings":
                $i();
                break;
            case "restore-initial":
                Zr();
                break;
            case "undo":
                Ur();
                break;
            case "redo":
                Qr();
                break;
            case "find-replace":
                qt(!1);
                break;
            case "select-all":
                Ss();
                break;
            case "merge-selected":
                Xn();
                break;
            case "insert-cue":
                Lt();
                break;
            case "delete-cue":
                pn();
                break;
            case "glossary":
                Er();
                break;
            case "break-words":
                Gt();
                break;
            case "chinese-convert":
                ki();
                break;
            case "compress-rep":
                Ci();
                break;
            case "viewing-punct":
                openViewingPunctModal();
                break;
            case "text-presets":
                wn();
                break;
            case "sakura-translate":
                we({
                    engine: "auto"
                });
                break;
            case "smart-translate":
                we({
                    engine: "smart"
                });
                break;
            case "context-reconstruct":
                Ve({
                    mode: "basic"
                });
                break;
            case "film-context-reconstruct":
                Ve({
                    mode: "film"
                });
                break;
            case "batch-sakura-translate":
                we({
                    engine: "auto",
                    forceSelected: !0
                });
                break;
            case "batch-sakura-translate-all":
                we({
                    engine: "auto",
                    forceAll: !0
                });
                break;
            case "batch-smart-translate":
                we({
                    engine: "smart",
                    forceSelected: !0
                });
                break;
            case "batch-smart-translate-all":
                we({
                    engine: "smart",
                    forceAll: !0
                });
                break;
            case "batch-context-reconstruct":
                Ve({
                    mode: "basic",
                    forceAll: !0
                });
                break;
            case "batch-film-context-reconstruct":
                Ve({
                    mode: "film",
                    forceAll: !0
                });
                break;
            case "shift-back":
                Kt(-500);
                break;
            case "shift-fwd":
                Kt(500);
                break;
            case "batch-duration":
                pr();
                break;
            case "smart-split":
                hr();
                break;
            case "silence-split":
                vr();
                break;
            case "smart-adjust":
                bi();
                break;
            case "remove-noise":
                Mi();
                break;
            case "retranscribe-duration":
                ur();
                break;
            case "retranscribe-low-conf":
                Bl?.openLowConfRetranscribe?.();
                break;
            case "workflows":
                St.openWorkflowModal?.();
                break;
            case "qc":
                Fr();
                break;
            case "next-issue":
                Ti();
                break;
            case "filter-all":
                Re("all");
                break;
            case "filter-low":
                Re("low");
                break;
            case "filter-qc":
                Re("qc");
                break;
            case "filter-find":
                Re("find");
                break;
            case "toggle-auto-focus":
                Ji(), ee();
                break;
            case "toggle-waveform":
                ta(), ee();
                break;
            case "toggle-theme":
                ea(), ee();
                break;
            case "layout-classic":
                ke?.applyPreset?.("classic"), ee();
                break;
            case "layout-immersive":
                ke?.applyPreset?.("immersive"), ee();
                break;
            case "layout-focus":
                ke?.applyPreset?.("focus"), ee();
                break;
            case "layout-widescreen":
                ke?.applyPreset?.("widescreen"), ee();
                break;
            case "layout-reset":
                ke?.resetLayout?.(), ee();
                break;
            case "timeline-zoom-in":
                zt(1 / 1.5, ca()), ee();
                break;
            case "timeline-zoom-out":
                zt(1.5, ca()), ee();
                break;
            case "timeline-zoom-fit":
                qi(), ee();
                break;
            case "shortcuts":
                ji();
                break;
            case "check-update":
                (async () => {
                    try {
                        const i = await p?.transubOpenUpdateWindow?.({
                            autoCheck: !0
                        });
                        i?.ok === !1 && d(i?.error || "\u65E0\u6CD5\u6253\u5F00\u66F4\u65B0\u7A97\u53E3", "err")
                    } catch (i) {
                        d(i?.message || "\u65E0\u6CD5\u6253\u5F00\u66F4\u65B0\u7A97\u53E3", "err")
                    }
                })();
                break;
            case "about":
                (async () => {
                    try {
                        const i = await p?.transubOpenAboutWindow?.();
                        i?.ok === !1 && d(i?.error || "\u65E0\u6CD5\u6253\u5F00\u5173\u4E8E\u7A97\u53E3", "err")
                    } catch (i) {
                        d(i?.message || "\u65E0\u6CD5\u6253\u5F00\u5173\u4E8E\u7A97\u53E3", "err")
                    }
                })();
                break;
            default:
                break
        }
    }

    function Ll() {
        gl(), hl(), yl(), pl(), vl(), t.timeline.zoom = na(), ke?.initLayout?.(), ol(), ee(), e.themeToggle?.addEventListener("click", () => {
            ea(), ee()
        }), e.settingsBtn?.addEventListener("click", () => {
            $i()
        }), e.openGeneratorBtn?.addEventListener("click", () => {
            Ai()
        }), e.librarySaveIntent?.addEventListener("change", () => {
            const v = e.librarySaveIntent.value;
            t.librarySaveIntent = v === "draft" || v === "ab" ? v : "current";
            persistLibrarySaveIntent()
        }), e.libraryLoadCompareBtn?.addEventListener("click", () => {
            void editorLibraryLoadCompareRef()
        }), e.libraryAbDiffBtn?.addEventListener("click", () => {
            void editorLibraryAbDiff()
        }), e.libraryRerunBtn?.addEventListener("click", () => {
            void editorLibraryRerun()
        }), e.libraryFixMediaBtn?.addEventListener("click", () => {
            void Ls()
        }), e.libraryFocusBtn?.addEventListener("click", () => {
            openSubtitleLibraryFromEditor()
        }), e.libraryDiffCloseBtn?.addEventListener("click", () => {
            e.libraryDiffModal?.classList.add("hidden")
        }), e.libraryDiffModal?.addEventListener("click", (ev) => {
            if (ev.target === e.libraryDiffModal || ev.target?.id === "editorLibraryDiffBackdrop") {
                e.libraryDiffModal?.classList.add("hidden")
            }
        }), e.openLibraryBtn?.addEventListener("click", () => {
            openSubtitleLibraryFromEditor()
        }), e.autoFocusBtn?.addEventListener("click", () => {
            Ji(), ee()
        }), e.waveformToggle?.addEventListener("click", () => {
            ta(), ee()
        });

        function n(s = null) {
            document.querySelectorAll(".editor-dropdown").forEach(a => {
                if (s && a === s || a.classList.contains("hidden")) return;
                a.classList.add("hidden"), a.closest(".editor-menu-wrap")?.querySelector('[aria-haspopup="true"], [data-dd-trigger]')?.setAttribute("aria-expanded", "false")
            }), e.layoutMenuBtn && e.layoutMenuBtn.setAttribute("aria-expanded", "false"), e.viewMenuBtn && e.viewMenuBtn.setAttribute("aria-expanded", "false"), e.reviewFilterBtn && e.reviewFilterBtn.setAttribute("aria-expanded", "false")
        }

        function r(s, a) {
            if (!s || !a) return;
            const o = a.classList.contains("hidden");
            n(), o && (a.classList.remove("hidden"), s.setAttribute("aria-expanded", "true"), (a === e.layoutMenu || a === e.viewMenu) && ke?.updateLayoutMenuUi?.())
        }
        const i = () => n();
        e.viewMenuBtn?.addEventListener("click", s => {
            s.stopPropagation(), r(e.viewMenuBtn, e.viewMenu || e.layoutMenu)
        }), e.reviewFilterBtn?.addEventListener("click", s => {
            s.stopPropagation(), r(e.reviewFilterBtn, e.reviewFilterMenu)
        }), e.modeTools?.querySelectorAll("[data-dd-trigger]").forEach(s => {
            s.addEventListener("click", a => {
                a.stopPropagation();
                const l = s.closest(".editor-menu-wrap")?.querySelector(".editor-dropdown");
                r(s, l)
            })
        }), e.modeTools?.addEventListener("click", s => {
            const a = s.target.closest?.(".editor-dropdown button");
            a && e.modeTools.contains(a) && setTimeout(() => n(), 0)
        }), e.layoutMenu?.addEventListener("click", s => {
            const a = s.target.closest?.("[data-layout-action]");
            if (a) {
                a.getAttribute("data-layout-action") === "reset" && (ke?.resetLayout?.(), ee()), setTimeout(i, 0);
                return
            }
            const o = s.target.closest?.("[data-layout-preset]");
            if (!o || o.disabled) return;
            const l = o.getAttribute("data-layout-preset");
            l && l !== "custom" && (ke?.applyPreset?.(l), ee()), setTimeout(i, 0)
        }), document.addEventListener("click", s => {
            s.target.closest?.(".editor-menu-wrap") || n()
        }), document.querySelectorAll("[data-list-filter]").forEach(s => {
            s.addEventListener("click", () => {
                Re(s.getAttribute("data-list-filter")), s.closest("#editorReviewFilterMenu") && n()
            })
        }), e.nextIssueBtn?.addEventListener("click", Ti), e.playPauseBtn?.addEventListener("click", Bs), e.seekBackBtn?.addEventListener("click", () => Fi(-1)), e.seekFwdBtn?.addEventListener("click", () => Fi(1)), e.rateSelect?.addEventListener("change", () => {
            e.video && (e.video.playbackRate = Number(e.rateSelect.value) || 1)
        }), e.volumeSlider?.addEventListener("input", () => {
            e.video && (e.video.volume = Number(e.volumeSlider.value) || 0)
        }), e.exportDualBtn?.addEventListener("click", () => {
            on()
        }), e.exportDualMenuBtn?.addEventListener("click", () => {
            on()
        }), e.saveBtn?.addEventListener("click", Pt), e.addCueBtn?.addEventListener("click", Lt), e.insertCueBtn?.addEventListener("click", Lt), e.openFileBtn?.addEventListener("click", rr), La(), e.shiftBackBtn?.addEventListener("click", () => Kt(-500)), e.shiftFwdBtn?.addEventListener("click", () => Kt(500)), e.linkVideoBtn?.addEventListener("click", Ls), e.findReplaceBtn?.addEventListener("click", () => qt(!1)), e.glossaryBtn?.addEventListener("click", () => {
            Er()
        }), e.contextReconstructBtn?.addEventListener("click", () => {
            Ve({
                mode: "basic"
            })
        }), e.filmContextReconstructBtn?.addEventListener("click", () => {
            Ve({
                mode: "film"
            })
        }), e.bilingualReviewBtn?.addEventListener("click", () => {
            runEditorBilingualReview()
        }), e.exportAssBtn?.addEventListener("click", () => {
            la()
        }), e.proAssBtn?.addEventListener("click", () => {
            la()
        }), e.exportDualAssBtn?.addEventListener("click", () => {
            void As?.exportDualAss?.()
        }), e.semanticReviewBtn?.addEventListener("click", () => {
            oa()
        }), e.sakuraTranslateBtn?.addEventListener("click", () => {
            we({
                engine: "auto"
            })
        }), e.smartTranslateBtn?.addEventListener("click", () => {
            we({
                engine: "smart"
            })
        }), document.getElementById("editorReconstructProgressCancel")?.addEventListener("click", () => {
            p?.transubAdvancedCancelContextReconstruct?.(), p?.transubSakuraCancelTranslate?.(), p?.transubEngineCancel?.();
            const s = document.getElementById("editorReconstructProgressDetail"),
                a = document.getElementById("editorReconstructProgressCancel");
            s && (s.textContent = "\u6B63\u5728\u53D6\u6D88\u2026"), a && (a.disabled = !0);
            const o = t.inferenceKind || t.translateEngine;
            d(o === "llm" || o === "sakura" ? "\u6B63\u5728\u53D6\u6D88\u63A8\u7406\u7FFB\u8BD1\u2026" : o === "smart" ? "\u6B63\u5728\u53D6\u6D88\u667A\u80FD\u7FFB\u8BD1\u2026" : o === "opus" || o === "engine" ? "\u6B63\u5728\u53D6\u6D88\u673A\u5668\u7FFB\u8BD1\u2026" : o === "semantic" ? "\u6B63\u5728\u53D6\u6D88\u8BED\u4E49\u5BA1\u9605\u2026" : o === "film" ? "\u6B63\u5728\u53D6\u6D88\u5F71\u7247\u7406\u89E3\u91CD\u6784\u2026" : o === "reconstruct" ? "\u6B63\u5728\u53D6\u6D88\u8BED\u5883\u91CD\u6784\u2026" : "\u6B63\u5728\u53D6\u6D88\u63A8\u7406\u4EFB\u52A1\u2026", "warn")
        }), e.textPresetsBtn?.addEventListener("click", () => {
            wn()
        }), St.bindWorkflowEvents(), e.breakWordsBtn?.addEventListener("click", Gt), e.splitOpenBreakWordsBtn?.addEventListener("click", Gt), e.smartSplitOpenBreakWordsBtn?.addEventListener("click", Gt), e.breakWordsClose?.addEventListener("click", Cr), e.breakWordsModal?.querySelectorAll("[data-break-words-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Cr()
            })
        }), e.breakWordsAddBtn?.addEventListener("click", di), e.breakWordsResetBtn?.addEventListener("click", Lo), e.breakWordsClearBtn?.addEventListener("click", Do), e.breakWordsInput?.addEventListener("keydown", s => {
            s.key === "Enter" && (s.preventDefault(), di())
        }), e.breakWordsChips?.addEventListener("click", s => {
            const a = s.target.closest("[data-break-word-remove]");
            a && Po(a.getAttribute("data-break-word-remove") || "")
        }), e.findReplaceClose?.addEventListener("click", mt), e.findReplaceModal?.querySelectorAll("[data-find-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), mt()
            })
        }), e.glossaryCancel?.addEventListener("click", Ir), e.glossaryModal?.querySelectorAll("[data-glossary-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Ir()
            })
        }), e.glossaryEntryList?.addEventListener("click", s => {
            const a = s.target.closest("[data-glossary-id]");
            a && ci(a.getAttribute("data-glossary-id"))
        }), e.glossaryIssueList?.addEventListener("click", s => {
            const a = s.target.closest("[data-glossary-entry-id]");
            if (!a) return;
            const o = a.getAttribute("data-glossary-entry-id");
            o && ci(o);
            const l = Number(a.getAttribute("data-glossary-issue-idx"));
            Number.isFinite(l) && l >= 0 && X(l)
        }), e.glossaryAddBtn?.addEventListener("click", Io), e.glossarySaveEntryBtn?.addEventListener("click", () => {
            Ao()
        }), e.glossaryDeleteEntryBtn?.addEventListener("click", () => {
            Fo()
        }), e.glossaryImportBtn?.addEventListener("click", () => {
            To()
        }), e.glossaryExportBtn?.addEventListener("click", () => {
            $o()
        }), e.glossaryModal?.querySelectorAll('input[name="editorGlossaryScope"]').forEach(s => {
            s.addEventListener("change", () => {
                Co(ko())
            })
        }), e.glossaryScanBtn?.addEventListener("click", () => {
            Fe(), d(t.glossaryIssues.length ? `\u53D1\u73B0 ${t.glossaryIssues.length} \u5904\u672F\u8BED\u4E0D\u4E00\u81F4` : "\u672A\u53D1\u73B0\u672F\u8BED\u4E0D\u4E00\u81F4", t.glossaryIssues.length ? "warn" : "ok")
        }), e.glossaryConfirm?.addEventListener("click", () => {
            ui()
        }), e.textPresetsClose?.addEventListener("click", fi), e.textPresetsModal?.querySelectorAll("[data-text-presets-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), fi()
            })
        }), e.textPresetsAddBtn?.addEventListener("click", pt), e.textPresetSaveBtn?.addEventListener("click", () => {
            No()
        }), e.textPresetDeleteBtn?.addEventListener("click", () => {
            qo()
        }), e.textPresetsImportBtn?.addEventListener("click", () => {
            _o()
        }), e.textPresetsExportBtn?.addEventListener("click", () => {
            Oo()
        }), e.textPresetsSeedBtn?.addEventListener("click", () => {
            Wo()
        }), e.textPresetsSearch?.addEventListener("input", () => {
            t.textPresetsQuery = e.textPresetsSearch.value || "", kn()
        }), e.textPresetsList?.addEventListener("click", s => {
            const a = s.target.closest("[data-text-preset-id]");
            if (!a) return;
            const o = _.findGroup(t.textPresetsDoc, a.getAttribute("data-text-preset-id"));
            mi(o)
        }), e.textPresetAddItemBtn?.addEventListener("click", () => {
            const s = Tr(),
                a = s[s.length - 1],
                o = a ? Number(a.endSec) + .1 : 0;
            s.push({
                id: _.makeItemId(),
                label: "",
                text: "",
                startSec: Math.round(o * 10) / 10,
                endSec: Math.round((o + .5) * 10) / 10
            }), Bn(s)
        }), e.textPresetItemsHost?.addEventListener("click", s => {
            const a = s.target.closest("[data-tp-remove]");
            if (!a) return;
            a.closest(".text-preset-item-row")?.remove(), e.textPresetItemsHost.querySelector(".text-preset-item-row") || Bn(Dr())
        }), e.textPresetInsertNewBtn?.addEventListener("click", () => {
            const s = _.normalizeGroup({
                id: t.textPresetEditingId || void 0,
                name: e.textPresetName?.value || "\u672A\u547D\u540D\u7EC4",
                anchor: e.textPresetAnchor?.value || "playhead",
                items: Tr()
            });
            if (!s.items.length) {
                d("\u8BF7\u5148\u586B\u5199\u7EC4\u5185\u6761\u76EE\uFF08\u6807\u7B7E+\u6587\u672C\uFF09", "warn");
                return
            }
            Ar(s)
        }), e.textPresetQuickSelect?.addEventListener("change", () => {
            const s = e.textPresetQuickSelect.value;
            if (e.textPresetQuickSelect.value = "", !!s) {
                if (s === "__manage__") {
                    wn();
                    return
                }
                Ho(s)
            }
        }), e.findInput?.addEventListener("input", () => {
            _s({
                navigate: !1
            })
        }), e.findCase?.addEventListener("change", () => {
            _s({
                navigate: !1
            })
        }), e.findNextBtn?.addEventListener("click", () => {
            js()
        }), e.findPrevBtn?.addEventListener("click", () => {
            Gs()
        }), e.replaceOneBtn?.addEventListener("click", () => {
            Ks()
        }), e.replaceAllBtn?.addEventListener("click", () => {
            mo()
        }), e.batchDurBtn?.addEventListener("click", pr), e.batchDurConfirm?.addEventListener("click", vo), e.batchDurCancel?.addEventListener("click", _e), e.batchDurModal?.querySelectorAll("[data-batch-dur-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), _e()
            })
        }), document.querySelectorAll('input[name="editorBatchDurCond"]').forEach(s => {
            s.addEventListener("change", ae)
        }), document.querySelectorAll('input[name="editorBatchDurMode"]').forEach(s => {
            s.addEventListener("change", ae)
        }), [e.batchDurTarget, e.batchDurSilenceDb, e.batchDurSilenceDur, e.batchDurSnapPadMs, e.batchDurShorter, e.batchDurLonger, e.batchDurMin, e.batchDurMax, e.batchDurCpsAbove, e.batchDurCpsBelow, e.batchDurText, e.batchDurAvoidOverlap].forEach(s => {
            s?.addEventListener("input", ae), s?.addEventListener("change", ae)
        }), e.smartAdjustBtn?.addEventListener("click", bi), e.removeNoiseBtn?.addEventListener("click", Mi), e.chineseConvertBtn?.addEventListener("click", ki), e.chineseConvertConfirm?.addEventListener("click", zo), e.chineseConvertCancel?.addEventListener("click", Tn), e.chineseConvertModal?.querySelectorAll("[data-chinese-dismiss]").forEach(s => {
            s.addEventListener("click", Tn)
        }), e.chineseConvertModal?.querySelectorAll('input[type="radio"]').forEach(s => {
            s.addEventListener("change", Dn)
        }), e.chineseProtectGlossary?.addEventListener("change", Dn), e.compressRepBtn?.addEventListener("click", Ci), e.compressRepConfirm?.addEventListener("click", Qo), e.compressRepCancel?.addEventListener("click", $n), e.compressRepModal?.querySelectorAll("[data-compress-rep-dismiss]").forEach(s => {
            s.addEventListener("click", $n)
        }), e.compressRepModal?.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(s => {
            s.addEventListener("change", Rr)
        }), e.viewingPunctBtn?.addEventListener("click", openViewingPunctModal), e.viewingPunctConfirm?.addEventListener("click", confirmViewingPunct), e.viewingPunctCancel?.addEventListener("click", closeViewingPunctModal), e.viewingPunctModal?.querySelectorAll("[data-viewing-punct-dismiss]").forEach(s => {
            s.addEventListener("click", closeViewingPunctModal)
        }), e.viewingPunctModal?.querySelectorAll('input[type="radio"]').forEach(s => {
            s.addEventListener("change", refreshViewingPunctPreview)
        }), e.qcBtn?.addEventListener("click", Fr), e.retranscribeDurBtn?.addEventListener("click", ur), Bl?.wireUi?.(), e.smartSplitBtn?.addEventListener("click", hr), e.silenceSplitBtn?.addEventListener("click", () => vr()), e.smartSplitCueBtn?.addEventListener("click", () => {
            const s = Ke();
            lt("smart", {
                smartMaxChars: s.smartMaxChars,
                smartLineChars: s.smartLineChars,
                useCps: s.useCps,
                fixOverlap: s.fixOverlap
            })
        }), e.silenceSplitCueBtn?.addEventListener("click", () => ir()), e.compressRepCueBtn?.addEventListener("click", () => Zo()), e.splitLinesBtn?.addEventListener("click", () => lt("lines")), e.splitSpacesBtn?.addEventListener("click", () => lt("spaces")), e.charDurBtn?.addEventListener("click", () => Ds()), e.smartDurBtn?.addEventListener("click", () => Fs()), e.audioSnapBtn?.addEventListener("click", () => {
            snapSelectedCueToAudio()
        }), e.silenceSplitConfirm?.addEventListener("click", si), e.silenceProgressCancel?.addEventListener("click", () => {
            if (t.workflowBusy) {
                St.cancelWorkflowRun(), sr();
                return
            }
            if (e.silenceProgress && !e.silenceProgress.classList.contains("hidden") && e.silenceProgressCancel?.textContent === "\u5173\u95ED") {
                Ie(), e.silenceProgressCancel && (e.silenceProgressCancel.textContent = "\u53D6\u6D88");
                return
            }
            sr()
        }), e.silenceSplitCancel?.addEventListener("click", Wt), e.silenceSplitModal?.querySelectorAll("[data-silence-split-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Wt()
            })
        }), document.querySelectorAll('input[name="editorSilenceSplitCond"]').forEach(s => {
            s.addEventListener("change", Je)
        }), [e.silenceSplitDb, e.silenceSplitDur, e.silenceSplitDurLong, e.silenceSplitCpsAbove, e.silenceSplitCharsLong, e.silenceSplitFixOverlap].forEach(s => {
            s?.addEventListener("input", Je), s?.addEventListener("change", Je)
        }), e.smartSplitConfirm?.addEventListener("click", xo), e.smartSplitCancel?.addEventListener("click", xn), e.smartSplitModal?.querySelectorAll("[data-smart-split-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), xn()
            })
        }), document.querySelectorAll('input[name="editorSmartSplitCond"]').forEach(s => {
            s.addEventListener("change", Ae)
        }), [e.smartSplitMaxChars, e.smartSplitLineChars, e.smartSplitCpsAbove, e.smartSplitLineLen, e.smartSplitDurLong, e.smartSplitCharsLong, e.smartSplitUseCps, e.smartSplitFixOverlap].forEach(s => {
            s?.addEventListener("input", Ae), s?.addEventListener("change", Ae)
        }), e.smartAdjustConfirm?.addEventListener("click", Ko), e.smartAdjustCancel?.addEventListener("click", In), e.smartAdjustModal?.querySelectorAll("[data-smart-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), In()
            })
        }), e.removeNoiseConfirm?.addEventListener("click", Xo), e.removeNoiseCancel?.addEventListener("click", Ln), e.removeNoiseModal?.querySelectorAll("[data-remove-noise-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Ln()
            })
        }), [e.noiseRemoveEmpty, e.noiseRemoveFragments, e.noiseRemoveSoundEffects, e.noiseRemoveSymbolOnly, e.noiseRemoveDuplicates, e.noiseRemoveHallucinations].forEach(s => {
            s?.addEventListener("change", Pn)
        }), e.qcConfirm?.addEventListener("click", () => Si()), e.qcFixFiltered?.addEventListener("click", () => Si({
            filtered: !0
        })), e.qcCancel?.addEventListener("click", En), e.qcModal?.querySelectorAll("[data-qc-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), En()
            })
        }), e.qcSummaryBar?.addEventListener("click", s => {
            const a = s.target.closest?.("[data-qc-type]");
            if (!a || !e.qcSummaryBar.contains(a)) return;
            const o = a.getAttribute("data-qc-type");
            Go(o || null)
        }), e.qcIssueList?.addEventListener("click", s => {
            const a = s.target.closest?.("[data-qc-idx]");
            if (!a) return;
            const o = Number(a.getAttribute("data-qc-idx"));
            !Number.isFinite(o) || o < 0 || X(o, {
                scroll: !0,
                seek: !0
            })
        }), [e.qcFixOverlap, e.qcFixCpsSplit, e.qcFixCpsExtend, e.qcEnforceMin, e.qcEnforceMax, e.qcCompressRep, e.qcRemoveNoise, e.qcRemoveDup, e.qcSmartFix, e.qcLlmSplit, e.qcRetranscribe, e.qcSemanticReview, e.qcMaxCps, e.qcMinSec, e.qcMaxSec, e.qcGapMs].forEach(s => {
            s?.addEventListener("input", gt), s?.addEventListener("change", gt)
        }), e.retranscribeDurConfirm?.addEventListener("click", () => {
            ao()
        }), e.retranscribeDurAll?.addEventListener("click", () => {
            lo()
        }), e.retranscribeDurCancel?.addEventListener("click", Ft), e.retranscribeDurModal?.querySelectorAll("[data-retranscribe-dur-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Ft()
            })
        }), document.querySelectorAll('input[name="editorRetranscribeDurStart"]').forEach(s => {
            s.addEventListener("change", Oe)
        }), document.querySelectorAll('input[name="editorRetranscribeWriteAs"]').forEach(s => {
            s.addEventListener("change", Oe)
        }), [e.retranscribeDurSec, e.retranscribeDurPadMs].forEach(s => {
            s?.addEventListener("input", Oe), s?.addEventListener("change", Oe)
        }), document.querySelectorAll("[data-retranscribe-dur-preset]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault();
                const o = Number(s.getAttribute("data-retranscribe-dur-preset"));
                !Number.isFinite(o) || !e.retranscribeDurSec || (e.retranscribeDurSec.value = String(o), Oe())
            })
        }), [e.smartFixOverlap, e.smartFixCps, e.smartEnforceMin, e.smartEnforceMax, e.smartMaxCps, e.smartMinSec, e.smartMaxSec, e.smartGapMs].forEach(s => {
            s?.addEventListener("input", Ht), s?.addEventListener("change", Ht)
        }), e.restoreBtn?.addEventListener("click", Zr), e.findInput?.addEventListener("keydown", s => {
            s.key === "Enter" && !s.shiftKey ? (s.preventDefault(), js()) : s.key === "Enter" && s.shiftKey ? (s.preventDefault(), Gs()) : s.key === "Escape" && (s.preventDefault(), mt())
        }), e.replaceInput?.addEventListener("keydown", s => {
            s.key === "Enter" ? (s.preventDefault(), Ks()) : s.key === "Escape" && (s.preventDefault(), mt())
        }), e.prevCueBtn?.addEventListener("click", () => X(t.selectedIndex - 1, {
            scroll: !0
        })), e.nextCueBtn?.addEventListener("click", () => X(t.selectedIndex + 1, {
            scroll: !0
        })), e.deleteCueBtn?.addEventListener("click", pn), e.splitCueBtn?.addEventListener("click", Os), e.splitConfirm?.addEventListener("click", uo), e.splitCancel?.addEventListener("click", Rt), e.splitModal?.querySelectorAll("[data-split-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Rt()
            })
        }), document.querySelectorAll('input[name="editorSplitMode"]').forEach(s => {
            s.addEventListener("change", $e)
        }), [e.splitCharCount, e.splitCount, e.splitSmartMaxChars, e.splitSmartLineChars, e.splitSilenceDb, e.splitSilenceDur, e.splitUseCps, e.splitFixOverlap].forEach(s => {
            s?.addEventListener("input", $e), s?.addEventListener("change", $e)
        }), e.splitRemember?.addEventListener("change", Vr), e.detailText?.addEventListener("click", () => {
            e.splitModal?.classList.contains("hidden") || $e()
        }), e.detailText?.addEventListener("keyup", () => {
            e.splitModal?.classList.contains("hidden") || $e()
        }), e.detailText?.addEventListener("keydown", s => {
            if (!(s.ctrlKey || s.metaKey) || s.altKey || s.key !== "ArrowUp" && s.key !== "ArrowDown") return;
            const a = s.key === "ArrowUp" ? -1 : 1,
                o = t.selectedIndex + a;
            o < 0 || o >= t.cues.length || (s.preventDefault(), s.stopPropagation(), X(o, {
                scroll: !0
            }), requestAnimationFrame(() => {
                if (!e.detailText) return;
                e.detailText.focus();
                const l = e.detailText.value.length;
                e.detailText.setSelectionRange(l, l)
            }))
        }), e.startNudgeBack?.addEventListener("click", () => xs(-100)), e.startNudgeFwd?.addEventListener("click", () => xs(100)), e.durNudgeDown?.addEventListener("click", () => bs(-.1)), e.durNudgeUp?.addEventListener("click", () => bs(.1)), e.setStartToPlayhead?.addEventListener("click", Yn), e.setEndToPlayhead?.addEventListener("click", Jn), e.undoBtn?.addEventListener("click", Ur), e.redoBtn?.addEventListener("click", Qr), e.shortcutsBtn?.addEventListener("click", ji), e.shortcutsClose?.addEventListener("click", Or), e.shortcutsModal?.querySelectorAll("[data-shortcuts-dismiss]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), Or()
            })
        }), e.detailStart?.addEventListener("change", () => {
            Ze(), (t.selectedIndex < 0 || !Ut(t.selectedIndex)) && me()
        }), e.detailDuration?.addEventListener("change", () => {
            Ze(), (t.selectedIndex < 0 || !Ut(t.selectedIndex)) && me()
        }), e.detailDuration?.addEventListener("input", () => {
            if (e.detailEnd && t.selectedIndex >= 0) {
                const s = t.cues[t.selectedIndex],
                    a = Number(e.detailDuration.value);
                Number.isFinite(a) && (e.detailEnd.value = Z(s.startMs + Math.round(a * 1e3), t.format))
            }
            wt(), at()
        }), e.detailText?.addEventListener("input", Ze), e.targetCps?.addEventListener("input", () => {
            Yi(), wt(), e.splitModal && !e.splitModal.classList.contains("hidden") && $e(), e.smartSplitModal && !e.smartSplitModal.classList.contains("hidden") && Ae()
        }), e.targetCps?.addEventListener("change", () => {
            Yi(), wt(), e.splitModal && !e.splitModal.classList.contains("hidden") && $e(), e.smartSplitModal && !e.smartSplitModal.classList.contains("hidden") && Ae()
        }), e.sidecarSelect?.addEventListener("change", async s => {
            !t.dirty || await ie("\u5207\u6362\u5B57\u5E55\u540E\u5F53\u524D\u4FEE\u6539\u5C06\u4E22\u5931\uFF0C\u7EE7\u7EED\uFF1F") ? await mn(s.target.value, t.videoPath) : s.target.value = t.path
        }), e.dualDisplaySelect?.addEventListener("change", () => {
            ha(e.dualDisplaySelect.value)
        }), e.dualLineOrderSelect?.addEventListener("change", () => {
            ya(e.dualLineOrderSelect.value)
        }), t.dualDisplayMode = zn(), t.dualLineOrder = nn(), e.dualDisplaySelect && (e.dualDisplaySelect.value = t.dualDisplayMode), e.dualLineOrderSelect && (e.dualLineOrderSelect.value = t.dualLineOrder), e.cueBody?.addEventListener("click", s => {
            const a = s.target.closest("tr[data-cue-idx]");
            if (!a) return;
            const o = Number(a.dataset.cueIdx);
            X(o, {
                scroll: !0,
                additive: s.ctrlKey || s.metaKey,
                range: s.shiftKey
            }), er()
        }), e.cueBody?.addEventListener("dblclick", s => {
            const a = s.target.closest("tr[data-cue-idx]");
            if (!a) return;
            const o = Number(a.dataset.cueIdx);
            X(o, {
                seek: !0,
                scroll: !0
            }), er()
        }), e.cueBody?.addEventListener("contextmenu", s => {
            const a = s.target.closest("tr[data-cue-idx]");
            a && (s.preventDefault(), or(Number(a.dataset.cueIdx), s.clientX, s.clientY, {
                scroll: !1
            }))
        }), e.cueContextMenu?.querySelectorAll("[data-ctx-action]").forEach(s => {
            s.addEventListener("click", a => {
                a.preventDefault(), !s.disabled && Ga(s.dataset.ctxAction)
            })
        }), document.addEventListener("click", s => {
            !e.cueContextMenu?.classList.contains("hidden") && !e.cueContextMenu?.contains(s.target) && ct()
        }), document.addEventListener("keydown", s => {
            s.key === "Escape" && e.cueContextMenu && !e.cueContextMenu.classList.contains("hidden") && ct()
        }), e.cueBody?.closest(".editor-list-wrap")?.addEventListener("scroll", ct), window.addEventListener("resize", ct), e.listWrap?.addEventListener("mousedown", s => {
            s.button === 0 && (s.target.closest("tr[data-cue-idx]") || er())
        }), e.videoWrap?.addEventListener("mousedown", s => {
            s.button === 0 && (s.target.closest('button, select, input, textarea, a, [contenteditable="true"]') || Ms())
        }), e.timelinePanel?.addEventListener("mousedown", s => {
            s.button === 0 && (s.target.closest('button, select, input, textarea, a, [contenteditable="true"]') || Ms())
        }), document.addEventListener("keydown", s => {
            if (s.key === "Escape") {
                if (t.silenceSplitBusy || t.retranscribeBusy) {
                    s.preventDefault(), sr();
                    return
                }
                if (e.shortcutsModal && !e.shortcutsModal.classList.contains("hidden")) {
                    s.preventDefault(), Or();
                    return
                }
                if (e.silenceSplitModal && !e.silenceSplitModal.classList.contains("hidden")) {
                    s.preventDefault(), Wt();
                    return
                }
                if (e.smartSplitModal && !e.smartSplitModal.classList.contains("hidden")) {
                    s.preventDefault(), xn();
                    return
                }
                if (e.smartAdjustModal && !e.smartAdjustModal.classList.contains("hidden")) {
                    s.preventDefault(), In();
                    return
                }
                if (e.removeNoiseModal && !e.removeNoiseModal.classList.contains("hidden")) {
                    s.preventDefault(), Ln();
                    return
                }
                if (e.chineseConvertModal && !e.chineseConvertModal.classList.contains("hidden")) {
                    s.preventDefault(), Tn();
                    return
                }
                if (e.compressRepModal && !e.compressRepModal.classList.contains("hidden")) {
                    s.preventDefault(), $n();
                    return
                }
                if (e.viewingPunctModal && !e.viewingPunctModal.classList.contains("hidden")) {
                    s.preventDefault(), closeViewingPunctModal();
                    return
                }
                if (e.qcModal && !e.qcModal.classList.contains("hidden")) {
                    s.preventDefault(), En();
                    return
                }
                if (e.retranscribeDurModal && !e.retranscribeDurModal.classList.contains("hidden")) {
                    s.preventDefault(), Ft();
                    return
                }
                if (e.batchDurModal && !e.batchDurModal.classList.contains("hidden")) {
                    s.preventDefault(), _e();
                    return
                }
                if (e.findReplaceModal && !e.findReplaceModal.classList.contains("hidden")) {
                    s.preventDefault(), mt();
                    return
                }
                if (e.glossaryModal && !e.glossaryModal.classList.contains("hidden")) {
                    s.preventDefault(), Ir();
                    return
                }
                if (e.assStylesModal && !e.assStylesModal.classList.contains("hidden")) {
                    s.preventDefault(), As?.closeModal?.();
                    return
                }
                if (e.breakWordsModal && !e.breakWordsModal.classList.contains("hidden")) {
                    s.preventDefault(), Cr();
                    return
                }
                if (e.splitModal && !e.splitModal.classList.contains("hidden")) {
                    s.preventDefault(), Rt();
                    return
                }
            }
            if ((s.ctrlKey || s.metaKey) && s.key === "z" && !s.shiftKey) {
                s.preventDefault(), Ur();
                return
            }
            if ((s.ctrlKey || s.metaKey) && s.key === "y") {
                s.preventDefault(), Qr();
                return
            }
            if (s.key === "F11") {
                s.preventDefault(), Yn();
                return
            }
            if (s.key === "F12") {
                s.preventDefault(), Jn();
                return
            }
            if ((s.ctrlKey || s.metaKey) && (s.key === "f" || s.key === "F")) {
                s.preventDefault(), qt(!1);
                return
            }
            if ((s.ctrlKey || s.metaKey) && (s.key === "h" || s.key === "H")) {
                s.preventDefault(), qt(!0);
                return
            }
            if ((s.ctrlKey || s.metaKey) && (s.key === "s" || s.key === "S")) {
                s.preventDefault(), Pt();
                return
            }
            if (s.altKey && !s.ctrlKey && !s.metaKey && !Ct(s.target)) {
                const o = {
                    1: "polish",
                    2: "timeline",
                    3: "dual",
                    4: "ai",
                    5: "pro"
                } [s.key];
                if (o) {
                    s.preventDefault(), Bt?.setWorkspaceMode?.(o);
                    return
                }
            }
            if (s.key === "Delete" && !s.ctrlKey && !s.metaKey && !s.altKey) {
                if (s.target.matches("input, textarea") || [e.splitModal, e.findReplaceModal, e.glossaryModal, e.assStylesModal, e.breakWordsModal, e.batchDurModal, e.smartSplitModal, e.silenceSplitModal, e.smartAdjustModal, e.removeNoiseModal, e.chineseConvertModal, e.compressRepModal, e.viewingPunctModal, e.qcModal, e.retranscribeDurModal, e.shortcutsModal].some(o => o && !o.classList.contains("hidden")) || t.selectedIndex < 0 && !J().length) return;
                s.preventDefault(), pn();
                return
            }
            if ((s.ctrlKey || s.metaKey) && !s.altKey && String(s.key).toLowerCase() === "a") {
                if (Ct(s.target)) return;
                if (Xe() || s.target === document.body || s.target === document.documentElement) {
                    s.preventDefault(), Ss();
                    return
                }
            }
            if ((s.ctrlKey || s.metaKey) && !s.altKey && String(s.key).toLowerCase() === "m") {
                if (Ct(s.target)) return;
                if (Xe()) {
                    s.preventDefault(), Xn();
                    return
                }
            }
            if (s.key === " " || s.code === "Space") {
                if (Ct(s.target)) return;
                if (Xe() || un()) {
                    s.preventDefault(), Bs();
                    return
                }
            }
            if (!s.ctrlKey && !s.metaKey && !s.altKey && !Ct(s.target)) {
                if (String(s.key).toLowerCase() === "b" && (Xe() || un())) {
                    s.preventDefault(), H?.toggleBookmarkAtPlayhead?.();
                    return
                }
                if (s.key === "[" && (Xe() || un())) {
                    s.preventDefault(), H?.setAbPoint?.("a");
                    return
                }
                if (s.key === "]" && (Xe() || un())) {
                    s.preventDefault(), H?.setAbPoint?.("b");
                    return
                }
            }
            if (Xe() && s.key === "Enter" && !s.ctrlKey && !s.metaKey && !s.altKey && !s.shiftKey) {
                s.preventDefault(), Lt();
                return
            }
            s.target === e.detailText && (s.ctrlKey || s.metaKey) && (s.key === "ArrowUp" || s.key === "ArrowDown") || s.target.matches("input, textarea") && !s.ctrlKey && !s.metaKey || (s.key === "ArrowUp" && t.selectedIndex > 0 ? (s.preventDefault(), X(t.selectedIndex - 1, {
                scroll: !0
            })) : s.key === "ArrowDown" && t.selectedIndex < t.cues.length - 1 && (s.preventDefault(), X(t.selectedIndex + 1, {
                scroll: !0
            })))
        }), e.video?.addEventListener("play", Ha), e.video?.addEventListener("pause", Es), e.video?.addEventListener("ended", Es), e.video?.addEventListener("playing", () => {
            e.video && !e.video.paused && (Ce(!0), ot()), requestAnimationFrame(() => {
                const s = e.video;
                if (!s || s.paused || s.videoWidth > 0 && s.videoHeight > 0) return;
                const a = String(t.videoCodec || "").toLowerCase(),
                    o = ["hevc", "h265", "av1", "vp9"].includes(a);
                d(o ? "\u5185\u7F6E\u64AD\u653E\u5668\u65E0\u6CD5\u89E3\u7801\u8BE5\u89C6\u9891\u7F16\u7801\uFF08\u9ED1\u5C4F\u4EC5\u6709\u58F0\u97F3\uFF09\uFF0C\u53EF\u5C1D\u8BD5 H.264 \u7248\u672C\u6216\u5B89\u88C5 HEVC \u89C6\u9891\u6269\u5C55" : "\u89C6\u9891\u6B63\u5728\u64AD\u653E\u4F46\u65E0\u753B\u9762\uFF0C\u8BF7\u68C0\u67E5\u89C6\u9891\u6587\u4EF6", "err")
            })
        }), e.video?.addEventListener("seeked", () => {
            Ce(!0), e.video && !e.video.paused && ot()
        }), e.video?.addEventListener("ratechange", () => {
            e.video && !e.video.paused && ot()
        }), e.video?.addEventListener("loadedmetadata", () => {
            Nn(), me(), Wr()
        }), e.video?.addEventListener("timeupdate", () => {
            if (!e.video || e.video.paused) return;
            const s = performance.now();
            s - (t.lastPlaybackSyncAt || 0) >= 50 && (t.lastPlaybackSyncAt = s, Ce(!1));
            const a = Math.round((e.video.currentTime || 0) * 1e3);
            H?.tickAbLoop?.(a), tt(a, {
                follow: !0
            })
        }), p?.onSubtitleEditorMenuAction?.(Pl)
    }

    function Dl() {
        Object.assign(e, {
            formatBadge: document.getElementById("editorFormatBadge"),
            autoFocusBtn: document.getElementById("editorAutoFocusBtn"),
            waveformToggle: document.getElementById("editorWaveformToggle"),
            cueCount: document.getElementById("editorCueCount"),
            lowConfBadge: document.getElementById("editorLowConfBadge"),
            keptTranscriptBadge: document.getElementById("editorKeptTranscriptBadge"),
            keptDiffBtn: document.getElementById("editorKeptDiffBtn"),
            keptAttachBtn: document.getElementById("editorKeptAttachBtn"),
            abLoopBadge: document.getElementById("editorAbLoopBadge"),
            bookmarkCountBadge: document.getElementById("editorBookmarkCountBadge"),
            contextActionBar: document.getElementById("editorContextActionBar"),
            genericModal: document.getElementById("editorGenericModal"),
            genericModalTitle: document.getElementById("editorGenericModalTitle"),
            genericModalBody: document.getElementById("editorGenericModalBody"),
            bookmarkBtn: document.getElementById("editorBookmarkBtn"),
            abSetABtn: document.getElementById("editorAbSetABtn"),
            abSetBBtn: document.getElementById("editorAbSetBBtn"),
            abClearBtn: document.getElementById("editorAbClearBtn"),
            exportChecklistBtn: document.getElementById("editorExportChecklistBtn"),
            tourOverlay: document.getElementById("editorTourOverlay"),
            tourTitle: document.getElementById("editorTourTitle"),
            tourBody: document.getElementById("editorTourBody"),
            tourProgress: document.getElementById("editorTourProgress"),
            tourSkipBtn: document.getElementById("editorTourSkipBtn"),
            tourNextBtn: document.getElementById("editorTourNextBtn"),
            tourReplayBtn: document.getElementById("editorTourReplayBtn"),
            listToolbar: document.querySelector(".editor-list-toolbar"),
            dirtyBadge: document.getElementById("editorDirtyBadge"),
            saveStatus: document.getElementById("editorSaveStatus"),
            saveBtn: document.getElementById("editorSaveBtn"),
            libraryBar: document.getElementById("editorLibraryBar"),
            libraryTitle: document.getElementById("editorLibraryTitle"),
            libraryRole: document.getElementById("editorLibraryRole"),
            libraryActive: document.getElementById("editorLibraryActive"),
            libraryRecipe: document.getElementById("editorLibraryRecipe"),
            librarySaveIntent: document.getElementById("editorLibrarySaveIntent"),
            libraryLoadCompareBtn: document.getElementById("editorLibraryLoadCompareBtn"),
            libraryAbDiffBtn: document.getElementById("editorLibraryAbDiffBtn"),
            libraryRerunBtn: document.getElementById("editorLibraryRerunBtn"),
            libraryFixMediaBtn: document.getElementById("editorLibraryFixMediaBtn"),
            libraryFocusBtn: document.getElementById("editorLibraryFocusBtn"),
            libraryMediaStatus: document.getElementById("editorLibraryMediaStatus"),
            libraryDiffModal: document.getElementById("editorLibraryDiffModal"),
            libraryDiffMeta: document.getElementById("editorLibraryDiffMeta"),
            libraryDiffBody: document.getElementById("editorLibraryDiffBody"),
            libraryDiffCloseBtn: document.getElementById("editorLibraryDiffClose"),
            exportDualBtn: document.getElementById("editorExportDualBtn"),
            exportDualMenuBtn: document.getElementById("editorExportDualMenuBtn"),
            addCueBtn: document.getElementById("editorAddCueBtn"),
            insertCueBtn: document.getElementById("editorInsertCueBtn"),
            detailInsertCueBtn: document.getElementById("editorDetailInsertCueBtn"),
            retranscribeCueBtn: document.getElementById("editorRetranscribeCueBtn"),
            playheadTime: document.getElementById("editorPlayheadTime"),
            openFileBtn: document.getElementById("editorOpenFileBtn"),
            undoBtn: document.getElementById("editorUndoBtn"),
            redoBtn: document.getElementById("editorRedoBtn"),
            toolsMenuBtn: document.getElementById("editorToolsMenuBtn"),
            toolsMenu: document.getElementById("editorToolsMenu"),
            modeTools: document.getElementById("editorModeTools"),
            themeToggle: document.getElementById("editorThemeToggle"),
            openGeneratorBtn: document.getElementById("editorOpenGeneratorBtn"),
            openLibraryBtn: document.getElementById("editorOpenLibraryBtn"),
            settingsBtn: document.getElementById("editorSettingsBtn"),
            splitter: document.getElementById("editorSplitter"),
            cuesPanel: document.getElementById("editorCuesPanel"),
            listPanel: document.getElementById("editorListPanel"),
            detailPanel: document.getElementById("editorDetailPanel"),
            mediaPanel: document.getElementById("editorVideoWrap"),
            timelinePanel: document.getElementById("editorTimelinePanel"),
            layoutMenuBtn: document.getElementById("editorViewMenuBtn"),
            layoutMenu: document.getElementById("editorViewMenu"),
            viewMenuBtn: document.getElementById("editorViewMenuBtn"),
            viewMenu: document.getElementById("editorViewMenu"),
            reviewFilterBtn: document.getElementById("editorReviewFilterBtn"),
            reviewFilterMenu: document.getElementById("editorReviewFilterMenu"),
            main: document.getElementById("editorMain") || document.querySelector(".editor-main"),
            filterCount: document.getElementById("editorFilterCount"),
            nextIssueBtn: document.getElementById("editorNextIssueBtn"),
            detailTools: document.getElementById("editorDetailTools"),
            playPauseBtn: document.getElementById("editorPlayPauseBtn"),
            seekBackBtn: document.getElementById("editorSeekBackBtn"),
            seekFwdBtn: document.getElementById("editorSeekFwdBtn"),
            rateSelect: document.getElementById("editorRateSelect"),
            dualDisplaySelect: document.getElementById("editorDualDisplaySelect"),
            dualLineOrderSelect: document.getElementById("editorDualLineOrderSelect"),
            volumeSlider: document.getElementById("editorVolumeSlider"),
            videoEmpty: document.getElementById("editorVideoEmpty"),
            timelineStack: document.getElementById("editorTimelineStack"),
            timeline: document.getElementById("editorTimeline"),
            timelineTrack: document.getElementById("editorTimelineTrack"),
            waveformRow: document.getElementById("editorWaveformRow"),
            waveformTrack: document.getElementById("editorWaveformTrack"),
            timelineWaveform: document.getElementById("editorTimelineWaveform"),
            waveformPlayhead: document.getElementById("editorWaveformPlayhead"),
            waveformLoading: document.getElementById("editorWaveformLoading"),
            waveformLoadingText: document.getElementById("editorWaveformLoadingText"),
            timelineCues: document.getElementById("editorTimelineCues"),
            timelineMarkers: document.getElementById("editorTimelineMarkers"),
            timelinePlayhead: document.getElementById("editorTimelinePlayhead"),
            timelineHScrollWrap: document.getElementById("editorTimelineHScrollWrap"),
            timelineHScroll: document.getElementById("editorTimelineHScroll"),
            timelineZoomIn: document.getElementById("editorTimelineZoomIn"),
            timelineZoomOut: document.getElementById("editorTimelineZoomOut"),
            timelineZoomFit: document.getElementById("editorTimelineZoomFit"),
            shortcutsBtn: document.getElementById("editorShortcutsBtn"),
            shortcutsModal: document.getElementById("editorShortcutsModal"),
            shortcutsClose: document.getElementById("editorShortcutsClose"),
            shiftBackBtn: document.getElementById("editorShiftBackBtn"),
            shiftFwdBtn: document.getElementById("editorShiftFwdBtn"),
            linkVideoBtn: document.getElementById("editorLinkVideoBtn"),
            findReplaceBtn: document.getElementById("editorFindReplaceBtn"),
            findReplaceModal: document.getElementById("editorFindReplaceModal"),
            findReplaceClose: document.getElementById("editorFindReplaceClose"),
            glossaryBtn: document.getElementById("editorGlossaryBtn"),
            contextReconstructBtn: document.getElementById("editorContextReconstructBtn"),
            filmContextReconstructBtn: document.getElementById("editorFilmContextReconstructBtn"),
            bilingualReviewBtn: document.getElementById("editorBilingualReviewBtn"),
            exportAssBtn: document.getElementById("editorExportAssBtn"),
            proAssBtn: document.getElementById("editorProAssBtn"),
            assStylesBtn: document.getElementById("editorAssStylesBtn"),
            assStylesModal: document.getElementById("editorAssStylesModal"),
            assStyleList: document.getElementById("editorAssStyleList"),
            assStyleName: document.getElementById("editorAssStyleName"),
            assStyleFont: document.getElementById("editorAssStyleFont"),
            assStyleSize: document.getElementById("editorAssStyleSize"),
            assStylePrimary: document.getElementById("editorAssStylePrimary"),
            assStyleOutline: document.getElementById("editorAssStyleOutline"),
            assStyleBack: document.getElementById("editorAssStyleBack"),
            assStyleOutlineWidth: document.getElementById("editorAssStyleOutlineWidth"),
            assStyleShadow: document.getElementById("editorAssStyleShadow"),
            assStyleAlign: document.getElementById("editorAssStyleAlign"),
            assStyleMarginL: document.getElementById("editorAssStyleMarginL"),
            assStyleMarginR: document.getElementById("editorAssStyleMarginR"),
            assStyleMarginV: document.getElementById("editorAssStyleMarginV"),
            assStyleBold: document.getElementById("editorAssStyleBold"),
            assStyleItalic: document.getElementById("editorAssStyleItalic"),
            assStyleAddBtn: document.getElementById("editorAssStyleAddBtn"),
            assStyleSaveBtn: document.getElementById("editorAssStyleSaveBtn"),
            assStyleDeleteBtn: document.getElementById("editorAssStyleDeleteBtn"),
            assStyleApplyBtn: document.getElementById("editorAssStyleApplyBtn"),
            assStylePresetSelect: document.getElementById("editorAssStylePresetSelect"),
            assStyleExportBtn: document.getElementById("editorAssStyleExportBtn"),
            assStyleHint: document.getElementById("editorAssStyleHint"),
            assDualPreset: document.getElementById("editorAssDualPreset"),
            assDualLineOrder: document.getElementById("editorAssDualLineOrder"),
            assDualSourceStyle: document.getElementById("editorAssDualSourceStyle"),
            assDualTargetStyle: document.getElementById("editorAssDualTargetStyle"),
            assDualMarginGap: document.getElementById("editorAssDualMarginGap"),
            assDualApplyBtn: document.getElementById("editorAssDualApplyBtn"),
            assDualExportBtn: document.getElementById("editorAssDualExportBtn"),
            exportDualAssBtn: document.getElementById("editorExportDualAssBtn"),
            assOverrideBar: document.getElementById("editorAssOverrideBar"),
            assPreviewBadge: document.getElementById("editorAssPreviewBadge"),
            semanticReviewBtn: document.getElementById("editorSemanticReviewBtn"),
            sakuraTranslateBtn: document.getElementById("editorSakuraTranslateBtn"),
            smartTranslateBtn: document.getElementById("editorSmartTranslateBtn"),
            filmHintModal: document.getElementById("editorFilmHintModal"),
            filmHintTitleInput: document.getElementById("editorFilmHintTitleInput"),
            filmHintSynopsisInput: document.getElementById("editorFilmHintSynopsisInput"),
            filmHintTermsInput: document.getElementById("editorFilmHintTermsInput"),
            filmHintGlossaryHint: document.getElementById("editorFilmHintGlossaryHint"),
            filmHintSourceHint: document.getElementById("editorFilmHintSourceHint"),
            filmHintIntensityHelp: document.getElementById("editorFilmHintIntensityHelp"),
            filmHintScope: document.getElementById("editorFilmHintScope"),
            filmHintConfirm: document.getElementById("editorFilmHintConfirm"),
            filmHintCancel: document.getElementById("editorFilmHintCancel"),
            filmBriefModal: document.getElementById("editorFilmBriefModal"),
            filmBriefTitleGuess: document.getElementById("editorFilmBriefTitleGuess"),
            filmBriefGenre: document.getElementById("editorFilmBriefGenre"),
            filmBriefSynopsis: document.getElementById("editorFilmBriefSynopsis"),
            filmBriefTone: document.getElementById("editorFilmBriefTone"),
            filmBriefStyleNotes: document.getElementById("editorFilmBriefStyleNotes"),
            filmBriefCharacters: document.getElementById("editorFilmBriefCharacters"),
            filmBriefTerms: document.getElementById("editorFilmBriefTerms"),
            filmBriefTimeline: document.getElementById("editorFilmBriefTimeline"),
            filmBriefAvoid: document.getElementById("editorFilmBriefAvoid"),
            filmBriefConfirm: document.getElementById("editorFilmBriefConfirm"),
            filmBriefCancel: document.getElementById("editorFilmBriefCancel"),
            reconstructReviewModal: document.getElementById("editorReconstructReviewModal"),
            reconstructReviewList: document.getElementById("editorReconstructReviewList"),
            reconstructReviewMeta: document.getElementById("editorReconstructReviewMeta"),
            reconstructReviewLead: document.getElementById("editorReconstructReviewLead"),
            reconstructReviewTitle: document.getElementById("editorReconstructReviewTitle"),
            reconstructReviewConfirm: document.getElementById("editorReconstructReviewConfirm"),
            reconstructReviewCancel: document.getElementById("editorReconstructReviewCancel"),
            reconstructReviewSelectAll: document.getElementById("editorReconstructReviewSelectAll"),
            reconstructReviewSelectNone: document.getElementById("editorReconstructReviewSelectNone"),
            reconstructReviewOnlyChanged: document.getElementById("editorReconstructReviewOnlyChanged"),
            reconstructReviewRetryFailed: document.getElementById("editorReconstructReviewRetryFailed"),
            reconstructReviewBeforeLabel: document.getElementById("editorReconstructReviewBeforeLabel"),
            reconstructReviewAfterLabel: document.getElementById("editorReconstructReviewAfterLabel"),
            glossaryBadge: document.getElementById("editorGlossaryBadge"),
            glossaryModal: document.getElementById("editorGlossaryModal"),
            glossaryScopeGlobal: document.getElementById("editorGlossaryScopeGlobal"),
            glossaryScopeProject: document.getElementById("editorGlossaryScopeProject"),
            glossaryScopeProjectLabel: document.getElementById("editorGlossaryScopeProjectLabel"),
            glossaryEntryList: document.getElementById("editorGlossaryEntryList"),
            glossaryIssueList: document.getElementById("editorGlossaryIssueList"),
            textPresetsBtn: document.getElementById("editorTextPresetsBtn"),
            textPresetsBadge: document.getElementById("editorTextPresetsBadge"),
            textPresetsModal: document.getElementById("editorTextPresetsModal"),
            workflowBtn: document.getElementById("editorWorkflowBtn"),
            workflowModal: document.getElementById("editorWorkflowModal"),
            workflowSelect: document.getElementById("editorWorkflowSelect"),
            workflowNote: document.getElementById("editorWorkflowNote"),
            workflowStepList: document.getElementById("editorWorkflowStepList"),
            workflowStatus: document.getElementById("editorWorkflowStatus"),
            workflowRunBtn: document.getElementById("editorWorkflowRunBtn"),
            workflowCancelRunBtn: document.getElementById("editorWorkflowCancelRunBtn"),
            workflowClose: document.getElementById("editorWorkflowClose"),
            workflowDupBtn: document.getElementById("editorWorkflowDupBtn"),
            workflowNewBtn: document.getElementById("editorWorkflowNewBtn"),
            workflowDeleteBtn: document.getElementById("editorWorkflowDeleteBtn"),
            workflowImportBtn: document.getElementById("editorWorkflowImportBtn"),
            workflowExportBtn: document.getElementById("editorWorkflowExportBtn"),
            workflowAddRow: document.getElementById("editorWorkflowAddRow"),
            workflowAddStepSelect: document.getElementById("editorWorkflowAddStepSelect"),
            workflowAddStepBtn: document.getElementById("editorWorkflowAddStepBtn"),
            workflowPauseBanner: document.getElementById("editorWorkflowPauseBanner"),
            workflowPauseMessage: document.getElementById("editorWorkflowPauseMessage"),
            workflowContinueBtn: document.getElementById("editorWorkflowContinueBtn"),
            workflowSkipStepBtn: document.getElementById("editorWorkflowSkipStepBtn"),
            workflowAbortBtn: document.getElementById("editorWorkflowAbortBtn"),
            workflowPauseOverlay: document.getElementById("editorWorkflowPauseOverlay"),
            workflowPauseOverlayMessage: document.getElementById("editorWorkflowPauseOverlayMessage"),
            workflowOverlayContinueBtn: document.getElementById("editorWorkflowOverlayContinueBtn"),
            workflowOverlaySkipBtn: document.getElementById("editorWorkflowOverlaySkipBtn"),
            workflowOverlayAbortBtn: document.getElementById("editorWorkflowOverlayAbortBtn"),
            textPresetsList: document.getElementById("editorTextPresetsList"),
            textPresetsSearch: document.getElementById("editorTextPresetsSearch"),
            textPresetsStatus: document.getElementById("editorTextPresetsStatus"),
            textPresetsAddBtn: document.getElementById("editorTextPresetsAddBtn"),
            textPresetsImportBtn: document.getElementById("editorTextPresetsImportBtn"),
            textPresetsExportBtn: document.getElementById("editorTextPresetsExportBtn"),
            textPresetsSeedBtn: document.getElementById("editorTextPresetsSeedBtn"),
            textPresetsClose: document.getElementById("editorTextPresetsClose"),
            textPresetName: document.getElementById("editorTextPresetName"),
            textPresetAnchor: document.getElementById("editorTextPresetAnchor"),
            textPresetItemsHost: document.getElementById("editorTextPresetItemsHost"),
            textPresetAddItemBtn: document.getElementById("editorTextPresetAddItemBtn"),
            textPresetSaveBtn: document.getElementById("editorTextPresetSaveBtn"),
            textPresetDeleteBtn: document.getElementById("editorTextPresetDeleteBtn"),
            textPresetInsertNewBtn: document.getElementById("editorTextPresetInsertNewBtn"),
            textPresetQuickSelect: document.getElementById("editorTextPresetQuickSelect"),
            glossaryCanonical: document.getElementById("editorGlossaryCanonical"),
            glossaryAliases: document.getElementById("editorGlossaryAliases"),
            glossaryCaseSensitive: document.getElementById("editorGlossaryCaseSensitive"),
            glossaryEnabled: document.getElementById("editorGlossaryEnabled"),
            glossaryAddBtn: document.getElementById("editorGlossaryAddBtn"),
            glossarySaveEntryBtn: document.getElementById("editorGlossarySaveEntryBtn"),
            glossaryDeleteEntryBtn: document.getElementById("editorGlossaryDeleteEntryBtn"),
            glossaryImportBtn: document.getElementById("editorGlossaryImportBtn"),
            glossaryExportBtn: document.getElementById("editorGlossaryExportBtn"),
            glossaryScanBtn: document.getElementById("editorGlossaryScanBtn"),
            breakWordsBtn: document.getElementById("editorBreakWordsBtn"),
            splitOpenBreakWordsBtn: document.getElementById("editorSplitOpenBreakWordsBtn"),
            smartSplitOpenBreakWordsBtn: document.getElementById("editorSmartSplitOpenBreakWordsBtn"),
            breakWordsModal: document.getElementById("editorBreakWordsModal"),
            breakWordsChips: document.getElementById("editorBreakWordsChips"),
            breakWordsInput: document.getElementById("editorBreakWordsInput"),
            breakWordsAddBtn: document.getElementById("editorBreakWordsAddBtn"),
            breakWordsResetBtn: document.getElementById("editorBreakWordsResetBtn"),
            breakWordsClearBtn: document.getElementById("editorBreakWordsClearBtn"),
            breakWordsClose: document.getElementById("editorBreakWordsClose"),
            breakWordsStatus: document.getElementById("editorBreakWordsStatus"),
            glossaryPreview: document.getElementById("editorGlossaryPreview"),
            glossaryConfirm: document.getElementById("editorGlossaryConfirm"),
            glossaryCancel: document.getElementById("editorGlossaryCancel"),
            findInput: document.getElementById("editorFindInput"),
            replaceInput: document.getElementById("editorReplaceInput"),
            findCase: document.getElementById("editorFindCase"),
            findStatus: document.getElementById("editorFindStatus"),
            findPrevBtn: document.getElementById("editorFindPrevBtn"),
            findNextBtn: document.getElementById("editorFindNextBtn"),
            replaceOneBtn: document.getElementById("editorReplaceOneBtn"),
            replaceAllBtn: document.getElementById("editorReplaceAllBtn"),
            batchDurBtn: document.getElementById("editorBatchDurBtn"),
            batchDurModal: document.getElementById("editorBatchDurModal"),
            batchDurFixedWrap: document.getElementById("editorBatchDurFixedWrap"),
            batchDurSilenceWrap: document.getElementById("editorBatchDurSilenceWrap"),
            batchDurTarget: document.getElementById("editorBatchDurTarget"),
            batchDurHint: document.getElementById("editorBatchDurHint"),
            batchDurSilenceDb: document.getElementById("editorBatchDurSilenceDb"),
            batchDurSilenceDur: document.getElementById("editorBatchDurSilenceDur"),
            batchDurSnapPadWrap: document.getElementById("editorBatchDurSnapPadWrap"),
            batchDurSnapPadMs: document.getElementById("editorBatchDurSnapPadMs"),
            batchDurAvoidOverlapRow: document.getElementById("editorBatchDurAvoidOverlapRow"),
            batchDurShorter: document.getElementById("editorBatchDurShorter"),
            batchDurLonger: document.getElementById("editorBatchDurLonger"),
            batchDurMin: document.getElementById("editorBatchDurMin"),
            batchDurMax: document.getElementById("editorBatchDurMax"),
            batchDurCpsAbove: document.getElementById("editorBatchDurCpsAbove"),
            batchDurCpsBelow: document.getElementById("editorBatchDurCpsBelow"),
            batchDurText: document.getElementById("editorBatchDurText"),
            batchDurAvoidOverlap: document.getElementById("editorBatchDurAvoidOverlap"),
            batchDurPreview: document.getElementById("editorBatchDurPreview"),
            batchDurConfirm: document.getElementById("editorBatchDurConfirm"),
            batchDurCancel: document.getElementById("editorBatchDurCancel"),
            smartAdjustBtn: document.getElementById("editorSmartAdjustBtn"),
            qcBtn: document.getElementById("editorQcBtn"),
            qcBadge: document.getElementById("editorQcBadge"),
            retranscribeDurBtn: document.getElementById("editorRetranscribeDurBtn"),
            retranscribeLowConfBtn: document.getElementById("editorRetranscribeLowConfBtn"),
            retranscribeDurModal: document.getElementById("editorRetranscribeDurModal"),
            retranscribeDurSec: document.getElementById("editorRetranscribeDurSec"),
            retranscribeDurPadMs: document.getElementById("editorRetranscribeDurPadMs"),
            retranscribeDurSnapAfter: document.getElementById("editorRetranscribeDurSnapAfter"),
            retranscribeDurPreview: document.getElementById("editorRetranscribeDurPreview"),
            retranscribeDurConfirm: document.getElementById("editorRetranscribeDurConfirm"),
            retranscribeDurAll: document.getElementById("editorRetranscribeDurAll"),
            retranscribeDurCancel: document.getElementById("editorRetranscribeDurCancel"),
            qcModal: document.getElementById("editorQcModal"),
            qcSummaryBar: document.getElementById("editorQcSummaryBar"),
            qcIssueList: document.getElementById("editorQcIssueList"),
            qcFixOverlap: document.getElementById("editorQcFixOverlap"),
            qcFixCpsSplit: document.getElementById("editorQcFixCpsSplit"),
            qcFixCpsExtend: document.getElementById("editorQcFixCpsExtend"),
            qcEnforceMin: document.getElementById("editorQcEnforceMin"),
            qcEnforceMax: document.getElementById("editorQcEnforceMax"),
            qcCompressRep: document.getElementById("editorQcCompressRep"),
            qcRemoveNoise: document.getElementById("editorQcRemoveNoise"),
            qcRemoveDup: document.getElementById("editorQcRemoveDup"),
            qcSmartFix: document.getElementById("editorQcSmartFix"),
            qcSmartFixWrap: document.getElementById("editorQcSmartFixWrap"),
            qcLlmSplit: document.getElementById("editorQcLlmSplit"),
            qcLlmSplitWrap: document.getElementById("editorQcLlmSplitWrap"),
            qcRetranscribe: document.getElementById("editorQcRetranscribe"),
            qcRetranscribeWrap: document.getElementById("editorQcRetranscribeWrap"),
            qcSemanticReview: document.getElementById("editorQcSemanticReview"),
            qcSemanticWrap: document.getElementById("editorQcSemanticWrap"),
            qcMaxCps: document.getElementById("editorQcMaxCps"),
            qcMinSec: document.getElementById("editorQcMinSec"),
            qcMaxSec: document.getElementById("editorQcMaxSec"),
            qcGapMs: document.getElementById("editorQcGapMs"),
            qcPreview: document.getElementById("editorQcPreview"),
            qcConfirm: document.getElementById("editorQcConfirm"),
            qcFixFiltered: document.getElementById("editorQcFixFiltered"),
            qcCancel: document.getElementById("editorQcCancel"),
            smartSplitBtn: document.getElementById("editorSmartSplitBtn"),
            silenceSplitBtn: document.getElementById("editorSilenceSplitBtn"),
            smartSplitCueBtn: document.getElementById("editorSmartSplitCueBtn"),
            silenceSplitCueBtn: document.getElementById("editorSilenceSplitCueBtn"),
            compressRepCueBtn: document.getElementById("editorCompressRepCueBtn"),
            splitLinesBtn: document.getElementById("editorSplitLinesBtn"),
            splitSpacesBtn: document.getElementById("editorSplitSpacesBtn"),
            charDurBtn: document.getElementById("editorCharDurBtn"),
            smartDurBtn: document.getElementById("editorSmartDurBtn"),
            audioSnapBtn: document.getElementById("editorAudioSnapBtn"),
            silenceSplitModal: document.getElementById("editorSilenceSplitModal"),
            silenceSplitDb: document.getElementById("editorSilenceSplitDb"),
            silenceSplitDur: document.getElementById("editorSilenceSplitDur"),
            silenceSplitDurLong: document.getElementById("editorSilenceSplitDurLong"),
            silenceSplitCpsAbove: document.getElementById("editorSilenceSplitCpsAbove"),
            silenceSplitCharsLong: document.getElementById("editorSilenceSplitCharsLong"),
            silenceSplitFixOverlap: document.getElementById("editorSilenceSplitFixOverlap"),
            silenceSplitPreview: document.getElementById("editorSilenceSplitPreview"),
            silenceSplitConfirm: document.getElementById("editorSilenceSplitConfirm"),
            silenceSplitCancel: document.getElementById("editorSilenceSplitCancel"),
            smartSplitModal: document.getElementById("editorSmartSplitModal"),
            smartSplitMaxChars: document.getElementById("editorSmartSplitMaxChars"),
            smartSplitLineChars: document.getElementById("editorSmartSplitLineChars"),
            smartSplitCpsAbove: document.getElementById("editorSmartSplitCpsAbove"),
            smartSplitLineLen: document.getElementById("editorSmartSplitLineLen"),
            smartSplitDurLong: document.getElementById("editorSmartSplitDurLong"),
            smartSplitCharsLong: document.getElementById("editorSmartSplitCharsLong"),
            smartSplitUseCps: document.getElementById("editorSmartSplitUseCps"),
            smartSplitFixOverlap: document.getElementById("editorSmartSplitFixOverlap"),
            smartSplitPreview: document.getElementById("editorSmartSplitPreview"),
            smartSplitConfirm: document.getElementById("editorSmartSplitConfirm"),
            smartSplitCancel: document.getElementById("editorSmartSplitCancel"),
            smartAdjustModal: document.getElementById("editorSmartAdjustModal"),
            smartFixOverlap: document.getElementById("editorSmartFixOverlap"),
            smartFixCps: document.getElementById("editorSmartFixCps"),
            smartEnforceMin: document.getElementById("editorSmartEnforceMin"),
            smartEnforceMax: document.getElementById("editorSmartEnforceMax"),
            smartMaxCps: document.getElementById("editorSmartMaxCps"),
            smartMinSec: document.getElementById("editorSmartMinSec"),
            smartMaxSec: document.getElementById("editorSmartMaxSec"),
            smartGapMs: document.getElementById("editorSmartGapMs"),
            smartPreview: document.getElementById("editorSmartPreview"),
            smartAdjustConfirm: document.getElementById("editorSmartAdjustConfirm"),
            smartAdjustCancel: document.getElementById("editorSmartAdjustCancel"),
            removeNoiseBtn: document.getElementById("editorRemoveNoiseBtn"),
            removeNoiseModal: document.getElementById("editorRemoveNoiseModal"),
            removeNoisePreview: document.getElementById("editorRemoveNoisePreview"),
            removeNoiseConfirm: document.getElementById("editorRemoveNoiseConfirm"),
            removeNoiseCancel: document.getElementById("editorRemoveNoiseCancel"),
            noiseRemoveEmpty: document.getElementById("editorNoiseRemoveEmpty"),
            noiseRemoveFragments: document.getElementById("editorNoiseRemoveFragments"),
            noiseRemoveSoundEffects: document.getElementById("editorNoiseRemoveSoundEffects"),
            noiseRemoveSymbolOnly: document.getElementById("editorNoiseRemoveSymbolOnly"),
            noiseRemoveDuplicates: document.getElementById("editorNoiseRemoveDuplicates"),
            noiseRemoveHallucinations: document.getElementById("editorNoiseRemoveHallucinations"),
            chineseConvertBtn: document.getElementById("editorChineseConvertBtn"),
            chineseConvertModal: document.getElementById("editorChineseConvertModal"),
            chineseConvertPreview: document.getElementById("editorChineseConvertPreview"),
            chineseConvertConfirm: document.getElementById("editorChineseConvertConfirm"),
            chineseConvertCancel: document.getElementById("editorChineseConvertCancel"),
            chineseDirS2T: document.getElementById("editorChineseDirS2T"),
            chineseDirT2S: document.getElementById("editorChineseDirT2S"),
            chineseLocaleTwp: document.getElementById("editorChineseLocaleTwp"),
            chineseLocaleTw: document.getElementById("editorChineseLocaleTw"),
            chineseLocaleHk: document.getElementById("editorChineseLocaleHk"),
            chineseScopeAll: document.getElementById("editorChineseScopeAll"),
            chineseScopeSelected: document.getElementById("editorChineseScopeSelected"),
            chineseProtectGlossary: document.getElementById("editorChineseProtectGlossary"),
            compressRepBtn: document.getElementById("editorCompressRepBtn"),
            compressRepModal: document.getElementById("editorCompressRepModal"),
            compressRepPreview: document.getElementById("editorCompressRepPreview"),
            compressRepConfirm: document.getElementById("editorCompressRepConfirm"),
            compressRepCancel: document.getElementById("editorCompressRepCancel"),
            compressRepScopeAll: document.getElementById("editorCompressRepScopeAll"),
            compressRepScopeSelected: document.getElementById("editorCompressRepScopeSelected"),
            compressRepSingleChar: document.getElementById("editorCompressRepSingleChar"),
            compressRepExclaim: document.getElementById("editorCompressRepExclaim"),
            viewingPunctBtn: document.getElementById("editorViewingPunctBtn"),
            viewingPunctModal: document.getElementById("editorViewingPunctModal"),
            viewingPunctPreview: document.getElementById("editorViewingPunctPreview"),
            viewingPunctConfirm: document.getElementById("editorViewingPunctConfirm"),
            viewingPunctCancel: document.getElementById("editorViewingPunctCancel"),
            viewingPunctScopeAll: document.getElementById("editorViewingPunctScopeAll"),
            viewingPunctScopeSelected: document.getElementById("editorViewingPunctScopeSelected"),
            restoreBtn: document.getElementById("editorRestoreBtn"),
            sidecarSelect: document.getElementById("editorSidecarSelect"),
            cueBody: document.getElementById("editorCueBody"),
            cueTable: document.getElementById("editorCueTable"),
            listWrap: document.getElementById("editorListWrap"),
            cueContextMenu: document.getElementById("editorCueContextMenu"),
            detailPane: document.getElementById("editorDetailPane"),
            detailStart: document.getElementById("editorDetailStart"),
            detailDuration: document.getElementById("editorDetailDuration"),
            detailEnd: document.getElementById("editorDetailEnd"),
            detailText: document.getElementById("editorDetailText"),
            detailPairWrap: document.getElementById("editorDetailPairWrap"),
            detailPairLabel: document.getElementById("editorDetailPairLabel"),
            detailPairText: document.getElementById("editorDetailPairText"),
            detailCps: document.getElementById("editorDetailCps"),
            targetCps: document.getElementById("editorTargetCps"),
            lineLen: document.getElementById("editorLineLen"),
            textLen: document.getElementById("editorTextLen"),
            detailWarn: document.getElementById("editorDetailWarn"),
            prevCueBtn: document.getElementById("editorPrevCueBtn"),
            nextCueBtn: document.getElementById("editorNextCueBtn"),
            deleteCueBtn: document.getElementById("editorDeleteCueBtn"),
            splitCueBtn: document.getElementById("editorSplitCueBtn"),
            splitModal: document.getElementById("editorSplitModal"),
            splitConfirm: document.getElementById("editorSplitConfirm"),
            splitCancel: document.getElementById("editorSplitCancel"),
            splitCharCount: document.getElementById("editorSplitCharCount"),
            splitCount: document.getElementById("editorSplitCount"),
            splitSmartMaxChars: document.getElementById("editorSplitSmartMaxChars"),
            splitSmartLineChars: document.getElementById("editorSplitSmartLineChars"),
            splitSilenceDb: document.getElementById("editorSplitSilenceDb"),
            splitSilenceDur: document.getElementById("editorSplitSilenceDur"),
            splitUseCps: document.getElementById("editorSplitUseCps"),
            splitFixOverlap: document.getElementById("editorSplitFixOverlap"),
            splitPreview: document.getElementById("editorSplitPreview"),
            splitRemember: document.getElementById("editorSplitRemember"),
            splitHint: document.getElementById("editorSplitHint"),
            startNudgeBack: document.getElementById("editorStartNudgeBack"),
            startNudgeFwd: document.getElementById("editorStartNudgeFwd"),
            durNudgeDown: document.getElementById("editorDurNudgeDown"),
            durNudgeUp: document.getElementById("editorDurNudgeUp"),
            setStartToPlayhead: document.getElementById("editorSetStartToPlayhead"),
            setEndToPlayhead: document.getElementById("editorSetEndToPlayhead"),
            video: document.getElementById("editorVideo"),
            videoFrame: document.getElementById("editorVideoFrame"),
            videoWrap: document.getElementById("editorVideoWrap"),
            videoHint: document.getElementById("editorVideoHint"),
            videoSubtitle: document.getElementById("editorVideoSubtitle"),
            videoSubtitleSource: document.getElementById("editorVideoSubtitleSource"),
            videoSubtitleText: document.getElementById("editorVideoSubtitleText"),
            statusLine: document.getElementById("editorStatusLine"),
            bootProgress: document.getElementById("editorBootProgress"),
            welcome: document.getElementById("editorWelcome"),
            welcomeIconWrap: document.getElementById("editorWelcomeIconWrap"),
            welcomeIcon: document.getElementById("editorWelcomeIcon"),
            welcomeOpenBtn: document.getElementById("editorWelcomeOpenBtn"),
            welcomeOpenGeneratorBtn: document.getElementById("editorWelcomeOpenGeneratorBtn"),
            welcomeOpenLibraryBtn: document.getElementById("editorWelcomeOpenLibraryBtn"),
            welcomeHistoryList: document.getElementById("editorWelcomeHistoryList"),
            welcomeClearBtn: document.getElementById("editorWelcomeClearBtn"),
            bootProgressTitle: document.getElementById("editorBootProgressTitle"),
            bootProgressDetail: document.getElementById("editorBootProgressDetail"),
            silenceProgress: document.getElementById("editorSilenceProgress"),
            silenceProgressTitle: document.getElementById("editorSilenceProgressTitle"),
            silenceProgressCount: document.getElementById("editorSilenceProgressCount"),
            silenceProgressDetail: document.getElementById("editorSilenceProgressDetail"),
            silenceProgressTrack: document.getElementById("editorSilenceProgressTrack"),
            silenceProgressBar: document.getElementById("editorSilenceProgressBar"),
            silenceProgressHint: document.getElementById("editorSilenceProgressHint"),
            silenceProgressCancel: document.getElementById("editorSilenceProgressCancel")
        })
    }

    (function warnMissingEditorParts() {
        const parts = (typeof globalThis !== 'undefined' && globalThis.TransubEditorParts)
            || (typeof window !== 'undefined' && window.TransubEditorParts)
            || {};
        const need = [
            'retranscribeRangePlan',
            'batchCueFilterPlan',
            'audioSnapDurationPlan',
            'cueSplitPlan',
            'silenceSplitPlan',
            'qcSummaryUi',
        ];
        const missing = need.filter((k) => !parts[k]);
        if (missing.length) {
            console.warn('[Transub editor] missing TransubEditorParts:', missing.join(', '));
        }
    })();

    function da() {
        if (!(!p?.isDesktop || !document.getElementById("editorCueBody")))
            if (loadLibrarySaveIntent(), syncLibraryBar(), Dl(), H?.bindUi?.(), Bt?.bindUi?.(), Bt?.refreshWorkspaceUi?.(), As?.bindUi?.(), Ov?.bindUi?.(), dl(), [e.splitModal, e.findReplaceModal, e.batchDurModal, e.smartSplitModal, e.silenceSplitModal, e.smartAdjustModal, e.removeNoiseModal, e.chineseConvertModal, e.compressRepModal, e.viewingPunctModal, e.qcModal, e.glossaryModal, e.assStylesModal, e.textPresetsModal, e.workflowModal, e.breakWordsModal, e.retranscribeDurModal, e.shortcutsModal].forEach(n => {
                    n?.classList.contains("hidden") && n.setAttribute("inert", "")
                }), Ll(), vt(), wo(), Pr(), St.loadWorkflows(), ka(), void loadSystemFontsForAss(), p?.onTransubComputeTaskChanged?.(n => {
                    t.computeBusy = !!n?.busy, t.computeBusyLabel = n?.busy ? String(n.label || n.kind || "").trim() : "", t.computeBusySince = n?.busy ? Number(n.since) || Date.now() : 0, ar(), Qe()
                }), (async () => {
                    try {
                        const n = await p?.transubComputeTaskStatus?.();
                        n?.busy && (t.computeBusy = !0, t.computeBusyLabel = String(n.label || n.kind || "").trim(), t.computeBusySince = Number(n.since) || Date.now(), ar(), Qe())
                    } catch {}
                })(), p?.onSubtitleEditorRefocus?.(() => ht()), window.addEventListener("focus", () => {
                    const n = document.activeElement;
                    (!n || n === document.body || !!n.closest?.(".editor-modal.hidden")) && ht()
                }), Vn = !0, st) {
                const n = st;
                st = null, ds(n)
            } else jr({
                title: "\u5B57\u5E55\u7F16\u8F91\u5668\u5DF2\u5C31\u7EEA",
                detail: "\u7B49\u5F85\u6253\u5F00\u5B57\u5E55\u6587\u4EF6\u2026",
                statusMessage: "\u6B63\u5728\u7B49\u5F85\u5B57\u5E55\u6587\u4EF6\u2026"
            }), setTimeout(() => {
                !t.ready && !st && !Jt && !t.path && cn()
            }, 400)
    }
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", () => setTimeout(da, 0)) : setTimeout(da, 0)
})(window);