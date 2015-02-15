#!/bin/sh

dir=/sdcard/testserver/   # ref. server.js setting

echo target dir: $dir

adb shell mkdir -p $dir
adb push ./sdcard/cat-1000x781.jpg   $dir 
adb push ./sdcard/hiyoko-640x480.jpg $dir 
adb push ./sdcard/index.html         $dir 
adb push ./sdcard/inu-1280x1023.jpg  $dir 
adb push ./sdcard/style.css          $dir 
adb push ./sdcard/script.js          $dir 



