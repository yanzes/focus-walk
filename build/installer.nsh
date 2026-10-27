; OJO: este archivo va en UTF-8 **con BOM**. NSIS lee los archivos incluidos con
; la página ANSI del sistema, no con el -INPUTCHARSET del proyecto, así que sin el
; BOM los acentos se compilan mal y el instalador muestra «cafÃ©» en vez de «café».
; Si tu editor permite elegir, guarda como «UTF-8 con BOM» y no lo quites.

; Textos propios del instalador. Se incluye antes de que NSIS monte las páginas,
; así que aquí valen los !define de MUI2.

; Última página, la que se ve al terminar. La invitación al café va aquí porque es
; el único momento en el que la persona ya sabe si la app le sirve.
!define MUI_FINISHPAGE_TEXT "Focus Walk ya está instalado.$\r$\n$\r$\nSi te sirvió, invítame a un café en ko-fi.com/yancodev: eso me motiva a continuar innovando."

; Aviso que sale mientras el instalador copia los archivos (no en /S).
; El texto largo está en build/installer-license.txt, que es la página de
; licencia que el usuario acepta antes de empezar.

!macro customInstall
  IfSilent +2
    MessageBox MB_ICONINFORMATION|MB_OK "Focus Walk es un proyecto de código abierto (licencia MIT).$\r$\n$\r$\nLo hice en un fin de semana para resolver mi propia necesidad: no hay empresa detrás, ni soporte garantizado. Si te sirve, úsalo y difunde lo que aprendas.$\r$\n$\r$\nNo me hago responsable del uso que se le dé ni de los daños que de él se deriven."
!macroend
