@echo off
REM LINKA - atalho de duplo clique para o tecnico.
REM Toda a logica esta no .ps1; este arquivo so existe para nao pedir nada
REM alem de "clique duas vezes".
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Provisionar-LINKA.ps1"
