#!/usr/bin/env bash
set -uo pipefail
KEY="$HOME/.ssh/lg-tv_webos_trad"
HOST="prisoner@10.0.0.176"
PORT="9922"
echo "== ssh echo =="
ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
    -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa \
    -o ConnectTimeout=8 -p "$PORT" "$HOST" 'echo HELLO_TV'
echo "exit=$?"
echo "== ssh whoami =="
ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
    -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa \
    -o ConnectTimeout=8 -p "$PORT" "$HOST" 'whoami'
echo "exit=$?"
echo "== tv date =="
ssh -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=no \
    -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa \
    -o ConnectTimeout=8 -p "$PORT" "$HOST" 'date'
echo "exit=$?"
