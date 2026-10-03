@echo off
setlocal
cd /d "%~dp0"
title Cat flap setup

echo.
echo  Checking that Docker Desktop is running...
docker info >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Docker Desktop isn't running. Open Docker Desktop, wait until it says
  echo  "Engine running", then double-click setup.cmd again.
  echo.
  pause
  exit /b 1
)

set COMPOSE=docker compose -f docker-compose.yml -f docker-compose.tunnel.yml

echo  Preparing the setup tools (the first time takes a few minutes)...
%COMPOSE% build setup || goto failed

%COMPOSE% run --rm setup scripts/setup.js || goto failed

echo.
echo  Starting the skill...
%COMPOSE% up -d --build --remove-orphans || goto failed

%COMPOSE% run --rm setup scripts/alexa-skill.js || goto failed

echo.
echo  All done. You can close this window.
echo.
pause
exit /b 0

:failed
echo.
echo  Something went wrong. The messages above say what; DEPLOY.md has a
echo  troubleshooting section.
echo.
pause
exit /b 1
