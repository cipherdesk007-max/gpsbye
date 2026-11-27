#!/bin/bash
# Prova dell'APK vero nell'emulatore Android: due avvii con la prova automatica, foto dello schermo.
set -u
APK=${1:-FMLAB-Cristalia.apk}
PKG=it.fmlab.cristalia
adb install -r "$APK"
mkdir -p foto
avvio() {
  adb logcat -c
  adb shell am start -W -n $PKG/it.fmlab.monsters.MainActivity --ez autotest true
  for i in $(seq 1 75); do
    adb logcat -d -s CristaliaTest:* > "run$1.log"
    grep -q "AUTOTEST {" "run$1.log" && break
    sleep 2
  done
  sleep 6
  adb exec-out screencap -p > "foto/android-$1.png"
  adb logcat -d | grep -iE "chromium|webview|AndroidRuntime" | tail -40 > "logcat-$1.txt" || true
  adb shell am force-stop $PKG
}
avvio 1
sleep 3
avvio 2
python3 apps/check-autotest.py run1.log run2.log | tee foto/android-risultato.txt
exit ${PIPESTATUS[0]}
