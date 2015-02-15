"use strict";

const DEBUG = true;
const NO_SYSTEM_XHR = true;
const BOOT_TIME = new Date().getTime();

var FPS = 2;
var lastTime = BOOT_TIME;
var SERVER_IP    = "192.168.100.104";
var SERVER_PORT  = 3000;
var API_BASE_URL  = "http://"+SERVER_IP+":"+SERVER_PORT+"/api/";

var FOXKEH_IS_FRIEND = true;

var MAX_SPEED = 255;
// 静止状態になるコントローラーの傾き基準位置 (beta: 横, gamma: 縦)
var calibration = { beta: 0, gamma: 20 };
// 静止状態扱いになる傾き範囲
var allowance = { beta: 5, gamma: 5 };
// 基準位置からこれ以上傾けても速度は上がらない(最大速度になる)
var threshold = { beta: 60, gamma: 60 };

function debugMessage(html) {
  var placeholder = document.getElementById("debug-message");
  if (DEBUG) {
    placeholder.innerHTML = html;
  } else {
    placeholder.innerHTML = "";
  }
}

function calibrateDefaultPosition() {
  console.log("calibrateDefaultPosition() is not implemented yet!")
  calibration = calibration;
}

function orientation2speed(orientation) {
  /*
   * 端末の傾きから左右のモーターの速度を決めて返す
   * beta: -180~180 横方向、右が正、左が負
   * gamma: -90~90 縦方向、手前に立てると正、逆に立てると負
   * speed.base を -MAX_SPEED ~ MAX_SPEED の範囲で指定
   * speed.[right|left] は speed.base を元に計算
   */
  var speed = { base: 0, right: 0, left: 0 };

  var calibratedBeta = orientation.beta - calibration.beta;
  var calibratedGamma = orientation.gamma - calibration.gamma;
  var betaRange = threshold.beta - allowance.beta;
  var gammaRange = threshold.gamma - allowance.gamma;

  // ベース速度計算
  if (Math.abs(calibratedGamma) <= allowance.gamma) { // 静止
    return speed;
  }
  if (Math.abs(calibratedGamma) >= threshold.gamma) { // 最高速度で前進/後退
    speed.base = calibratedGamma > 0 ? -MAX_SPEED : MAX_SPEED;
  } else { // 速度を計算して決定
    // 静止〜最高速度のあいだの傾きでリニア。適当に sin^2 とかの関数にすべき
    speed.base = (calibratedGamma > 0 ? -MAX_SPEED : MAX_SPEED) *
      (Math.abs(calibratedGamma) - allowance.gamma) / gammaRange;
  }


  // 左右の速度バランス計算
  if (Math.abs(calibratedBeta) <= allowance.beta) { // 直進
    speed.right = speed.base;
    speed.left = speed.base;
  }
  if (Math.abs(calibratedBeta) >= threshold.beta) { // 片方のみ
    speed.right = calibratedBeta > 0 ? speed.base : 0;
    speed.left  = calibratedBeta < 0 ? speed.base : 0;
  } else { // 速度を計算して決定
    var linearFactor = (threshold.beta - Math.abs(calibratedBeta)) / betaRange;
    var factor = Math.sin(Math.PI/2 * linearFactor);
    speed.right = calibratedBeta > 0 ? speed.base : speed.base * factor;
    speed.left  = calibratedBeta < 0 ? speed.base : speed.base * factor;
  }

  // right/left は整数値に丸める
  speed.right = Math.round(speed.right);
  speed.left  = Math.round(speed.left);
  //console.log(speed);
  return speed;
}

function sendSystemXHR(url) {
  console.log("sending system XHR request to: "+url);
  var req = new XMLHttpRequest({mozSystem: true});
  req.open('GET', url, true);
  req.onreadystatechange = function(event){
    if(req.readyState == 4){
      //console.log("req.readyState: " + req.readyState);
      if(req.status == 200){


      } else {
        console.log("req.status:" + req.status + "req:");
        console.log(req);
      }
    }
  };
  req.send(null);
}

function requestWithImgSrc(url) {
  console.log("inserting img src=: "+url);
  var placeholder = document.getElementById("debug-message");
  var imgtag = "<img src='"+url+"'/>";
  placeholder.innerHTML = imgtag;
}

function sendRequest(url) {
  if (!NO_SYSTEM_XHR && document.location.protocol == "app:") {
    sendSystemXHR(url);
  } else {
    requestWithImgSrc(url);
  }
}

window.addEventListener("deviceorientation", function(event) {
  /*
   * event.alpha: 0-360 端末の方向
   * event.beta: -180~180 横方向、右が正、左が負
   * event.gamma: -90~90 縦方向、手前に立てると正、逆に立てると負
   */
  if (!FOXKEH_IS_FRIEND) {
    return;
  }
  var speed = orientation2speed(event);
  var timestamp = new Date().getTime();

  if (timestamp - lastTime > 1000/FPS) {
    lastTime = timestamp;
    sendRequest(API_BASE_URL+"motor/right?speed="+speed.right+"&time="+timestamp);
    sendRequest(API_BASE_URL+"motor/left?speed="+speed.left+"&time="+timestamp);
  }

  var orientedTo =
    (event.beta > 45 && event.beta < 135) ? "top" :
    (event.beta < -45 && event.beta > -135) ? "bottom" :
    (event.gamma > 45) ? "right" :
    (event.gamma < -45) ? "left" : "flat";
  var orientationHtml =
    "<strong>speed.left: </strong>" + speed.left + "<br>" +
    "<strong>speed.right: </strong>" + speed.right + "<br>" +
    "<strong>Absolute: </strong>" + event.absolute + "<br>" +
    "<strong>Alpha: </strong>" + event.alpha + "<br>" +
    "<strong>Beta: </strong>" + event.beta + "<br>" +
    "<strong>Gamma: </strong>" + event.gamma + "<br>" +
    "<strong>Device orientation: </strong>" + orientedTo;
  debugMessage(orientationHtml);
});


var ipInput = document.getElementById("ip-input");
ipInput.addEventListener("change", function(event) {
  debugMessage("SERVER_IP changed to: "+ipInput.value);
  SERVER_IP = ipInput.value;
  API_BASE_URL  = "http://"+SERVER_IP+":"+SERVER_PORT+"/api/";
},false);

var portInput = document.getElementById("port-input");
portInput.addEventListener("change", function(event) {
  debugMessage("SERVER_PORT changed to: "+portInput.value);
  SERVER_PORT = portInput.value;
  API_BASE_URL  = "http://"+SERVER_IP+":"+SERVER_PORT+"/api/";
},false);

var winkButton = document.getElementById("wink-button");
winkButton.addEventListener("click", function(event) {
  sendRequest(API_BASE_URL+"face/eye/wink");
},false);

function eyeController(event) {
  console.log(event);
  var state = event.target.dataset.state;
  sendRequest(API_BASE_URL+"face/eye/?state="+state);
}
var eyeNormalButton = document.getElementById("eye-normal-button");
var eyeClosedButton = document.getElementById("eye-closed-button");
var eyeCryButton = document.getElementById("eye-cry-button");
var eyeRelaxButton = document.getElementById("eye-relax-button");
eyeNormalButton.addEventListener("click", eyeController, false);
eyeClosedButton.addEventListener("click", eyeController, false);
eyeCryButton.addEventListener("click", eyeController, false);
eyeRelaxButton.addEventListener("click", eyeController, false);


var friendButton = document.getElementById("friend-button");
friendButton.addEventListener("click", function(event) {
  FOXKEH_IS_FRIEND = !FOXKEH_IS_FRIEND;
  friendButton.innerHTML = FOXKEH_IS_FRIEND ?
    "さよならフォクすけ..." : "フォクすけあそぼ！";
},false);
