function GirlFiend() {
  'use strict';
  const CHECK_DURATION = 1000;

  const availableFeelings = ["fun", "normal", "bored", "love"];
  this.feeling = "normal";
  this.fallinglove = false;

  const availbbleSongs = availableFeelings;
  this.singing = false;
  this.song = new Audio("");
  this.song.autoplay = false;

  this.initialOrientation = [0,0,0];
  this.orientation = [0,0,0];

  // TOCOS のデータで初期化する
  this.checkOrientation();

  // TODO: 定期的に checkFeeling して感情判断し続ける

}

GirlFiend.prototype.getFeeling = function () {
  return this.feeling;
}
GirlFiend.prototype.setFeeling = function (feeling) {
  // TODO: availableFeelings に入ってるかチェックすべき
  this.feeling = feeling;
  if (feeling == "love") {
    this.song("love.m4a");
  }
  else {
    this.song("normal.m4a");
  }
}

GirlFiend.prototype.getTocosData = function (tocosDataHandler) {
  const MBED_SERVER_URL = 'http://192.168.100.44';
  const TOCOS_PATH = "/api/tocos";
  const TOCOS_URL = MBED_SERVER_URL + TOCOS_PATH;

  var xhr = new XMLHttpRequest({mozSystem: true});
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        console.log("tocos responce: " + xhr.responseText);
        tocosDataHandler(xhr.responseText);
      } else {
        console.log("cannot get: " + TOCOS_URL);
      }
    }
  };
  xhr.open('GET', TOCOS_URL, true);
  xhr.send();
}


GirlFiend.prototype.checkOrientation = function (checkOrientationCallback) {
  // TOCOS データを受け取って加速度の値を取得する
  /* tocosResponce の形式:
    X,Y,Z 軸の値は +-16G (x100) の値がかえってくる
    ;xx;xxxxxxxx;電波の強度;xxxx;xxxx;xxxx;xxxx;xxxx;xxxx;xxxx;X;X軸;Y軸;Z軸;
    ;19;00000000;132;1441;10160fb;3090;0000;0000;1283;0689;X;0087;-039;-050;
  */
  this.getTocosData(function(tocosResponce) {

    // TODO: XYZ 軸を受け取って this.orientation を Update する

    this.orientaion.x = 0;
    this.orientaion.y = 0;
    this.orientaion.z = 0;

    checkOrientationCallback();
  });
}

GirlFiend.prototype.checkFeeling = function () {
  /* TOCOS データが大きく変動したかどうかで感情の変動を判断する
    直立で 0,0,100 みたいになり 45度以上傾いたら Z が 71 以下になる
    30 以上の変動を閾値とすればよい
  */
  this.checkOrientation(function() {
    const THRESHOLD = 30;
    var feeling = "normal";
    var initial = this.initialOrientation;
    var current = this.orientation;
    if (Math.abs(initial.x - current.x) > THRESHOLD
      || Math.abs(initial.y - current.y) > THRESHOLD
      || Math.abs(initial.z - current.z) > THRESHOLD) {
      feeling = "love";
    }
    this.setFeeling(feeling);
  });
};

GirlFiend.prototype.sing = function(song) {
  const dir = "/song/";
  song = song ? song : "normal.m4a";
  var audioFilePath = dir + song;
  this.song.src = audioFilePath;
  this.song.play();
  this.singing = true;
};

GirlFiend.prototype.quiet = function() {
  this.song.pause();
  // this.sing.stop();
  this.singing = false;
};
