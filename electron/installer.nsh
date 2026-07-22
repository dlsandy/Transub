!macro customInstall
  ; Transub Editor — same exe, editor-only mode
  CreateShortCut "$DESKTOP\Transub Editor.lnk" "$appExe" "--subtitle-editor-only" "$INSTDIR\resources\icons\editor-app.ico" 0 "" "" "Transub Editor"
  CreateShortCut "$SMPROGRAMS\Transub Editor.lnk" "$appExe" "--subtitle-editor-only" "$INSTDIR\resources\icons\editor-app.ico" 0 "" "" "Transub Editor"
  ClearErrors
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Transub Editor.lnk"
  Delete "$SMPROGRAMS\Transub Editor.lnk"
  ClearErrors
!macroend
