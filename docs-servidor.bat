@echo off
REM Sobe a documentação em http://localhost:1900 (feche esta janela para parar).
REM Usa o PHP do PATH; no Laragon, abra pelo terminal do Laragon ou ajuste a variável PHP abaixo.
cd /d "%~dp0"
set PHP=php
if exist "C:\laragon\bin\php\php-8.4.2\php.exe" set PHP=C:\laragon\bin\php\php-8.4.2\php.exe
echo Documentacao em http://localhost:1900  (tecnica: http://localhost:1900/tecnica)
"%PHP%" -S 0.0.0.0:1900 scripts\docs-server.php
