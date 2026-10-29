@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 설치가 필요합니다. https://nodejs.org
  pause
  exit /b 1
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>24 || major===24 && minor>=15 ? 0 : 1)"
if errorlevel 1 (
  echo 계정 DB를 실행하려면 Node.js 24.15 이상이 필요합니다. https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci --no-fund
  if errorlevel 1 (
    echo 설치하지 못했습니다. 인터넷 연결과 Node.js 버전을 확인해 주세요.
    pause
    exit /b 1
  )
)
echo 뷰티로그를 시작합니다. 앱과 사진 분석 연결을 함께 준비합니다.
echo 계정 자료는 .계정자료 폴더에 보관합니다. 폴더를 삭제하거나 공유하지 마세요.
call npm run build
if errorlevel 1 (
  echo 화면을 준비하지 못했습니다. 위 오류를 확인해 주세요.
  pause
  exit /b 1
)
call npm run preview
pause
