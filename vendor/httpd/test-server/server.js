
var server = null;
var port = 3000;
var appRoot = './public';
var sdRoot = '/sdcard/testserver'; // ref. install.sh setting


//function who(thispointer) {
//	try {
//		return Object.getPrototypeOf(thispointer).constructor.name;
//	} catch (e) {
//		return "?";
//	}
//}

//function log(m) {
//	console.log(m);
//}

function init() {
	//
	var close_btn = document.getElementById('close');
	close_btn.innerHTML = 'Close';
	close_btn.addEventListener('click', function() {
		window.close();
	});

	// prepare server
	server = new HttpServer();
	server.get("/sd/", sdRoot);
	server.get("/", appRoot);
	server.get("/xhr", function xhrres(req, res, oncomplete){
		console.log(req);
		var ret = Math.random() < .3 ? 'あたり' : 'はずれ';
		res.write(ret); // not send?
		oncomplete();
	});
	server.start(port);
}

addEventListener('load', init);

