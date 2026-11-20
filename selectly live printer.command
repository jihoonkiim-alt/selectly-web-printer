#!/bin/zsh
cd "$(dirname "$0")"

cloudflared tunnel --url http://localhost:3737 > /tmp/selectly-tunnel.log 2>&1 &
CF_PID=$!

cleanup() {
  kill $CF_PID 2>/dev/null
}
trap cleanup EXIT

(sleep 1 && open -a "Google Chrome" "http://localhost:3737") &

(
  for i in $(seq 1 20); do
    sleep 1
    URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' /tmp/selectly-tunnel.log | head -1)
    if [ -n "$URL" ]; then
      echo "$URL" | pbcopy
      echo ""
      echo "=================================================="
      echo " 폰/다른 기기에서 접속할 주소 (클립보드에 복사됨):"
      echo " $URL"
      echo " 로그인 아이디/비밀번호는 webapp/auth.json 파일 참고"
      echo " (이 주소는 매번 새로 켤 때마다 바뀝니다)"
      echo "=================================================="
      break
    fi
  done
) &

python3 server.py
