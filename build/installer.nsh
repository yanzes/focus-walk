; Aviso que sale mientras el instalador copia los archivos (no en /S).
; El texto largo está en build/installer-license.txt, que es la página de
; licencia que el usuario acepta antes de empezar.

!macro customInstall
  IfSilent +2
    MessageBox MB_ICONINFORMATION|MB_OK "Focus Walk es un proyecto de código abierto (licencia MIT).$\r$\n$\r$\nLo hice en un fin de semana para resolver mi propia necesidad: no hay empresa detrás, ni soporte garantizado. Si te sirve, úsalo y difunde lo que aprendas.$\r$\n$\r$\nNo me hago responsable del uso que se le dé ni de los daños que de él se deriven."
!macroend
