@echo off
chcp 65001 >nul
title SiteBlueprint AI - 웹사이트 디자인·구조·3D·소스 추출기
cd /d "%~dp0"
echo =========================================================
echo   SiteBlueprint AI 데스크톱 앱을 시작합니다...
echo   (창을 닫으면 서버가 종료됩니다)
echo =========================================================
node server.js
pause
