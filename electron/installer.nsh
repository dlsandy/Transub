; Transub NSIS customizations (electron-builder buildResources = electron/)
; Default update uninstall wipes $INSTDIR. Stash models / GPU / Advanced LLM / settings
; beside the install dir (same volume → Rename), then restore after extract.

Var /GLOBAL tsPreserveRoot

!macro tsSetPreserveRoot
  StrCpy $tsPreserveRoot "$INSTDIR\..\Transub.__ts_preserve__"
!macroend

!macro tsStashPath SRC_REL DEST_NAME
  ${if} ${FileExists} "$INSTDIR\${SRC_REL}"
    ClearErrors
    Rename "$INSTDIR\${SRC_REL}" "$tsPreserveRoot\${DEST_NAME}"
    ${if} ${Errors}
      DetailPrint "Preserve rename failed: ${SRC_REL}"
      ClearErrors
    ${endif}
  ${endif}
!macroend

!macro tsRestorePath DEST_REL STASH_NAME
  ${if} ${FileExists} "$tsPreserveRoot\${STASH_NAME}"
    ${if} ${FileExists} "$INSTDIR\${DEST_REL}"
      RMDir /r "$INSTDIR\${DEST_REL}"
      Delete "$INSTDIR\${DEST_REL}"
    ${endif}
    ClearErrors
    Rename "$tsPreserveRoot\${STASH_NAME}" "$INSTDIR\${DEST_REL}"
    ${if} ${Errors}
      DetailPrint "Preserve restore failed: ${DEST_REL}"
      ClearErrors
    ${endif}
  ${endif}
!macroend

; Sets $R9=1 when a site-packages entry name must survive updates. ID suffixes labels.
!macro tsSitePackageShouldPreserve NAME ID
  StrCpy $R9 0
  StrCpy $R7 "${NAME}"

  StrCpy $R8 $R7 6
  StrCmp $R8 "nvidia" ts_sp_yes_${ID}

  StrCpy $R8 $R7 5
  StrCmp $R8 "torch" ts_sp_yes_${ID}

  StrCpy $R8 $R7 11
  StrCmp $R8 "onnxruntime" ts_sp_yes_${ID}

  StrCpy $R8 $R7 11
  StrCmp $R8 "ctranslate2" ts_sp_yes_${ID}

  StrCpy $R8 $R7 14
  StrCmp $R8 "faster_whisper" ts_sp_yes_${ID}

  StrCpy $R8 $R7 14
  StrCmp $R8 "openai_whisper" ts_sp_yes_${ID}

  StrCpy $R8 $R7 7
  StrCmp $R8 "whisper" ts_sp_yes_${ID}

  StrCpy $R8 $R7 6
  StrCmp $R8 "demucs" ts_sp_yes_${ID}

  StrCpy $R8 $R7 5
  StrCmp $R8 "numpy" ts_sp_yes_${ID}

  StrCmp $R7 "av" ts_sp_yes_${ID}
  StrCpy $R8 $R7 3
  StrCmp $R8 "av-" ts_sp_yes_${ID}
  StrCmp $R8 "av." ts_sp_yes_${ID}

  StrCpy $R8 $R7 10
  StrCmp $R8 "tokenizers" ts_sp_yes_${ID}

  StrCpy $R8 $R7 13
  StrCmp $R8 "sentencepiece" ts_sp_yes_${ID}

  StrCpy $R8 $R7 6
  StrCmp $R8 "funasr" ts_sp_yes_${ID}

  StrCpy $R8 $R7 4
  StrCmp $R8 "onnx" ts_sp_yes_${ID}

  Goto ts_sp_end_${ID}

  ts_sp_yes_${ID}:
    StrCpy $R9 1
  ts_sp_end_${ID}:
!macroend

!macro tsStashSitePackages SITE_REL STASH_SUB ID
  ${if} ${FileExists} "$INSTDIR\${SITE_REL}"
    CreateDirectory "$tsPreserveRoot\${STASH_SUB}"
    FindFirst $R1 $R2 "$INSTDIR\${SITE_REL}\*.*"
    ts_sp_loop_${ID}:
      StrCmp $R2 "" ts_sp_done_${ID}
      StrCmp $R2 "." ts_sp_next_${ID}
      StrCmp $R2 ".." ts_sp_next_${ID}
      !insertmacro tsSitePackageShouldPreserve $R2 ${ID}
      ${if} $R9 == 1
        ClearErrors
        Rename "$INSTDIR\${SITE_REL}\$R2" "$tsPreserveRoot\${STASH_SUB}\$R2"
        ${if} ${Errors}
          DetailPrint "Preserve site-package failed: $R2"
          ClearErrors
        ${endif}
      ${endif}
      ts_sp_next_${ID}:
      FindNext $R1 $R2
      Goto ts_sp_loop_${ID}
    ts_sp_done_${ID}:
    FindClose $R1
  ${endif}
!macroend

!macro tsRestoreSitePackages SITE_REL STASH_SUB ID
  ${if} ${FileExists} "$tsPreserveRoot\${STASH_SUB}"
    CreateDirectory "$INSTDIR\${SITE_REL}"
    FindFirst $R1 $R2 "$tsPreserveRoot\${STASH_SUB}\*.*"
    ts_spr_loop_${ID}:
      StrCmp $R2 "" ts_spr_done_${ID}
      StrCmp $R2 "." ts_spr_next_${ID}
      StrCmp $R2 ".." ts_spr_next_${ID}
      ${if} ${FileExists} "$INSTDIR\${SITE_REL}\$R2"
        RMDir /r "$INSTDIR\${SITE_REL}\$R2"
        Delete "$INSTDIR\${SITE_REL}\$R2"
      ${endif}
      ClearErrors
      Rename "$tsPreserveRoot\${STASH_SUB}\$R2" "$INSTDIR\${SITE_REL}\$R2"
      ${if} ${Errors}
        DetailPrint "Restore site-package failed: $R2"
        ClearErrors
      ${endif}
      ts_spr_next_${ID}:
      FindNext $R1 $R2
      Goto ts_spr_loop_${ID}
    ts_spr_done_${ID}:
    FindClose $R1
  ${endif}
!macroend

!macro tsStashUserData
  !insertmacro tsSetPreserveRoot
  RMDir /r "$tsPreserveRoot"
  CreateDirectory "$tsPreserveRoot"

  !insertmacro tsStashPath "transub-engine\models" "models"
  !insertmacro tsStashPath "advanced-llm" "advanced-llm"
  !insertmacro tsStashPath "advanced-modules" "advanced-modules"
  !insertmacro tsStashPath "backup" "backup"
  !insertmacro tsStashPath "subtitles" "subtitles"
  !insertmacro tsStashPath "temp" "temp"
  !insertmacro tsStashPath "transwithai-config" "transwithai-config"
  !insertmacro tsStashPath "data" "data"

  !insertmacro tsStashPath "transub-settings.json" "transub-settings.json"
  !insertmacro tsStashPath "transwithai-settings.json" "transwithai-settings.json"
  !insertmacro tsStashPath "transub-glossary.json" "transub-glossary.json"
  !insertmacro tsStashPath "transub-task-history.json" "transub-task-history.json"
  !insertmacro tsStashPath "transub-editor-history.json" "transub-editor-history.json"
  !insertmacro tsStashPath "transub-presets.json" "transub-presets.json"
  !insertmacro tsStashPath "transub-text-presets.json" "transub-text-presets.json"
  !insertmacro tsStashPath "transub-editor-workflows.json" "transub-editor-workflows.json"
  !insertmacro tsStashPath "transub-advanced.json" "transub-advanced.json"
  !insertmacro tsStashPath "transub-advanced-device.json" "transub-advanced-device.json"
  !insertmacro tsStashPath "ui-prefs.json" "ui-prefs.json"
  !insertmacro tsStashPath "window-state.json" "window-state.json"
  !insertmacro tsStashPath "transcript-keep-pins.json" "transcript-keep-pins.json"
  !insertmacro tsStashPath "transub-sense-memory.json" "transub-sense-memory.json"

  !insertmacro tsStashSitePackages "transub-engine\runtime\Lib\site-packages" "site-packages" 1
  !insertmacro tsStashSitePackages "transub-engine\runtime\lib\site-packages" "site-packages-lib" 2
!macroend

!macro tsRestoreUserData
  !insertmacro tsSetPreserveRoot
  ${if} ${FileExists} "$tsPreserveRoot"
    CreateDirectory "$INSTDIR\transub-engine"
    CreateDirectory "$INSTDIR\transub-engine\runtime"
    CreateDirectory "$INSTDIR\transub-engine\runtime\Lib"
    CreateDirectory "$INSTDIR\transub-engine\runtime\lib"

    !insertmacro tsRestorePath "transub-engine\models" "models"
    !insertmacro tsRestorePath "advanced-llm" "advanced-llm"
    !insertmacro tsRestorePath "advanced-modules" "advanced-modules"
    !insertmacro tsRestorePath "backup" "backup"
    !insertmacro tsRestorePath "subtitles" "subtitles"
    !insertmacro tsRestorePath "temp" "temp"
    !insertmacro tsRestorePath "transwithai-config" "transwithai-config"
    !insertmacro tsRestorePath "data" "data"

    !insertmacro tsRestorePath "transub-settings.json" "transub-settings.json"
    !insertmacro tsRestorePath "transwithai-settings.json" "transwithai-settings.json"
    !insertmacro tsRestorePath "transub-glossary.json" "transub-glossary.json"
    !insertmacro tsRestorePath "transub-task-history.json" "transub-task-history.json"
    !insertmacro tsRestorePath "transub-editor-history.json" "transub-editor-history.json"
    !insertmacro tsRestorePath "transub-presets.json" "transub-presets.json"
    !insertmacro tsRestorePath "transub-text-presets.json" "transub-text-presets.json"
    !insertmacro tsRestorePath "transub-editor-workflows.json" "transub-editor-workflows.json"
    !insertmacro tsRestorePath "transub-advanced.json" "transub-advanced.json"
    !insertmacro tsRestorePath "transub-advanced-device.json" "transub-advanced-device.json"
    !insertmacro tsRestorePath "ui-prefs.json" "ui-prefs.json"
    !insertmacro tsRestorePath "window-state.json" "window-state.json"
    !insertmacro tsRestorePath "transcript-keep-pins.json" "transcript-keep-pins.json"
    !insertmacro tsRestorePath "transub-sense-memory.json" "transub-sense-memory.json"

    !insertmacro tsRestoreSitePackages "transub-engine\runtime\Lib\site-packages" "site-packages" 1
    !insertmacro tsRestoreSitePackages "transub-engine\runtime\lib\site-packages" "site-packages-lib" 2

    RMDir /r "$tsPreserveRoot"
  ${endif}
!macroend

!macro customRemoveFiles
  ${if} ${isUpdated}
    ; Skip if customInit already stashed (avoids wiping a good stash).
    !insertmacro tsSetPreserveRoot
    ${ifNot} ${FileExists} "$tsPreserveRoot"
      !insertmacro tsStashUserData
    ${endif}
  ${endif}
  RMDir /r $INSTDIR
!macroend

; Run before uninstallOldVersion on silent updates (electron-updater), so upgrades from
; older builds that wiped $INSTDIR still keep models / GPU / Advanced LLM.
; Interactive installs stash later in customRemoveFiles to avoid leaving a half-moved
; tree if the user cancels the wizard.
!macro customInit
  ${if} ${Silent}
    ${if} ${FileExists} "$INSTDIR\Transub.exe"
      !insertmacro tsSetPreserveRoot
      ${ifNot} ${FileExists} "$tsPreserveRoot"
        !insertmacro tsStashUserData
      ${endif}
    ${endif}
  ${endif}
!macroend

!macro customInstall
  CreateShortCut "$DESKTOP\Transub Editor.lnk" "$appExe" "--subtitle-editor-only" "$INSTDIR\resources\icons\editor-app.ico" 0 "" "" "Transub Editor"
  CreateShortCut "$SMPROGRAMS\Transub Editor.lnk" "$appExe" "--subtitle-editor-only" "$INSTDIR\resources\icons\editor-app.ico" 0 "" "" "Transub Editor"

  !insertmacro tsRestoreUserData
  ClearErrors
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Transub Editor.lnk"
  Delete "$SMPROGRAMS\Transub Editor.lnk"
  ClearErrors
!macroend
