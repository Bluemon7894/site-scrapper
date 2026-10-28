@echo off
chcp 65001 >nul
title SiteScrap CMD
cd /d "%~dp0"
node index.js
pause
